# EL-DUCK VPN — Заметки

## VPS деплой

```bash
# Первичная установка
bash infra/vps/deploy.sh --init

# Обновление (бекап БД → pull → npm ci → restart, .env сохраняется)
bash infra/vps/deploy.sh

# Откат к предыдущему коммиту
bash infra/vps/deploy.sh --rollback

# Восстановление БД из бекапа
bash infra/vps/deploy.sh --restore data/backup/db_20250526_120000.db.gz

# Ручной бекап БД
bash infra/vps/deploy.sh --backup

# Статус (git, PM2, база, бекапы, cron)
bash infra/vps/deploy.sh --status
```

## Локальная разработка

```bash
npm install                    # установить зависимости
npm run dev                    # запуск на порту из .env (7777)
npm run start                  # production запуск
npm run clean:local            # удалить локальные артефакты

# HTTPS через Caddy:
caddy reverse-proxy --from https://localhost:7778 --to http://localhost:7777
```

## Бекапы БД (авто — каждые 6 часов через cron)

```bash
# Ручной бекап
bash scripts/backup-db.sh

# Проверка бекапа
bash scripts/backup-db.sh --verify data/backup/db_20250526_120000.db.gz
```

Ротация: 8 hourly → 7 daily → 4 weekly → 6 monthly

## Git

```bash
git push origin main           # запушить стабильную версию
```

## Архитектура

- Порт 3000 (VPS) / 7777 (local) — Node.js + Express
- Порт 8000 — Pasarguard (3X-UI)
- Reverse-proxy (Caddy/Nginx) → :443 → :3000
- SQLite — data/database.sqlite
- PM2 — менеджер процессов

## Безопасность

- `.env` — в `.gitignore`, никогда не коммитится
- Pre-commit hook — `scripts/check-secrets.sh` проверяет staging на секреты
- Бекапы БД — с SHA256 и integrity check