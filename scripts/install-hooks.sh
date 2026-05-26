#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT_DIR}/.githooks/pre-commit"
DST="${ROOT_DIR}/.git/hooks/pre-commit"

if [[ ! -d "${ROOT_DIR}/.git" ]]; then
  echo "[hooks] .git directory not found. Run inside repository root."
  exit 1
fi

if [[ ! -f "${SRC}" ]]; then
  echo "[hooks] Source hook not found: ${SRC}"
  exit 1
fi

cp "${SRC}" "${DST}"
chmod +x "${DST}" "${ROOT_DIR}/scripts/check-secrets.sh" "${ROOT_DIR}/scripts/install-hooks.sh"

echo "[hooks] Installed pre-commit hook to ${DST}"
echo "[hooks] It now runs scripts/check-secrets.sh before each commit."
