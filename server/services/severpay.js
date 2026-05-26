const crypto = require('crypto');
const Payment = require('../models/Payment');
const User = require('../models/User');
const config = require('../config/env');
const { finalizePayment } = require('./paymentFinalizer');

class SeverPayProvider {
  constructor() {
    this.mid = config.payment.mid;
    this.token = config.payment.token;
    this.currency = config.payment.currency || 'RUB';
    this.baseUrl = 'https://severpay.io/api/merchant';
  }

  _normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
  }

  _isSuccessStatus(status) {
    return this._normalizeStatus(status) === 'success';
  }

  _isFailedStatus(status) {
    const normalized = this._normalizeStatus(status);
    return normalized === 'decline' || normalized === 'fail';
  }

  _resolveReturnUrl(paymentId) {
    const explicit = String(config.payment.returnUrl || '').trim();
    const base = explicit || String(config.app.url || '').trim();
    return `${base.replace(/\/$/, '')}/payment-success.html?payment_id=${encodeURIComponent(String(paymentId))}`;
  }

  /**
   * Генерация HMAC-SHA256 подписи
   */
  generateSign(body) {
    const sorted = {};
    Object.keys(body).sort().forEach(key => {
      sorted[key] = body[key];
    });
    return crypto
      .createHmac('sha256', this.token)
      .update(JSON.stringify(sorted))
      .digest('hex');
  }

  /**
   * Верификация подписи webhook
   */
  verifyWebhookSign(body) {
    const safeEqual = (a, b) => {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const aBuf = Buffer.from(a.trim().toLowerCase());
      const bBuf = Buffer.from(b.trim().toLowerCase());
      if (aBuf.length !== bBuf.length) return false;
      return crypto.timingSafeEqual(aBuf, bBuf);
    };

    const { sign, ...rest } = body;
    if (!sign) return false;

    // Пробуем без сортировки (как прислал SeverPay)
    const jsonNoSort = JSON.stringify(rest);
    const expectedNoSort = crypto
      .createHmac('sha256', this.token)
      .update(jsonNoSort)
      .digest('hex');

    if (safeEqual(sign, expectedNoSort)) return true;

    // Пробуем с сортировкой (fallback)
    const sorted = {};
    Object.keys(rest).sort().forEach(key => {
      sorted[key] = rest[key];
    });
    const jsonSorted = JSON.stringify(sorted);
    const expectedSorted = crypto
      .createHmac('sha256', this.token)
      .update(jsonSorted)
      .digest('hex');

    return safeEqual(sign, expectedSorted);
  }

  /**
   * HTTP запрос к API SeverPay
   */
  async apiRequest(endpoint, data) {
    const salt = crypto.randomBytes(16).toString('hex');
    const body = {
      mid: parseInt(this.mid),
      salt,
      ...data
    };
    body.sign = this.generateSign(body);

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!result.status) {
      throw new Error(result.msg || 'SeverPay API error');
    }

    return result;
  }

  /**
   * Создание платежа
   */
  async createPayment(userId, amount, options = {}) {
    const user = User.getById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    // Создаём запись в БД
    const payment = Payment.create(userId, amount, null, 'pending', {
      promoSnapshot: options.promoSnapshot || null
    });
    const orderId = `payment_${payment.id}`;

    try {
      const result = await this.apiRequest('/payin/create', {
        order_id: orderId,
        amount: parseFloat(amount).toFixed(2),
        currency: this.currency,
        client_email: user.email,
        client_id: String(userId),
        url_return: this._resolveReturnUrl(payment.id),
        lifetime: 1440 // 24 часа
      });

      // Сохраняем: payment_id = наш внутренний ID (для поиска при return),
      // а SeverPay данные — в provider_data (объект, Payment.update сам сделает stringify)
      Payment.update(payment.id, {
        payment_id: String(payment.id),
        provider_data: {
          severpay_id: result.data.id,
          severpay_uid: result.data.uid,
          severpay_order_id: orderId,
          url: result.data.url,
          expire_at: result.data.expire_at
        }
      });

      return {
        success: true,
        paymentId: payment.id,
        url: result.data.url
      };
    } catch (error) {
      Payment.fail(payment.id);
      throw error;
    }
  }

  /**
   * Парсинг provider_data с поддержкой двойного JSON (для старых записей)
   */
  _parseProviderData(raw) {
    try {
      const parsed = JSON.parse(raw);
      // Если это строка — пробуем распарсить ещё раз
      if (typeof parsed === 'string') {
        return JSON.parse(parsed);
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Подтверждение платежа — проверяет статус через API SeverPay
   */
  async confirmPayment(paymentId) {
    const payment = Payment.getById(paymentId);
    if (!payment) return { success: false };
    if (payment.status === 'completed') return { success: true };

    const providerData = payment.provider_data ? this._parseProviderData(payment.provider_data) : null;
    if (!providerData?.severpay_id) {
      return { success: false };
    }

    try {
      const result = await this.apiRequest('/payin/get', {
        id: parseInt(providerData.severpay_id)
      });

      const remoteStatus = this._normalizeStatus(result.data?.status);
      if (this._isSuccessStatus(remoteStatus)) {
        return finalizePayment(payment.id);
      }

      if (this._isFailedStatus(remoteStatus)) {
        Payment.fail(payment.id);
        return { success: false, failed: true, status: remoteStatus };
      }

      return { success: false };
    } catch (error) {
      console.error('SeverPay confirm error:', error.message);
      return { success: false };
    }
  }

  /**
   * Получить URL платежа
   */
  async getPaymentUrl(paymentId) {
    const payment = Payment.getById(paymentId);
    if (!payment) return null;

    const providerData = payment.provider_data ? JSON.parse(payment.provider_data) : null;
    return providerData?.url || null;
  }

  /**
   * Обработка webhook от SeverPay
   */
  async handleWebhook(req, res) {
    const body = req.body;

    // Верификация подписи
    if (!this.verifyWebhookSign(body)) {
      return res.status(400).json({ status: false, msg: 'Invalid signature' });
    }

    const { type, data } = body;

    if (type === 'test') {
      return res.json({ status: true });
    }

    if (type === 'payin') {
      const orderId = data.order_id;
      const status = this._normalizeStatus(data?.status);

      // Извлекаем внутренний ID платежа из order_id (формат: "payment_123")
      const match = orderId.match(/^payment_(\d+)$/);
      if (!match) {
        return res.json({ status: true });
      }

      const paymentId = parseInt(match[1]);
      const payment = Payment.getById(paymentId);

      if (!payment) {
        return res.json({ status: true });
      }

      if (payment.status === 'completed') {
        return res.json({ status: true });
      }

      if (this._isSuccessStatus(status)) {
        finalizePayment(payment.id);
        console.log(`SeverPay webhook: платёж ${payment.id} завершён, баланс пополнен`);
      } else if (this._isFailedStatus(status)) {
        Payment.fail(payment.id);
        console.log(`SeverPay webhook: платёж ${payment.id} отклонён (статус: ${status})`);
      } else {
        console.log(`SeverPay webhook: платёж ${payment.id} промежуточный статус (${status || 'unknown'})`);
      }

      return res.json({ status: true });
    }

    res.json({ status: true });
  }
}

module.exports = SeverPayProvider;
