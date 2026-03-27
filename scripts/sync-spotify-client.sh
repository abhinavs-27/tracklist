#!/usr/bin/env bash
# Keep backend's linked package in sync: primary source is packages/spotify-client/src/index.ts
# Run in CI after edits: `bash scripts/sync-spotify-client.sh`
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/spotify-client/src/index.ts"
if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC" >&2
  exit 1
fi
echo "OK: Spotify client source at $SRC (Next + backend use @tracklist/spotify-client via workspaces/file: link)."
