#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# EL-DUCK SQLite Backup System
#
# Создаёт целостную копию БД с помощью sqlite3 .backup
# (не блокирует запись, гарантирует консистентность),
# проверяет копию, сжимает и ротирует бекапы.
#
# Использование:
#   ./scripts/backup-db.sh              # автоматический режим
#   ./scripts/backup-db.sh --full       # полный бекап (то же самое)
#   ./scripts/backup-db.sh --verify /path/to/backup.db.gz  # проверить бекап
#
# Cron (каждые 6 часов):
#   0 */6 * * * /root/el-duckDEV/scripts/backup-db.sh >> /var/log/el-duck-backup.log 2>&1
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${EL_DUCK_DB_PATH:-$(grep -E '^DATABASE_PATH=' "$PROJECT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || echo './data/database.sqlite')}"
DB_PATH="$(cd "$PROJECT_DIR" && realpath "$DB_PATH" 2>/dev/null || echo "$PROJECT_DIR/$DB_PATH")"

BACKUP_DIR="${EL_DUCK_BACKUP_DIR:-$PROJECT_DIR/data/backup}"
KEEP_HOURLY="${EL_DUCK_KEEP_HOURLY:-8}"
KEEP_DAILY="${EL_DUCK_KEEP_DAILY:-7}"
KEEP_WEEKLY="${EL_DUCK_KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${EL_DUCK_KEEP_MONTHLY:-6}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_DAY=$(date +%Y%m%d)
DATE_WEEK=$(date +%Y_W%V)
DATE_MONTH=$(date +%Y%m)

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

die() { log "ERROR: $*"; exit 1; }

check_sqlite3() {
  if ! command -v sqlite3 &>/dev/null; then
    log "sqlite3 not found, installing..."
    apt-get update -qq && apt-get install -y -qq sqlite3 2>/dev/null || \
    yum install -y sqlite 2>/dev/null || \
    die "Cannot install sqlite3"
  fi
}

verify_db() {
  local db_path="$1"
  local result
  result=$(sqlite3 "$db_path" "PRAGMA integrity_check;" 2>&1)
  if echo "$result" | grep -q "ok"; then
    return 0
  else
    log "INTEGRITY CHECK FAILED: $result"
    return 1
  fi
}

create_backup() {
  local src="$1"
  local dst="$2"

  if [ ! -f "$src" ]; then
    die "Database not found: $src"
  fi

  log "Creating backup: $src -> $dst"

  # sqlite3 .backup — безопасная консистентная копия без блокировки
  sqlite3 "$src" ".backup '$dst'"

  if [ ! -f "$dst" ]; then
    die "Backup file was not created: $dst"
  fi

  # Проверяем целостность копии
  if verify_db "$dst"; then
    log "Backup integrity: OK"
  else
    rm -f "$dst"
    die "Backup integrity check failed, removed corrupt backup"
  fi
}

compress_and_checksum() {
  local db_file="$1"
  local gz_file="${db_file}.gz"

  log "Compressing: $db_file"
  gzip -f "$db_file"

  sha256sum "$gz_file" > "${gz_file}.sha256"
  log "SHA256: $(cat "${gz_file}.sha256")"

  local size
  size=$(du -h "$gz_file" | cut -f1)
  log "Backup size: $size"
}

rotate_backups() {
  local prefix="$1"
  local keep="$2"

  local count
  count=$(ls -1 "${BACKUP_DIR}/${prefix}"_*.db.gz 2>/dev/null | wc -l || true)

  if [ "$count" -le "$keep" ]; then
    return 0
  fi

  local to_delete
  to_delete=$(ls -1t "${BACKUP_DIR}/${prefix}"_*.db.gz | tail -n +$((keep + 1)))

  for f in $to_delete; do
    log "Rotating: rm $f"
    rm -f "$f" "${f}.sha256"
  done
}

# === MAIN ===

ACTION="${1:---full}"

if [ "$ACTION" = "--verify" ]; then
  BACKUP_FILE="$2"
  [ -z "$BACKUP_FILE" ] && die "Usage: $0 --verify <backup.db.gz>"

  if [[ "$BACKUP_FILE" == *.gz ]]; then
    TMP_VERIFY=$(mktemp /tmp/el-duck-verify-XXXXX.db)
    gunzip -c "$BACKUP_FILE" > "$TMP_VERIFY"
    verify_db "$TMP_VERIFY"
    RESULT=$?
    rm -f "$TMP_VERIFY"
    exit $RESULT
  else
    verify_db "$BACKUP_FILE"
    exit $?
  fi
fi

check_sqlite3

# Создаём бекап во временный файл, затем перемещаем
TMP_BACKUP=$(mktemp /tmp/el-duck-backup-XXXXX.db)
trap "rm -f $TMP_BACKUP" EXIT

create_backup "$DB_PATH" "$TMP_BACKUP"

BASENAME="db_${TIMESTAMP}"
FINAL_GZ="${BACKUP_DIR}/${BASENAME}.db.gz"

# Сжимаем из темпа
gzip -c "$TMP_BACKUP" > "${BACKUP_DIR}/${BASENAME}.db.gz"
rm -f "$TMP_BACKUP"

sha256sum "${BACKUP_DIR}/${BASENAME}.db.gz" > "${BACKUP_DIR}/${BASENAME}.db.gz.sha256"

# Создаём симлинки-алиасы для ротации
ln -sf "${BACKUP_DIR}/${BASENAME}.db.gz" "${BACKUP_DIR}/db_latest.db.gz"
ln -sf "${BACKUP_DIR}/${BASENAME}.db.gz.sha256" "${BACKUP_DIR}/db_latest.db.gz.sha256"

# Дневной/недельный/месячный алиас
cp -p "${BACKUP_DIR}/${BASENAME}.db.gz" "${BACKUP_DIR}/daily_${DATE_DAY}.db.gz"
cp -p "${BACKUP_DIR}/${BASENAME}.db.gz.sha256" "${BACKUP_DIR}/daily_${DATE_DAY}.db.gz.sha256"

if [ "$(date +%u)" = "1" ]; then
  cp -p "${BACKUP_DIR}/${BASENAME}.db.gz" "${BACKUP_DIR}/weekly_${DATE_WEEK}.db.gz"
  cp -p "${BACKUP_DIR}/${BASENAME}.db.gz.sha256" "${BACKUP_DIR}/weekly_${DATE_WEEK}.db.gz.sha256"
fi

if [ "$(date +%d)" = "01" ]; then
  cp -p "${BACKUP_DIR}/${BASENAME}.db.gz" "${BACKUP_DIR}/monthly_${DATE_MONTH}.db.gz"
  cp -p "${BACKUP_DIR}/${BASENAME}.db.gz.sha256" "${BACKUP_DIR}/monthly_${DATE_MONTH}.db.gz.sha256"
fi

# Ротация
rotate_backups "db" "$KEEP_HOURLY"
rotate_backups "daily" "$KEEP_DAILY"
rotate_backups "weekly" "$KEEP_WEEKLY"
rotate_backups "monthly" "$KEEP_MONTHLY"

log "Backup complete: ${BACKUP_DIR}/${BASENAME}.db.gz"

# Отправим метрику в лог
DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
log "Source DB size: $DB_SIZE"