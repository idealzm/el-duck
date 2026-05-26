# 🚀 Развёртывание на VPS 2.27.44.228

## Шаг 1: Подключение к VPS

```bash
# Подключение по SSH
ssh root@2.27.44.228

# Или с ключом
ssh -i /path/to/key root@2.27.44.228
```

## Шаг 2: Загрузка файлов на сервер

### Вариант A: Через SCP

```bash
# С локальной машины
scp -r /Users/idealzm/Desktop/el-duckDEV/* root@2.27.44.228:/opt/el-duck-vpn/
```

### Вариант B: Через Git

```bash
# На VPS
cd /opt
git clone <your-repo-url> el-duck-vpn
cd el-duck-vpn
```

### Вариант C: Через SFTP (FileZilla, Cyberduck)

1. Подключитесь к 2.27.44.228
2. Загрузите файлы в `/opt/el-duck-vpn`

## Шаг 3: Установка и настройка

```bash
# Переход в директорию
cd /opt/el-duck-vpn

# Запуск скрипта развёртывания
sudo bash infra/vps/deploy.sh
```

### Параллельный деплой веток main + dev (PM2)

```bash
cd /opt/el-duck-vpn
REPO_URL=<your-repo-url> bash infra/vps/pm2-branches.sh
```

По умолчанию:
- main: `http://localhost:3000`
- dev: `http://localhost:3001`

## Шаг 4: Настройка .env

```bash
# Редактирование конфигурации
nano /opt/el-duck-vpn/.env
```

**Обязательно измените:**
```env
JWT_SECRET=ваша-случайная-строка-не-менее-32-символов
ADMIN_EMAIL=ваш-email-администратора
ADMIN_PASSWORD=сложный-пароль-админки

# Опционально: тестовый вход пользователя
ALLOW_PASSWORD_LOGIN=false
PASSWORD_LOGIN_EMAIL=
PASSWORD_LOGIN_PASSWORD=отдельный-пароль

# После настройки внешних сервисов:
PASARGUARD_BASE_URL=https://el-duck.com:8000
PASARGUARD_ADMIN_USERNAME=admin
PASARGUARD_ADMIN_PASSWORD=ваш-пароль
```

## Шаг 5: Перезапуск сервиса

```bash
# Перезапуск через PM2
pm2 restart el-duck-vpn

# Проверка статуса
pm2 status

# Просмотр логов
pm2 logs el-duck-vpn
```

## Шаг 6: Настройка Proxy Manager

1. Откройте Proxy Manager (обычно порт 81)
2. Добавьте новый Proxy Host:
   - **Domain Names:** `your-domain.com`
   - **Scheme:** `http`
   - **Forward Hostname/IP:** `2.27.44.228`
   - **Forward Port:** `3000`
   - **SSL:** Включите и получите сертификат Let's Encrypt

3. Настройки SSL:
   - Request a new SSL Certificate
   - Force SSL
   - HTTP/2 Support

## Шаг 7: Проверка работы

```bash
# Проверка доступности
curl http://2.27.44.228:3000/api/config

# Или через домен
curl https://your-domain.com/api/config
```

## Команды управления

```bash
# Статус
pm2 status el-duck-vpn

# Логи в реальном времени
pm2 logs el-duck-vpn --lines 100

# Перезапуск
pm2 restart el-duck-vpn

# Остановка
pm2 stop el-duck-vpn

# Запуск
pm2 start el-duck-vpn

# Удаление
pm2 delete el-duck-vpn
```

## Настройка внешних сервисов

### PasarGuard

```bash
# 1. Убедитесь, что API PasarGuard доступен
# 2. Проверьте /api/admin/token через curl
# 3. Обновите .env с данными доступа
```

## Безопасность

```bash
# Настройка UFW firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 81/tcp    # Proxy Manager (опционально)
sudo ufw enable

# Проверка статуса
sudo ufw status
```

## Мониторинг

```bash
# Использование ресурсов
pm2 monit

# Информация о процессе
pm2 describe el-duck-vpn

# Логи
tail -f /root/.pm2/logs/el-duck-vpn-out.log
tail -f /root/.pm2/logs/el-duck-vpn-error.log
```

## Решение проблем

### Сервер не запускается

```bash
# Проверка логов
pm2 logs el-duck-vpn --err

# Проверка порта
netstat -tlnp | grep 3000

# Проверка .env
cat /opt/el-duck-vpn/.env
```

### Ошибки базы данных

```bash
# Проверка прав
ls -la /opt/el-duck-vpn/data/

# Пересоздание БД (удалит все данные!)
rm /opt/el-duck-vpn/data/database.sqlite
pm2 restart el-duck-vpn
```

### Проблемы с авторизацией админа

```bash
# Проверьте email в .env
# Email должен совпадать с тем, который используется для входа
grep ADMIN_EMAIL /opt/el-duck-vpn/.env
```

## Обновление

```bash
cd /opt/el-duck-vpn

# Загрузка новых файлов (если через git)
git pull

# Установка зависимостей
npm install --production

# Перезапуск
pm2 restart el-duck-vpn
```

---

**Готово!** 🎉

Сервер должен быть доступен по адресу:
- Локально: `http://2.27.44.228:3000`
- Через домен: `https://your-domain.com`
- Админ-панель: `https://your-domain.com/admin`
