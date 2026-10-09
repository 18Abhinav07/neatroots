import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

import neatbolt_steer
from neatbolt_steer import _client


class StubBolts:
    """A tiny stand-in for the Bolt steering API."""

    def __init__(self, notes=None, mode="advisory"):
        self.notes = list(notes or [])
        self.mode = mode
        self.claims = []
        self.checks = []
        stub = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                self.send_response(404)
                self.end_headers()

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                if self.path == "/api/steer/claim":
                    stub.claims.append(body)
                    note = stub.notes.pop(0) if stub.notes else None
                    out = {"mode": stub.mode, "note": note}
                elif self.path == "/api/steer/check":
                    stub.checks.append(body)
                    out = {"probability": 0.9, "answer": "yes", "evidence_span_ids": ["abc"]}
                else:
                    out = {}
                data = json.dumps(out).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()


@pytest.fixture
def stub(monkeypatch):
    s = StubBolts(notes=[{"id": "n1", "kind": "template", "text": "Stop retrying.", "finding_id": "f1"}])
    neatbolt_steer.configure(s.url, listen=False)
    monkeypatch.setattr(neatbolt_steer, "current_trace", lambda: ("a" * 32, "b" * 16))
    yield s
    s.close()


def test_apply_appends_note_to_last_user_message(stub):
    msgs = [{"role": "system", "content": "s"}, {"role": "user", "content": "hi"}]
    out = neatbolt_steer.apply(msgs)
    assert msgs[-1]["content"] == "hi"  # input untouched
    assert "<neatbolt-guidance>" in out[-1]["content"] and "Stop retrying." in out[-1]["content"]
    assert stub.claims[0]["trace_id"] == "a" * 32


def test_apply_adds_user_turn_after_tool_result(stub):
    msgs = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": None}, {"role": "tool", "content": "{}", "tool_call_id": "c"}]
    out = neatbolt_steer.apply(msgs)
    assert len(out) == 4 and out[-1]["role"] == "user"


def test_apply_anthropic_joins_tool_result_turn(stub):
    msgs = [{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t", "content": "x"}]}]
    out = neatbolt_steer.apply_anthropic(msgs)
    assert out[-1]["content"][-1]["type"] == "text"
    assert "<neatbolt-guidance>" in out[-1]["content"][-1]["text"]


def test_no_note_leaves_messages_unchanged(stub):
    stub.notes.clear()
    msgs = [{"role": "user", "content": "hi"}]
    assert neatbolt_steer.apply(msgs) is msgs


def test_wrap_injects_into_chat_completions(stub):
    seen = {}

    class Completions:
        def create(self, **kw):
            seen.update(kw)
            return "ok"

    class Chat:
        completions = Completions()

    class Client:
        chat = Chat()

    c = neatbolt_steer.wrap(Client())
    assert c.chat.completions.create(model="m", messages=[{"role": "user", "content": "q"}]) == "ok"
    assert "<neatbolt-guidance>" in seen["messages"][-1]["content"]
    # wrapping twice is harmless
    neatbolt_steer.wrap(c)


def test_halt_note_raises(stub):
    stub.notes[:] = [{"id": "h", "kind": "halt", "text": "Your rule says stop.", "finding_id": None}]
    with pytest.raises(neatbolt_steer.BoltHalt):
        neatbolt_steer.apply([{"role": "user", "content": "q"}])


def test_check_my_work_and_tool_call(stub):
    r = neatbolt_steer.check_my_work("Did I verify the order?")
    assert r["probability_yes"] == 0.9 and r["answer"] == "yes"
    out = json.loads(neatbolt_steer.handle_tool_call("check_my_work", json.dumps({"question": "Q?"})))
    assert out["evidence_span_ids"] == ["abc"]
    assert neatbolt_steer.handle_tool_call("other_tool", "{}") is None
    assert neatbolt_steer.CHECK_MY_WORK_TOOL["function"]["name"] == "check_my_work"


def test_unreachable_bolts_is_silent(monkeypatch):
    neatbolt_steer.configure("http://127.0.0.1:9", listen=False)
    monkeypatch.setattr(neatbolt_steer, "current_trace", lambda: ("a" * 32, None))
    msgs = [{"role": "user", "content": "q"}]
    assert neatbolt_steer.apply(msgs) is msgs
    assert neatbolt_steer.check_my_work("q")["answer"] == "unknown"


def test_disabled_by_env(monkeypatch):
    monkeypatch.setenv("NEATBOLT_STEER", "off")
    c = _client.BoltClient("http://127.0.0.1:9", listen=False)
    assert c.claim("a" * 32) is None


def test_default_url_follows_local_endpoint(monkeypatch):
    monkeypatch.delenv("NEATBOLT_URL", raising=False)
    monkeypatch.setenv("NEATLOGS_ENDPOINT", "http://localhost:4123")
    assert _client._default_url() == "http://localhost:4123"
    monkeypatch.setenv("NEATLOGS_ENDPOINT", "https://ingest.neatlogs.com")
    assert _client._default_url() == "http://localhost:4100"
