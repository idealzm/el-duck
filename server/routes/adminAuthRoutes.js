const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createValidator } = require('../middleware/validate');
const config = require('../config/env');
const Admin = require('../models/Admin');
const adminMiddleware = require('../middleware/admin');
const { issueToken, setSessionCookie, clearSessionCookie } = require('../utils/sessionToken');
const { ok, fail } = require('../utils/httpResponse');

const router = express.Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
});

const validateAdminLogin = createValidator({
  email: { required: true, type: 'email' },
  password: { required: true, type: 'string', minLength: 1 }
});

function safeStringEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function issueAdminSession(res, admin) {
  const fresh = Admin.incrementTokenVersion(admin.id);
  const token = issueToken({
    type: 'admin',
    adminId: fresh.id,
    email: fresh.email,
    tokenVersion: Number(fresh.token_version || 0)
  });
  setSessionCookie(res, config.auth.adminCookieName, token);
  return fresh;
}

router.post('/login', adminLoginLimiter, validateAdminLogin, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    let admin = Admin.verifyLogin(email, password);

    if (!admin) {
      const hasAnyAdmins = Number(Admin.countAll() || 0) > 0;
      const bootstrapEmail = String(config.admin?.email || config.adminEmail || '').trim().toLowerCase();
      const bootstrapPassword = String(config.admin?.password || config.adminPassword || '');
      if (!hasAnyAdmins && bootstrapEmail && bootstrapPassword && safeStringEqual(email, bootstrapEmail) && safeStringEqual(password, bootstrapPassword)) {
        admin = Admin.create({ email: bootstrapEmail, password: bootstrapPassword, createdByAdminId: null });
      }
    }

    if (!admin) {
      return fail(res, 'Неверный email или пароль', 401);
    }

    const loggedIn = issueAdminSession(res, admin);

    return ok(res, {
      message: 'Вход выполнен',
      admin: {
        id: loggedIn.admin_uuid,
        uuid: loggedIn.admin_uuid,
        nickname: loggedIn.nickname || null,
        email: loggedIn.email
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return fail(res, 'Ошибка авторизации', 500);
  }
});

router.get('/me', adminMiddleware, async (req, res) => {
  return ok(res, {
    user: {
      id: req.admin.admin_uuid,
      uuid: req.admin.admin_uuid,
      nickname: req.admin.nickname || null,
      email: req.admin.email
    }
  });
});

router.post('/logout', adminMiddleware, async (req, res) => {
  Admin.incrementTokenVersion(req.admin.id);
  clearSessionCookie(res, config.auth.adminCookieName);
  return ok(res, { message: 'Выход выполнен' });
});

module.exports = router;
