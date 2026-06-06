const dotenv = require('dotenv');
const path = require('path');

// Загружаем переменные окружения
dotenv.config({ path: path.join(__dirname, '../../.env') });

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseTrustProxy(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  const hops = Number.parseInt(normalized, 10);
  if (Number.isInteger(hops) && hops >= 0) return hops;

  return String(value).trim();
}

function parseDurationToMs(value, defaultValueMs) {
  if (value === undefined || value === null || value === '') return defaultValueMs;
  const raw = String(value).trim().toLowerCase();

  if (/^\d+$/.test(raw)) {
    const ms = Number.parseInt(raw, 10);
    return Number.isFinite(ms) && ms > 0 ? ms : defaultValueMs;
  }

  const match = raw.match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!match) return defaultValueMs;
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return defaultValueMs;

  const unit = match[2];
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return amount * multipliers[unit];
}

const isProduction = process.env.NODE_ENV === 'production';
const allowInsecureDevAuth = toBool(process.env.ALLOW_INSECURE_DEV_AUTH, false);
const jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  if (isProduction || !allowInsecureDevAuth) {
    throw new Error('JWT_SECRET must be set and at least 32 chars (or set ALLOW_INSECURE_DEV_AUTH=true for local dev only)');
  }
}
if (!jwtSecret && allowInsecureDevAuth) {
  throw new Error('JWT_SECRET must be set even in dev mode. Use a secure random value.');
}

const adminPassword = process.env.ADMIN_PASSWORD || '';
if (isProduction && adminPassword.length < 12) {
  throw new Error('ADMIN_PASSWORD must be set and at least 12 chars in production');
}

const supportTokenEncryptionKey = process.env.SUPPORT_TOKEN_ENCRYPTION_KEY || '';
if (isProduction && supportTokenEncryptionKey.length < 32) {
  throw new Error('SUPPORT_TOKEN_ENCRYPTION_KEY must be set and at least 32 chars in production');
}

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@el-duck.com').trim().toLowerCase();
const passwordLoginEmail = (process.env.PASSWORD_LOGIN_EMAIL || '').trim().toLowerCase() || adminEmail;

module.exports = {
  // Сервер
  port: process.env.PORT || 3000,
  
  // JWT
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '180d',
  
  // База данных
  databasePath: process.env.DATABASE_PATH || './data/database.sqlite',
  
  // SMTP
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'System Reminder <noreply@el-duck.com>'
  },

  // Почта
  email: {
    transport: (process.env.EMAIL_TRANSPORT || 'smtp').toLowerCase(),
    sendmailPath: process.env.SENDMAIL_PATH || '/usr/sbin/sendmail'
  },
  
  // PasarGuard
  pasarguard: {
    baseUrl: process.env.PASARGUARD_BASE_URL || 'https://el-duck.com:8000',
    adminUsername: process.env.PASARGUARD_ADMIN_USERNAME || '',
    adminPassword: process.env.PASARGUARD_ADMIN_PASSWORD || '',
    skipTls: toBool(process.env.PASARGUARD_SKIP_TLS, false)
  },
  
  // Безопасность
  security: {
    corsOrigin: process.env.CORS_ORIGIN || '',
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY, false)
  },

  support: {
    tokenEncryptionKey: supportTokenEncryptionKey || (isProduction ? '' : jwtSecret || 'support-dev-key')
  },

  auth: {
    userCookieName: process.env.AUTH_COOKIE_NAME || 'ed_user_session',
    adminCookieName: process.env.ADMIN_AUTH_COOKIE_NAME || 'ed_admin_session',
    cookieSameSite: process.env.AUTH_COOKIE_SAMESITE || 'strict',
    cookiePath: process.env.AUTH_COOKIE_PATH || '/',
    cookieMaxAgeMs: Math.max(
      60 * 60 * 1000,
      parseDurationToMs(process.env.AUTH_COOKIE_MAX_AGE || process.env.AUTH_COOKIE_MAX_AGE_MS, 180 * 24 * 60 * 60 * 1000)
    ),
    secureCookies: isProduction,
    allowPasswordLogin: toBool(process.env.ALLOW_PASSWORD_LOGIN, false),
    deviceCookieName: process.env.AUTH_DEVICE_COOKIE_NAME || 'ed_device',
    deviceCookieMaxAgeMs: Math.max(
      60 * 60 * 1000,
      parseDurationToMs(process.env.AUTH_DEVICE_COOKIE_MAX_AGE || '365d', 365 * 24 * 60 * 60 * 1000)
    ),
    passwordLoginEmail,
    passwordLoginPassword: process.env.PASSWORD_LOGIN_PASSWORD || ''
  },
  
  // Платежи
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'stub',
    topupEnabled: toBool(process.env.PAYMENT_TOPUP_ENABLED, true),
    apiKey: process.env.PAYMENT_API_KEY || '',
    secret: process.env.PAYMENT_SECRET || '',
    // SeverPay
    mid: process.env.PAYMENT_MID || '',
    token: process.env.PAYMENT_TOKEN || '',
    currency: process.env.PAYMENT_CURRENCY || 'RUB',
    returnUrl: process.env.PAYMENT_RETURN_URL || '',
    allowStubConfirmation: toBool(process.env.ALLOW_STUB_PAYMENT_CONFIRMATION, false)
  },

  // URL приложения (для return URL после оплаты)
  app: {
    url: process.env.APP_URL || 'http://localhost:3000'
  },

  // Уведомления (push)
  notify: {
    url: process.env.NOTIFY_URL || 'http://localhost:3001',
    secret: process.env.NOTIFY_SECRET || ''
  },
  
  // Админ
  admin: {
    email: adminEmail,
    password: adminPassword
  },
  adminEmail,
  adminPassword,

  // Как часто проверять истёкшие cancelled-подписки, мс
  expiredCancelledCheckMs: Math.max(
    5000,
    parseInt(process.env.EXPIRED_CANCELLED_CHECK_MS, 10) || 15000
  ),

  // Как часто запускать проверку daily-списаний, мс
  dailyBillingCheckMs: Math.max(
    60000,
    parseInt(process.env.DAILY_BILLING_CHECK_MS, 10) || 5 * 60 * 1000
  ),

  // Разрешение на запуск реальных сценарных тестов подписок из админки
  adminScenarioTestsEnabled: toBool(process.env.ADMIN_SCENARIO_TESTS_ENABLED, false)
};

if (isProduction && module.exports.payment.provider === 'stub') {
  throw new Error('PAYMENT_PROVIDER=stub is not allowed in production');
}
