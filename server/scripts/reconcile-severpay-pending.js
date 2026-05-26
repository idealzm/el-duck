const { db } = require('../config/database');
const config = require('../config/env');
const SeverPayProvider = require('../services/severpay');

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isSuccessStatus(status) {
  const normalized = normalizeStatus(status);
  return ['success', 'succeeded', 'paid', 'completed', 'done'].includes(normalized);
}

function isFailedStatus(status) {
  const normalized = normalizeStatus(status);
  return ['decline', 'declined', 'fail', 'failed', 'error', 'canceled', 'cancelled'].includes(normalized);
}

async function main() {
  const applyMode = process.argv.includes('--apply');

  if (String(config.payment.provider || '').toLowerCase() !== 'severpay') {
    console.error('PAYMENT_PROVIDER должен быть severpay для этого скрипта');
    process.exit(1);
  }

  const provider = new SeverPayProvider();
  const pending = db.prepare("SELECT id, payment_id, provider_data, amount, user_id, created_at FROM payments WHERE status = 'pending' ORDER BY id ASC").all();

  if (!pending.length) {
    console.log('pending платежей не найдено');
    return;
  }

  let checked = 0;
  let finalized = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending) {
    checked += 1;

    let providerData;
    try {
      providerData = row.provider_data ? JSON.parse(row.provider_data) : null;
      if (typeof providerData === 'string') providerData = JSON.parse(providerData);
    } catch {
      providerData = null;
    }

    const severpayId = Number(providerData && providerData.severpay_id);
    if (!severpayId) {
      skipped += 1;
      console.log(`[skip] #${row.id}: нет severpay_id`);
      continue;
    }

    try {
      const result = await provider.apiRequest('/payin/get', { id: severpayId });
      const remoteStatus = normalizeStatus(result?.data?.status);

      if (isSuccessStatus(remoteStatus)) {
        if (applyMode) {
          const finalizeResult = await provider.confirmPayment(row.id);
          if (finalizeResult?.success) {
            finalized += 1;
            console.log(`[ok] #${row.id}: ${remoteStatus} -> completed`);
          } else {
            failed += 1;
            console.log(`[err] #${row.id}: не удалось финализировать (${finalizeResult?.error || 'unknown'})`);
          }
        } else {
          console.log(`[dry-run] #${row.id}: ${remoteStatus} (будет completed)`);
        }
      } else if (isFailedStatus(remoteStatus)) {
        console.log(`[info] #${row.id}: ${remoteStatus}`);
      } else {
        console.log(`[wait] #${row.id}: ${remoteStatus || 'unknown'}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`[err] #${row.id}: ошибка запроса к SeverPay (${error.message})`);
    }
  }

  console.log('---');
  console.log(`mode: ${applyMode ? 'apply' : 'dry-run'}`);
  console.log(`checked: ${checked}`);
  console.log(`finalized: ${finalized}`);
  console.log(`failed: ${failed}`);
  console.log(`skipped: ${skipped}`);
}

main().catch((error) => {
  console.error('fatal:', error.message);
  process.exit(1);
});
