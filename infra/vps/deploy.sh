#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# EL-DUCK VPN — VPS Deploy & Update
#
# Порт: 3000 (PM2)
#
# Команды:
#   bash infra/vps/deploy.sh                # Обновить до последнего коммита
#   bash infra/vps/deploy.sh --init         # Первичная установка на VPS
#   bash infra/vps/deploy.sh --rollback     # Откатить к предыдущему коммиту
#   bash infra/vps/deploy.sh --restore F    # Восстановить БД из бекапа
#   bash infra/vps/deploy.sh --status       # Статус сервера и бекапов
#   bash infra/vps/deploy.sh --backup       # Создать бекап БД прямо сейчас
# ============================================================

PROJECT_DIR="${EL_DUCK_DIR:-/root/el-duck}"
APP_PORT="${EL_DUCK_PORT:-3000}"
APP_USER="${EL_DUCK_USER:-root}"
REPO_URL="${EL_DUCK_REPO_URL:-}"
BRANCH="${EL_DUCK_BRANCH:-main}"
BACKUP_DIR="${PROJECT_DIR}/data/backup"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { log "FATAL: $*"; exit 1; }
warn() { log "WARN: $*"; }

resolve_db_path() {
  local raw
  raw=$(grep -E '^DATABASE_PATH=' "$PROJECT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || echo './data/database.sqlite')
  echo "$(cd "$PROJECT_DIR" && realpath "$raw" 2>/dev/null || echo "$PROJECT_DIR/$raw")"
}

# ======================== INIT ========================
cmd_init() {
  log "=== Первичная установка EL-DUCK VPN ==="

  [ "$EUID" -ne 0 ] && die "Запустите от root: sudo bash infra/vps/deploy.sh --init"

  log "Обновление системы..."
  apt update && apt upgrade -y

  if ! command -v node &>/dev/null || [[ "$(node -v)" != "v2"[0-9]* ]]; then
    log "Установка Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
  fi
  log "Node.js: $(node -v), npm: $(npm -v)"

  if ! command -v pm2 &>/dev/null; then
    log "Установка PM2..."
    npm install -g pm2
  fi

  if ! command -v sqlite3 &>/dev/null; then
    log "Установка sqlite3..."
    apt install -y sqlite3
  fi

  if [ ! -d "$PROJECT_DIR/.git" ]; then
    if [ -z "$REPO_URL" ]; then
      die "REPO_URL не задан. Задайте EL_DUCK_REPO_URL или клонируйте вручную: git clone <url> $PROJECT_DIR"
    fi
    log "Клонирование $REPO_URL ($BRANCH)..."
    git clone -b "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
  fi

  cd "$PROJECT_DIR"

  if [ ! -f .env ]; then
    log "Создание .env из шаблона..."
    cp .env.example .env
    log ""
    log "!!! ОБЯЗАТЕЛЬНО отредактируйте .env перед запуском:"
    log "    nano $PROJECT_DIR/.env"
    log ""
    log "Ключевые поля: JWT_SECRET, ADMIN_PASSWORD, PASARGUARD_ADMIN_USERNAME/PASSWORD"
    exit 0
  fi

  log "Установка зависимостей..."
  npm ci --production

  mkdir -p data/backup
  chmod +x scripts/backup-db.sh scripts/check-secrets.sh scripts/install-hooks.sh

  log "Запуск через PM2..."
  pm2 delete el-duck 2>/dev/null || true
  NODE_ENV=production PORT="$APP_PORT" pm2 start ecosystem.config.cjs
  pm2 save

  log "Настройка автозапуска..."
  pm2 startup systemd -u "$APP_USER" --hp "/root" 2>/dev/null || true

  local CRON_LINE="0 */6 * * * $PROJECT_DIR/scripts/backup-db.sh >> /var/log/el-duck-backup.log 2>&1"
  if ! crontab -l 2>/dev/null | grep -q "backup-db.sh"; then
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    log "Cron: бекап БД каждые 6 часов"
  fi

  if command -v ufw &>/dev/null; then
    ufw allow "$APP_PORT"/tcp 2>/dev/null || true
    log "UFW: порт $APP_PORT открыт"
  fi

  cat > /etc/systemd/system/el-duck.service <<EOF
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
Environment=PORT=$APP_PORT

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload

  log ""
  log "=== Установка завершена ==="
  log "Сервер: http://localhost:$APP_PORT"
  log "Логи: pm2 logs el-duck"
  log "Статус: bash infra/vps/deploy.sh --status"
}

# ======================== DEPLOY (update) ========================
cmd_deploy() {
  log "=== Обновление EL-DUCK VPN ==="

  cd "$PROJECT_DIR"

  if [ ! -d .git ]; then
    die "Нет .git в $PROJECT_DIR. Для обновлений необходим git-репозиторий."
  fi

  # --- Сохраняем текущий коммит ---
  local CURRENT_COMMIT
  CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  log "Текущий коммит: ${CURRENT_COMMIT:0:8}"

  # --- Бекап БД ---
  log "Бекап БД перед обновлением..."
  bash scripts/backup-db.sh

  # --- Сохраняем .env ---
  local ENV_BACKUP
  ENV_BACKUP=$(mktemp /tmp/el-duck-env-XXXXXX)
  cp .env "$ENV_BACKUP"
  log ".env сохранён в временном файле"

  # --- Pull ---
  log "Получение обновлений..."
  git fetch origin "$BRANCH"

  local REMOTE_COMMIT
  REMOTE_COMMIT=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "unknown")

  if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
    log "Уже на последнем коммите ${CURRENT_COMMIT:0:8}. Обновление не требуется."
    rm -f "$ENV_BACKUP"
    exit 0
  fi

  log "Обновление: ${CURRENT_COMMIT:0:8} -> ${REMOTE_COMMIT:0:8}"

  # --- Stash локальных изменений (кроме .env) ---
  if ! git diff --quiet -- ':!.env' 2>/dev/null; then
    log "Сохранение локальных изменений..."
    git stash push -- ':!.env' 2>/dev/null || warn "stash не нужен"
  fi

  # --- Применяем обновление ---
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"

  # --- Восстанавливаем .env ---
  if [ -f "$ENV_BACKUP" ]; then
    cp "$ENV_BACKUP" .env
    log ".env восстановлен"
    rm -f "$ENV_BACKUP"
  fi

  # --- Восстанавливаем stash если был ---
  if git stash list 2>/dev/null | head -1 | grep -q "On $BRANCH"; then
    log "Восстановление локальных изменений..."
    git stash pop 2>/dev/null || warn "Конфликт при stash pop — разрешите вручную"
  fi

  # --- Зависимости ---
  log "Установка зависимостей..."
  npm ci --production 2>/dev/null || npm install --production

  # --- Health check перед restart ---
  log "Проверка конфигурации..."
  if [ ! -f .env ]; then
    die ".env отсутствует! Восстановите из бекапа: cp .env.example .env"
  fi

  # --- Перезапуск ---
  log "Перезапуск PM2..."
  if pm2 describe el-duck &>/dev/null; then
    pm2 restart el-duck
  else
    NODE_ENV=production PORT="$APP_PORT" pm2 start ecosystem.config.cjs
  fi
  pm2 save

  # --- Проверка что процесс жив ---
  sleep 3
  if pm2 describe el-duck &>/dev/null && pm2 jlist 2>/dev/null | grep -q '"status":"online"'; then
    log "=== Обновление завершено (${REMOTE_COMMIT:0:8}) ==="
  else
    log "ПРЕДУПРЕЖДЕНИЕ: PM2 процесс не в статусе online"
    log "Проверьте логи: pm2 logs el-duck"
  fi

  # --- Очистка ---
  log "Очистка старых файлов npm..."
  npm prune --production 2>/dev/null || true

  pm2 status
}

# ======================== ROLLBACK ========================
cmd_rollback() {
  log "=== Откат к предыдущему коммиту ==="

  cd "$PROJECT_DIR"

  if [ ! -d .git ]; then
    die "Нет .git — откат невозможен"
  fi

  local CURRENT_COMMIT
  CURRENT_COMMIT=$(git rev-parse HEAD)
  local PREV_COMMIT
  PREV_COMMIT=$(git rev-parse HEAD~1 2>/dev/null || die "Нет предыдущего коммита")

  log "Откат: ${CURRENT_COMMIT:0:8} -> ${PREV_COMMIT:0:8}"
  log ""
  log "Изменения в откате:"
  git log --oneline -1 "$PREV_COMMIT"
  echo ""

  # Бекап БД
  log "Бекап БД перед откатом..."
  bash scripts/backup-db.sh

  # Сохраняем .env
  local ENV_BACKUP
  ENV_BACKUP=$(mktemp /tmp/el-duck-env-XXXXXX)
  cp .env "$ENV_BACKUP"

  # Откат
  git reset --hard "$PREV_COMMIT"

  # Восстанавливаем .env
  cp "$ENV_BACKUP" .env
  rm -f "$ENV_BACKUP"
  log ".env восстановлен"

  # Зависимости
  log "Установка зависимостей..."
  npm ci --production 2>/dev/null || npm install --production

  # Перезапуск
  log "Перезапуск PM2..."
  if pm2 describe el-duck &>/dev/null; then
    pm2 restart el-duck
  else
    NODE_ENV=production PORT="$APP_PORT" pm2 start ecosystem.config.cjs
  fi
  pm2 save

  sleep 3
  log "=== Откат завершён (${PREV_COMMIT:0:8}) ==="
  pm2 status
  log ""
  log "Для отката на конкретный коммит используйте:"
  log "  git log --oneline -10          # выбрать коммит"
  log "  git reset --hard <commit>      # откатиться"
  log "  bash infra/vps/deploy.sh       # перезапустить"
}

# ======================== RESTORE DB ========================
cmd_restore() {
  local BACKUP_FILE="${1:-}"
  [ -z "$BACKUP_FILE" ] && die "Укажите файл бекапа:\n  bash infra/vps/deploy.sh --restore /path/to/backup.db.gz"

  [ ! -f "$BACKUP_FILE" ] && die "Файл не найден: $BACKUP_FILE"

  cd "$PROJECT_DIR"

  local DB_PATH
  DB_PATH=$(resolve_db_path)

  log "=== Восстановление БД ==="
  log "Файл:  $BACKUP_FILE"
  log "Цель:  $DB_PATH"

  # SHA256
  if [ -f "${BACKUP_FILE}.sha256" ]; then
    log "Проверка SHA256..."
    sha256sum -c "${BACKUP_FILE}.sha256" || die "SHA256 не совпадает!"
    log "SHA256: OK"
  else
    warn "SHA256 файл не найден — пропускаю проверку"
  fi

  # Остановка
  log "Остановка сервера..."
  pm2 stop el-duck 2>/dev/null || true

  # Экстренная копия текущей БД
  local EMERGENCY="${DB_PATH}.pre-restore-$(date +%Y%m%d_%H%M%S)"
  if [ -f "$DB_PATH" ]; then
    log "Экстренная копия текущей БД -> $EMERGENCY"
    cp "$DB_PATH" "$EMERGENCY"
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
    log "ВНИМАНИЕ: целостность БД нарушена!"
    if [ -f "$EMERGENCY" ]; then
      log "Возврат к аварийной копии..."
      cp "$EMERGENCY" "$DB_PATH"
    fi
    die "Восстановление прервано — БД повреждена"
  fi

  # Запуск
  log "Запуск сервера..."
  pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart el-duck

  log "=== Восстановление завершено ==="
}

# ======================== BACKUP ========================
cmd_backup() {
  cd "$PROJECT_DIR"
  bash scripts/backup-db.sh
}

# ======================== STATUS ========================
cmd_status() {
  echo "=== EL-DUCK VPN Status ==="
  echo ""
  echo "Directory: $PROJECT_DIR"
  echo "Port:       $APP_PORT"
  echo ""

  cd "$PROJECT_DIR" 2>/dev/null || die "Нет директории проекта: $PROJECT_DIR"

  # Git
  echo "--- Git ---"
  if [ -d .git ]; then
    echo "Branch:  $(git branch --show-current 2>/dev/null || echo '?')"
    echo "Commit:  $(git log --oneline -1 2>/dev/null || echo '?')"
    echo "Remote:  $(git remote get-url origin 2>/dev/null || echo 'not set')"
    if git diff --quiet 2>/dev/null; then
      echo "Changes: clean"
    else
      echo "Changes: $(git diff --stat 2>/dev/null | tail -1 || echo 'dirty')"
    fi
  else
    echo "No git repository"
  fi

  # PM2
  echo ""
  echo "--- PM2 ---"
  pm2 describe el-duck &>/dev/null && pm2 status el-duck || echo "el-duck not running"

  # DB
  local DB_PATH
  DB_PATH=$(resolve_db_path)
  echo ""
  echo "--- Database ---"
  if [ -f "$DB_PATH" ]; then
    echo "Path:      $DB_PATH"
    echo "Size:      $(du -h "$DB_PATH" | cut -f1)"
    echo "Integrity: $(sqlite3 "$DB_PATH" 'PRAGMA integrity_check;' 2>/dev/null || echo 'error')"
    echo "Users:      $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM users;' 2>/dev/null || echo '?')"
    echo "Admins:    $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM admins;' 2>/dev/null || echo '?')"
  else
    echo "Not found: $DB_PATH"
  fi

  # Backups
  echo ""
  echo "--- Backups ---"
  if [ -d "$BACKUP_DIR" ]; then
    local COUNT
    COUNT=$(ls -1 "$BACKUP_DIR"/*.gz 2>/dev/null | wc -l | tr -d ' ')
    echo "Count: $COUNT"
    ls -lht "$BACKUP_DIR"/*.gz 2>/dev/null | head -5 || echo "No backups"
    echo ""
    echo "Latest: $(ls -lht "$BACKUP_DIR"/db_latest.db.gz 2>/dev/null || echo 'none')"
  else
    echo "No backup directory"
  fi

  # Cron
  echo ""
  echo "--- Cron ---"
  crontab -l 2>/dev/null | grep "backup-db" || echo "No backup cron configured"
}

# ======================== MAIN ========================
ACTION="${1:---deploy}"

case "$ACTION" in
  --init)     cmd_init ;;
  --deploy)   cmd_deploy ;;
  --rollback) cmd_rollback ;;
  --restore)  cmd_restore "$2" ;;
  --backup)   cmd_backup ;;
  --status)   cmd_status ;;
  *)
    echo "Использование: bash infra/vps/deploy.sh <команда>"
    echo ""
    echo "Команды:"
    echo "  (без аргументов)  Обновить до последнего коммита (git pull + restart)"
    echo "  --init            Первичная установка на VPS"
    echo "  --rollback        Откатить к предыдущему коммиту"
    echo "  --restore <file>  Восстановить БД из бекапа (.gz)"
    echo "  --backup          Создать бекап БД вручную"
    echo "  --status          Показать статус сервера"
    exit 1
    ;;
esac