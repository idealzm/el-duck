#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Cleaning local runtime artifacts in $ROOT_DIR"

rm -rf "$ROOT_DIR/node_modules"
rm -rf "$ROOT_DIR/.opencode"
rm -f "$ROOT_DIR"/*.log
rm -f "$ROOT_DIR/data"/*.sqlite "$ROOT_DIR/data"/*.sqlite-shm "$ROOT_DIR/data"/*.sqlite-wal "$ROOT_DIR/data"/*.db
rm -f "$ROOT_DIR/data/vapid-keys.json"

echo "Done. Run npm install to restore dependencies."
