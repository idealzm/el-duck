const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./env');

// Создаём директорию для базы данных если не существует
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.databasePath);

// Включаем внешние ключи
db.pragma('foreign_keys = ON');

// Инициализация таблиц
function initDatabase() {
  // Пользователи
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      user_uuid TEXT UNIQUE,
      balance REAL DEFAULT 0,
      is_admin BOOLEAN DEFAULT FALSE,
      token_version INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by_user_id INTEGER,
      referred_at DATETIME,
      referral_reward_granted_at DATETIME,
      consent_accepted_at DATETIME,
      consent_ip TEXT,
      consent_user_agent TEXT,
      consent_version TEXT DEFAULT 'v1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referred_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Администраторы
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_uuid TEXT UNIQUE,
      nickname TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      token_version INTEGER DEFAULT 0,
      created_by_admin_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
    )
  `);

  try {
    db.exec(`ALTER TABLE admins ADD COLUMN nickname TEXT`);
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  const adminRows = db.prepare('SELECT id, email, nickname FROM admins ORDER BY id ASC').all();
  const saveNickname = db.prepare('UPDATE admins SET nickname = ? WHERE id = ?');
  const seenNicknames = new Set();

  for (const row of adminRows) {
    const current = String(row.nickname || '').trim();
    const emailLocalPart = String(row.email || '').trim().toLowerCase().split('@')[0] || 'admin';
    const baseRaw = current || emailLocalPart || 'admin';
    const base = baseRaw.replace(/\s+/g, '-').slice(0, 32) || 'admin';

    let candidate = base;
    let suffix = 2;
    while (seenNicknames.has(candidate.toLowerCase())) {
      const trimmedBase = base.slice(0, Math.max(1, 32 - String(suffix).length - 1));
      candidate = `${trimmedBase}-${suffix}`;
      suffix += 1;
    }

    seenNicknames.add(candidate.toLowerCase());

    if (candidate !== row.nickname) {
      saveNickname.run(candidate, row.id);
    }
  }

  // Подписки
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('vpn')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired')),
      config_data TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Платежи
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'refunded')),
      payment_id TEXT,
      provider_data TEXT,
      is_admin BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Миграция: добавляем is_admin для существующих БД
  try {
    db.exec(`ALTER TABLE payments ADD COLUMN is_admin BOOLEAN DEFAULT 0`);
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec(`ALTER TABLE payments ADD COLUMN payment_kind TEXT DEFAULT 'topup'`);
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec(`ALTER TABLE payments ADD COLUMN admin_actor_id INTEGER`);
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  // Коды авторизации
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Настройки
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Тикеты поддержки
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_uuid TEXT UNIQUE NOT NULL,
      access_token_hash TEXT NOT NULL,
      access_token_encrypted TEXT,
      user_id INTEGER,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'pending', 'closed')),
      user_last_seen_at DATETIME,
      admin_last_seen_at DATETIME,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_admin_message_at DATETIME,
      unread_email_notified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  try {
    db.exec('ALTER TABLE support_tickets ADD COLUMN access_token_encrypted TEXT');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE support_tickets ADD COLUMN creator_ip TEXT');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'admin', 'system')),
      sender_admin_id INTEGER,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_admin_id) REFERENCES admins(id) ON DELETE SET NULL
    )
  `);

  // Промокоды
  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      starts_at DATETIME,
      ends_at DATETIME,
      min_topup REAL DEFAULT 0,
      reward_type TEXT NOT NULL CHECK(reward_type IN ('fixed', 'percent')),
      reward_value REAL NOT NULL,
      instant_grant BOOLEAN DEFAULT 0,
      max_reward REAL,
      total_limit INTEGER,
      per_user_limit INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Использования промокодов
  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promo_code_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      payment_id INTEGER,
      amount REAL NOT NULL,
      bonus_amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
      UNIQUE(payment_id)
    )
  `);

  // Реферальные начисления
  db.exec(`
    CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inviter_user_id INTEGER NOT NULL,
      invitee_user_id INTEGER NOT NULL,
      payment_id INTEGER NOT NULL,
      reward_for TEXT NOT NULL CHECK(reward_for IN ('inviter', 'invitee')),
      reward_type TEXT NOT NULL CHECK(reward_type IN ('fixed', 'percent')),
      reward_value REAL NOT NULL,
      bonus_amount REAL NOT NULL,
      status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invitee_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_popup_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_admin_id INTEGER,
      title TEXT,
      body TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('all', 'selected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_admin_id) REFERENCES admins(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_popup_message_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      acknowledged_at DATETIME,
      acknowledged_ip TEXT,
      acknowledged_user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES admin_popup_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(message_id, user_id)
    )
  `);

  // Индексы
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_nickname_unique ON admins(lower(nickname))`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(payment_kind)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_admin_actor ON payments(admin_actor_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_auth_codes_email ON auth_codes(email)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_uuid ON support_tickets(ticket_uuid)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message ON support_tickets(last_message_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_creator_ip ON support_tickets(creator_ip)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_referral_rewards_inviter ON referral_rewards(inviter_user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_referral_rewards_invitee ON referral_rewards(invitee_user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_popup_messages_created ON admin_popup_messages(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_popup_recipients_user_ack ON admin_popup_message_recipients(user_id, acknowledged_at)`);

  // Начальные настройки
  const defaultSettings = {
    vpn_price: '299',
    min_topup: '50',
    max_topup: '500',
    referral_enabled: 'true',
    referral_min_topup: '100',
    referral_inviter_reward_type: 'fixed',
    referral_inviter_reward_value: '50',
    referral_inviter_max_reward: '0',
    referral_invitee_reward_type: 'fixed',
    referral_invitee_reward_value: '30',
    referral_invitee_max_reward: '0'
  };

  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insert.run(key, value);
  }

  // Миграция: добавляем is_admin если колонка отсутствует
  try {
    db.exec('ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN user_uuid TEXT');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN referral_code TEXT');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN referred_by_user_id INTEGER');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN referred_at DATETIME');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN referral_reward_granted_at DATETIME');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN consent_accepted_at DATETIME');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN consent_ip TEXT');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN consent_user_agent TEXT');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec("ALTER TABLE users ADD COLUMN consent_version TEXT DEFAULT 'v1'");
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  try {
    db.exec('ALTER TABLE promo_codes ADD COLUMN instant_grant BOOLEAN DEFAULT 0');
  } catch (e) {
    // Колонка уже существует — игнорируем ошибку
  }

  // Миграция: разрешаем promo_redemptions.payment_id = NULL для instant-промокодов
  try {
    const promoRedemptionsInfo = db.prepare('PRAGMA table_info(promo_redemptions)').all();
    const paymentIdColumn = promoRedemptionsInfo.find(c => c.name === 'payment_id');
    if (paymentIdColumn && Number(paymentIdColumn.notnull) === 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS promo_redemptions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          promo_code_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          payment_id INTEGER,
          amount REAL NOT NULL,
          bonus_amount REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
          UNIQUE(payment_id)
        )
      `);
      db.exec(`
        INSERT INTO promo_redemptions_new (id, promo_code_id, user_id, payment_id, amount, bonus_amount, created_at)
        SELECT id, promo_code_id, user_id, payment_id, amount, bonus_amount, created_at
        FROM promo_redemptions
      `);
      db.exec('DROP TABLE promo_redemptions');
      db.exec('ALTER TABLE promo_redemptions_new RENAME TO promo_redemptions');
      db.exec(`CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id)`);
    }
  } catch (e) {
    console.error('Ошибка миграции promo_redemptions.payment_id:', e.message);
  }

  try {
    const usersWithoutUuid = db.prepare('SELECT id FROM users WHERE user_uuid IS NULL OR user_uuid = ""').all();
    if (usersWithoutUuid.length > 0) {
      const crypto = require('crypto');
      const updateUuid = db.prepare('UPDATE users SET user_uuid = ? WHERE id = ?');
      for (const row of usersWithoutUuid) {
        updateUuid.run(crypto.randomUUID(), row.id);
      }
    }
  } catch (e) {
    // ignore backfill errors
  }

  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(user_uuid)`);
  } catch (e) {
    // Игнорируем, если колонка отсутствует
  }

  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`);
  } catch (e) {
    // Игнорируем, если колонка отсутствует
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id)`);
  } catch (e) {
    // Игнорируем, если колонка отсутствует
  }

  // Миграция: удаляем устаревшие типы подписок (до пересоздания таблиц)
  const legacyVpnTypes = ['vless', 'telegram'];
  const legacyTypesSql = legacyVpnTypes.map((item) => `'${item}'`).join(', ');
  try {
    db.exec(`DELETE FROM subscriptions WHERE type IN (${legacyTypesSql})`);
  } catch (e) {
    // Таблица может не существовать — игнорируем
  }

  // Миграция: пересоздаём subscriptions без колонки protocol
  try {
    const hasProtocol = db.prepare("PRAGMA table_info(subscriptions)").all().some(c => c.name === 'protocol');
    if (hasProtocol) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS subscriptions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('vpn')),
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired')),
          config_data TEXT,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      db.exec(`INSERT INTO subscriptions_new (id, user_id, type, status, config_data, expires_at, created_at) SELECT id, user_id, CASE WHEN type IN (${legacyTypesSql}) THEN 'vpn' ELSE type END, status, config_data, expires_at, created_at FROM subscriptions`);
      db.exec('DROP TABLE subscriptions');
      db.exec('ALTER TABLE subscriptions_new RENAME TO subscriptions');
      db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
    }
  } catch (e) {
    // Миграция уже применена или таблица не существует
  }

  // Миграция: добавляем поля для ежедневного биллинга
  try {
    const hasDailyRate = db.prepare("PRAGMA table_info(subscriptions)").all().some(c => c.name === 'daily_rate');
    if (!hasDailyRate) {
      db.exec('ALTER TABLE subscriptions ADD COLUMN daily_rate INTEGER DEFAULT NULL');
      db.exec('ALTER TABLE subscriptions ADD COLUMN first_charge_at DATETIME DEFAULT NULL');
      db.exec('ALTER TABLE subscriptions ADD COLUMN next_charge_at DATETIME DEFAULT NULL');
      db.exec('ALTER TABLE subscriptions ADD COLUMN last_charge_at DATETIME DEFAULT NULL');
      console.log('Добавлены поля для ежедневного биллинга');
    }
  } catch (e) {
    console.error('Ошибка миграции daily billing:', e.message);
  }

  // Миграция: для старых записей с daily_rate без next_charge_at — выравниваем по expires_at
  try {
    db.exec(`
      UPDATE subscriptions
      SET next_charge_at = expires_at
      WHERE daily_rate IS NOT NULL AND next_charge_at IS NULL AND expires_at IS NOT NULL
    `);
  } catch (e) {
    // игнорируем
  }

  try {
    db.exec('ALTER TABLE users DROP COLUMN telegram_code');
  } catch (e) {
    // колонки нет или SQLite < 3.35
  }
  try {
    db.exec('ALTER TABLE users DROP COLUMN telegram_verified');
  } catch (e) {
    // игнорируем
  }

  try {
    const adminsWithoutUuid = db.prepare('SELECT id FROM admins WHERE admin_uuid IS NULL OR admin_uuid = ""').all();
    if (adminsWithoutUuid.length > 0) {
      const crypto = require('crypto');
      const updateUuid = db.prepare('UPDATE admins SET admin_uuid = ? WHERE id = ?');
      for (const row of adminsWithoutUuid) {
        updateUuid.run(crypto.randomUUID(), row.id);
      }
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_uuid ON admins(admin_uuid)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_email ON admins(email)');
  } catch (e) {
    // ignore admin backfill errors
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN unlimited_balance BOOLEAN DEFAULT 0');
  } catch (e) {
    // колонка уже существует
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#888888',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_group_members (
        user_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, group_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
      )
    `);
  } catch (e) {
    // таблицы уже существуют
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_type TEXT NOT NULL CHECK(actor_type IN ('admin', 'system', 'user')),
        actor_id INTEGER,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_type, actor_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`);
  } catch (e) {
    // таблица уже существует
  }

  try {
    db.exec('ALTER TABLE admin_popup_messages ADD COLUMN expires_at DATETIME');
  } catch (e) {
    // колонка уже существует
  }

  try {
    db.exec('ALTER TABLE admin_popup_messages ADD COLUMN priority TEXT DEFAULT \'normal\' CHECK(priority IN (\'low\', \'normal\', \'high\'))');
  } catch (e) {
    // колонка уже существует
  }

  try {
    const idxExists = db.prepare("SELECT 1 FROM pragma_index_list('admin_popup_messages') WHERE name = 'idx_popup_expires'").get();
    if (!idxExists) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_popup_expires ON admin_popup_messages(expires_at)');
    }
  } catch (e) {
    // индекс уже существует
  }

  console.log('База данных инициализирована');
}

module.exports = {
  db,
  initDatabase
};
