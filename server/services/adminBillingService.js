const subscriptionBilling = require('./subscriptionBilling');
const { db } = require('../config/database');

async function runDailyBilling() {
  const result = await subscriptionBilling.processDailyCharges();
  return { result };
}

async function runUserBillingDryRun(userId, user) {
  const subscriptions = db.prepare(`
    SELECT * FROM subscriptions
    WHERE user_id = ? AND status = 'active' AND daily_rate IS NOT NULL
  `).all(userId);

  if (subscriptions.length === 0) {
    return {
      message: 'Нет активных daily-подписок',
      result: { processed: 0, success: 0, failed: 0, suspended: 0 },
      details: null
    };
  }

  const { result, log } = await subscriptionBilling.processUserChargesDryRun(userId, user, subscriptions);

  return {
    message:
      result === 'success'
        ? 'Хватило бы средств — списание прошло бы успешно'
        : result === 'suspended'
          ? 'Не хватило бы средств — подписки были бы приостановлены'
          : 'Ошибка обработки',
    result: {
      processed: subscriptions.length,
      success: result === 'success' ? subscriptions.length : 0,
      failed: result === 'failed' ? subscriptions.length : 0,
      suspended: result === 'suspended' ? subscriptions.length : 0
    },
    details: log
  };
}

function getBillingLog() {
  return subscriptionBilling.getLastBillingLog();
}

function listDailySubscriptions() {
  const subs = db.prepare(`
    SELECT s.*, u.email
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE s.daily_rate IS NOT NULL
    ORDER BY s.next_charge_at ASC
  `).all();

  return subs.map((s) => ({
    id: s.id,
    email: s.email,
    type: s.type,
    status: s.status,
    dailyRate: s.daily_rate,
    firstChargeAt: s.first_charge_at,
    lastChargeAt: s.last_charge_at,
    nextChargeAt: s.next_charge_at,
    expiresAt: s.expires_at
  }));
}

module.exports = {
  runDailyBilling,
  runUserBillingDryRun,
  getBillingLog,
  listDailySubscriptions
};
