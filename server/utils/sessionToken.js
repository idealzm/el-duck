const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return {};
  const result = {};
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch (_) {
      result[key] = value;
    }
  }
  return result;
}

function getTokenFromRequest(req, cookieName) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[cookieName] || null;
}

function issueToken(payload) {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function setSessionCookie(res, cookieName, token) {
  const maxAge = Number(config.auth.cookieMaxAgeMs || 0);
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: config.auth.secureCookies,
    sameSite: config.auth.cookieSameSite,
    path: config.auth.cookiePath,
    ...(maxAge > 0 ? { maxAge } : {})
  });
}

function clearSessionCookie(res, cookieName) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: config.auth.secureCookies,
    sameSite: config.auth.cookieSameSite,
    path: config.auth.cookiePath
  });
}

module.exports = {
  getTokenFromRequest,
  issueToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie
};
