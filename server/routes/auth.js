const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createValidator } = require('../middleware/validate');
const config = require('../config/env');
const User = require('../models/User');
const { UserPassword, hashPassword: hashPasswordFn } = require('../models/UserPassword');
const { db } = require('../config/database');
const MagicLink = require('../models/MagicLink');
const TrustedDevice = require('../models/TrustedDevice');
const emailService = require('../services/email');
const authMiddleware = require('../middleware/auth');
const { issueToken, setSessionCookie, clearSessionCookie, getTokenFromRequest, verifyToken } = require('../utils/sessionToken');

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || '';
}

function getUserAgent(req) {
  return (req.headers['user-agent'] || '').slice(0, 500);
}

function setDeviceCookie(res, deviceToken) {
  const maxAge = Number(config.auth.deviceCookieMaxAgeMs || 365 * 24 * 60 * 60 * 1000);
  res.cookie(config.auth.deviceCookieName || 'ed_device', deviceToken, {
    httpOnly: true,
    secure: config.auth.secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge
  });
}

function clearDeviceCookie(res) {
  res.clearCookie(config.auth.deviceCookieName || 'ed_device', {
    httpOnly: true,
    secure: config.auth.secureCookies,
    sameSite: 'Lax',
    path: '/'
  });
}

function getDeviceTokenFromRequest(req) {
  const cookieName = config.auth.deviceCookieName || 'ed_device';
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const parts = cookies.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === cookieName) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()); }
      catch (_) { return part.slice(idx + 1).trim(); }
    }
  }
  return null;
}

function buildMagicLinkUrl(token, type) {
  const base = String(config.app?.url || '').replace(/\/+$/, '') || 'http://localhost:3000';
  if (type === 'registration') {
    return `${base}/auth/verify-registration?token=${encodeURIComponent(token)}`;
  }
  if (type === 'password_reset') {
    return `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;
  }
  return `${base}/auth/verify?token=${encodeURIComponent(token)}`;
}

function issueSessionAndSetCookies(req, res, user, { rememberDevice = true } = {}) {
  const updatedUser = User.incrementTokenVersion(user.id);
  const userUuid = User.ensureUuid(updatedUser.id);

  const token = issueToken({
    userId: updatedUser.id,
    email: updatedUser.email,
    tokenVersion: Number(updatedUser.token_version || 0)
  });
  setSessionCookie(res, config.auth.userCookieName, token);

  if (rememberDevice) {
    const deviceToken = TrustedDevice.create(updatedUser.id, {
      userAgent: getUserAgent(req),
      ip: getClientIp(req)
    });
    setDeviceCookie(res, deviceToken);
    TrustedDevice.limitDevices(updatedUser.id);
  }

  return {
    success: true,
    user: {
      id: userUuid,
      uuid: userUuid,
      email: updatedUser.email,
      balance: updatedUser.balance
    }
  };
}

// ===================== VALIDATORS =====================

const validateCheckEmail = createValidator({
  email: { required: true, type: 'email' }
});

const validateRegister = createValidator({
  email: { required: true, type: 'email' },
  password: { required: true, type: 'string', minLength: 6, maxLength: 128 }
});

const validateLogin = createValidator({
  email: { required: true, type: 'email' },
  password: { required: true, type: 'string', minLength: 1 }
});

const validateTrustedLogin = createValidator({});

const validateRequestPasswordReset = createValidator({
  email: { required: true, type: 'email' }
});

const validateResetPasswordWithToken = createValidator({
  token: { required: true, type: 'string', minLength: 10 },
  password: { required: true, type: 'string', minLength: 6, maxLength: 128 }
});

const validateSetPassword = createValidator({
  password: { required: true, type: 'string', minLength: 6, maxLength: 128 }
});

// ===================== RATE LIMITERS =====================

const verifyRegistrationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return `verify_reg_${ip}`;
  }
});

const checkEmailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return `check_email_${ip}`;
  }
});

const registerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток регистрации. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    return `register_${ip}_${email || 'no_email'}`;
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    return `login_${ip}_${email || 'no_email'}`;
  }
});

const trustedLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return `trusted_login_${ip}`;
  }
});

const passwordResetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    return `pw_reset_${ip}_${email || 'no_email'}`;
  }
});

const magicLinkVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return `magic_verify_${ip}`;
  }
});

// ===================== ROUTES =====================

/**
 * POST /api/auth/check-email
 * Check if an email exists and whether the user has a password set
 */
router.post('/check-email', checkEmailLimiter, validateCheckEmail, (req, res) => {
  try {
    const normalizedEmail = String(req.body.email).trim().toLowerCase();
    const user = User.getByEmail(normalizedEmail);

    if (!user) {
      return res.json({ success: true, status: 'new' });
    }

    const hasPassword = UserPassword.exists(user.id);
    console.log(`[Auth] check-email: ${normalizedEmail} → user.id=${user.id}, hasPassword=${hasPassword}`);
    return res.json({ success: true, status: hasPassword ? 'has_password' : 'needs_password' });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ error: 'Ошибка проверки email' });
  }
});

/**
 * POST /api/auth/register
 * Register new user: create user record + password hash, send magic link
 * Also used for existing users without password to set their password
 */
router.post('/register', registerLimiter, validateRegister, async (req, res) => {
  try {
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password);

    const existingUser = User.getByEmail(email);
    if (existingUser && UserPassword.exists(existingUser.id)) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован. Используйте вход по паролю.' });
    }

    const passwordHash = hashPasswordFn(password);

    const token = MagicLink.create(email, 'registration', {
      payload: { passwordHash },
      expiresInMinutes: 10
    });
    console.log(`[Auth] Registration magic link created for ${email}, payload has passwordHash: ${!!passwordHash}`);

    MagicLink.cleanup();

    const link = buildMagicLinkUrl(token, 'registration');
    const emailResult = await emailService.sendRegistrationMagicLink(email, link);
    if (!emailResult?.success) {
      console.error(`[Auth] Не удалось отправить magic link на ${email}:`, emailResult?.error);
      return res.status(502).json({ error: 'Не удалось отправить письмо. Попробуйте позже.' });
    }

    res.json({
      success: true,
      message: 'Ссылка для подтверждения отправлена на email',
      email
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

/**
 * GET /api/auth/verify-registration?token=xxx
 * Verify registration magic link → create user + set password → issue session → redirect
 */
router.get('/verify-registration', magicLinkVerifyLimiter, (req, res) => {
  try {
    const rawToken = String(req.query.token || '').trim();
    console.log(`[Auth] verify-registration called, token length: ${rawToken.length}`);
    if (!rawToken) {
      console.log(`[Auth] verify-registration: empty token`);
      return res.redirect('/?auth_error=' + encodeURIComponent('Ссылка недействительна'));
    }

    const linkData = MagicLink.verify(rawToken);
    console.log(`[Auth] verify-registration: linkData=${!!linkData}, type=${linkData?.type}, hasPayload=${!!linkData?.payload}, hasPasswordHash=${!!linkData?.payload?.passwordHash}`);
    if (!linkData || linkData.type !== 'registration') {
      return res.redirect('/?auth_error=' + encodeURIComponent('Ссылка устарела или недействительна'));
    }

    const email = linkData.email;

    let user = User.getByEmail(email);
    console.log(`[Auth] verify-registration: email=${email}, userExists=${!!user}, userId=${user?.id}`);
    if (user && UserPassword.exists(user.id)) {
      console.log(`[Auth] verify-registration: already has password, redirecting to login`);
      return res.redirect('/?auth_error=' + encodeURIComponent('Аккаунт уже подтверждён. Войдите по паролю.'));
    }

    if (!user) {
      user = User.create(email);
      console.log(`[Auth] verify-registration: created new user ${user.id}`);
    }

    if (!UserPassword.exists(user.id) && linkData.payload?.passwordHash) {
      UserPassword.setHash(user.id, linkData.payload.passwordHash);
      console.log(`[Auth] Password set for user ${user.id} (${email}) via magic link verify, verify check: ${UserPassword.exists(user.id)}`);
    } else {
      console.log(`[Auth] Verify-registration SKIPPED setting password: user ${user.id} (${email}), passwordExists=${UserPassword.exists(user.id)}, hasPayloadHash=${!!linkData?.payload?.passwordHash}`);
    }

    const result = issueSessionAndSetCookies(req, res, user);
    TrustedDevice.cleanup();

    res.redirect('/?auth_verified=1');
  } catch (error) {
    console.error('Verify registration magic link error:', error);
    res.redirect('/?auth_error=' + encodeURIComponent('Ошибка подтверждения'));
  }
});

/**
 * POST /api/auth/resend-registration
 * Resend registration magic link
 */
router.post('/resend-registration', registerLimiter, validateCheckEmail, async (req, res) => {
  try {
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password || '');

    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    const existingUser = User.getByEmail(email);
    if (existingUser && UserPassword.exists(existingUser.id)) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован. Используйте вход по паролю.' });
    }

    const passwordHash = password ? hashPasswordFn(password) : null;
    const payloadData = passwordHash ? { passwordHash } : {};

    const token = MagicLink.create(email, 'registration', { payload: payloadData });
    MagicLink.cleanup();

    const link = buildMagicLinkUrl(token, 'registration');
    const emailResult = await emailService.sendRegistrationMagicLink(email, link);
    if (!emailResult?.success) {
      console.error(`[Auth] Не удалось повторно отправить magic link на ${email}:`, emailResult?.error);
      return res.status(502).json({ error: 'Не удалось отправить письмо. Попробуйте позже.' });
    }

    res.json({ success: true, message: 'Ссылка отправлена повторно' });
  } catch (error) {
    console.error('Resend registration error:', error);
    res.status(500).json({ error: 'Ошибка повторной отправки' });
  }
});

/**
 * POST /api/auth/login
 * Login with email + password
 */
router.post('/login', loginLimiter, validateLogin, async (req, res) => {
  try {
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password);
    const rememberDevice = req.body.rememberDevice !== false;

    const user = User.getByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    if (!UserPassword.exists(user.id)) {
      return res.status(401).json({ error: 'Пароль не установлен. Зарегистрируйтесь.' });
    }

    if (!UserPassword.verify(user.id, password)) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const result = issueSessionAndSetCookies(req, res, user, { rememberDevice });
    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

/**
 * POST /api/auth/trusted-login
 * Quick login via trusted device cookie
 */
router.post('/trusted-login', trustedLoginLimiter, validateTrustedLogin, (req, res) => {
  try {
    const deviceToken = getDeviceTokenFromRequest(req);
    if (!deviceToken) {
      return res.status(401).json({ error: 'Устройство не распознано' });
    }

    const deviceData = TrustedDevice.verify(deviceToken);
    if (!deviceData) {
      clearDeviceCookie(res);
      return res.status(401).json({ error: 'Устройство не найдено или сессия истекла' });
    }

    const user = User.getById(deviceData.userId);
    if (!user) {
      TrustedDevice.deleteByToken(deviceToken);
      clearDeviceCookie(res);
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    if (!UserPassword.exists(user.id)) {
      TrustedDevice.deleteByToken(deviceToken);
      TrustedDevice.deleteByUser(user.id);
      clearDeviceCookie(res);
      return res.status(401).json({ error: 'Пароль не установлен' });
    }

    const result = issueSessionAndSetCookies(req, res, user);
    res.json(result);
  } catch (error) {
    console.error('Trusted login error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
});

/**
 * POST /api/auth/request-password-reset
 * Send a password-reset magic link to email
 */
router.post('/request-password-reset', passwordResetLimiter, validateRequestPasswordReset, async (req, res) => {
  try {
    const email = String(req.body.email).trim().toLowerCase();
    const user = User.getByEmail(email);
    if (!user) {
      return res.json({ success: true, message: 'Если аккаунт существует, ссылка для сброса пароля отправлена на email' });
    }

    const token = MagicLink.create(email, 'password_reset');
    MagicLink.cleanup();

    const link = buildMagicLinkUrl(token, 'password_reset');
    const emailResult = await emailService.sendPasswordResetMagicLink(email, link);
    if (!emailResult?.success) {
      console.error(`[Auth] Не удалось отправить ссылку сброса на ${email}:`, emailResult?.error);
      return res.status(502).json({ error: 'Не удалось отправить письмо. Попробуйте позже.' });
    }

    res.json({ success: true, message: 'Ссылка для сброса пароля отправлена на email' });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ error: 'Ошибка отправки ссылки' });
  }
});

/**
 * POST /api/auth/reset-password-with-token
 * Reset password using magic link token (called from reset-password.html page)
 */
router.post('/reset-password-with-token', magicLinkVerifyLimiter, validateResetPasswordWithToken, async (req, res) => {
  try {
    const rawToken = String(req.body.token).trim();
    const password = String(req.body.password);

    const linkData = MagicLink.verify(rawToken);
    if (!linkData || linkData.type !== 'password_reset') {
      return res.status(400).json({ error: 'Ссылка устарела или недействительна' });
    }

    const user = User.getByEmail(linkData.email);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    UserPassword.set(user.id, password);
    User.incrementTokenVersion(user.id);
    TrustedDevice.deleteByUser(user.id);

    const result = issueSessionAndSetCookies(req, res, user);
    res.json(result);
  } catch (error) {
    console.error('Reset password with token error:', error);
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  }
});

/**
 * GET /api/auth/validate-reset-token?token=xxx
 * Validate a password reset token without consuming it
 */
router.get('/validate-reset-token', magicLinkVerifyLimiter, (req, res) => {
  try {
    const rawToken = String(req.query.token || '').trim();
    if (!rawToken) {
      return res.status(400).json({ valid: false, error: 'Токен не указан' });
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const row = db.prepare(`
      SELECT * FROM magic_links
      WHERE token = ? AND type = 'password_reset' AND used = 0 AND expires_at > CURRENT_TIMESTAMP
    `).get(tokenHash);

    if (!row) {
      return res.json({ valid: false, error: 'Ссылка устарела или недействительна' });
    }

    const user = User.getByEmail(row.email);
    if (!user) {
      return res.json({ valid: false, error: 'Пользователь не найден' });
    }

    res.json({ valid: true, email: user.email });
  } catch (error) {
    console.error('Validate reset token error:', error);
    res.status(500).json({ valid: false, error: 'Ошибка проверки токена' });
  }
});

/**
 * POST /api/auth/set-password
 * Set password for existing user who doesn't have one (requires auth)
 */
router.post('/set-password', authMiddleware, validateSetPassword, async (req, res) => {
  try {
    const userId = req.user.id;
    const password = String(req.body.password);

    if (UserPassword.exists(userId)) {
      return res.status(409).json({ error: 'Пароль уже установлен' });
    }

    UserPassword.set(userId, password);
    TrustedDevice.deleteByUser(userId);

    const result = issueSessionAndSetCookies(req, res, req.user);
    res.json(result);
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Ошибка установки пароля' });
  }
});

/**
 * DELETE /api/auth/trusted-devices
 * Remove all trusted devices for current user (logout from all devices)
 */
router.delete('/trusted-devices', authMiddleware, (req, res) => {
  try {
    TrustedDevice.deleteByUser(req.user.id);
    clearDeviceCookie(res);
    res.json({ success: true, message: 'Все устройства удалены' });
  } catch (error) {
    console.error('Delete trusted devices error:', error);
    res.status(500).json({ error: 'Ошибка удаления устройств' });
  }
});

// ===================== LEGACY (deprecated) =====================

/**
 * POST /api/auth/verify-registration
 * @deprecated Use GET /api/auth/verify-registration?token=xxx instead
 */
router.post('/verify-registration', verifyRegistrationLimiter, (req, res) => {
  res.status(410).json({
    error: 'Этот метод устарел. Используйте ссылку из письма для подтверждения.',
    deprecated: true
  });
});

/**
 * POST /api/auth/send-code
 * @deprecated Use POST /api/auth/register instead
 */
router.post('/send-code', (req, res) => {
  res.status(410).json({
    error: 'Этот метод устарел. Используйте регистрацию с_magic link.',
    deprecated: true
  });
});

/**
 * POST /api/auth/verify-code
 * @deprecated Use GET /api/auth/verify-registration?token=xxx instead
 */
router.post('/verify-code', (req, res) => {
  res.status(410).json({
    error: 'Этот метод устарел. Используйте ссылку из письма.',
    deprecated: true
  });
});

/**
 * POST /api/auth/reset-password
 * @deprecated Use POST /api/auth/reset-password-with-token instead
 */
router.post('/reset-password', (req, res) => {
  res.status(410).json({
    error: 'Этот метод устарел. Используйте ссылку из письма для сброса пароля.',
    deprecated: true
  });
});

// ===================== SESSION & STATUS =====================

/**
 * GET /api/auth/session
 * Check if user has a valid session
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

    return res.json({
      success: true,
      authenticated: true,
      hasPassword: UserPassword.exists(user.id)
    });
  } catch (_) {
    return res.json({ success: true, authenticated: false });
  }
});

/**
 * GET /api/auth/trusted-device
 * Check if current device is trusted (for quick login)
 */
router.get('/trusted-device', (req, res) => {
  const deviceToken = getDeviceTokenFromRequest(req);
  if (!deviceToken) {
    return res.json({ success: true, trusted: false });
  }

  const deviceData = TrustedDevice.verify(deviceToken);
  if (!deviceData) {
    return res.json({ success: true, trusted: false });
  }

  const user = User.getById(deviceData.userId);
  if (!user || !UserPassword.exists(user.id)) {
    return res.json({ success: true, trusted: false });
  }

  return res.json({
    success: true,
    trusted: true,
    email: user.email
  });
});

/**
 * GET /api/auth/me
 * Get current user data
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
 * Logout — invalidate session
 */
router.post('/logout', authMiddleware, (req, res) => {
  User.incrementTokenVersion(req.user.id);
  clearSessionCookie(res, config.auth.userCookieName);
  res.json({ success: true, message: 'Выход выполнен' });
});

module.exports = router;