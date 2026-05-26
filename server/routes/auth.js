const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createValidator } = require('../middleware/validate');
const config = require('../config/env');
const User = require('../models/User');
const AuthCode = require('../models/AuthCode');
const emailService = require('../services/email');
const authMiddleware = require('../middleware/auth');
const { issueToken, setSessionCookie, clearSessionCookie, getTokenFromRequest, verifyToken } = require('../utils/sessionToken');

const validateSendCode = createValidator({
  email: { required: true, type: 'email' }
});

const validateVerifyCode = createValidator({
  email: { required: true, type: 'email' },
  code: { required: true, type: 'string', minLength: 4, maxLength: 10 }
});

const validatePasswordLogin = createValidator({
  email: { required: true, type: 'email' },
  password: { required: true, type: 'string', minLength: 1 }
});

const sendCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ip = req.ip || req.connection.remoteAddress;
    return `send_code_${ip}_${email || 'no_email'}`;
  }
});

const verifyCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ip = req.ip || req.connection.remoteAddress;
    return `verify_code_${ip}_${email || 'no_email'}`;
  }
});

const passwordLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ip = req.ip || req.connection.remoteAddress;
    return `password_login_${ip}_${email || 'no_email'}`;
  }
});

/**
 * Генерация случайного кода
 */
function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * POST /api/auth/send-code
 * Отправка кода подтверждения на email
 */
router.post('/send-code', sendCodeLimiter, validateSendCode, async (req, res) => {
  try {
    const { email } = req.body;

    const normalizedEmail = email.toLowerCase().trim();

    // Генерируем код
    const code = generateCode();

    // Сохраняем код в БД
    AuthCode.create(normalizedEmail, code);

    // Отправляем email
    const emailResult = await emailService.sendVerificationCode(normalizedEmail, code);
    if (!emailResult?.success) {
      console.error(`[Auth] Не удалось отправить код на ${normalizedEmail}:`, emailResult?.error);
      return res.status(502).json({ error: 'Не удалось отправить письмо. Проверьте настройки почты.' });
    }

    res.json({ 
      success: true, 
      message: 'Код отправлен на email',
      email: normalizedEmail
    });
  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ error: 'Ошибка отправки кода' });
  }
});

/**
 * POST /api/auth/verify-code
 * Проверка кода и выдача токена
 */
router.post('/verify-code', verifyCodeLimiter, validateVerifyCode, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email и код обязательны' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Проверяем код
    const isValid = AuthCode.verify(normalizedEmail, code.toString());

    if (!isValid) {
      AuthCode.invalidateAllForEmail(normalizedEmail);
      return res.status(400).json({ error: 'Неверный код или истёк срок действия' });
    }

    // Ищем или создаём пользователя
    let user = User.getByEmail(normalizedEmail);

    if (!user) {
      user = User.create(normalizedEmail);
    }

    // Ротация сессии: инвалидируем предыдущие токены пользователя
    user = User.incrementTokenVersion(user.id);
    const userUuid = User.ensureUuid(user.id);

    const token = issueToken({
      userId: user.id,
      email: user.email,
      tokenVersion: Number(user.token_version || 0)
    });

    setSessionCookie(res, config.auth.userCookieName, token);

    res.json({
      success: true,
      user: {
        id: userUuid,
        uuid: userUuid,
        email: user.email,
        balance: user.balance
      }
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Ошибка проверки кода' });
  }
});

/**
 * POST /api/auth/password-login
 * Тестовый вход по email+паролю
 */
router.post('/password-login', passwordLoginLimiter, validatePasswordLogin, async (req, res) => {
  try {
    if (!config.auth.allowPasswordLogin) {
      return res.status(403).json({ error: 'Вход по паролю отключён' });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const expectedEmail = String(config.auth.passwordLoginEmail || '').trim().toLowerCase();
    const expectedPassword = String(config.auth.passwordLoginPassword || '');

    if (!expectedEmail || !expectedPassword) {
      return res.status(503).json({ error: 'Парольный вход не настроен' });
    }

    const emailOk = email === expectedEmail;
    const provided = Buffer.from(password);
    const expected = Buffer.from(expectedPassword);
    const passOk = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

    if (!emailOk || !passOk) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    let user = User.getByEmail(expectedEmail);
    if (!user) {
      user = User.create(expectedEmail);
    }

    user = User.incrementTokenVersion(user.id);
    const userUuid = User.ensureUuid(user.id);

    const token = issueToken({
      userId: user.id,
      email: user.email,
      tokenVersion: Number(user.token_version || 0)
    });

    setSessionCookie(res, config.auth.userCookieName, token);

    res.json({
      success: true,
      user: {
        id: userUuid,
        uuid: userUuid,
        email: user.email,
        balance: user.balance
      }
    });
  } catch (error) {
    console.error('Password login error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
});

/**
 * GET /api/auth/session
 * Проверка наличия валидной пользовательской сессии
 */
router.get('/session', (req, res) => {
  const token = getTokenFromRequest(req, config.auth.userCookieName);

  if (!token) {
    return res.json({ success: true, authenticated: false });
  }

  try {
    const decoded = verifyToken(token);
    const user = User.getById(decoded.userId);
    if (!user) {
      return res.json({ success: true, authenticated: false });
    }

    const currentVersion = Number(user.token_version || 0);
    const tokenVersion = Number(decoded.tokenVersion || 0);
    if (tokenVersion !== currentVersion) {
      return res.json({ success: true, authenticated: false });
    }

    return res.json({ success: true, authenticated: true });
  } catch (_) {
    return res.json({ success: true, authenticated: false });
  }
});

/**
 * GET /api/auth/me
 * Получение данных текущего пользователя
 */
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.user_uuid || User.ensureUuid(req.user.id),
      uuid: req.user.user_uuid || User.ensureUuid(req.user.id),
      email: req.user.email,
      balance: req.user.balance
    }
  });
});

/**
 * POST /api/auth/logout
 * Выход (на клиенте просто удаляем токен)
 */
router.post('/logout', authMiddleware, (req, res) => {
  User.incrementTokenVersion(req.user.id);
  clearSessionCookie(res, config.auth.userCookieName);
  res.json({ success: true, message: 'Выход выполнен' });
});

module.exports = router;
