const config = require('../config/env');
const Payment = require('../models/Payment');
const SeverPayProvider = require('./severpay');
const { finalizePayment } = require('./paymentFinalizer');

/**
 * Базовый класс для платёжных провайдеров
 */
class PaymentProvider {
  async createPayment(userId, amount, options = {}) {
    throw new Error('Метод должен быть реализован');
  }

  async confirmPayment(paymentId) {
    throw new Error('Метод должен быть реализован');
  }

  async getPaymentUrl(paymentId) {
    throw new Error('Метод должен быть реализован');
  }
}

/**
 * Stub провайдер (для разработки)
 */
class StubProvider extends PaymentProvider {
  async createPayment(userId, amount, options = {}) {
    const payment = Payment.create(userId, amount, `stub_${Date.now()}`, 'pending', {
      promoSnapshot: options.promoSnapshot || null
    });
    
    // Мгновенное подтверждение для тестов
    await this.confirmPayment(payment.payment_id);

    return {
      success: true,
      paymentId: payment.payment_id,
      url: `/payment-success.html?payment_id=${encodeURIComponent(payment.payment_id)}`
    };
  }

  async confirmPayment(paymentId) {
    return finalizePayment(paymentId);
  }

  async getPaymentUrl(paymentId) {
    return `/payment-success.html?payment_id=${encodeURIComponent(paymentId)}`;
  }
}

/**
 * YooKassa провайдер (заготовка)
 */
class YooKassaProvider extends PaymentProvider {
  constructor() {
    super();
    this.shopId = config.payment.apiKey;
    this.secretKey = config.payment.secret;
  }

  async createPayment(userId, amount, options = {}) {
    return {
      success: false,
      error: 'Провайдер yookassa пока не настроен. Используйте severpay или stub.'
    };
  }

  async confirmPayment(paymentId) {
    return {
      success: false,
      error: 'Подтверждение платежа yookassa пока не реализовано'
    };
  }

  async getPaymentUrl(paymentId) {
    return null;
  }

  async handleWebhook(req, res) {
    res.status(501).json({
      success: false,
      error: 'Webhook yookassa пока не поддерживается'
    });
  }
}

/**
 * Фабрика платёжных провайдеров
 */
let _providerInstance = null;
let _providerType = null;

function getPaymentProvider() {
  const provider = config.payment.provider;
  if (_providerInstance && _providerType === provider) {
    return _providerInstance;
  }
  _providerType = provider;
  switch (provider) {
    case 'severpay':
      _providerInstance = new SeverPayProvider();
      break;
    case 'yookassa':
      _providerInstance = new YooKassaProvider();
      break;
    case 'stub':
    default:
      _providerInstance = new StubProvider();
      break;
  }
  return _providerInstance;
}

module.exports = {
  getPaymentProvider,
  PaymentProvider,
  StubProvider,
  YooKassaProvider,
  SeverPayProvider
};
