const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config/env');
const { initDatabase } = require('./config/database');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const subscriptionsRoutes = require('./routes/subscriptions');
const paymentsRoutes = require('./routes/payments');
const adminRoutes = require('./routes/adminRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const { router: supportRoutes } = require('./routes/support');
const Setting = require('./models/Setting');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const registerSupportSocket = require('./realtime/supportSocket');

// Инициализация базы данных
initDatabase();

const app = express();
const server = http.createServer(app);
app.set('etag', false);

function getAllowedOrigins() {
  return String(config.security.corsOrigin || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, req) {
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch (_) {
    return false;
  }

  const host = req.headers.host;
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  if (host && origin === `${proto}://${host}`) return true;

  return getAllowedOrigins().includes(origin);
}

const io = new Server(server, {
  cors: config.security.corsOrigin ? {
    origin: getAllowedOrigins(),
    credentials: true
  } : undefined,
  allowRequest: (req, callback) => {
    callback(null, isAllowedOrigin(req.headers.origin, req));
  }
});
app.set('io', io);
registerSupportSocket(io);

app.set('trust proxy', config.security.trustProxy);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://api.qrserver.com'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

if (config.security.corsOrigin) {
  const allowedOrigins = config.security.corsOrigin.split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: allowedOrigins,
    credentials: true
  }));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (isAllowedOrigin(req.headers.origin, req)) return next();
  return res.status(403).json({ error: 'Недопустимый Origin' });
});

// Middleware для запрета кэширования статики
app.use((req, res, next) => {
  if (/\.(html|js|css)$/.test(req.path)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Статические файлы
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  }
}));

app.get('/favicon.ico', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.redirect('/assets/icons/favicon.ico?v=20260417-1');
});

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);

// Публичные настройки
app.get('/api/config', (req, res) => {
  const prices = Setting.getPrices();
  const limits = Setting.getTopupLimits();

  res.json({
    success: true,
    config: {
      prices,
      limits,
      auth: {
        allowPasswordLogin: !!config.auth.allowPasswordLogin
      },
      payments: {
        topupEnabled: !!config.payment.topupEnabled
      }
    }
  });
});

// Админ-панель - страницы
app.get('/admin/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(path.join(__dirname, '../public/admin-login.html'));
});

app.get('/admin', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Главный маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// SPA маршруты
app.get('/vpn', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/support/:ticketUuid', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/terms.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

// Запуск сервера
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`\n🦆 EL-DUCK VPN Server запущен`);
  console.log(`   Порт: ${PORT}`);
  console.log(`   Клиент: http://localhost:${PORT}`);
  console.log(`   Админ-панель: http://localhost:${PORT}/admin\n`);
});

// Периодическая очистка истёкших подписок и auth-кодов
const Subscription = require('./models/Subscription');
const AuthCode = require('./models/AuthCode');
const subscriptionBilling = require('./services/subscriptionBilling');

setInterval(() => {
  try {
    const expiredResult = Subscription.expireExpired();
    if (expiredResult.changes > 0) {
      console.log(`[Cron] Помечено ${expiredResult.changes} истёкших подписок`);
    }
    AuthCode.cleanup();
  } catch (err) {
    console.error('[Cron] Ошибка очистки:', err.message);
  }
}, 5 * 60 * 1000); // каждые 5 минут

// Проверка и отключение истёкших cancelled подписок, интервал из env
const expiredCancelledMs = config.expiredCancelledCheckMs || 15000;
setInterval(() => {
  subscriptionBilling.checkExpiredCancelled().catch(err => {
    console.error('[Cron] Check expired cancelled error:', err.message);
  });
}, expiredCancelledMs);
setTimeout(() => {
  subscriptionBilling.checkExpiredCancelled().catch(() => {});
}, 3000);

// Проверка daily-списаний (регулярный запуск, списание только когда next_charge_at <= now)
const dailyBillingCheckMs = config.dailyBillingCheckMs || (5 * 60 * 1000);
setInterval(() => {
  subscriptionBilling.processDailyCharges().catch(err => {
    console.error('[Cron] Billing error:', err.message);
  });
}, dailyBillingCheckMs);

module.exports = app;
