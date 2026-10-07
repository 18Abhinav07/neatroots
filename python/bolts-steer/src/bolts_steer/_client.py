"""Talks to a local Bolts app: claims guidance notes, listens for steering events, runs self-checks.

Everything here fails quietly. If Bolts is not running, the agent carries on unchanged.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Set
from urllib.parse import urlparse

logger = logging.getLogger("bolts_steer")

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}


def _default_url() -> str:
    explicit = os.environ.get("BOLTS_URL")
    if explicit:
        return explicit.rstrip("/")
    endpoint = os.environ.get("NEATLOGS_ENDPOINT", "")
    if endpoint:
        parsed = urlparse(endpoint)
        if parsed.hostname in _LOCAL_HOSTS:
            return f"{parsed.scheme}://{parsed.netloc}"
    return "http://localhost:4100"


class Note:
    __slots__ = ("id", "kind", "text", "finding_id")

    def __init__(self, id: str, kind: str, text: str, finding_id: Optional[str]) -> None:
        self.id = id
        self.kind = kind
        self.text = text
        self.finding_id = finding_id

    def __repr__(self) -> str:  # pragma: no cover
        return f"Note({self.kind}: {self.text!r})"


class BoltsClient:
    """One per process. Holds the SSE listener and a short-lived view of steering modes."""

    def __init__(self, url: Optional[str] = None, *, listen: bool = True) -> None:
        self.url = (url or _default_url()).rstrip("/")
        self.disabled = os.environ.get("BOLTS_STEER", "").lower() in {"0", "off", "false", "no"}
        self._mode = "unknown"
        self._mode_checked = 0.0
        self._pending: Set[str] = set()
        self._sse_connected = False
        self._down_until = 0.0
        self._lock = threading.Lock()
        self._listener: Optional[threading.Thread] = None
        if listen and not self.disabled:
            self._start_listener()

    # ------------------------------------------------------------- transport

    def _post(self, path: str, body: Dict[str, Any], timeout: float) -> Optional[Dict[str, Any]]:
        if self.disabled or time.monotonic() < self._down_until:
            return None
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            self.url + path, data=data, method="POST", headers={"content-type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            logger.debug("bolts %s -> HTTP %s", path, exc.code)
            return None
        except Exception as exc:  # noqa: BLE001 - never break the agent
            logger.debug("bolts unreachable at %s: %s", self.url, exc)
            # Back off so a stopped Bolts costs nothing per LLM call.
            self._down_until = time.monotonic() + 5.0
            return None

    # ------------------------------------------------------------- listener

    def _start_listener(self) -> None:
        t = threading.Thread(target=self._listen_forever, name="bolts-steer-sse", daemon=True)
        self._listener = t
        t.start()

    def _listen_forever(self) -> None:
        backoff = 1.0
        while True:
            try:
                req = urllib.request.Request(self.url + "/api/steer/stream", headers={"accept": "text/event-stream"})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    self._sse_connected = True
                    backoff = 1.0
                    event = None
                    for raw in resp:
                        line = raw.decode("utf-8").rstrip("\r\n")
                        if line.startswith("event:"):
                            event = line[6:].strip()
                        elif line.startswith("data:"):
                            self._on_event(event, line[5:].strip())
                        elif not line:
                            event = None
            except Exception as exc:  # noqa: BLE001
                logger.debug("bolts stream closed: %s", exc)
            self._sse_connected = False
            time.sleep(backoff)
            backoff = min(backoff * 2, 30.0)

    def _on_event(self, event: Optional[str], data: str) -> None:
        try:
            payload = json.loads(data)
        except ValueError:
            return
        with self._lock:
            if event == "note" and payload.get("trace_id"):
                self._pending.add(payload["trace_id"])
            elif event == "mode":
                self._mode_checked = 0.0
            elif event == "hello" and payload.get("enabled") is False:
                self._mode = "off"
                self._mode_checked = time.monotonic()

    # ---------------------------------------------------------------- notes

    @property
    def mode(self) -> str:
        return self._mode

    def _should_claim(self, trace_id: str) -> bool:
        if self.disabled:
            return False
        now = time.monotonic()
        with self._lock:
            # A project with steering off is re-checked every 10 s rather than on every call.
            if self._mode == "off" and now - self._mode_checked < 10.0 and trace_id not in self._pending:
                return False
            if self._mode in {"advisory", "self-check"} and self._sse_connected and trace_id not in self._pending:
                # Nothing pending for this run; skip the round trip.
                return now - self._mode_checked > 10.0
        return True

    def claim(self, trace_id: str, span_id: Optional[str] = None, *, gate_ms: Optional[int] = None) -> Optional[Note]:
        """Takes at most one pending note for this run. Bolts marks it delivered."""
        if not self._should_claim(trace_id):
            return None
        body: Dict[str, Any] = {"trace_id": trace_id}
        if span_id:
            body["span_id"] = span_id
        if gate_ms is not None:
            body["gate_ms"] = gate_ms
        timeout = 0.5 if gate_ms is None else gate_ms / 1000.0 + 0.5
        res = self._post("/api/steer/claim", body, timeout)
        if res is None:
            return None
        with self._lock:
            self._mode = res.get("mode") or "unknown"
            self._mode_checked = time.monotonic()
            note = res.get("note")
            if not note:
                self._pending.discard(trace_id)
                return None
        return Note(note.get("id", ""), note.get("kind", "template"), note.get("text", ""), note.get("finding_id"))

    def check(self, trace_id: str, question: str, span_ids: Optional[list] = None, timeout: float = 30.0) -> Optional[Dict[str, Any]]:
        body: Dict[str, Any] = {"trace_id": trace_id, "question": question}
        if span_ids:
            body["span_ids"] = span_ids
        return self._post("/api/steer/check", body, timeout)


_client: Optional[BoltsClient] = None
_client_lock = threading.Lock()


def get_client() -> BoltsClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = BoltsClient()
        return _client


def configure(url: Optional[str] = None, *, listen: bool = True) -> BoltsClient:
    """Points the hook at a Bolts app other than the default (BOLTS_URL or localhost:4100)."""
    global _client
    with _client_lock:
        _client = BoltsClient(url, listen=listen)
        return _client
