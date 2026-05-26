const PushService = require('./pushService');

class NotifyService {
  static async send({ title, body, tag = 'system' }) {
    try {
      const result = await PushService.send({ title, body, tag });
      if (result.sent > 0) {
        console.log(`Push sent: ${result.sent} ok, ${result.failed} failed`);
      }
      return result.sent > 0;
    } catch (err) {
      console.error('Notify service error:', err.message);
      return false;
    }
  }

  static async sendToUser(userId, { title, body, tag = 'system' }) {
    try {
      const result = await PushService.sendToUser(userId, { title, body, tag });
      if (result.sent > 0) {
        console.log(`Push to user ${userId}: ${result.sent} ok, ${result.failed} failed`);
      }
      return result.sent > 0;
    } catch (err) {
      console.error('Notify service error:', err.message);
      return false;
    }
  }

  /**
   * Баланс заканчивается (3 дня и меньше)
   */
  static async sendLowBalance(userId, balance, daysRemaining) {
    return this.sendToUser(userId, {
      title: '⚠️ Баланс заканчивается',
      body: `Баланс: ${balance.toFixed(0)}₽. Хватит на ${daysRemaining} ${daysRemaining === 1 ? 'день' : daysRemaining < 5 ? 'дня' : 'дней'}. Пополните счёт.`,
      tag: 'low_balance'
    });
  }

  /**
   * Средства закончились — подписка отключена
   */
  static async sendFundsDepleted(userId, balance) {
    return this.sendToUser(userId, {
      title: '🔴 Средства закончились',
      body: `Баланс: ${balance.toFixed(0)}₽. Подписка приостановлена. Пополните счёт для возобновления.`,
      tag: 'depleted'
    });
  }
}

module.exports = NotifyService;
