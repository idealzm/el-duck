const { db } = require('../config/database');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const subscriptionBilling = require('./subscriptionBilling');
const {
  cancelSubscription,
  resumeSubscription,
  createDailySubscriptionForAdmin
} = require('./adminSubscriptionService');

const ONE_MINUTE_MS = 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function parseConfigData(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function getAllVpnSubscriptions(userId) {
  return Subscription.getByUser(userId).filter((item) => item.type === 'vpn');
}

function getLatestVpnSubscription(userId) {
  const list = getAllVpnSubscriptions(userId);
  return list.length > 0 ? list[0] : null;
}

function getActiveDailySubscriptions(userId) {
  return db.prepare(`
    SELECT * FROM subscriptions
    WHERE user_id = ? AND status = 'active' AND daily_rate IS NOT NULL
    ORDER BY created_at DESC
  `).all(userId);
}

function buildSnapshot(userId) {
  const user = User.getById(userId);
  const vpnSubscriptions = getAllVpnSubscriptions(userId).map((sub) => {
    const configData = parseConfigData(sub.config_data) || {};
    const resources = Array.isArray(configData.resources) ? configData.resources : [];
    return {
      id: sub.id,
      status: sub.status,
      expiresAt: sub.expires_at,
      nextChargeAt: sub.next_charge_at || null,
      dailyRate: sub.daily_rate || null,
      resourcesCount: resources.length,
      pauseReason: configData.pauseReason || null,
      pausedAt: configData.pausedAt || null,
      deleteAfter: configData.deleteAfter || null
    };
  });

  return {
    user: user
      ? {
          id: user.user_uuid || User.ensureUuid(user.id),
          email: user.email,
          balance: user.balance
        }
      : null,
    vpnSubscriptions
  };
}

function createAssertionRecorder(step) {
  step.assertions = [];
  return function assertEqual(key, expected, actual, message) {
    const pass = expected === actual;
    step.assertions.push({ key, expected, actual, pass, message: message || null });
    if (!pass) {
      throw new Error(message || `Assertion failed: ${key}`);
    }
  };
}

async function ensureActiveVpnSubscription(userId, step) {
  const user = User.getById(userId);
  if (!user) {
    throw new Error('Пользователь не найден');
  }

  const active = Subscription.getActiveByUser(userId, 'vpn')[0] || null;
  if (active) {
    return active;
  }

  const cancelled = Subscription.getCancelledByUser(userId, 'vpn')[0] || null;
  if (cancelled) {
    await resumeSubscription(cancelled, 'vpn');
    step.meta = { source: 'resumed_cancelled' };
    return getLatestVpnSubscription(userId);
  }

  await createDailySubscriptionForAdmin(user, 'vpn');
  step.meta = { source: 'created_new' };
  return getLatestVpnSubscription(userId);
}

async function runStep(report, name, action, handler) {
  const started = Date.now();
  const step = {
    name,
    action,
    status: 'pending',
    startedAt: new Date(started).toISOString(),
    finishedAt: null,
    durationMs: 0,
    assertions: [],
    details: null,
    error: null
  };

  try {
    const details = await handler(step);
    step.status = 'passed';
    step.details = details || null;
  } catch (error) {
    step.status = 'failed';
    step.error = error.message;
  } finally {
    step.finishedAt = nowIso();
    step.durationMs = Date.now() - started;
    report.steps.push(step);
  }

  if (step.status === 'failed') {
    throw new Error(step.error || `Step failed: ${name}`);
  }
}

async function scenarioCancelThenResume(userId, report) {
  await runStep(report, 'Ensure active VPN', 'ensure-active', async (step) => {
    const sub = await ensureActiveVpnSubscription(userId, step);
    if (!sub) throw new Error('Не удалось подготовить активную подписку');
    const assertEqual = createAssertionRecorder(step);
    assertEqual('status', 'active', sub.status, 'VPN подписка должна быть active перед отменой');
    return { subscriptionId: sub.id };
  });

  await runStep(report, 'Cancel active subscription', 'cancel', async (step) => {
    const activeSub = Subscription.getActiveByUser(userId, 'vpn')[0] || getLatestVpnSubscription(userId);
    if (!activeSub) throw new Error('Нет VPN подписки для отмены');
    await cancelSubscription(activeSub, 'vpn');
    const updated = Subscription.getById(activeSub.id);
    const assertEqual = createAssertionRecorder(step);
    assertEqual('status', 'cancelled', updated.status, 'После cancel статус должен быть cancelled');
    return { subscriptionId: updated.id, expiresAt: updated.expires_at };
  });

  await runStep(report, 'Resume cancelled subscription', 'resume', async (step) => {
    const cancelledSub = Subscription.getCancelledByUser(userId, 'vpn')[0];
    if (!cancelledSub) throw new Error('Нет отмененной подписки для возобновления');
    await resumeSubscription(cancelledSub, 'vpn');
    const resumed = Subscription.getById(cancelledSub.id);
    const configData = parseConfigData(resumed.config_data) || {};
    const resources = Array.isArray(configData.resources) ? configData.resources : [];
    const assertEqual = createAssertionRecorder(step);
    assertEqual('status', 'active', resumed.status, 'После resume статус должен быть active');
    const hasResources = resources.length > 0;
    step.assertions.push({
      key: 'resourcesCount>0',
      expected: true,
      actual: hasResources,
      pass: hasResources,
      message: 'После resume должен быть хотя бы один VPN ресурс'
    });
    if (!hasResources) {
      throw new Error('После resume отсутствуют VPN ресурсы');
    }
    return { subscriptionId: resumed.id, resourcesCount: resources.length };
  });
}

async function scenarioLowBalanceSuspend(userId, report) {
  await runStep(report, 'Ensure active VPN', 'ensure-active', async (step) => {
    const sub = await ensureActiveVpnSubscription(userId, step);
    if (!sub) throw new Error('Не удалось подготовить активную подписку');
    return { subscriptionId: sub.id };
  });

  await runStep(report, 'Set user balance to zero', 'set-balance-0', async (step) => {
    const updatedUser = User.setBalance(userId, 0);
    const assertEqual = createAssertionRecorder(step);
    assertEqual('balance', 0, Number(updatedUser.balance), 'Баланс должен быть 0 для проверки suspend');
    return { balance: updatedUser.balance };
  });

  await runStep(report, 'Run real user billing', 'real-billing', async (step) => {
    const user = User.getById(userId);
    const activeDaily = getActiveDailySubscriptions(userId);
    if (!activeDaily.length) {
      throw new Error('Нет активных daily-подписок для списания');
    }
    const result = await subscriptionBilling.processUserCharges(userId, user, activeDaily);
    const latest = getLatestVpnSubscription(userId);
    const assertEqual = createAssertionRecorder(step);
    assertEqual('billingResult', 'suspended', result.result, 'Биллинг должен перевести подписку в suspended');
    assertEqual('subscriptionStatus', 'expired', latest?.status || null, 'После нехватки средств подписка должна стать expired');
    return {
      billingResult: result.result,
      subscriptionStatus: latest?.status || null
    };
  });
}

async function scenarioCancelThenExpire(userId, report) {
  await runStep(report, 'Ensure active VPN', 'ensure-active', async (step) => {
    const sub = await ensureActiveVpnSubscription(userId, step);
    if (!sub) throw new Error('Не удалось подготовить активную подписку');
    return { subscriptionId: sub.id };
  });

  await runStep(report, 'Cancel active subscription', 'cancel', async (step) => {
    const activeSub = Subscription.getActiveByUser(userId, 'vpn')[0] || getLatestVpnSubscription(userId);
    if (!activeSub) throw new Error('Нет VPN подписки для отмены');
    await cancelSubscription(activeSub, 'vpn');
    const updated = Subscription.getById(activeSub.id);
    const assertEqual = createAssertionRecorder(step);
    assertEqual('status', 'cancelled', updated.status, 'После cancel статус должен быть cancelled');
    return { subscriptionId: updated.id };
  });

  await runStep(report, 'Force expiration time to past', 'force-expire', async (step) => {
    const cancelledSub = Subscription.getCancelledByUser(userId, 'vpn')[0];
    if (!cancelledSub) throw new Error('Нет отмененной подписки для проверки expire');
    const forcedExpireAt = new Date(Date.now() - ONE_MINUTE_MS).toISOString();
    Subscription.update(cancelledSub.id, { expires_at: forcedExpireAt });
    return { subscriptionId: cancelledSub.id, forcedExpireAt };
  });

  await runStep(report, 'Run check expired cancelled', 'check-expired-cancelled', async (step) => {
    const checkResult = await subscriptionBilling.checkExpiredCancelled();
    const updated = getLatestVpnSubscription(userId);
    const configData = parseConfigData(updated?.config_data) || {};
    const assertEqual = createAssertionRecorder(step);
    assertEqual('status', 'expired', updated?.status || null, 'После checkExpiredCancelled статус должен быть expired');
    const hasPauseReason = configData.pauseReason === 'cancelled';
    step.assertions.push({
      key: 'pauseReason=cancelled',
      expected: 'cancelled',
      actual: configData.pauseReason || null,
      pass: hasPauseReason,
      message: 'У expired подписки должен сохраняться pauseReason=cancelled'
    });
    if (!hasPauseReason) {
      throw new Error('pauseReason не установлен в cancelled');
    }
    return { checkResult };
  });
}

const scenarios = {
  cancel_then_resume: {
    id: 'cancel_then_resume',
    title: 'Cancel -> Resume',
    description: 'Отмена активной подписки и последующее возобновление с проверкой статуса и ресурсов',
    run: scenarioCancelThenResume
  },
  low_balance_suspend: {
    id: 'low_balance_suspend',
    title: 'Low Balance -> Suspend',
    description: 'Реальный прогон биллинга при нулевом балансе: подписка должна перейти в expired',
    run: scenarioLowBalanceSuspend
  },
  cancel_then_expire: {
    id: 'cancel_then_expire',
    title: 'Cancel -> Expire',
    description: 'Отмена подписки, форс истечения и проверка отключения через checkExpiredCancelled',
    run: scenarioCancelThenExpire
  }
};

function listScenarios() {
  return Object.values(scenarios).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description
  }));
}

async function runScenario({ scenarioId, userId, adminId = null }) {
  const scenario = scenarios[scenarioId];
  if (!scenario) {
    throw new Error(`Неизвестный сценарий: ${scenarioId}`);
  }

  const user = User.getById(userId);
  if (!user) {
    throw new Error('Пользователь не найден');
  }

  const report = {
    scenario: {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description
    },
    actor: {
      adminId
    },
    user: {
      id: user.user_uuid || User.ensureUuid(user.id),
      email: user.email
    },
    startedAt: nowIso(),
    finishedAt: null,
    status: 'running',
    steps: [],
    snapshotBefore: buildSnapshot(userId),
    snapshotAfter: null,
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };

  try {
    await scenario.run(userId, report);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
  } finally {
    report.finishedAt = nowIso();
    report.snapshotAfter = buildSnapshot(userId);
    report.summary.total = report.steps.length;
    report.summary.passed = report.steps.filter((step) => step.status === 'passed').length;
    report.summary.failed = report.steps.filter((step) => step.status === 'failed').length;
  }

  return report;
}

module.exports = {
  listScenarios,
  runScenario
};
