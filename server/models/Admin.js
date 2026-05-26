const crypto = require('crypto');
const { db } = require('../config/database');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, packedHash) {
  const raw = String(packedHash || '');
  const [salt, hash] = raw.split(':');
  if (!salt || !hash) return false;
  const provided = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeNickname(nickname) {
  return String(nickname || '').trim();
}

function buildBaseNickname(email) {
  const local = String(email || '').trim().toLowerCase().split('@')[0] || 'admin';
  return local.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'admin';
}

class Admin {
  static getById(id) {
    return db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  }

  static getByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return db.prepare('SELECT * FROM admins WHERE email = ?').get(normalized);
  }

  static getByUuid(uuid) {
    return db.prepare('SELECT * FROM admins WHERE admin_uuid = ?').get(String(uuid || '').trim());
  }

  static getByNickname(nickname) {
    return db.prepare('SELECT * FROM admins WHERE lower(nickname) = lower(?)').get(normalizeNickname(nickname));
  }

  static listAll() {
    return db.prepare('SELECT id, admin_uuid, nickname, email, is_active, created_by_admin_id, created_at, updated_at FROM admins ORDER BY created_at DESC').all();
  }

  static countAll() {
    return db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  }

  static create({ email, password, nickname = null, createdByAdminId = null }) {
    const normalized = String(email || '').trim().toLowerCase();
    let safeNickname = normalizeNickname(nickname);
    if (!safeNickname) {
      const base = buildBaseNickname(normalized);
      safeNickname = base;
      let suffix = 2;
      while (this.getByNickname(safeNickname)) {
        safeNickname = `${base.slice(0, Math.max(1, 32 - String(suffix).length - 1))}-${suffix}`;
        suffix += 1;
      }
    }
    const passwordHash = hashPassword(password);
    const adminUuid = crypto.randomUUID();
    const result = db.prepare(`
      INSERT INTO admins (admin_uuid, nickname, email, password_hash, is_active, token_version, created_by_admin_id)
      VALUES (?, ?, ?, ?, 1, 0, ?)
    `).run(adminUuid, safeNickname, normalized, passwordHash, createdByAdminId);
    return this.getById(result.lastInsertRowid);
  }

  static setPassword(id, password) {
    const passwordHash = hashPassword(password);
    db.prepare('UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, id);
    return this.getById(id);
  }

  static setActive(id, isActive) {
    db.prepare('UPDATE admins SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(isActive ? 1 : 0, id);
    return this.getById(id);
  }

  static incrementTokenVersion(id) {
    db.prepare('UPDATE admins SET token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return this.getById(id);
  }

  static verifyLogin(email, password) {
    const admin = this.getByEmail(email);
    if (!admin || !admin.is_active) return null;
    if (!verifyPassword(password, admin.password_hash)) return null;
    return admin;
  }
}

module.exports = Admin;
