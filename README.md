# 🦆 EL-DUCK VPN

Сервис продажи и управления VPN-подписками с интеграцией PasarGuard.

## Возможности

- 📱 **Клиентская часть**
  - Авторизация через email с кодом подтверждения
  - Пополнение баланса (интеграция с платёжными системами)
  - Оформление VPN-подписки (единая подписочная ссылка PasarGuard)
  - Просмотр конфигураций и инструкций по подключению

- 🔧 **Админ-панель** (`/admin`)
  - Дашборд со статистикой
  - Управление пользователями (баланс, подписки)
  - История платежей
  - Настройка цен
  - Настройка тарифов и шаблонов PasarGuard

## Структура проекта

```
el-duck.com/
├── docs/                   # Документация
│   ├── INSTALL.md          # Ручная установка на VPS
│   └── DEPLOY_VPS.md       # Пошаговый деплой
├── infra/
│   └── vps/
│       ├── deploy.sh       # Скрипт развёртывания
│       └── el-duck-vpn.service # unit-файл systemd/PM2
├── public/                 # Фронтенд
│   ├── index.html         # Клиентская часть
│   ├── admin.html         # Админ-панель
│   ├── styles.css         # Стили клиента
│   ├── admin.css          # Стили админки
│   ├── client-app.js      # Клиентский JS
│   ├── admin-panel.js     # JS админки
│   ├── assets/
│   │   ├── brand/         # Логотипы
│   │   └── icons/         # Favicon/PWA иконки
│   └── manifest.json      # PWA manifest
├── server/
│   ├── index.js           # Основной сервер
│   ├── config/
│   │   ├── env.js         # Конфигурация
│   │   └── database.js    # SQLite
│   ├── routes/
│   │   ├── auth.js        # Авторизация
│   │   ├── user.js        # Личный кабинет
│   │   ├── subscriptions.js # Подписки
│   │   ├── payments.js    # Платежи
│   │   ├── adminRoutes.js # Админ API
│   │   ├── adminAuthRoutes.js # Авторизация админа
│   │   └── admin/         # Декомпозиция админ-маршрутов
│   ├── services/
│   │   ├── email.js       # Email рассылка
│   │   ├── pasarguardService.js # PasarGuard интеграция
│   │   ├── userAccountService.js # Логика личного кабинета
│   │   ├── userPaymentsService.js # Платежи/промо пользователя
│   │   ├── adminSubscriptionService.js # Подписки в админке
│   │   ├── adminBillingService.js # Биллинг в админке
│   │   ├── adminPromoService.js # Промокоды в админке
│   │   ├── adminReferralService.js # Рефералы в админке
│   │   ├── adminSettingsService.js # Настройки в админке
│   │   ├── adminNotificationService.js # Уведомления в админке
│   │   └── payment.js     # Платёжные системы
│   ├── middleware/
│   │   ├── auth.js        # Проверка токена
│   │   ├── admin.js       # Проверка админа
│   │   └── errorHandler.js # Централизованный обработчик ошибок
│   └── models/
│       ├── User.js        # Модель пользователя
│       ├── Subscription.js # Модель подписки
│       ├── Payment.js     # Модель платежа
│       ├── AuthCode.js    # Коды авторизации
│       └── Setting.js     # Настройки
├── .env                   # Конфигурация (не в git!)
├── .env.example           # Шаблон конфигурации
└── package.json
```

## Быстрый старт (локально)

```bash
# Установка зависимостей
npm install

# Копирование .env
cp .env.example .env

# Запуск
npm start

# Режим разработки
npm run dev

# Быстрый smoke-check (при запущенном сервере)
npm run smoke

# Установка pre-commit проверки секретов
npm run hooks:install

# Ручной запуск проверки секретов
npm run check:secrets
```

Сервер запустится на `http://localhost:3000`

### PM2 (одновременно main + dev)

```bash
# Локальный запуск по ecosystem-файлу
npm run pm2:start

# Обновление env и перезагрузка
npm run pm2:reload

# Остановка
npm run pm2:stop
```

Для VPS-параллельного деплоя веток используйте один скрипт:

```bash
REPO_URL=git@github.com:ORG/REPO.git bash infra/vps/pm2-branches.sh
```

Скрипт поднимет две копии проекта: `main` и `dev` на разных портах.

Полезные команды:

```bash
# Синхронизировать и перезапустить main
REPO_URL=git@github.com:ORG/REPO.git bash infra/vps/pm2-branches.sh sync-main

# Синхронизировать и перезапустить dev
REPO_URL=git@github.com:ORG/REPO.git bash infra/vps/pm2-branches.sh sync-dev

# Перенести изменения из dev в main, запушить main и перезапустить main
REPO_URL=git@github.com:ORG/REPO.git bash infra/vps/pm2-branches.sh update-main
```

## Развёртывание на VPS

```bash
# Автоматическая установка
sudo bash infra/vps/deploy.sh

# Или вручную (см. docs/INSTALL.md)
```

## Конфигурация (.env)

### Обязательные параметры

```env
# Порт сервера
PORT=3000

# JWT Secret (замените на случайную строку!)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Bootstrap админ-аккаунт (только для первого входа)
ADMIN_EMAIL=admin@el-duck.com
ADMIN_PASSWORD=your-secure-admin-password

# Опционально: тестовый вход пользователя по email+паролю
ALLOW_PASSWORD_LOGIN=false
PASSWORD_LOGIN_EMAIL=
PASSWORD_LOGIN_PASSWORD=change-me-separate-password
```

### SMTP (для отправки кодов)

```env
EMAIL_TRANSPORT=smtp
SENDMAIL_PATH=/usr/sbin/sendmail
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=System Reminder <noreply@el-duck.com>
```

### Внешние сервисы

```env
# PasarGuard (VPN backend)
PASARGUARD_BASE_URL=https://el-duck.com:8000
PASARGUARD_ADMIN_USERNAME=admin
PASARGUARD_ADMIN_PASSWORD=change-me
```

### Платёжная система

```env
PAYMENT_PROVIDER=stub  # stub для разработки, yookassa для продакшена
PAYMENT_API_KEY=your-api-key
PAYMENT_SECRET=your-secret
```

## API Endpoints

### Публичные

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/config` | Публичные настройки (цены) |
| POST | `/api/auth/send-code` | Отправка кода на email |
| POST | `/api/auth/verify-code` | Проверка кода, получение токена |

### Авторизованные (пользователь)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/user/me` | Данные пользователя |
| GET | `/api/user/balance` | Баланс |
| POST | `/api/user/topup` | Пополнение баланса |
| GET | `/api/user/subscriptions` | Список подписок |
| POST | `/api/subscriptions/create` | Оформление подписки |
| PUT | `/api/user/subscriptions/:type/cancel` | Отмена подписки (VPN) |
| GET | `/api/user/config/:type` | Конфигурация подписки |

### Админ-панель

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/admin/stats` | Статистика дашборда |
| GET | `/api/admin/users` | Список пользователей |
| PUT | `/api/admin/users/:id/balance` | Изменение баланса |
| PUT | `/api/admin/users/:id/subscription` | Управление подпиской |
| GET | `/api/admin/payments` | История платежей |
| GET | `/api/admin/settings` | Настройки |
| PUT | `/api/admin/settings` | Сохранение настроек |
| GET | `/api/admin/pasarguard/templates` | Шаблоны PasarGuard для выбора в настройках |

## Тариф

VPN (PasarGuard) — ежедневное списание с баланса, цена по умолчанию задаётся в настройках (`vpn_price`).

### Жизненный цикл VPN-подписки

- При создании подписки пользователь создаётся в PasarGuard по шаблону из админки (`defaultUserTemplateId`)
- Пользователь получает одну подписочную ссылку + QR
- При отмене подписки доступ сохраняется до `next_charge_at`, затем пользователь переводится в `disabled`
- При нехватке средств в момент списания пользователь переводится в `disabled`
- Через 7 дней в `disabled` (если не возобновили) пользователь удаляется из PasarGuard

## База данных

SQLite с таблицами:
- `users` — пользователи
- `subscriptions` — подписки
- `payments` — платежи
- `auth_codes` — коды авторизации
- `settings` — настройки

## Локальные runtime-папки

Эти папки появляются после запуска/тестов и не должны коммититься:

- `node_modules/`
- `data/` (sqlite + wal/shm)
- `.opencode/`

## Безопасность

- JWT токены для авторизации
- Хеширование чувствительных данных
- Rate limiting для API
- Проверка прав администратора

## Технологии

- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3)
- **Auth:** JWT
- **Email:** Nodemailer
- **External APIs:** Axios
- **Frontend:** Vanilla JS

## Лицензия

MIT
