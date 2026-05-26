#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

echo "[smoke] Checking public config endpoint"
curl -fsS "$BASE_URL/api/config" >/dev/null

echo "[smoke] Checking main pages"
curl -fsS "$BASE_URL/" >/dev/null
curl -fsS "$BASE_URL/admin" >/dev/null
curl -fsS "$BASE_URL/terms" >/dev/null
curl -fsS "$BASE_URL/privacy" >/dev/null

echo "[smoke] OK"
