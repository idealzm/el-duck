const User = require('../models/User');
const config = require('../config/env');
const { getTokenFromRequest, verifyToken } = require('../utils/sessionToken');

function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req, config.auth.userCookieName);

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const decoded = verifyToken(token);
    const user = User.getById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const currentVersion = Number(user.token_version || 0);
    const tokenVersion = Number(decoded.tokenVersion || 0);
    if (tokenVersion !== currentVersion) {
      return res.status(401).json({ error: 'Сессия устарела. Войдите снова' });
    }

    req.user = user;
    req.token = token;
    req.tokenPayload = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

module.exports = authMiddleware;
