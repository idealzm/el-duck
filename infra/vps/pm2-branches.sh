#!/usr/bin/env bash

set -euo pipefail

log() {
  echo "[pm2-branches] $*"
}

die() {
  echo "[pm2-branches][error] $*" >&2
  exit 1
}

trap 'echo "[pm2-branches][error] Command failed at line $LINENO: $BASH_COMMAND" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CREDS_FILE="${CREDS_FILE:-$SCRIPT_DIR/github.env}"

REPO_URL="${REPO_URL:-}"
BASE_DIR="${BASE_DIR:-/opt/el-duck}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
DEV_BRANCH="${DEV_BRANCH:-dev}"
MAIN_PORT="${MAIN_PORT:-3000}"
DEV_PORT="${DEV_PORT:-3001}"

MAIN_DIR="$BASE_DIR/main"
DEV_DIR="$BASE_DIR/dev"

need_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[error] Required command not found: $cmd"
    echo "[hint] $hint"
    return 1
  fi
  return 0
}

ensure_dependencies() {
  local failed=0

  need_cmd git "Install git: apt update && apt install -y git" || failed=1
  need_cmd node "Install Node.js 20+: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs" || failed=1
  need_cmd npm "Install npm via Node.js package: apt install -y nodejs" || failed=1
  need_cmd pm2 "Install PM2 globally: npm install -g pm2" || failed=1
  need_cmd make "Install build tools: apt update && apt install -y build-essential" || failed=1
  need_cmd g++ "Install build tools: apt update && apt install -y build-essential" || failed=1
  need_cmd python3 "Install python3: apt update && apt install -y python3" || failed=1

  if command -v node >/dev/null 2>&1; then
    local node_major
    node_major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "$node_major" -lt 20 ]]; then
      echo "[error] Node.js $(node -v) detected. This project requires Node.js >= 20 (better-sqlite3)."
      echo "[hint] Install Node.js 20 LTS: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"
      failed=1
    fi
  fi

  if [[ "$failed" -ne 0 ]]; then
    exit 1
  fi
}

load_creds() {
  if [[ -f "$CREDS_FILE" ]]; then
    local env_repo_url="$REPO_URL"
    set -a
    source "$CREDS_FILE"
    set +a
    if [[ -n "$env_repo_url" ]]; then
      REPO_URL="$env_repo_url"
    fi
  fi
}

auth_repo_url() {
  local url="$1"
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    local user="${GITHUB_USER:-x-access-token}"
    local repo_path=""

    # email/invalid username ломает URL (символ @), поэтому fallback
    if [[ "$user" == *"@"* ]]; then
      user="x-access-token"
    fi

    if [[ "$url" == git@github.com:* ]]; then
      repo_path="${url#git@github.com:}"
      echo "https://${user}:${GITHUB_TOKEN}@github.com/${repo_path}"
      return
    fi

    if [[ "$url" == https://github.com/* ]]; then
      repo_path="${url#https://github.com/}"
      echo "https://${user}:${GITHUB_TOKEN}@github.com/${repo_path}"
      return
    fi
  fi
  echo "$url"
}

sync_branch() {
  local branch="$1"
  local target_dir="$2"
  local resolved_url
  resolved_url="$(auth_repo_url "$REPO_URL")"

  log "Sync branch '$branch' -> $target_dir"

  if [[ ! -d "$target_dir/.git" ]]; then
    log "Cloning repository"
    GIT_TERMINAL_PROMPT=0 git clone --branch "$branch" --single-branch "$resolved_url" "$target_dir" || \
      die "Git clone failed (check REPO_URL and credentials in $CREDS_FILE)"
  else
    log "Fetching latest changes"
    git -C "$target_dir" remote set-url origin "$resolved_url"
    GIT_TERMINAL_PROMPT=0 git -C "$target_dir" fetch origin "$branch" || \
      die "Git fetch failed (check REPO_URL and credentials in $CREDS_FILE)"
    git -C "$target_dir" checkout "$branch"
    git -C "$target_dir" reset --hard "origin/$branch"
  fi

  log "Installing production dependencies"
  npm --prefix "$target_dir" install --omit=dev

  if [[ ! -f "$target_dir/.env" && -f "$target_dir/.env.example" ]]; then
    cp "$target_dir/.env.example" "$target_dir/.env"
    echo "Created $target_dir/.env from template. Update it before production use."
  fi
}

start_pm2() {
  pm2 delete el-duck-main 2>/dev/null || true
  pm2 delete el-duck-dev 2>/dev/null || true

  NODE_ENV=production PORT="$MAIN_PORT" pm2 start "$MAIN_DIR/server/index.js" --name el-duck-main --cwd "$MAIN_DIR"
  NODE_ENV=development PORT="$DEV_PORT" pm2 start "$DEV_DIR/server/index.js" --name el-duck-dev --cwd "$DEV_DIR"

  pm2 save
  pm2 status

  echo ""
  echo "Main: http://localhost:$MAIN_PORT"
  echo "Dev:  http://localhost:$DEV_PORT"
}

restart_pm2() {
  local name="$1"
  pm2 restart "$name" 2>/dev/null || true
  pm2 save
  pm2 status
}

start_or_restart_pm2() {
  local name="$1"
  local app_dir="$2"
  local port="$3"
  local node_env="$4"

  if pm2 describe "$name" >/dev/null 2>&1; then
    NODE_ENV="$node_env" PORT="$port" pm2 restart "$name" --update-env
  else
    NODE_ENV="$node_env" PORT="$port" pm2 start "$app_dir/server/index.js" --name "$name" --cwd "$app_dir"
  fi

  pm2 save
  pm2 status
}

cmd_sync() {
  load_creds
  ensure_dependencies

  if [[ -z "$REPO_URL" ]]; then
    echo "REPO_URL is required."
    echo "Example: REPO_URL=git@github.com:org/repo.git bash infra/vps/pm2-branches.sh sync"
    exit 1
  fi
  mkdir -p "$BASE_DIR"

  sync_branch "$MAIN_BRANCH" "$MAIN_DIR"
  sync_branch "$DEV_BRANCH" "$DEV_DIR"
  start_pm2
}

cmd_sync_main() {
  load_creds
  ensure_dependencies

  if [[ -z "$REPO_URL" ]]; then
    echo "REPO_URL is required."
    exit 1
  fi
  mkdir -p "$BASE_DIR"

  sync_branch "$MAIN_BRANCH" "$MAIN_DIR"
  start_or_restart_pm2 el-duck-main "$MAIN_DIR" "$MAIN_PORT" production
  echo "Main synced: http://localhost:$MAIN_PORT"
}

cmd_sync_dev() {
  load_creds
  ensure_dependencies

  [[ -z "$REPO_URL" ]] && die "REPO_URL is required."
  mkdir -p "$BASE_DIR"

  sync_branch "$DEV_BRANCH" "$DEV_DIR"
  start_or_restart_pm2 el-duck-dev "$DEV_DIR" "$DEV_PORT" development
  log "Dev synced: http://localhost:$DEV_PORT"
}

cmd_update_main() {
  load_creds
  ensure_dependencies

  if [[ -z "$REPO_URL" ]]; then
    echo "REPO_URL is required."
    exit 1
  fi
  mkdir -p "$BASE_DIR"

  local resolved_url
  resolved_url="$(auth_repo_url "$REPO_URL")"

  if [[ ! -d "$MAIN_DIR/.git" ]]; then
    echo "Main branch not found at $MAIN_DIR. Run 'sync' first."
    exit 1
  fi

  if [[ ! -d "$DEV_DIR/.git" ]]; then
    echo "Dev branch not found at $DEV_DIR. Run 'sync' first."
    exit 1
  fi

  git -C "$MAIN_DIR" remote set-url origin "$resolved_url"
  git -C "$MAIN_DIR" fetch origin "$MAIN_BRANCH" "$DEV_BRANCH"
  git -C "$MAIN_DIR" checkout "$MAIN_BRANCH"
  git -C "$MAIN_DIR" reset --hard "origin/$MAIN_BRANCH"

  git -C "$DEV_DIR" remote set-url origin "$resolved_url"
  git -C "$DEV_DIR" fetch origin "$DEV_BRANCH"
  git -C "$DEV_DIR" checkout "$DEV_BRANCH"
  git -C "$DEV_DIR" reset --hard "origin/$DEV_BRANCH"

  echo "Merging origin/$DEV_BRANCH into $MAIN_BRANCH..."
  git -C "$MAIN_DIR" merge "origin/$DEV_BRANCH" --no-edit || {
    echo ""
    echo "Merge conflict detected. Resolve manually:"
    echo "  cd $MAIN_DIR && git status"
    exit 1
  }

  git -C "$MAIN_DIR" push origin "$MAIN_BRANCH"
  echo "Pushed updated $MAIN_BRANCH to origin."

  npm --prefix "$MAIN_DIR" install --omit=dev
  start_or_restart_pm2 el-duck-main "$MAIN_DIR" "$MAIN_PORT" production
  echo "Main updated from $DEV_BRANCH and restarted: http://localhost:$MAIN_PORT"
}

cmd_help() {
  echo "Usage: bash infra/vps/pm2-branches.sh <command>"
  echo ""
  echo "Commands:"
  echo "  sync          Sync both branches and restart (default)"
  echo "  sync-main     Sync and restart only main branch"
  echo "  sync-dev      Sync and restart only dev branch"
  echo "  update-main   Merge dev into main, push, and restart main"
  echo "  help          Show this help"
  echo ""
  echo "Credentials file: $CREDS_FILE"
  echo "  REPO_URL=<git-repository-url>"
  echo "  GITHUB_USER=<username>"
  echo "  GITHUB_TOKEN=<personal-access-token>"
  echo ""
  echo "Environment variables (override github.env):"
  echo "  REPO_URL      Git repository URL (required for sync)"
  echo "  BASE_DIR      Base directory (default: /opt/el-duck)"
  echo "  MAIN_BRANCH   Main branch name (default: main)"
  echo "  DEV_BRANCH    Dev branch name (default: dev)"
  echo "  MAIN_PORT     Main app port (default: 3000)"
  echo "  DEV_PORT      Dev app port (default: 3001)"
  echo "  CREDS_FILE    Path to credentials file (default: infra/vps/github.env)"
}

COMMAND="${1:-sync}"
shift 2>/dev/null || true

case "$COMMAND" in
  sync)       cmd_sync ;;
  sync-main)  cmd_sync_main ;;
  sync-dev)   cmd_sync_dev ;;
  update-main) cmd_update_main ;;
  help|--help|-h) cmd_help ;;
  *)
    echo "Unknown command: $COMMAND"
    echo "Run with 'help' for usage."
    exit 1
    ;;
esac
