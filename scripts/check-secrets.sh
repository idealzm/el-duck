#!/usr/bin/env bash

set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[secret-check] Not a git repository, skipping."
  exit 0
fi

staged_files="$(git diff --cached --name-only --diff-filter=ACMR)"
if [[ -z "${staged_files}" ]]; then
  exit 0
fi

has_issues=0

check_filename_risks() {
  local file
  while IFS= read -r file; do
    [[ -z "${file}" ]] && continue

    case "${file}" in
      .env.example|*.env.example|.env.sample|*.env.sample|.env.template|*.env.template)
        continue
        ;;
    esac

    case "${file}" in
      *.pem|*.p12|*.pfx|*.key|*.jks|*.keystore|id_rsa|id_ed25519|*.env|*.env.*|*credentials*.json|*service-account*.json)
        echo "[secret-check] Suspicious file staged: ${file}"
        has_issues=1
        ;;
    esac
  done <<< "${staged_files}"
}

is_placeholder_line() {
  local line="${1,,}"
  [[ "${line}" == *"change-me"* ]] && return 0
  [[ "${line}" == *"your-"* ]] && return 0
  [[ "${line}" == *"example"* ]] && return 0
  [[ "${line}" == *"placeholder"* ]] && return 0
  [[ "${line}" == *"<token>"* ]] && return 0
  [[ "${line}" == *"dummy"* ]] && return 0
  [[ "${line}" == *"test"* ]] && return 0
  return 1
}

report_matches() {
  local label="$1"
  local regex="$2"
  local lines

  lines="$(git diff --cached --no-color --unified=0 | sed -n 's/^+//p' | sed '/^+++/d' | grep -En "${regex}" || true)"
  [[ -z "${lines}" ]] && return 0

  local printed=0
  while IFS= read -r row; do
    [[ -z "${row}" ]] && continue
    local payload="${row#*:}"
    if is_placeholder_line "${payload}"; then
      continue
    fi
    if [[ ${printed} -eq 0 ]]; then
      echo "[secret-check] Potential secret (${label}):"
      printed=1
    fi
    echo "  ${row}"
  done <<< "${lines}"

  if [[ ${printed} -eq 1 ]]; then
    has_issues=1
  fi
}

check_filename_risks

report_matches "private key" "BEGIN (RSA|EC|DSA|OPENSSH|PGP|PRIVATE) KEY"
report_matches "jwt token" "[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"
report_matches "github token" "gh[pousr]_[A-Za-z0-9_]{20,}"
report_matches "aws access key" "AKIA[0-9A-Z]{16}"
report_matches "bearer token" "Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._=-]{20,}"
report_matches "hardcoded credential" "(password|passwd|secret|token|api[_-]?key)[[:space:]]*[:=][[:space:]]*['\"][^'\"]{8,}['\"]"

if [[ ${has_issues} -eq 1 ]]; then
  echo ""
  echo "[secret-check] Commit blocked. Remove secrets or move them to .env/.secret storage."
  exit 1
fi

exit 0
