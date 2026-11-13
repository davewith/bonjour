#!/usr/bin/env bash
# Start a persistent Piper HTTP server so synthesis does not reload the voice
# model on every call (the model stays in memory; /synthesize returns WAVs).
#
# Usage: scripts/start-piper-server.sh [voice] [port]
# Then:  export FRENCH_PIPER_SERVER_URL=http://127.0.0.1:5000
#
# Requires the [http] extra (flask): reinstall with
#   uv tool install --reinstall "piper-tts[http]"
set -euo pipefail

VOICE="${1:-fr_FR-siwis-medium}"
PORT="${2:-5000}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${FRENCH_PIPER_DATA_DIR:-$REPO_ROOT/data/voices}"

# Locate the python that owns the `piper` entry point (uv tool venv or pip).
PIPER_BIN="$(command -v piper || true)"
if [ -z "$PIPER_BIN" ]; then
  echo "error: piper not found on PATH. Install with: uv tool install piper-tts" >&2
  exit 1
fi
PIPER_PYTHON="$(head -n1 "$PIPER_BIN" | sed 's/^#!//')"
if [ ! -x "$PIPER_PYTHON" ]; then
  echo "error: cannot derive python interpreter from $PIPER_BIN" >&2
  exit 1
fi

if ! "$PIPER_PYTHON" -c "import flask" 2>/dev/null; then
  echo "error: flask is missing (needed for the HTTP server)." >&2
  echo "Reinstall with: uv tool install --reinstall \"piper-tts[http]\"" >&2
  exit 1
fi

echo "Starting Piper server: voice=$VOICE port=$PORT data-dir=$DATA_DIR"
exec "$PIPER_PYTHON" -m piper.http_server \
  -m "$VOICE" \
  --data-dir "$DATA_DIR" \
  --host 127.0.0.1 \
  --port "$PORT"
