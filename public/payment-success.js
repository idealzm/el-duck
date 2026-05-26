const params = new URLSearchParams(window.location.search);
const paymentId = params.get('payment_id');

async function checkPayment() {
  if (!paymentId) {
    showStatus('error', 'Платеж не найден', 'Не указан идентификатор платежа.');
    return;
  }

  try {
    const res = await fetch(`/api/payments/stub-success?payment_id=${encodeURIComponent(paymentId)}`);
    const data = await res.json();

    if (data.success) {
      showStatus('success', 'Оплата прошла!', 'Средства зачислены на ваш баланс.');
      setTimeout(() => {
        window.location.href = '/';
      }, 5000);
    } else {
      showStatus('pending', 'Платеж обрабатывается', 'Если оплата еще не подтверждена, баланс будет пополнен автоматически.');
      setTimeout(() => {
        window.location.href = '/';
      }, 8000);
    }
  } catch (_) {
    showStatus('pending', 'Платеж обрабатывается', 'Баланс будет пополнен после подтверждения.');
    setTimeout(() => {
      window.location.href = '/';
    }, 8000);
  }
}

function showStatus(type, title, message) {
  const area = document.getElementById('statusArea');
  const countdownSeconds = type === 'success' ? 5 : 8;
  const icon = type === 'success'
    ? `<div class="checkmark-circle"><svg class="checkmark" viewBox="0 0 48 48"><path d="M10 24 L20 34 L38 14"/></svg></div>`
    : type === 'error'
      ? `<div class="checkmark-circle checkmark-error"><svg class="checkmark" viewBox="0 0 48 48"><path d="M14 14 L34 34 M34 14 L14 34" stroke="#ef4444" stroke-width="3" fill="none" stroke-linecap="round"/></svg></div>`
      : `<div class="checkmark-circle checkmark-pending"><svg class="checkmark" viewBox="0 0 48 48"><rect x="20" y="20" width="8" height="8" fill="#c8c8c8"/></svg></div>`;

  area.innerHTML = `
    ${icon}
    <h1>${title}</h1>
    <p class="subtitle">${message}</p>
    <div class="status-msg ${type}">
      ${type === 'success' ? '✓' : type === 'error' ? '✕' : '⏳'} ${message}
    </div>
    <a href="/" class="btn btn-primary">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
      Вернуться в кабинет
    </a>
    <p class="countdown">Автоматический переход через <span id="countdownNum">${countdownSeconds}</span> сек</p>
  `;

  let sec = countdownSeconds;
  const el = document.getElementById('countdownNum');
  if (el) {
    const timer = setInterval(() => {
      sec -= 1;
      el.textContent = String(sec);
      if (sec <= 0) clearInterval(timer);
    }, 1000);
  }
}

checkPayment();
