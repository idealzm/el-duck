const webpush = require('web-push');
const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');

const configuredVapidPath = String(process.env.VAPID_KEYS_PATH || '').trim();
const vapidKeysPath = configuredVapidPath
  ? path.resolve(process.cwd(), configuredVapidPath)
  : path.resolve(process.cwd(), 'data/vapid-keys.json');

let vapidPublicKey, vapidPrivateKey;

if (fs.existsSync(vapidKeysPath)) {
  try {
    const keys = JSON.parse(fs.readFileSync(vapidKeysPath, 'utf8'));
    if (keys && keys.publicKey && keys.privateKey) {
      vapidPublicKey = keys.publicKey;
      vapidPrivateKey = keys.privateKey;
    }
  } catch (error) {
    console.warn('[Push] Failed to parse VAPID keys file, generating a new one:', error.message);
  }
}

if (!vapidPublicKey || !vapidPrivateKey) {
  const keys = webpush.generateVAPIDKeys();
  vapidPublicKey = keys.publicKey;
  vapidPrivateKey = keys.privateKey;
  if (!fs.existsSync(path.dirname(vapidKeysPath))) {
    fs.mkdirSync(path.dirname(vapidKeysPath), { recursive: true });
  }
  fs.writeFileSync(vapidKeysPath, JSON.stringify(keys, null, 2));
  console.log(`🔑 VAPID ключи сгенерированы: ${vapidKeysPath}`);
}

webpush.setVapidDetails(
  'mailto:admin@el-duck.com',
  vapidPublicKey,
  vapidPrivateKey
);

// Создаём таблицу
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Миграция: добавляем user_id для существующих записей
try {
  const hasUserId = db.prepare("PRAGMA table_info(push_subscriptions)").all().some(c => c.name === 'user_id');
  if (!hasUserId) {
    db.exec('ALTER TABLE push_subscriptions ADD COLUMN user_id INTEGER DEFAULT 0');
  }
} catch (e) {}

class PushService {
  static getVapidPublicKey() {
    return vapidPublicKey;
  }

  static async subscribe(userId, endpoint, p256dh, auth) {
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
    `).run(userId, endpoint, p256dh, auth);
  }

  static async unsubscribe(userId, endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
  }

  static async send({ title, body, tag = 'system', icon = '/assets/icons/icon-192.png' }) {
    const subscriptions = db.prepare('SELECT * FROM push_subscriptions').all();
    return this._sendToSubscriptions(subscriptions, { title, body, tag, icon });
  }

  static async sendToUser(userId, { title, body, tag = 'system', icon = '/assets/icons/icon-192.png' }) {
    const subscriptions = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
    return this._sendToSubscriptions(subscriptions, { title, body, tag, icon });
  }

  static async _sendToSubscriptions(subscriptions, { title, body, tag, icon }) {
    if (subscriptions.length === 0) return { sent: 0, failed: 0 };

    const payload = JSON.stringify({ title, body, icon, tag });
    let sent = 0, failed = 0;

    for (const sub of subscriptions) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };

      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
        }
      }
    }

    return { sent, failed };
  }

  static getStats() {
    return db.prepare('SELECT COUNT(*) as count FROM push_subscriptions').get();
  }
}

module.exports = PushService;
