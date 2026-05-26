const Admin = require('../models/Admin');
const config = require('../config/env');
const { getTokenFromRequest, verifyToken } = require('../utils/sessionToken');

function adminMiddleware(req, res, next) {
  const token = getTokenFromRequest(req, config.auth.adminCookieName);

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.type !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const admin = Admin.getById(decoded.adminId);

    if (!admin) {
      return res.status(401).json({ error: 'Администратор не найден' });
    }

    if (!admin.is_active) {
      return res.status(403).json({ error: 'Администратор деактивирован' });
    }

    const currentVersion = Number(admin.token_version || 0);
    const tokenVersion = Number(decoded.tokenVersion || 0);
    if (tokenVersion !== currentVersion) {
      return res.status(401).json({ error: 'Сессия устарела. Войдите снова' });
    }

    req.admin = admin;
    req.user = admin;
    req.token = token;
    req.tokenPayload = decoded;
    req.isAdmin = true;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

module.exports = adminMiddleware;
