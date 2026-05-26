#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# EL-DUCK VPN — Deploy to VPS
#
# Однократная установка + деплой обновлений.
# Порт: 3000 (reverse-proxy → Caddy/Nginx → 443)
#
# Первичная установка:
#   bash infra/vps/deploy.sh --init
#
# Обновление (pull + restart):
#   bash infra/vps/deploy.sh
#
# Откат бекапа:
#   bash infra/vps/deploy.sh --restore /path/to/backup.db.gz
# ============================================================

PROJECT_DIR="${EL_DUCK_DIR:-/root/el-duckDEV}"
APP_PORT="${EL_DUCK_PORT:-3000}"
APP_USER="${EL_DUCK_USER:-root}"
REPO_URL="${EL_DUCK_REPO_URL:-}"
BRANCH="${EL_DUCK_BRANCH:-main}"
BACKUP_DIR="${PROJECT_DIR}/data/backup"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { log "ERROR: $*"; exit 1; }

# ---------------------------- init ----------------------------
init_vps() {
  log "=== Первичная настройка VPS ==="

  [ "$EUID" -ne 0 ] && die "Запустите от root: sudo bash infra/vps/deloy.sh --init"

  # Обновление системы
  log "Обновление системы..."
  apt update && apt upgrade -y

  # Node.js 20 LTS
  if ! command -v node &>/dev/null || [[ "$(node -v)" != "v2"[0-9]* ]]; then
    log "Установка Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
  fi
  log "Node.js: $(node -v), npm: $(npm -v)"

  # pm2
  if ! command -v pm2 &>/dev/null; then
    log "Установка PM2..."
    npm install -g pm2
  fi

  # sqlite3 (для бекапов)
  if ! command -v sqlite3 &>/dev/null; then
    log "Установка sqlite3..."
    apt install -y sqlite3
  fi

  # Клонирование
  if [ ! -d "$PROJECT_DIR/.git" ]; then
    if [ -z "$REPO_URL" ]; then
      log "REPO_URL не задан. Клонируйте репозиторий вручную или задайте EL_DUCK_REPO_URL"
      log "Пример: git clone <url> $PROJECT_DIR"
      mkdir -p "$PROJECT_DIR"
    else
      log "Клонирование $REPO_URL (ветка $BRANCH)..."
      git clone -b "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
    fi
  fi

  cd "$PROJECT_DIR"

  # .env
  if [ ! -f .env ]; then
    log "Создание .env из шаблона..."
    cp .env.example .env
    log "!!! ОТРЕДАКТИРУЙТЕ .env перед запуском: nano $PROJECT_DIR/.env"
    exit 0
  fi

  # Зависимости
  log "Установка зависимостей..."
  npm ci --production

  # Директории
  mkdir -p data/backup

  # Права на бекап-скрипт
  chmod +x scripts/backup-db.sh

  # PM2
  log "Запуск через PM2..."
  pm2 delete el-duck 2>/dev/null || true
  NODE_ENV=production PORT="$APP_PORT" pm2 start ecosystem.config.cjs
  pm2 save

  # Autostart
  log "Настройка автозапуска..."
  pm2 startup systemd -u "$APP_USER" --hp "/root" 2>/dev/null || true

  # Cron — бекап каждые 6 часов
  local CRON_LINE="0 */6 * * * $PROJECT_DIR/scripts/backup-db.sh >> /var/log/el-duck-backup.log 2>&1"
  if ! crontab -l 2>/dev/null | grep -q "backup-db.sh"; then
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    log "Cron: бекап БД каждые 6 часов"
  fi

  # Firewall
  if command -v ufw &>/dev/null; then
    ufw allow "$APP_PORT"/tcp 2>/dev/null || true
    log "UFW: порт $APP_PORT открыт"
  fi

  # Systemd unit
  local SERVICE_FILE="/etc/systemd/system/el-duck.service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=EL-DUCK VPN Server
After=network.target

[Service]
Type=forking
User=$APP_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/pm2 start ecosystem.config.cjs
ExecStop=/usr/bin/pm2 stop el-duck
ExecReload=/usr/bin/pm2 restart el-duck
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload

  log "=== Установка завершена ==="
  log "Сервер: http://localhost:$APP_PORT"
  log "Логи: pm2 logs el-duck"
  log "Бекапы: $BACKUP_DIR/"
}

# ------------------------ deploy (update) ------------------------
deploy_update() {
  log "=== Обновление приложения ==="

  cd "$PROJECT_DIR"

  # Бекап перед обновлением
  log "Создание бекапа БД перед обновлением..."
  bash scripts/backup-db.sh

  # Pull
  if [ -d .git ]; then
    log "Git pull..."
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
  else
    log "Нет .git — пропускаем git pull"
  fi

  # Зависимости
  log "Установка зависимостей..."
  npm ci --production 2>/dev/null || npm install --production

  # Перезапуск
  log "Перезапуск PM2..."
  pm2 restart el-duck || pm2 start ecosystem.config.cjs
  pm2 save

  log "=== Обновление завершено ==="
  pm2 status el-duck
}

# ----------------------- restore backup -----------------------
restore_backup() {
  local BACKUP_FILE="$1"
  [ -z "$BACKUP_FILE" ] && die "Укажите файл бекапа: bash infra/vps/deploy.sh --restore /path/to/backup.db.gz"

  [ ! -f "$BACKUP_FILE" ] && die "Файл не найден: $BACKUP_FILE"

  cd "$PROJECT_DIR"

  local DB_PATH
  DB_PATH=$(grep -E '^DATABASE_PATH=' .env 2>/dev/null | head -1 | cut -d= -f2- || echo './data/database.sqlite')
  DB_PATH="$(cd "$PROJECT_DIR" && realpath "$DB_PATH" 2>/dev/null || echo "$PROJECT_DIR/$DB_PATH")"

  log "=== Восстановление БД из бекапа ==="
  log "Файл: $BACKUP_FILE"
  log "Цель: $DB_PATH"

  # SHA256 проверка
  if [ -f "${BACKUP_FILE}.sha256" ]; then
    log "Проверка SHA256..."
    sha256sum -c "${BACKUP_FILE}.sha256" || die "SHA256 не совпадает!"
    log "SHA256: OK"
  fi

  # Остановка сервера
  log "Остановка сервера..."
  pm2 stop el-duck 2>/dev/null || true

  # Бекап текущей БД (на всякий случай)
  local EMERGENCY_BACKUP="${DB_PATH}.pre-restore-$(date +%Y%m%d_%H%M%S)"
  if [ -f "$DB_PATH" ]; then
    log "Экстренный бекап текущей БД -> $EMERGENCY_BACKUP"
    cp "$DB_PATH" "$EMERGENCY_BACKUP"
  fi

  # Восстановление
  if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" > "$DB_PATH"
  else
    cp "$BACKUP_FILE" "$DB_PATH"
  fi

  # Проверка
  log "Проверка целостности..."
  if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1 | grep -q "ok"; then
    log "Целостность: OK"
  else
    log "ВНИМАНИЕ: целостность БД под вопросом!"
    if [ -f "$EMERGENCY_BACKUP" ]; then
      log "Восстановление аварийной копии..."
      cp "$EMERGENCY_BACKUP" "$DB_PATH"
    fi
    die "Восстановление прервано — БД повреждена"
  fi

  # Запуск сервера
  log "Запуск сервера..."
  pm2 start ecosystem.config.cjs || pm2 restart el-duck

  log "=== Восстановление завершено ==="
}

# ----------------------- status -----------------------
show_status() {
  echo "=== EL-DUCK VPN Status ==="
  echo ""
  echo "Directory: $PROJECT_DIR"
  echo "Port: $APP_PORT"
  echo ""

  cd "$PROJECT_DIR" 2>/dev/null || die "Нет директории проекта: $PROJECT_DIR"

  # PM2
  echo "--- PM2 ---"
  pm2 status el-duck 2>/dev/null || echo "el-duck not running"

  # DB info
  local DB_PATH
  DB_PATH=$(grep -E '^DATABASE_PATH=' .env 2>/dev/null | head -1 | cut -d= -f2- || echo './data/database.sqlite')
  DB_PATH="$PROJECT_DIR/$DB_PATH"

  if [ -f "$DB_PATH" ]; then
    echo ""
    echo "--- Database ---"
    echo "Size: $(du -h "$DB_PATH" | cut -f1)"
    echo "Integrity: $(sqlite3 "$DB_PATH" 'PRAGMA integrity_check;' 2>/dev/null || echo 'error')"
    echo "Tables: $(sqlite3 "$DB_PATH" '.tables' 2>/dev/null | tr ' ' '\n' | wc -l | tr -d ' ')"
  fi

  # Backups
  echo ""
  echo "--- Backups ---"
  if [ -d "$BACKUP_DIR" ]; then
    ls -lht "$BACKUP_DIR"/*.gz 2>/dev/null | head -5 || echo "No backups"
  else
    echo "No backup directory"
  fi

  # Cron
  echo ""
  echo "--- Cron (backup) ---"
  crontab -l 2>/dev/null | grep "backup-db" || echo "No backup cron configured"
}

# ----------------------- main -----------------------
ACTION="${1:---deploy}"

case "$ACTION" in
  --init)   init_vps ;;
  --restore) restore_backup "$2" ;;
  --status) show_status ;;
  --deploy|*) deploy_update ;;
esac