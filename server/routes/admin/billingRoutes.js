const express = require('express');
const config = require('../../config/env');
const { ok, fail } = require('../../utils/httpResponse');
const { getUserByPublicId } = require('./_helpers');
const {
  runDailyBilling,
  runUserBillingDryRun,
  getBillingLog,
  listDailySubscriptions
} = require('../../services/adminBillingService');
const {
  listScenarios,
  runScenario
} = require('../../services/adminSubscriptionScenarioService');

const router = express.Router();

router.post('/billing/run', async (req, res) => {
  try {
    return ok(res, await runDailyBilling());
  } catch (error) {
    return fail(res, `Ошибка запуска биллинга: ${error.message}`, 500);
  }
});

router.post('/billing/run/:userId', async (req, res) => {
  try {
    const user = getUserByPublicId(req.params.userId);
    if (!user) return fail(res, 'Пользователь не найден', 404);
    return ok(res, await runUserBillingDryRun(user.id, user));
  } catch (error) {
    return fail(res, `Ошибка запуска биллинга: ${error.message}`, 500);
  }
});

router.get('/billing/log', async (req, res) => {
  try {
    return ok(res, { log: getBillingLog() });
  } catch (error) {
    return fail(res, `Ошибка получения лога биллинга: ${error.message}`, 500);
  }
});

router.get('/billing/subscriptions', async (req, res) => {
  try {
    return ok(res, { subscriptions: listDailySubscriptions() });
  } catch (_) {
    return fail(res, 'Ошибка получения данных биллинга', 500);
  }
});

router.get('/subscription-scenarios', async (req, res) => {
  try {
    return ok(res, {
      enabled: Boolean(config.adminScenarioTestsEnabled),
      scenarios: listScenarios()
    });
  } catch (error) {
    return fail(res, `Ошибка получения сценариев: ${error.message}`, 500);
  }
});

router.post('/subscription-scenarios/run/:userId', async (req, res) => {
  try {
    if (!config.adminScenarioTestsEnabled) {
      return fail(res, 'Сценарные тесты отключены (ADMIN_SCENARIO_TESTS_ENABLED=false)', 403);
    }

    const user = getUserByPublicId(req.params.userId);
    if (!user) return fail(res, 'Пользователь не найден', 404);

    const scenarioId = String(req.body?.scenarioId || '').trim();
    if (!scenarioId) {
      return fail(res, 'Не передан scenarioId', 400);
    }

    const report = await runScenario({
      scenarioId,
      userId: user.id,
      adminId: req.admin?.id || null
    });

    return ok(res, {
      message: report.status === 'passed' ? 'Сценарий выполнен успешно' : 'Сценарий завершился с ошибками',
      report
    });
  } catch (error) {
    return fail(res, `Ошибка запуска сценария: ${error.message}`, 500);
  }
});

module.exports = router;
