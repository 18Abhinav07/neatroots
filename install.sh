#!/bin/sh
# Neatlogs Bolt installer.
#
#   curl -fsSL https://raw.githubusercontent.com/neatlogs/neatlogs-bolt/main/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --service      # also start Bolt at login
#
# Installs into ~/.neatbolt (source and, if needed, a private Node.js) and puts `neatbolt` in
# ~/.local/bin. No sudo. Your runs and settings also live in ~/.neatbolt and are kept on update.
#
# Options (flags or environment variables):
#   --service            start Bolt in the background now and at login   (NEATBOLT_SERVICE=1)
#   --ref <ref>          branch or tag to install                         (NEATBOLT_REF, default main)
#   --repo <url>         git URL or local path to install from            (NEATBOLT_REPO)
#   --dir <path>         install directory                                (NEATBOLT_INSTALL_DIR, default ~/.neatbolt)
#   --bin-dir <path>     where the `neatbolt` command goes                   (NEATBOLT_BIN_DIR, default ~/.local/bin)
#   --no-modify-path     do not add the bin dir to your shell profile     (NEATBOLT_NO_MODIFY_PATH=1)
#   --uninstall          remove the command, service, source and private Node (keeps your data)
#
# The whole script is a function called on the last line, so a partial download runs nothing.

set -eu

main() {
  REPO="${NEATBOLT_REPO:-https://github.com/neatlogs/neatlogs-bolt.git}"
  REF="${NEATBOLT_REF:-main}"
  DIR="${NEATBOLT_INSTALL_DIR:-$HOME/.neatbolt}"
  BIN_DIR="${NEATBOLT_BIN_DIR:-$HOME/.local/bin}"
  SERVICE="${NEATBOLT_SERVICE:-0}"
  NO_MODIFY_PATH="${NEATBOLT_NO_MODIFY_PATH:-0}"
  UPDATE="${NEATBOLT_UPDATE:-0}"
  UNINSTALL=0
  NODE_VERSION="24.14.1"
  PNPM_VERSION="10.33.0"

  while [ $# -gt 0 ]; do
    case "$1" in
      --service) SERVICE=1 ;;
      --ref) REF="$2"; shift ;;
      --repo) REPO="$2"; shift ;;
      --dir) DIR="$2"; shift ;;
      --bin-dir) BIN_DIR="$2"; shift ;;
      --no-modify-path) NO_MODIFY_PATH=1 ;;
      --uninstall) UNINSTALL=1 ;;
      -h|--help) sed -n '2,22p' "$0" 2>/dev/null || true; exit 0 ;;
      *) fail "unknown option: $1" ;;
    esac
    shift
  done

  SRC="${NEATBOLT_SOURCE_DIR:-$DIR/src}"
  LOG="$DIR/install.log"

  if [ "$UNINSTALL" = 1 ]; then uninstall; return; fi

  detect_platform
  need git
  need tar
  mkdir -p "$DIR" "$BIN_DIR"
  : >"$LOG"

  if [ "$UPDATE" = 1 ]; then say "Updating Bolt in $SRC"; else say "Installing Neatlogs Bolt"; fi
  ensure_node
  fetch_source
  build
  if [ "$UPDATE" = 1 ]; then
    [ -f "$BIN_DIR/neatbolt" ] && write_command
    ok "Bolt updated ($(version))"
    return
  fi
  write_command
  setup_path
  finish
}

# ------------------------------------------------------------------ output

if [ -t 1 ]; then B="$(printf '\033[1m')"; G="$(printf '\033[32m')"; R="$(printf '\033[31m')"; D="$(printf '\033[2m')"; N="$(printf '\033[0m')"; else B=""; G=""; R=""; D=""; N=""; fi
say() { printf '%s\n' "${B}$*${N}"; }
ok() { printf '%s\n' "${G}✓${N} $*"; }
step() { printf '%s\n' "${D}→${N} $*"; }
fail() {
  printf '%s\n' "${R}✗ $*${N}" >&2
  if [ -n "${LOG:-}" ] && [ -s "${LOG:-/nonexistent}" ]; then
    printf '%s\n' "${D}Last lines of $LOG:${N}" >&2
    tail -n 20 "$LOG" >&2
  fi
  exit 1
}
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required. Install it and run this again."; }
run() { "$@" >>"$LOG" 2>&1 || fail "failed: $*"; }

# ---------------------------------------------------------------- platform

detect_platform() {
  case "$(uname -s)" in
    Darwin) OS=darwin ;;
    Linux) OS=linux ;;
    MINGW*|MSYS*|CYGWIN*) fail "Windows is not supported directly. Run this inside WSL." ;;
    *) fail "unsupported system: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH=arm64 ;;
    x86_64|amd64) ARCH=x64 ;;
    *) fail "unsupported CPU: $(uname -m)" ;;
  esac
}

# -------------------------------------------------------------------- node

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

ensure_node() {
  NODE=""
  if [ "${NEATBOLT_FORCE_NODE:-0}" != 1 ] && command -v node >/dev/null 2>&1 && [ "$(node_major node)" -ge 22 ]; then
    NODE="$(command -v node)"
  elif [ -x "$DIR/node/bin/node" ] && [ "$(node_major "$DIR/node/bin/node")" -ge 22 ]; then
    NODE="$DIR/node/bin/node"
  else
    install_node
    NODE="$DIR/node/bin/node"
  fi
  NODE_BIN="$(dirname "$NODE")"
  ok "Node.js $("$NODE" -v) ($NODE)"
}

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi
}

install_node() {
  need curl
  if [ "$OS" = linux ] && ldd --version 2>&1 | grep -qi musl; then
    fail "this Linux uses musl (e.g. Alpine). Install Node.js 22 or newer yourself and run this again."
  fi
  name="node-v$NODE_VERSION-$OS-$ARCH"
  step "Downloading Node.js $NODE_VERSION (no Node 22+ found)"
  tmp="$(mktemp -d)"
  run curl -fsSL -o "$tmp/$name.tar.gz" "https://nodejs.org/dist/v$NODE_VERSION/$name.tar.gz"
  run curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  want="$(grep " $name.tar.gz\$" "$tmp/SHASUMS256.txt" | cut -d' ' -f1)"
  [ -n "$want" ] && [ "$(sha256 "$tmp/$name.tar.gz")" = "$want" ] || fail "Node.js download did not match its checksum"
  rm -rf "$DIR/node"
  run tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
  mv "$tmp/$name" "$DIR/node"
  rm -rf "$tmp"
}

# ------------------------------------------------------------------ source

fetch_source() {
  if [ -f "$SRC/.neatbolt-installed" ]; then
    # A checkout this script made: follow the requested branch or tag exactly.
    step "Fetching $REF"
    run git -C "$SRC" fetch --depth 1 origin "$REF"
    run git -C "$SRC" checkout -q -B "$REF" FETCH_HEAD
  elif [ -n "${NEATBOLT_SOURCE_DIR:-}" ]; then
    # Your own checkout: never reset it; fast-forward only when it tracks a remote.
    [ -f "$SRC/pnpm-workspace.yaml" ] || fail "$SRC is not a Bolt checkout"
    if [ "$UPDATE" = 1 ] && git -C "$SRC" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
      step "Pulling"
      run git -C "$SRC" pull --ff-only
    fi
  else
    step "Cloning $REPO ($REF)"
    rm -rf "$SRC"
    git clone -q --depth 1 --branch "$REF" "$REPO" "$SRC" >>"$LOG" 2>&1 || fail "could not clone $REPO. If the repository is private, check that git can reach it (gh auth login, or an SSH key)."
    touch "$SRC/.neatbolt-installed"
  fi
  ok "Source $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo local) in $SRC"
}

# ------------------------------------------------------------------- build

pnpm() {
  (cd "$SRC" && PATH="$NODE_BIN:$PATH" "$NODE_BIN/npm" exec --yes --package="pnpm@$PNPM_VERSION" -- pnpm "$@")
}

build() {
  step "Installing dependencies (a minute or two the first time)"
  pnpm install --frozen-lockfile >>"$LOG" 2>&1 || fail "pnpm install failed"
  step "Building"
  pnpm build >>"$LOG" 2>&1 || fail "build failed"
  [ -f "$SRC/packages/bolt/dist/cli.js" ] || fail "build did not produce packages/bolt/dist/cli.js"
  ok "Built"
}

version() { "$NODE" "$SRC/packages/bolt/dist/cli.js" --version 2>/dev/null || echo "?"; }

# ----------------------------------------------------------------- command

write_command() {
  cat >"$BIN_DIR/neatbolt" <<EOF
#!/bin/sh
# Neatlogs Bolt (written by install.sh; rerun it or use \`neatbolt update\` to update)
exec "$NODE" "$SRC/packages/bolt/dist/cli.js" "\$@"
EOF
  chmod +x "$BIN_DIR/neatbolt"
  ok "Command: $BIN_DIR/neatbolt ($(version))"
}

setup_path() {
  case ":$PATH:" in *":$BIN_DIR:"*) return ;; esac
  line="export PATH=\"$BIN_DIR:\$PATH\""
  if [ "$NO_MODIFY_PATH" = 1 ]; then
    PATH_NOTE="Add $BIN_DIR to your PATH:  $line"
    return
  fi
  case "${SHELL:-}" in
    */zsh) rc="$HOME/.zshrc" ;;
    */bash) if [ "$OS" = darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
    */fish) rc="" ;;
    *) rc="$HOME/.profile" ;;
  esac
  if [ -z "$rc" ]; then
    PATH_NOTE="Add $BIN_DIR to your PATH:  fish_add_path $BIN_DIR"
    return
  fi
  if ! grep -qs "# neatlogs-bolt" "$rc"; then
    printf '\n%s  # neatlogs-bolt\n' "$line" >>"$rc"
    ok "Added $BIN_DIR to PATH in $rc"
  fi
  PATH_NOTE="Open a new terminal (or run: source $rc) so \`neatbolt\` is on your PATH."
}

finish() {
  echo
  if [ "$SERVICE" = 1 ]; then
    "$BIN_DIR/neatbolt" service install || true
  fi
  say "Bolt is installed."
  [ -n "${PATH_NOTE:-}" ] && echo "  $PATH_NOTE"
  echo
  if [ "$SERVICE" != 1 ]; then
    echo "  Start it:            neatbolt start            (or neatbolt service install to run it at login)"
  fi
  echo "  Open the app:        http://localhost:4100"
  echo "  Point your agent:    export NEATLOGS_ENDPOINT=http://localhost:4100 NEATLOGS_API_KEY=neatbolt-local"
  echo "  Check everything:    neatbolt doctor"
  echo
  if ! command -v ollama >/dev/null 2>&1; then
    echo "  ${D}No Ollama found. Rules work without it; for questions and explanations install a local model"
    echo "  (https://ollama.com, then: ollama pull qwen3:8b) or use a hosted one: neatbolt llm login anthropic${N}"
  fi
  echo "  ${D}Steering hooks: pip install \"$SRC/python/neatbolt-steer\"  ·  npm install \"$SRC/packages/steer-ts\"${N}"
  echo "  ${D}Guide: $SRC/docs/getting-started.md${N}"
}

# --------------------------------------------------------------- uninstall

uninstall() {
  if [ -x "$BIN_DIR/neatbolt" ]; then "$BIN_DIR/neatbolt" service uninstall >/dev/null 2>&1 || true; fi
  rm -f "$BIN_DIR/neatbolt"
  rm -rf "$DIR/src" "$DIR/node" "$DIR/install.log"
  ok "Removed the neatbolt command, background service, source and private Node.js."
  echo "  Your runs, settings and Laya are still in $DIR. Delete that folder to remove them too."
  echo "  Stored API keys are in the macOS Keychain under \"neatlogs-bolts\" (Keychain Access to remove)."
}

main "$@"
