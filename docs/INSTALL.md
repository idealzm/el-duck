# EL-DUCK VPN - Инструкция по установке на VPS

## Требования
- Ubuntu 20.04+ / Debian 11+
- Node.js 18+
- SQLite (устанавливается автоматически)

## Быстрая установка

```bash
# 1. Обновление системы
sudo apt update && sudo apt upgrade -y

# 2. Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Установка PM2 для управления процессом
sudo npm install -g pm2

# 4. Клонирование проекта (если используете git)
# или загрузка файлов через SCP/SFTP

# 5. Переход в директорию проекта
cd /path/to/el-duck.com

# 6. Установка зависимостей
npm install --production

# 7. Настройка .env файла
cp .env.example .env
nano .env
# Отредактируйте необходимые параметры

# 8. Создание директории для базы данных
mkdir -p data

# 9. Запуск сервера через PM2
pm2 start server/index.js --name el-duck-vpn

# 10. Сохранение конфигурации PM2
pm2 save

# 11. Автозапуск при загрузке системы
pm2 startup
# Выполните команду, которая будет выведена
```

## Настройка Nginx (опционально, для Proxy Manager)

Если используете Nginx Proxy Manager, настройте proxy pass:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Команды управления

```bash
# Просмотр статуса
pm2 status el-duck-vpn

# Просмотр логов
pm2 logs el-duck-vpn

# Перезапуск
pm2 restart el-duck-vpn

# Остановка
pm2 stop el-duck-vpn

# Удаление
pm2 delete el-duck-vpn
```

## Настройка внешних сервисов

### PasarGuard
1. Убедитесь, что PasarGuard доступен по HTTPS
2. Проверьте доступ админ-аккаунта к API
3. Укажите данные в `.env`:
   ```
   PASARGUARD_BASE_URL=https://el-duck.com:8000
   PASARGUARD_ADMIN_USERNAME=admin
   PASARGUARD_ADMIN_PASSWORD=your-password
   ```

### SMTP (для отправки email)
```
EMAIL_TRANSPORT=smtp
SENDMAIL_PATH=/usr/sbin/sendmail
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=System Reminder <noreply@el-duck.com>
```

### Тестовый пользовательский вход (опционально)
```
ALLOW_PASSWORD_LOGIN=false
PASSWORD_LOGIN_EMAIL=
PASSWORD_LOGIN_PASSWORD=change-me-separate-password
```

Если `PASSWORD_LOGIN_EMAIL` пустой, используется `ADMIN_EMAIL`.

### Платёжная система
Для продакшена настройте выбранную платёжную систему:
```
PAYMENT_PROVIDER=yookassa
PAYMENT_API_KEY=your-api-key
PAYMENT_SECRET=your-secret
```

## Безопасность

1. Измените `JWT_SECRET` на случайную строку
2. Настройте firewall (UFW):
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
3. Регулярно обновляйте систему
4. Используйте HTTPS через Proxy Manager

## Мониторинг

```bash
# Логи в реальном времени
pm2 logs el-duck-vpn --lines 100

# Мониторинг ресурсов
pm2 monit

# Информация о процессе
pm2 describe el-duck-vpn
```
