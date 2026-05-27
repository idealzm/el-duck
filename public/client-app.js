// EL-DUCK VPN Client App
// =====================================

const API_URL = '';

function showEl(el) { if (el) el.classList.remove('hidden'); }
function hideEl(el) { if (el) el.classList.add('hidden'); }
function toggleEl(el, visible) { if (el) { if (visible) el.classList.remove('hidden'); else el.classList.add('hidden'); } }
function isVisible(el) { return el && !el.classList.contains('hidden'); }

// Состояние приложения
const state = {
  user: null,
  subscriptions: [],
  config: null,
  referral: null,
  currentSection: 'vpn',
  dailyRate: 0,
  daysRemaining: 0,
  nextChargeAt: null,
  activeTicket: null,
  support: {
    ticket: null,
    messages: [],
    socket: null,
    key: null
  },
  pendingAdminPopup: null
};

// DOM элементы
const elements = {
  authScreen: document.getElementById('authScreen'),
  mainScreen: document.getElementById('mainScreen'),
  emailForm: document.getElementById('emailForm'),
  codeForm: document.getElementById('codeForm'),
  emailInput: document.getElementById('email'),
  codeInput: document.getElementById('code'),
  emailDisplay: document.getElementById('emailDisplay'),
  spamWarning: document.getElementById('spamWarning'),
  sendCodeBtn: document.getElementById('sendCodeBtn'),
  verifyCodeBtn: document.getElementById('verifyCodeBtn'),
  resendCodeBtn: document.getElementById('resendCodeBtn'),
  changeEmailBtn: document.getElementById('changeEmailBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  cardsContainer: document.getElementById('cardsContainer'),
  noSubscriptionBanner: document.getElementById('noSubscriptionBanner'),
  subscribeBtn: document.getElementById('subscribeBtn'),
  subscribeBtnCard: document.getElementById('subscribeBtnCard'),
  profileName: document.getElementById('profileName'),
  profileEmail: document.getElementById('profileEmail'),
  profileUuidCopy: document.getElementById('profileUuidCopy'),
  profileAvatar: document.getElementById('profileAvatar'),
  profileAvatarText: document.getElementById('profileAvatarText'),
  balanceValue: document.getElementById('balanceValue'),
  balanceCurrency: document.getElementById('balanceCurrency'),
  subBalanceCurrency: document.getElementById('subBalanceCurrency'),
  currentBalanceCurrency: document.getElementById('currentBalanceCurrency'),
  refreshBalance: document.getElementById('refreshBalance'),
  topUpBtn: document.getElementById('topUpBtn'),
  customAmountInput: document.getElementById('customAmount'),
  paymentNote: document.querySelector('.payment-note'),
  promoCodeInput: document.getElementById('promoCodeInput'),
  promoTypeBadge: document.getElementById('promoTypeBadge'),
  applyPromoBtn: document.getElementById('applyPromoBtn'),
  promoPreviewHint: document.getElementById('promoPreviewHint'),
  subscriptionStatusBlock: document.getElementById('subscriptionStatusBlock'),
  instructionModal: document.getElementById('instructionModal'),
  instructionTitle: document.getElementById('instructionTitle'),
  instructionBody: document.getElementById('instructionBody'),
  topUpModal: document.getElementById('topUpModal'),
  subscriptionModal: document.getElementById('subscriptionModal'),
  configModal: document.getElementById('configModal'),
  configContent: document.getElementById('configContent'),
  currentBalance: document.getElementById('currentBalance'),
  cancelSubscriptionBtn: document.getElementById('cancelSubscriptionBtn'),
  cancelSubscriptionModal: document.getElementById('cancelSubscriptionModal'),
  resumeSubscriptionBtn: document.getElementById('resumeSubscriptionBtn'),
  welcomeModal: document.getElementById('welcomeModal'),
  welcomeDoneBtn: document.getElementById('welcomeDoneBtn'),
  welcomeReadCheckbox: document.getElementById('welcomeReadCheckbox'),
  welcomeConsentCheckbox: document.getElementById('welcomeConsentCheckbox'),
  adminPopupModal: document.getElementById('adminPopupModal'),
  adminPopupTitle: document.getElementById('adminPopupTitle'),
  adminPopupDate: document.getElementById('adminPopupDate'),
  adminPopupBody: document.getElementById('adminPopupBody'),
  adminPopupReadCheckbox: document.getElementById('adminPopupReadCheckbox'),
  adminPopupConfirmBtn: document.getElementById('adminPopupConfirmBtn'),
  toast: document.getElementById('toast'),
  // Push notifications
  pushModal: document.getElementById('pushModal'),
  pushModalStatus: document.getElementById('pushModalStatus'),
  pushModalToggleBtn: document.getElementById('pushModalToggleBtn'),
  referralCard: document.getElementById('referralCard'),
  referralCodeValue: document.getElementById('referralCodeValue'),
  copyReferralBtn: document.getElementById('copyReferralBtn'),
  referralHint: document.getElementById('referralHint'),
  supportLoginBtn: document.getElementById('supportLoginBtn'),
  supportProfileBtn: document.getElementById('supportProfileBtn'),
  supportCreateModal: document.getElementById('supportCreateModal'),
  supportCreateForm: document.getElementById('supportCreateForm'),
  supportEmailGroup: document.getElementById('supportEmailGroup'),
  supportEmailInput: document.getElementById('supportEmailInput'),
  supportSubjectInput: document.getElementById('supportSubjectInput'),
  supportBodyInput: document.getElementById('supportBodyInput'),
  supportBackBtn: document.getElementById('supportBackBtn'),
  supportChatTitle: document.getElementById('supportChatTitle'),
  supportChatStatus: document.getElementById('supportChatStatus'),
  supportMessages: document.getElementById('supportMessages'),
  supportMessageForm: document.getElementById('supportMessageForm'),
  supportMessageInput: document.getElementById('supportMessageInput'),
  supportActiveTicket: document.getElementById('supportActiveTicket'),
  supportActiveTicketSubject: document.getElementById('supportActiveTicketSubject'),
  supportActiveTicketStatus: document.getElementById('supportActiveTicketStatus'),
  supportActiveTicketBtn: document.getElementById('supportActiveTicketBtn'),
  supportCardText: document.getElementById('supportCardText'),
  popupBlockedModal: document.getElementById('popupBlockedModal'),
  popupBlockedMessage: document.getElementById('popupBlockedMessage'),
  popupBlockedLink: document.getElementById('popupBlockedLink'),
  pushModal: document.getElementById('pushModal'),
  pushModalStatus: document.getElementById('pushModalStatus'),
  pushModalToggleBtn: document.getElementById('pushModalToggleBtn')
};

// =====================================
// Утилиты
// =====================================

function showToast(message, type = 'info') {
  if (showToast.timer) {
    clearTimeout(showToast.timer);
  }
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;
  showToast.timer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 3000);
}

function showLoading(btn, isLoading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  if (text) { if (isLoading) hideEl(text); else showEl(text); }
  if (loader) { if (isLoading) showEl(loader); else hideEl(loader); }
  btn.disabled = isLoading;
}

function formatBalance(balance) {
  return parseFloat(balance).toFixed(2);
}

function updateCurrencyVisibility() {
  const unlimited = state.user && state.user.unlimitedBalance;
  if (unlimited) {
    hideEl(elements.balanceCurrency);
    hideEl(elements.subBalanceCurrency);
    hideEl(elements.currentBalanceCurrency);
  } else {
    showEl(elements.balanceCurrency);
    showEl(elements.subBalanceCurrency);
    showEl(elements.currentBalanceCurrency);
  }
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTopupLimits() {
  const minRaw = Number(state.config?.limits?.min);
  const maxRaw = Number(state.config?.limits?.max);

  const min = Number.isFinite(minRaw) && minRaw > 0 ? minRaw : 50;
  const max = Number.isFinite(maxRaw) && maxRaw >= min ? maxRaw : 500;
  return { min, max };
}

function isTopupEnabled() {
  return state.config?.payments?.topupEnabled !== false;
}

function setPromoTypeBadge(type) {
  if (!elements.promoTypeBadge) return;

  if (!type) {
    elements.promoTypeBadge.classList.add('hidden');
    elements.promoTypeBadge.textContent = '';
    return;
  }

  if (type === 'instant') {
    elements.promoTypeBadge.textContent = 'Мгновенный';
    elements.promoTypeBadge.className = 'promo-type-badge instant';
    return;
  }

  elements.promoTypeBadge.textContent = 'К пополнению';
  elements.promoTypeBadge.className = 'promo-type-badge topup';
}

function getAvatarText(email) {
  return email ? email[0].toUpperCase() : 'U';
}

// =====================================
// API запросы
// =====================================

class ApiError extends Error {
  constructor(message, { status = 0, data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function apiRequest(endpoint, options = {}) {
  const { timeoutMs = 0, ...fetchOptions } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers
  };

  let controller = null;
  let timeoutId = null;
  if (Number(timeoutMs) > 0) {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs));
  }

  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      credentials: 'same-origin',
      headers,
      signal: controller ? controller.signal : fetchOptions.signal
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(data?.error || `Ошибка запроса (${response.status})`, {
      status: response.status,
      data
    });
  }

  return data;
}

// =====================================
// Авторизация
// =====================================

async function sendCode(email) {
  return apiRequest('/api/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
    timeoutMs: 12000
  });
}

async function verifyCode(email, code) {
  try {
    const response = await apiRequest('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
    return response;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

function openCodeStep(email) {
  elements.emailDisplay.textContent = email;
  elements.spamWarning.classList.remove('hidden');
  elements.emailForm.classList.add('hidden');
  elements.codeForm.classList.remove('hidden');
  elements.codeInput.focus();
}

function canFallbackToCodeEntry(error) {
  const status = Number(error?.status || 0);
  if (status >= 500) return true;

  const message = String(error?.message || '').toLowerCase();
  return (
    error?.name === 'AbortError' ||
    message.includes('ошибка запроса') ||
    message.includes('не удалось отправить письмо') ||
    message.includes('network') ||
    message.includes('aborted')
  );
}

// =====================================
// Получение данных пользователя
// =====================================

async function loadUserData() {
  try {
    const data = await apiRequest('/api/user/me');
    state.user = data.user;
    state.subscriptions = data.subscriptions;
    state.config = {
      ...(state.config || {}),
      prices: data.prices || state.config?.prices,
      limits: data.limits || state.config?.limits
    };
    state.referral = {
      code: data.user.referralCode || null,
      link: data.user.referralLink || null,
      enabled: data.user.referralEnabled !== false,
      referredByUserId: data.user.referredByUserId || null
    };
    state.dailyRate = data.dailyRate || 0;
    state.daysRemaining = data.daysRemaining || 0;
    state.nextChargeAt = data.nextChargeAt || null;
    updateUI();
    loadReferralData();
    return true;
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('авторизация') || message.includes('токен') || message.includes('сессия')) {
      logout({ skipRequest: true });
    } else {
      showToast(error.message, 'error');
    }
    return false;
  }
}

// =====================================
// Обновление UI
// =====================================

function updateUI() {
  if (!state.user) return;
  document.body.classList.remove('support-chat-only');

  // Обновляем профиль
  elements.profileName.textContent = state.user.email.split('@')[0];
  elements.profileEmail.textContent = state.user.email;
  elements.profileAvatarText.textContent = getAvatarText(state.user.email);
  elements.balanceValue.textContent = state.user.unlimitedBalance ? '∞' : formatBalance(state.user.balance);
  updateCurrencyVisibility();

  // Обновляем подписки
  updateSubscriptionsUI();

  renderReferralUI();
  
  // Обновляем информацию о балансе подписки (daily billing)
  updateSubscriptionBalanceUI();

  // Показываем главный экран
  elements.authScreen.classList.remove('active');
  elements.mainScreen.classList.add('active');
  document.body.classList.remove('auth-screen-open');
  navigateToSection(state.currentSection || 'vpn');

  loadActiveTicket();
}

async function loadActiveTicket() {
  if (!state.user) {
    renderActiveTicket();
    return;
  }
  try {
    const data = await apiRequest('/api/support/my-ticket');
    if (data.ticket) {
      state.activeTicket = { ...data.ticket, _accessKey: data.accessKey || '' };
    } else {
      state.activeTicket = null;
    }
    renderActiveTicket();
  } catch (_) {
    state.activeTicket = null;
    renderActiveTicket();
  }
}

function renderActiveTicket() {
  const ticket = state.activeTicket;
  const activeBlock = elements.supportActiveTicket;
  const createBtn = elements.supportProfileBtn;
  const cardText = elements.supportCardText;

  if (!activeBlock) return;

  if (ticket && ticket.status !== 'closed') {
    const statusMap = { open: 'Открыт', pending: 'Ожидает ответа', closed: 'Закрыт' };
    if (elements.supportActiveTicketSubject) {
      elements.supportActiveTicketSubject.textContent = ticket.subject || 'Обращение в поддержку';
    }
    if (elements.supportActiveTicketStatus) {
      elements.supportActiveTicketStatus.textContent = statusMap[ticket.status] || ticket.status;
    }
    activeBlock.classList.remove('hidden');
    if (createBtn) createBtn.classList.add('hidden');
    if (cardText) cardText.textContent = 'У вас есть открытое обращение. Перейдите в чат, чтобы продолжить.';
  } else {
    activeBlock.classList.add('hidden');
    if (createBtn) createBtn.classList.remove('hidden');
    if (cardText) cardText.textContent = 'Если что-то не работает, создайте обращение. Ответ появится в чате.';
  }
}

function renderReferralUI() {
  if (elements.referralCard) {
    const enabled = state.referral?.enabled !== false;
    toggleEl(elements.referralCard, enabled);
    if (!enabled) return;
  }

  if (!elements.referralCodeValue) return;
  const referralLink = state.referral?.link || (state.referral?.code ? `${window.location.origin}/?ref=${encodeURIComponent(state.referral.code)}` : '—');
  elements.referralCodeValue.value = referralLink;

  if (elements.referralHint) {
    const invited = state.referral?.stats?.invitedUsers || 0;
    const earned = Number(state.referral?.stats?.earnedAsInviter || 0) + Number(state.referral?.stats?.earnedAsInvitee || 0);
    if (invited > 0 || earned > 0) {
      elements.referralHint.textContent = `Приглашено: ${invited}. Начислено бонусов: ${earned.toFixed(2)} ₽`;
    }
  }
}

async function loadReferralData() {
  if (state.referral?.enabled === false) {
    renderReferralUI();
    return;
  }
  try {
    const data = await apiRequest('/api/user/referral');
    state.referral = {
      ...data.referral,
      enabled: data.referral?.settings?.enabled !== false
    };
    renderReferralUI();
  } catch (_) {}
}

function captureReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('ref') || '').trim().toUpperCase();
    if (/^[A-Z0-9_-]{3,32}$/.test(ref)) {
      localStorage.setItem('pending_referral_code', ref);
    }

    if (params.has('ref')) {
      params.delete('ref');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', next);
    }
  } catch (_) {}
}

async function applyPendingReferralIfNeeded() {
  const pendingCode = (localStorage.getItem('pending_referral_code') || '').trim().toUpperCase();
  if (!pendingCode || !state.user || state.referral?.referredByUserId) return;

  try {
    await apiRequest('/api/user/referral/bind', {
      method: 'POST',
      body: JSON.stringify({ code: pendingCode })
    });
    localStorage.removeItem('pending_referral_code');
    await loadReferralData();
    showToast('Реферальная ссылка применена', 'success');
  } catch (error) {
    if (error.message.includes('уже привязана') || error.message.includes('Нельзя использовать свою')) {
      localStorage.removeItem('pending_referral_code');
    }
  }
}

function updateSubscriptionsUI() {
  // Показываем active и cancelled подписки
  const now = new Date();
  const validSubs = state.subscriptions.filter(s => {
    const expiresAt = new Date(s.expiresAt);
    return (s.status === 'active' || s.status === 'cancelled') && expiresAt > now;
  });

  // Берём только последнюю подписку VPN
  const vpnSubs = validSubs.filter(s => s.type === 'vpn');
  const sorted = vpnSubs.sort((a, b) => {
    if (a.status === 'active' && b.status === 'cancelled') return -1;
    if (a.status === 'cancelled' && b.status === 'active') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const activeSubs = sorted.length > 0 ? [sorted[0]] : [];
  const hasVpn = activeSubs.some(s => s.type === 'vpn');

  if (activeSubs.length === 0) {
    elements.noSubscriptionBanner.classList.remove('hidden');
    elements.cardsContainer.innerHTML = '';
    elements.subscriptionStatusBlock.innerHTML = `
      <span class="status-text">Не активна</span>
    `;
    elements.subscriptionStatusBlock.classList.remove('active');
    if (elements.cancelSubscriptionBtn) {
      elements.cancelSubscriptionBtn.classList.add('hidden');
    }
    if (elements.resumeSubscriptionBtn) {
      elements.resumeSubscriptionBtn.classList.add('hidden');
    }
  } else {
    elements.noSubscriptionBanner.classList.add('hidden');
    renderSubscriptionCards(state.subscriptions, activeSubs);

    // Проверяем статус подписки
    const vpnSub = activeSubs.find(s => s.type === 'vpn');
    const vpnCanceled = vpnSub && vpnSub.status === 'cancelled';

    const statusListItems = [];
    if (hasVpn) {
      if (vpnCanceled) {
        const timerDate = vpnSub.dailyRate && vpnSub.nextChargeAt
          ? vpnSub.nextChargeAt
          : vpnSub.expiresAt;
        statusListItems.push(`<div class="subscription-item">Активна <span class="subscription-timer" data-sub-id="${vpnSub.id}" data-expires="${timerDate}">⏳</span></div>`);
      } else {
        statusListItems.push('<div class="subscription-item">Активна</div>');
      }
    }

    elements.subscriptionStatusBlock.innerHTML = `
      <div class="subscription-list">${statusListItems.join('')}</div>
    `;
    elements.subscriptionStatusBlock.classList.add('active');

    if (elements.cancelSubscriptionBtn) {
      toggleEl(elements.cancelSubscriptionBtn, vpnSub && !vpnCanceled);
    }
    if (elements.resumeSubscriptionBtn) {
      toggleEl(elements.resumeSubscriptionBtn, vpnCanceled);
      toggleEl(elements.resumeSubscriptionBtn, vpnCanceled);
    }
    if (elements.subscribeBtnCard) {
      toggleEl(elements.subscribeBtnCard, !hasVpn);
    }

    startSubscriptionTimers();
  }
}

/**
 * Обновление информации о балансе подписки (daily billing)
 */
function updateSubscriptionBalanceUI() {
  const billingStat = document.getElementById('subscriptionBillingStat');
  if (!billingStat) return;

  const dailyRate = state.dailyRate || 0;
  const daysRemaining = state.daysRemaining || 0;
  const nextChargeAt = state.nextChargeAt ? new Date(state.nextChargeAt) : null;

  // Показываем блок только если есть active daily подписки
  const now = new Date();
  const hasDailySubs = state.subscriptions.some(s => {
    const expiresAt = new Date(s.expiresAt);
    return s.dailyRate && s.status === 'active' && expiresAt > now;
  });

  if (hasDailySubs && dailyRate > 0) {
    billingStat.classList.remove('hidden');

    // Обновляем значения
    document.getElementById('subBalance').textContent = state.user.unlimitedBalance ? '∞' : formatBalance(state.user.balance);
    updateCurrencyVisibility();
    document.getElementById('subDailyRate').textContent = dailyRate.toFixed(2);
    document.getElementById('subDaysRemaining').textContent = daysRemaining;

    // Цвет дней в зависимости от остатка
    const daysEl = document.getElementById('subDaysRemaining');
    const highlightRow = daysEl.closest('.billing-row-highlight');
    
    // Определяем цвет и класс
    let colorClass = '';
    let bgColor = '';
    let textColor = '';
    
    if (daysRemaining > 3) {
      colorClass = 'days-green';
      bgColor = 'rgba(76, 175, 80, 0.1)';
      textColor = '#4caf50';
    } else if (daysRemaining >= 2) {
      colorClass = 'days-neutral';
      bgColor = 'rgba(255, 255, 255, 0.06)';
      textColor = '#c8c8c8';
    } else {
      colorClass = 'days-red';
      bgColor = 'rgba(239, 68, 68, 0.1)';
      textColor = '#ef4444';
    }
    
    // Применяем стили к строке
    if (highlightRow) {
      highlightRow.style.background = bgColor;
      highlightRow.style.borderLeft = `3px solid ${textColor}`;
    }
    
    // Применяем цвет к тексту
    daysEl.style.color = textColor;
    const billingUnit = highlightRow?.querySelector('.billing-unit');
    if (billingUnit) billingUnit.style.color = textColor;
    
    // Показываем время следующего списания
    const nextChargeRow = document.getElementById('nextChargeRow');
    if (nextChargeAt) {
      nextChargeRow.classList.remove('hidden');
      document.getElementById('nextChargeTime').textContent = formatDateTime(nextChargeAt);
    } else {
      nextChargeRow.classList.add('hidden');
    }
  } else {
    billingStat.classList.add('hidden');
  }
}

// Таймеры для отменённых подписок
let timerIntervals = {};

function startSubscriptionTimers() {
  // Очищаем старые таймеры
  Object.values(timerIntervals).forEach(interval => clearInterval(interval));
  timerIntervals = {};

  // Находим таймеры на странице
  const timers = document.querySelectorAll('.subscription-timer');

  timers.forEach(timerEl => {
    const subId = timerEl.dataset.subId;
    if (subId && !timerIntervals[subId]) {
      updateTimer(timerEl);
      timerIntervals[subId] = setInterval(() => updateTimer(timerEl), 1000);
    }
  });
}

function updateTimer(timerEl) {
  const expiresStr = timerEl.dataset.expires;
  
  // Проверка валидности даты
  if (!expiresStr) {
    timerEl.textContent = '⏰';
    return;
  }
  
  const expiresAt = new Date(expiresStr);
  if (isNaN(expiresAt.getTime())) {
    timerEl.textContent = '⏰';
    return;
  }
  
  const now = new Date();
  const diff = expiresAt - now;

  if (diff <= 0) {
    timerEl.textContent = '⏰ Истекло';
    const subId = timerEl.dataset.subId;
    if (subId && timerIntervals[subId]) {
      clearInterval(timerIntervals[subId]);
      delete timerIntervals[subId];
    }
    // Перезагружаем данные пользователя
    setTimeout(() => loadUserData(), 1000);
    return;
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  timerEl.textContent = `⏳ ${timeStr}`;
}

function renderSubscriptionCards(allSubs, activeSubs) {
  const sections = [];
  const hasVpn = activeSubs.some(s => s.type === 'vpn');

  // Активные подписки — сверху
  for (const sub of activeSubs) {
    const isCancelled = sub.status === 'cancelled';

    if (sub.type === 'vpn') {
      const resources = Array.isArray(sub.configData?.resources) ? sub.configData.resources : [];
      const hasLink = resources.some((item) => !!String(item?.subscriptionLink || '').trim());
      const buttonText = isCancelled ? 'Доступ' : 'Конфигурация';
      const singleCard = `
        <div class="card${isCancelled ? ' card-cancelled' : ''}">
          <div class="card-info">
            <div class="card-title">VPN</div>
            <div class="card-description">${hasLink ? 'Одна ссылка для всех конфигов' : 'Конфигурации подготавливаются'}</div>
          </div>
          <button class="card-btn" data-type="vpn" data-id="${sub.id}" data-protocol-key="">${buttonText}</button>
        </div>
      `;

      if (!isCancelled) {

        sections.push(`
          <div class="card-section">
            <div class="card-section-title">VPN</div>
            ${singleCard}
          </div>
        `);
      } else {
        const timerDate = sub.dailyRate && sub.nextChargeAt ? sub.nextChargeAt : sub.expiresAt;
        const timeLeft = new Date(timerDate) - new Date();
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
        const daysLeft = Math.floor(hoursLeft / 24);
        const accessText = daysLeft > 0 ? `Доступ ${daysLeft} дн.` : `Доступ ${hoursLeft} ч.`;

        const cardsWithAccess = singleCard.replace('>Доступ<', `>${accessText}<`);

        sections.push(`
          <div class="card-section card-section-cancelled">
            <div class="card-section-title">Отменённые</div>
            ${cardsWithAccess}
          </div>
        `);
      }
    }
  }

  // Если нет VPN подписки — показываем заглушку
  if (!hasVpn) {
    sections.push(`
      <div class="card-section card-section-inactive">
        <div class="card card-disabled">
          <div class="card-info">
            <div class="card-title">VPN</div>
            <div class="card-description">Одна ссылка + QR для всех конфигов</div>
          </div>
        </div>
      </div>
      <button id="subscribeBtnCard" class="btn-subscribe">Оформить подписку</button>
    `);
  }

  elements.cardsContainer.innerHTML = sections.join('');

  // Обработчики активных кнопок
  elements.cardsContainer.querySelectorAll('.card-btn:not(.card-btn-disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const id = btn.dataset.id;
      const protocolKey = btn.dataset.protocolKey || '';
      // Ищем подписку в state.subscriptions, а не в локальной переменной
      const sub = state.subscriptions.find(s => s.id == id);
      if (sub) {
        const titles = { vpn: 'VPN' };
        showConfig(titles[type], type, id, protocolKey);
      }
    });
  });

  // Обработчик кнопки «Оформить подписку»
  const subscribeBtn = document.getElementById('subscribeBtnCard');
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', () => openSubscriptionModal());
  }
}

// =====================================
// Конфигурации
// =====================================

function navigateToSection(section) {
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.section === section);
  });
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`${section}-section`);
  if (el) el.classList.add('active');
  state.currentSection = section;
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (section === 'vpn' || section === 'profile') {
    const target = '/' + section;
    window.history.pushState({}, '', target);
  }
}

async function showConfig(title, type, id, protocolKey = '') {
  try {
    // Проверяем, есть ли подписка с таким ID
    const sub = state.subscriptions.find(s => s.id == id);

    if (!sub) {
      showToast('Подписка не найдена', 'error');
      return;
    }

    // Проверяем, не истёк ли срок действия подписки
    const expiresAt = new Date(sub.expiresAt);
    const now = new Date();
    
    if (expiresAt <= now) {
      elements.configContent.innerHTML = `
        <div class="vpn-access-denied">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" class="vpn-access-denied-icon">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3 class="vpn-access-denied-title">Доступ прекращён</h3>
          <p class="text-muted-sm">Срок действия подписки истёк. Для продолжения использования оформите подписку заново.</p>
        </div>
      `;
      elements.configModal.classList.add('active');
      return;
    }

    // Для cancelled подписок показываем предупреждение
    let warningHtml = '';
    if (sub.status === 'cancelled') {
      const timeLeft = expiresAt - now;
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      const daysLeft = Math.floor(hoursLeft / 24);
      const warningText = daysLeft > 0
        ? `Доступ сохранится ещё на ${daysLeft} дн.`
        : `Доступ сохранится ещё на ${hoursLeft} ч.`;

      warningHtml = `
        <div class="vpn-cancelled-banner">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bdbdbd" stroke-width="2" class="vpn-cancelled-banner-icon">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p class="vpn-cancelled-banner-text">Подписка отменена. ${warningText}</p>
        </div>
      `;
    }

    if (type !== 'vpn') {
      showToast('Неподдерживаемый тип подписки', 'error');
      return;
    }

    const data = await apiRequest(`/api/subscriptions/config/${type}`);
    const protocols = Array.isArray(data.protocols) ? data.protocols : [];
    const selected = protocols.find((item) => item.key === protocolKey) || protocols[0] || null;
    const primaryLink = String(data.subscriptionLink || '').trim();
    const fallbackLink = String((protocols.find((item) => !!item.subscriptionLink) || selected || {}).subscriptionLink || '').trim();
    const subscriptionLink = primaryLink || fallbackLink;
    const instructionProtocol = String((selected || {}).protocol || 'vless').toLowerCase();

    let content = '';

    if (subscriptionLink) {
      content = `
          <div class="instr-copy-bar">
            <button class="btn-action btn-copy-vless" data-link="${escapeHtml(subscriptionLink)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Копировать ссылку
            </button>
            <button class="btn-action btn-toggle-qr" data-qr-target="vpn-qr-container">Показать QR</button>
          </div>
          <div id="vpn-qr-container" class="vpn-qr-container" hidden>
            <img src="${escapeHtml(getQrImageUrl(subscriptionLink))}" alt="VPN QR" />
          </div>
          <div class="instruction-block">
            <div class="server-routing-note">
              <p class="server-routing-title">Режимы серверов в одной ссылке:</p>
              <p class="server-routing-line"><span class="route-badge route-badge-direct">напрямую</span> весь трафик идёт через зарубежный сервер</p>
              <p class="server-routing-line"><span class="route-badge route-badge-ru-eu">RU→EU</span> сайты <strong>.ru .su .рф</strong> через российский сервер, остальные — через зарубежный</p>
            </div>
            ${getInstruction()}
          </div>
        `;
    } else {
      content = '<p class="instruction-warning">Конфигурация недоступна</p>';
    }

    elements.configContent.innerHTML = warningHtml + content;
    elements.configModal.classList.add('active');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getSupportRouteUuid() {
  const match = window.location.pathname.match(/^\/support\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getSupportKeyFromUrl() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function getSupportStorageKey(ticketUuid) {
  return `support_access_key_${ticketUuid}`;
}

function openSupportCreateModal() {
  if (!elements.supportCreateModal) return;
  if (state.activeTicket && state.activeTicket.status !== 'closed') {
    const key = state.activeTicket._accessKey || '';
    openSupportChat(state.activeTicket.id, key);
    return;
  }
  const isAuthed = !!state.user;
  if (elements.supportEmailGroup) toggleEl(elements.supportEmailGroup, !isAuthed);
  if (elements.supportEmailInput) {
    elements.supportEmailInput.required = !isAuthed;
    elements.supportEmailInput.value = isAuthed ? state.user.email : (elements.emailInput?.value || '');
  }
  elements.supportCreateModal.classList.add('active');
}

function renderSupportMessages() {
  if (!elements.supportMessages) return;
  if (!state.support.messages.length) {
    elements.supportMessages.innerHTML = '<div class="support-empty">Сообщений пока нет</div>';
    return;
  }
  elements.supportMessages.innerHTML = state.support.messages.map((msg) => {
    const own = msg.senderType === 'user';
    const name = msg.senderType === 'admin' ? (msg.senderAdminName || 'Поддержка') : 'Вы';
    return `
      <div class="support-message ${own ? 'own' : 'agent'}">
        <div class="support-message-meta">${escapeHtml(name)} · ${formatDateTime(msg.createdAt)}</div>
        <div class="support-message-body">${escapeHtml(msg.body)}</div>
      </div>
    `;
  }).join('');
  elements.supportMessages.scrollTop = elements.supportMessages.scrollHeight;
}

function renderSupportTicket() {
  const ticket = state.support.ticket;
  if (!ticket) return;
  if (elements.supportChatTitle) elements.supportChatTitle.textContent = ticket.subject || 'Поддержка';
  if (elements.supportChatStatus) {
    const map = { open: 'Открыт', pending: 'Ожидает пользователя', closed: 'Закрыт' };
    elements.supportChatStatus.textContent = `${map[ticket.status] || ticket.status} · #${ticket.id.slice(0, 8)}`;
  }
  const isClosed = ticket.status === 'closed';
  if (elements.supportMessageInput) {
    elements.supportMessageInput.disabled = isClosed;
    elements.supportMessageInput.placeholder = isClosed ? 'Обращение закрыто' : 'Напишите сообщение';
  }
  const submitBtn = elements.supportMessageForm?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = isClosed;
    submitBtn.textContent = isClosed ? 'Закрыто' : 'Отправить';
  }
  if (ticket.id && state.activeTicket && state.activeTicket.id === ticket.id) {
    state.activeTicket = { ...state.activeTicket, status: ticket.status, subject: ticket.subject };
  }
  if (isClosed && state.activeTicket && state.activeTicket.id === ticket.id) {
    state.activeTicket = null;
    renderActiveTicket();
  }
}

function setSupportChatOnlyMode(enabled) {
   const active = !!enabled;
   document.body.classList.toggle('support-chat-only', active);
   document.querySelectorAll('.header, .navbar').forEach((el) => {
     el.hidden = active;
     toggleEl(el, !active);
   });
}

function connectSupportSocket(ticketUuid, key) {
  if (!window.io) return;
  if (state.support.socket) state.support.socket.disconnect();
  const socket = window.io({ auth: { key } });
  state.support.socket = socket;
  socket.on('connect', () => {
    socket.emit('support:join', { ticketUuid, key, role: 'user' }, (ack) => {
      if (!ack?.success) showToast(ack?.error || 'Не удалось подключить чат', 'error');
    });
  });
  socket.on('support:message', (event) => {
    if (event.ticket) {
      state.support.ticket = event.ticket;
      renderSupportTicket();
    }
    if (event.message && !state.support.messages.some(m => Number(m.id) === Number(event.message.id))) {
      state.support.messages.push(event.message);
      renderSupportMessages();
    }
    socket.emit('support:read');
  });
  socket.on('support:status', (event) => {
    if (event.ticket) {
      state.support.ticket = event.ticket;
      renderSupportTicket();
    }
  });
}

async function openSupportChat(ticketUuid, key = '') {
  try {
    const storedKey = sessionStorage.getItem(getSupportStorageKey(ticketUuid)) || '';
    const accessKey = key || storedKey;
    const headers = accessKey ? { 'x-support-key': accessKey } : {};
    const data = await apiRequest(`/api/support/tickets/${encodeURIComponent(ticketUuid)}`, { headers });
    state.support.ticket = data.ticket;
    state.support.messages = data.messages || [];
    state.support.key = accessKey;
    if (accessKey) {
      sessionStorage.setItem(getSupportStorageKey(ticketUuid), accessKey);
    }
    if (key && window.location.search.includes('key=')) {
      window.history.replaceState({}, '', `/support/${encodeURIComponent(ticketUuid)}`);
    }

    if (state.user && window.location.pathname !== `/support/${encodeURIComponent(ticketUuid)}`) {
      window.history.pushState({}, '', `/support/${encodeURIComponent(ticketUuid)}`);
    }

    const chatOnly = !state.user;
    setSupportChatOnlyMode(chatOnly);
    elements.authScreen.classList.remove('active');
    elements.mainScreen.classList.add('active');
    document.body.classList.remove('auth-screen-open');
    navigateToSection('support');
    renderSupportTicket();
    renderSupportMessages();
    connectSupportSocket(ticketUuid, accessKey);
  } catch (error) {
    showToast(error.message, 'error');
    if (!state.user) {
      elements.mainScreen.classList.remove('active');
      elements.authScreen.classList.add('active');
      document.body.classList.add('auth-screen-open');
    }
  }
}

function safeCode(code) {
  return `<code>${escapeHtml(code)}</code>`;
}

function getQrImageUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(String(text || ''))}`;
}

// Действия в модальном окне конфигурации (делегирование событий)
if (elements.configModal) {
  elements.configModal.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      const text = copyBtn.dataset.copy;
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Скопировано', 'success');
        }).catch(() => {
          showToast('Ошибка копирования', 'error');
        });
      }
      return;
    }

    const copyLinkBtn = e.target.closest('[data-link]');
    if (copyLinkBtn) {
      const link = copyLinkBtn.dataset.link;
      if (link) {
        navigator.clipboard.writeText(link).then(() => {
          showToast('Ссылка скопирована', 'success');
        }).catch(() => {
          showToast('Ошибка копирования', 'error');
        });
      }
      return;
    }

    const toggleQrBtn = e.target.closest('.btn-toggle-qr');
    if (toggleQrBtn) {
      const targetId = toggleQrBtn.dataset.qrTarget;
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) {
        const isHidden = target.hasAttribute('hidden');
        target.toggleAttribute('hidden', !isHidden);
        toggleQrBtn.textContent = isHidden ? 'Скрыть QR' : 'Показать QR';
      }
      return;
    }

  });
}

// =====================================
// Инструкции
// =====================================

function getStepNumberHtml(num, label) {
  return `<div class="instr-step"><div class="instr-step-num">${num}</div><div class="instr-step-body"><div class="instr-step-label">${label}</div></div></div>`;
}

function getAppLinkHtml(text, url) {
  return `<a class="instr-app-link" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function getPlatformInstructionBlock(platform, steps) {
  return `<div class="instr-platform"><div class="instr-platform-title">${platform}</div><div class="instr-steps">${steps}</div></div>`;
}

function getInstruction() {
  const commonSteps = [
    getStepNumberHtml(1, `Скачайте приложение <strong>HAPP</strong>: ${getAppLinkHtml('Google Play', 'https://play.google.com/store/apps/details?id=com.happproxy')} · ${getAppLinkHtml('APK', 'https://github.com/Happ-proxy/happ-android/releases/latest/download/Happ.apk')} · ${getAppLinkHtml('App Store (Global)', 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215')} · ${getAppLinkHtml('App Store (РУ)', 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973')} · ${getAppLinkHtml('Windows', 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe')} · ${getAppLinkHtml('macOS', 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/Happ.macOS.universal.dmg')} · ${getAppLinkHtml('Linux', 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/Happ.linux.x64.deb')}`),
    getStepNumberHtml(2, 'Нажмите кнопку <strong>«Копировать ссылку»</strong> выше'),
    getStepNumberHtml(3, 'Нажмите кнопку <strong>«+»</strong> и выберите <strong>«Из буфера обмена»</strong>, или если ранее не добавлялись профили — <strong>«Из буфера обмена»</strong> внизу экрана'),
    getStepNumberHtml(4, 'Выберите добавленный профиль и нажмите <strong>подключиться</strong>'),
  ].join('');
  return `
    <div class="instr-platforms">
      <div class="instr-title">Как подключиться</div>
      <div class="instr-steps">
        ${commonSteps}
      </div>
    </div>
    <div class="instr-tip">
      <span class="instr-tip-icon">💡</span>
      <span>Добавьте сайт на главный экран — так вы не пропустите важные обновления.</span>
    </div>
  `;
}

function showInstruction(title, html) {
  elements.instructionTitle.textContent = title;
  elements.instructionBody.innerHTML = html;
  elements.instructionModal.classList.add('active');
}

// =====================================
// Модальные окна
// =====================================

function openTopUpModal() {
  const limits = getTopupLimits();
  const topupEnabled = isTopupEnabled();
  const payBtn = document.getElementById('payBtn');
  const amountPresets = document.querySelectorAll('.amount-preset');

  if (elements.customAmountInput) {
    elements.customAmountInput.min = String(limits.min);
    elements.customAmountInput.max = String(limits.max);
    elements.customAmountInput.placeholder = `Мин. ${limits.min} ₽`;
    elements.customAmountInput.disabled = !topupEnabled;
  }

  amountPresets.forEach((btn) => {
    btn.disabled = !topupEnabled;
  });

  if (payBtn) {
    payBtn.disabled = !topupEnabled;
    payBtn.innerHTML = topupEnabled
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>Оплатить`
      : 'Оплата временно отключена';
  }

  if (elements.paymentNote) {
    elements.paymentNote.textContent = topupEnabled
      ? `Минимальная сумма: ${limits.min} ₽ | Максимальная: ${limits.max} ₽`
      : 'Пополнение через оплату временно отключено. Доступна активация промокодов.';
    elements.paymentNote.style.color = topupEnabled ? '#888' : '#efb84a';
  }

  elements.currentBalance.textContent = state.user.unlimitedBalance ? '∞' : formatBalance(state.user.balance);
  updateCurrencyVisibility();
  if (elements.promoPreviewHint && !(elements.promoCodeInput?.value || '').trim()) {
    elements.promoPreviewHint.textContent = 'Промокод вводится здесь: мгновенный начислит бонус сразу, бонус к пополнению применится при оплате.';
    elements.promoPreviewHint.style.color = '#666';
  }
  elements.topUpModal.classList.add('active');
}

function openWelcomeModal() {
  if (elements.welcomeReadCheckbox) {
    elements.welcomeReadCheckbox.checked = false;
  }
  if (elements.welcomeConsentCheckbox) {
    elements.welcomeConsentCheckbox.checked = false;
  }
  elements.welcomeModal.classList.add('active');
}

function openAdminPopupModal(message) {
  if (!message || !elements.adminPopupModal) return;
  state.pendingAdminPopup = message;
  if (elements.adminPopupTitle) {
    elements.adminPopupTitle.textContent = message.title || 'Сообщение от администрации';
  }
  if (elements.adminPopupDate) {
    let dateText = `Отправлено: ${formatDateTime(message.createdAt)}`;
    if (message.expiresAt) {
      dateText += ` · Доступно до: ${formatDateTime(message.expiresAt)}`;
    }
    elements.adminPopupDate.textContent = dateText;
  }
  if (elements.adminPopupBody) {
    elements.adminPopupBody.textContent = String(message.body || '');
  }
  if (elements.adminPopupReadCheckbox) {
    elements.adminPopupReadCheckbox.checked = false;
  }
  const modalEl = elements.adminPopupModal;
  modalEl.classList.remove('popup-priority-low', 'popup-priority-normal', 'popup-priority-high');
  const priority = message.priority || 'normal';
  modalEl.classList.add(`popup-priority-${priority}`);
  elements.adminPopupModal.classList.add('active');
}

async function loadPendingAdminPopup() {
  if (!state.user) return;
  try {
    const data = await apiRequest('/api/user/popup/pending');
    const message = data?.message || null;
    if (message) {
      openAdminPopupModal(message);
    }
  } catch (error) {
    console.error('Failed to load pending popup:', error.message);
  }
}

async function acknowledgeAdminPopup() {
  const message = state.pendingAdminPopup;
  if (!message) return;
  if (!elements.adminPopupReadCheckbox?.checked) {
    showToast('Подтвердите, что прочитали сообщение', 'error');
    return;
  }

  try {
    await apiRequest(`/api/user/popup/${encodeURIComponent(message.id)}/acknowledge`, {
      method: 'POST'
    });
    state.pendingAdminPopup = null;
    closeModal(elements.adminPopupModal);
    showToast('Сообщение подтверждено', 'success');
    await loadPendingAdminPopup();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function closeWelcomeModal() {
  if (!state.user?.consentAccepted) {
    if (!elements.welcomeReadCheckbox?.checked) {
      showToast('Подтвердите, что прочитали инструкцию', 'error');
      return;
    }

    if (!elements.welcomeConsentCheckbox?.checked) {
      showToast('Подтвердите согласие с документами', 'error');
      return;
    }

    try {
      await apiRequest('/api/user/consent/accept', {
        method: 'POST',
        body: JSON.stringify({ accepted: true })
      });
      state.user.consentAccepted = true;
      state.user.consentAcceptedAt = new Date().toISOString();
      showToast('Согласие сохранено', 'success');
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
  }

  localStorage.setItem('welcomeShown', 'true');
  closeModal(elements.welcomeModal);
  setTimeout(() => loadPendingAdminPopup(), 350);
}

function openSubscriptionModal() {
  elements.currentBalance.textContent = state.user.unlimitedBalance ? '∞' : formatBalance(state.user.balance);
  updateCurrencyVisibility();

  const now = new Date();
  const activeSubs = state.subscriptions.filter(s => {
    const expiresAt = new Date(s.expiresAt);
    return s.status === 'active' && expiresAt > now;
  });
  const hasVpn = activeSubs.some(s => s.type === 'vpn');

  const plansContainer = elements.subscriptionModal.querySelector('.subscription-plans');
  const vpnCard = plansContainer.querySelector('[data-plan="vpn"]');

  function styleCard(card, isOwned) {
    const btn = card.querySelector('.btn-plan-select');
    let badge = card.querySelector('.plan-owned-badge');
    if (isOwned) {
      card.classList.add('plan-owned');
      btn.disabled = true;
      btn.textContent = 'Уже оформлено';
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'plan-owned-badge';
        btn.after(badge);
      }
    } else {
      card.classList.remove('plan-owned');
      btn.disabled = false;
      btn.textContent = 'Оплатить с баланса';
      if (badge) badge.remove();
    }
  }

  styleCard(vpnCard, hasVpn);

  // Перемещаем оформленные карточки вниз
  const cards = Array.from(plansContainer.querySelectorAll('.plan-card'));
  const ownedCards = cards.filter(c => c.classList.contains('plan-owned'));
  const availableCards = cards.filter(c => !c.classList.contains('plan-owned'));

  availableCards.forEach(c => plansContainer.appendChild(c));
  ownedCards.forEach(c => plansContainer.appendChild(c));

  elements.subscriptionModal.classList.add('active');
}

function closeModal(modal) {
  if (modal === elements.adminPopupModal && state.pendingAdminPopup) {
    showToast('Подтвердите прочтение сообщения, чтобы продолжить', 'error');
    return;
  }
  if (modal === elements.welcomeModal && state.user && !state.user.consentAccepted) {
    showToast('Нужно подтвердить согласие, чтобы продолжить', 'error');
    return;
  }
  modal.classList.remove('active');
}

// =====================================
// События
// =====================================

// Авторизация
elements.emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = elements.emailInput.value.trim();
  
  if (!email) {
    showToast('Введите email', 'error');
    return;
  }

  showLoading(elements.sendCodeBtn, true);
  
  try {
    await sendCode(email);
    openCodeStep(email);
  } catch (error) {
    if (canFallbackToCodeEntry(error)) {
      openCodeStep(email);
      showToast('Если код уже пришёл — введите его. Иначе нажмите «Отправить код повторно».', 'info');
    } else {
      showToast(error.message, 'error');
    }
  } finally {
    showLoading(elements.sendCodeBtn, false);
  }
});

elements.codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = elements.emailDisplay.textContent;
  const code = elements.codeInput.value.trim();
  
  if (!code) {
    showToast('Введите код', 'error');
    return;
  }
  
  showLoading(elements.verifyCodeBtn, true);
  
  try {
    await verifyCode(email, code);
    const loaded = await loadUserData();

    if (loaded && state.user && !state.user.consentAccepted) {
      setTimeout(() => openWelcomeModal(), 300);
    } else if (loaded) {
      setTimeout(() => loadPendingAdminPopup(), 350);
    }
  } catch (error) {
    // Ошибка уже показана
  } finally {
    showLoading(elements.verifyCodeBtn, false);
  }
});

elements.resendCodeBtn.addEventListener('click', async () => {
  const email = elements.emailDisplay.textContent;
  showLoading(elements.resendCodeBtn, true);
  
  try {
    await sendCode(email);
    showToast('Код отправлен повторно', 'success');
  } catch (error) {
    // Ошибка уже показана
  } finally {
    showLoading(elements.resendCodeBtn, false);
  }
});

elements.changeEmailBtn.addEventListener('click', () => {
  elements.codeForm.classList.add('hidden');
  elements.emailForm.classList.remove('hidden');
  elements.emailInput.value = '';
});

elements.logoutBtn.addEventListener('click', logout);

if (elements.profileUuidCopy) {
  elements.profileUuidCopy.addEventListener('click', async () => {
    const uuid = String(state.user?.uuid || state.user?.id || '').trim();
    if (!uuid) {
      showToast('UUID недоступен', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(uuid);
      showToast('UUID скопирован', 'success');
    } catch (_) {
      showToast('Не удалось скопировать UUID', 'error');
    }
  });
}

// Подписка
elements.subscribeBtn.addEventListener('click', openSubscriptionModal);
elements.subscribeBtnCard.addEventListener('click', openSubscriptionModal);

// Отмена подписки
if (elements.cancelSubscriptionBtn) {
  elements.cancelSubscriptionBtn.addEventListener('click', () => {
    renderCancelSubscriptionList();
    elements.cancelSubscriptionModal.classList.add('active');
  });
}

if (elements.resumeSubscriptionBtn) {
  elements.resumeSubscriptionBtn.addEventListener('click', async () => {
    const now = new Date();
    const cancelledSub = state.subscriptions.find(s =>
      s.type === 'vpn' && s.status === 'cancelled' && new Date(s.expiresAt) > now
    );
    if (!cancelledSub) {
      showToast('Отменённая подписка не найдена', 'error');
      return;
    }
    try {
      const data = await apiRequest(`/api/subscriptions/${cancelledSub.id}/resume`, {
        method: 'PUT'
      });
      showToast(data.message || 'Подписка возобновлена', 'success');
      await loadUserData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// Рендер списка активных подписок для отмены
function renderCancelSubscriptionList() {
  const now = new Date();
  const activeSubs = state.subscriptions.filter(s => {
    const expiresAt = new Date(s.expiresAt);
    return (s.status === 'active' || s.status === 'cancelled') && expiresAt > now;
  });

  // Приоритет: active > cancelled, затем по created_at
  activeSubs.sort((a, b) => {
    if (a.status === 'active' && b.status === 'cancelled') return -1;
    if (a.status === 'cancelled' && b.status === 'active') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  const listContainer = document.getElementById('cancelSubscriptionList');

  if (activeSubs.length === 0) {
    listContainer.innerHTML = '<p class="text-muted-sm">Нет активных подписок</p>';
    return;
  }

  // Добавляем предупреждение
   let warningHtml = `
     <div class="vpn-notice-block">
       <div class="vpn-notice-block-inner">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bdbdbd" stroke-width="2" class="vpn-notice-block-icon">
           <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
           <line x1="12" y1="9" x2="12" y2="13"/>
           <line x1="12" y1="17" x2="12.01" y2="17"/>
         </svg>
         <div>
           <p class="vpn-notice-block-title">Важная информация</p>
           <p class="vpn-notice-block-body">
            После окончания оплаченного периода доступ будет прекращён. Для продолжения использования необходимо оформить подписку заново.
          </p>
        </div>
      </div>
    </div>
  `;

  // Только VPN подписки
  const vpnSub = activeSubs.find(s => s.type === 'vpn');
  const items = [];

    if (vpnSub) {
    const isDaily = !!vpnSub.dailyRate;
    const isCancelled = vpnSub.status === 'cancelled';
    const expiresText = isCancelled
      ? `Действует до ${formatDateTime(vpnSub.expiresAt)}`
      : (isDaily && vpnSub.nextChargeAt
          ? `Следующее списание: ${formatDateTime(vpnSub.nextChargeAt)}`
          : `Действует до ${formatDate(vpnSub.expiresAt)}`);
    const statusText = isCancelled ? ' (отменена)' : '';
    const actionBtn = !isCancelled
      ? `<button class="btn-plan-cancel" data-type="vpn">Отменить</button>`
      : `<button class="btn-renew" data-type="vpn">Возобновить</button>`;

    items.push(`
      <div class="cancel-sub-item">
        <div class="cancel-sub-info">
          <span class="cancel-sub-icon">🚀</span>
          <div class="cancel-sub-details">
            <div class="cancel-sub-name">VPN${statusText}</div>
            <div class="cancel-sub-expires">${expiresText}</div>
          </div>
        </div>
        ${actionBtn}
      </div>
    `);
  }

  listContainer.innerHTML = warningHtml + items.join('');

  // Добавляем обработчики на новые кнопки
  listContainer.querySelectorAll('.btn-plan-cancel').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const sub = vpnSub;

      if (!sub) {
        showToast('Подписка не найдена', 'error');
        return;
      }

      const isDaily = !!sub.dailyRate;

      const message = isDaily
        ? `Вы уверены что хотите отменить подписку VPN? Доступ сохранится до конца оплаченного периода (${formatDateTime(sub.nextChargeAt)}).`
        : `Вы уверены что хотите отменить подписку VPN? Доступ сохранится до 23:59 сегодня.`;

      if (!confirm(message)) {
        return;
      }

      try {
        const data = await apiRequest(`/api/user/subscriptions/${type}/cancel`, { method: 'PUT' });
        showToast(data.message, 'success');

        closeModal(elements.cancelSubscriptionModal);
        await loadUserData();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });

  // New button: renew cancelled subscription via resume endpoint
  listContainer.querySelectorAll('.btn-renew').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      try {
        // Find the cancelled subscription
        const cancelledSub = state.subscriptions.find(s =>
          s.type === type && s.status === 'cancelled' && new Date(s.expiresAt) > new Date()
        );

        if (!cancelledSub) {
          showToast('Отменённая подписка не найдена', 'error');
          return;
        }

        // Use the resume endpoint
        const data = await apiRequest(`/api/subscriptions/${cancelledSub.id}/resume`, {
          method: 'PUT'
        });
        showToast(data.message || 'Подписка возобновлена', 'success');
        closeModal(elements.cancelSubscriptionModal);
        await loadUserData();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

// Пополнение баланса
elements.topUpBtn.addEventListener('click', openTopUpModal);

// Обновление баланса
elements.refreshBalance.addEventListener('click', async () => {
  elements.refreshBalance.style.transform = 'rotate(360deg)';
  setTimeout(() => {
    elements.refreshBalance.style.transform = '';
  }, 300);
  await loadUserData();
  showToast('Баланс обновлён', 'success');
});

// Модальные окна - закрытие
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) closeModal(modal);
  });
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });
});

// Пополнение - выбор суммы
document.querySelectorAll('.amount-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.amount-preset').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('customAmount').value = btn.dataset.amount;
  });
});

// Пополнение - оплата
document.getElementById('payBtn').addEventListener('click', async () => {
  if (!isTopupEnabled()) {
    showToast('Пополнение через оплату временно отключено', 'error');
    return;
  }

  const amount = parseFloat(document.getElementById('customAmount').value);
  const promoCode = (elements.promoCodeInput?.value || '').trim();
  const limits = getTopupLimits();

  if (promoCode) {
    try {
      const previewAmount = amount && amount > 0 ? amount : 1;
      const preview = await apiRequest('/api/user/promo/validate', {
        method: 'POST',
        body: JSON.stringify({ amount: previewAmount, code: promoCode })
      });

      if (preview.promo.instantGrant) {
        if (!confirm(`Этот промокод начислит ${Number(preview.promo.bonus).toFixed(2)} ₽ сразу на баланс. Активировать сейчас?`)) {
          return;
        }
        const redeem = await apiRequest('/api/user/promo/redeem', {
          method: 'POST',
          body: JSON.stringify({ code: promoCode })
        });
        showToast(redeem.message, 'success');
        if (elements.promoCodeInput) elements.promoCodeInput.value = '';
        closeModal(elements.topUpModal);
        await loadUserData();
        return;
      }
    } catch (error) {
      showToast(error.message, 'error');
      return;
    }
  }

  if (!amount || amount < limits.min) {
    showToast(`Минимальная сумма ${limits.min} ₽`, 'error');
    return;
  }

  if (amount > limits.max) {
    showToast(`Максимальная сумма ${limits.max} ₽`, 'error');
    return;
  }

  try {
    const data = await apiRequest('/api/user/topup', {
      method: 'POST',
      body: JSON.stringify({ amount, promoCode })
    });

    if (data.url) {
      const opened = window.open(data.url, '_blank');
      if (opened) {
        closeModal(elements.topUpModal);
        showToast('Страница оплаты открыта в новой вкладке', 'success');
      } else {
        // Показываем отдельный modal с возможностью открыть ссылку
        if (elements.popupBlockedModal && elements.popupBlockedMessage && elements.popupBlockedLink) {
          elements.popupBlockedMessage.textContent = 'Браузер заблокировал новую вкладку. Нажмите на кнопку ниже, чтобы открыть оплату.';
          elements.popupBlockedLink.href = encodeURI(data.url);
          elements.popupBlockedModal.classList.add('active');
        } else {
          // Fallback для старых версий — заменяем paymentNote если modal недоступен
          if (elements.paymentNote) {
            elements.paymentNote.innerHTML = `Браузер заблокировал новую вкладку. <a href="${encodeURI(data.url)}" target="_blank" rel="noopener noreferrer">Нажмите здесь, чтобы открыть оплату</a>.`;
            elements.paymentNote.style.color = '#efb84a';
          }
          showToast('Открытие вкладки заблокировано браузером', 'info');
        }
      }
    } else {
      closeModal(elements.topUpModal);
      showToast('Платёж создан, ожидайте зачисления', 'info');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
});

if (elements.applyPromoBtn) {
  elements.applyPromoBtn.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('customAmount').value);
    const code = (elements.promoCodeInput?.value || '').trim();

    if (!code) {
      showToast('Введите промокод', 'error');
      return;
    }

    try {
      const previewAmount = amount && amount > 0 ? amount : 1;
      const data = await apiRequest('/api/user/promo/validate', {
        method: 'POST',
        body: JSON.stringify({ amount: previewAmount, code })
      });

      if (data.promo.instantGrant) {
        setPromoTypeBadge('instant');
        if (!confirm(`Этот промокод начислит ${Number(data.promo.bonus).toFixed(2)} ₽ сразу на баланс. Активировать сейчас?`)) {
          return;
        }
        const redeem = await apiRequest('/api/user/promo/redeem', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        if (elements.promoPreviewHint) {
          elements.promoPreviewHint.textContent = redeem.message;
          elements.promoPreviewHint.style.color = '#4caf50';
        }
        showToast(redeem.message, 'success');
        if (elements.promoCodeInput) elements.promoCodeInput.value = '';
        setPromoTypeBadge(null);
        await loadUserData();
        return;
      }

      setPromoTypeBadge('topup');

      if (elements.promoPreviewHint) {
        if (!isTopupEnabled()) {
          elements.promoPreviewHint.textContent = 'Промокод валиден, но оплата сейчас отключена. Можно использовать только мгновенные промокоды.';
          elements.promoPreviewHint.style.color = '#efb84a';
          showToast('Сейчас доступны только мгновенные промокоды', 'info');
          return;
        }

        elements.promoPreviewHint.textContent = `Промокод применится: бонус ${Number(data.promo.bonus).toFixed(2)} ₽`;
        elements.promoPreviewHint.style.color = '#4caf50';
      }
      showToast('Промокод валиден', 'success');
    } catch (error) {
      setPromoTypeBadge(null);
      if (elements.promoPreviewHint) {
        elements.promoPreviewHint.textContent = error.message;
        elements.promoPreviewHint.style.color = '#ef4444';
      }
      showToast(error.message, 'error');
    }
  });
}

if (elements.copyReferralBtn) {
  elements.copyReferralBtn.addEventListener('click', async () => {
    const link = elements.referralCodeValue?.value;
    if (!link || link === '—') return;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Реферальная ссылка скопирована', 'success');
    } catch (_) {
      showToast('Не удалось скопировать ссылку', 'error');
    }
  });
}

if (elements.promoCodeInput) {
  elements.promoCodeInput.addEventListener('input', () => {
    setPromoTypeBadge(null);
  });
}

if (elements.supportLoginBtn) {
  elements.supportLoginBtn.addEventListener('click', openSupportCreateModal);
}

if (elements.supportProfileBtn) {
  elements.supportProfileBtn.addEventListener('click', () => {
    if (state.activeTicket && state.activeTicket.status !== 'closed') {
      const key = state.activeTicket._accessKey || '';
      openSupportChat(state.activeTicket.id, key);
    } else {
      openSupportCreateModal();
    }
  });
}

if (elements.supportActiveTicketBtn) {
  elements.supportActiveTicketBtn.addEventListener('click', () => {
    if (state.activeTicket) {
      const key = state.activeTicket._accessKey || '';
      openSupportChat(state.activeTicket.id, key);
    }
  });
}

if (elements.supportBackBtn) {
  elements.supportBackBtn.addEventListener('click', () => {
    if (state.user) {
      setSupportChatOnlyMode(false);
      navigateToSection('profile');
    } else {
      if (state.support.socket) state.support.socket.disconnect();
      elements.mainScreen.classList.remove('active');
      elements.authScreen.classList.add('active');
      setSupportChatOnlyMode(false);
      document.body.classList.add('auth-screen-open');
      window.history.pushState({}, '', '/');
    }
  });
}

if (elements.supportCreateForm) {
  elements.supportCreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(elements.supportEmailInput?.value || '').trim().toLowerCase();
    const subject = String(elements.supportSubjectInput?.value || '').trim();
    const message = String(elements.supportBodyInput?.value || '').trim();
    const submitBtn = elements.supportCreateForm.querySelector('button[type="submit"]');
    if (elements.supportCreateForm.dataset.submitting === '1') return;
    elements.supportCreateForm.dataset.submitting = '1';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Создаём обращение...';
    }

    try {
      const data = await apiRequest('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ email, subject, message })
      });
      closeModal(elements.supportCreateModal);
      elements.supportCreateForm.reset();

      const ticket = data.ticket;
      const key = data.accessKey || '';

      if (data.active) {
        if (state.user) {
          state.activeTicket = { ...ticket, _accessKey: key };
          renderActiveTicket();
        }
        showToast('У вас уже есть открытое обращение', 'info');
        await openSupportChat(ticket.id, key);
      } else {
        if (state.user) {
          state.activeTicket = { ...ticket, _accessKey: key };
          renderActiveTicket();
        }
        showToast('Обращение создано', 'success');
        window.history.pushState({}, '', `/support/${encodeURIComponent(ticket.id)}${key ? `?key=${encodeURIComponent(key)}` : ''}`);
        await openSupportChat(ticket.id, key);
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      elements.supportCreateForm.dataset.submitting = '0';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Создать обращение';
      }
    }
  });
}

if (elements.supportMessageForm) {
  elements.supportMessageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticket = state.support.ticket;
    const body = String(elements.supportMessageInput?.value || '').trim();
    if (!ticket || !body) return;
    if (ticket.status === 'closed') {
      showToast('Обращение закрыто', 'error');
      return;
    }

    const socket = state.support.socket;
    if (socket?.connected) {
      socket.emit('support:message', { body }, (ack) => {
        if (!ack?.success) showToast(ack?.error || 'Ошибка отправки', 'error');
      });
      elements.supportMessageInput.value = '';
      return;
    }

    try {
      await apiRequest(`/api/support/tickets/${encodeURIComponent(ticket.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, key: state.support.key })
      });
      elements.supportMessageInput.value = '';
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// Оформление подписки
document.querySelectorAll('.btn-plan-select').forEach(btn => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.plan;
    
    try {
      const data = await apiRequest('/api/subscriptions/create', {
        method: 'POST',
        body: JSON.stringify({ type })
      });
      
      closeModal(elements.subscriptionModal);
      showToast(data.message, 'success');
      await loadUserData();
      navigateToSection('vpn');
    } catch (error) {
      // If the error suggests resuming a cancelled subscription, offer to do so
      if (error.message.includes('Возобновите её') || error.message.includes('hasCancelled')) {
        try {
          // Try to find the cancelled subscription and resume it
          const cancelledSub = state.subscriptions.find(s =>
            s.type === type && s.status === 'cancelled' && new Date(s.expiresAt) > new Date()
          );

          if (cancelledSub) {
            if (confirm('У вас есть отменённая подписка. Возобновить её?')) {
              const resumeData = await apiRequest(`/api/subscriptions/${cancelledSub.id}/resume`, {
                method: 'PUT'
              });
              closeModal(elements.subscriptionModal);
              showToast(resumeData.message || 'Подписка возобновлена', 'success');
              await loadUserData();
              navigateToSection('vpn');
              return;
            }
          }
        } catch (resumeError) {
          showToast(resumeError.message, 'error');
          return;
        }
      }
      showToast(error.message, 'error');
    }
  });
});

// Welcome modal - кнопка "Начать"
if (elements.welcomeDoneBtn) {
  elements.welcomeDoneBtn.addEventListener('click', closeWelcomeModal);
}

if (elements.adminPopupConfirmBtn) {
  elements.adminPopupConfirmBtn.addEventListener('click', acknowledgeAdminPopup);
}

// Навигация
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset.section;
    if (!section) return;
    navigateToSection(section);
  });
});

// =====================================
// Выход
// =====================================

async function logout({ skipRequest = false } = {}) {
  if (!skipRequest) {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
  }
  state.user = null;
  state.subscriptions = [];
  setSupportChatOnlyMode(false);
  
  elements.mainScreen.classList.remove('active');
  elements.authScreen.classList.add('active');
  document.body.classList.add('auth-screen-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
  
  elements.emailForm.classList.remove('hidden');
  elements.codeForm.classList.add('hidden');
  elements.emailInput.value = '';
  elements.codeInput.value = '';
}

// =====================================
// Инициализация
// =====================================

async function init() {
  captureReferralFromUrl();

  const supportUuid = getSupportRouteUuid();
  const supportKey = getSupportKeyFromUrl();

  // Загрузка конфигурации
  try {
    const data = await apiRequest('/api/config');
    state.config = data.config;
    
    const vpnPriceEl = document.getElementById('vpnPriceValue');
    if (vpnPriceEl && state.config.prices) {
      vpnPriceEl.textContent = state.config.prices.vpn ?? '—';
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  
  let isAuthenticated = false;
  try {
    const session = await apiRequest('/api/auth/session');
    if (session?.authenticated) {
      const loaded = await loadUserData();
      isAuthenticated = !!loaded && !!state.user;
      if (isAuthenticated) {
        await applyPendingReferralIfNeeded();
      }
      if (isAuthenticated && !state.user?.consentAccepted) {
        setTimeout(() => openWelcomeModal(), 300);
      } else if (isAuthenticated) {
        setTimeout(() => loadPendingAdminPopup(), 350);
      }
    }
  } catch (error) {
    // Не авторизован — остаёмся на экране входа
  }

  if (supportUuid) {
    await openSupportChat(supportUuid, supportKey);
    return;
  }

  if (!isAuthenticated) {
    document.body.classList.add('auth-screen-open');
  }

  // Регистрация Service Worker для push
  const swRegistered = await registerSW();
  if (swRegistered && isAuthenticated) {
    tryShowPushModal();
  }
}

// =====================================
// Browser back/forward navigation
// =====================================
window.addEventListener('popstate', () => {
  const path = window.location.pathname;
  if (path === '/vpn') {
    navigateToSection('vpn');
  } else if (path === '/profile') {
    navigateToSection('profile');
  } else if (/^\/support\//.test(path)) {
    const uuid = getSupportRouteUuid();
    if (uuid) {
      const storedKey = sessionStorage.getItem(getSupportStorageKey(uuid)) || '';
      openSupportChat(uuid, storedKey);
      return;
    }
    navigateToSection('vpn');
  } else {
    navigateToSection('vpn');
  }
});

// =====================================
// Push Notifications
// =====================================
let pushSubscription = null;

async function registerSW() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.register('/sw.js');
    return true;
  } catch (e) {
    console.error('SW registration failed:', e);
    return false;
  }
}

async function checkPushSubscription() {
  if (!elements.pushModalStatus || !elements.pushModalToggleBtn) return;

  const registration = await navigator.serviceWorker.ready;
  pushSubscription = await registration.pushManager.getSubscription();

  if (pushSubscription) {
    elements.pushModalStatus.textContent = 'Уведомления включены';
    elements.pushModalStatus.style.color = '#4caf50';
    elements.pushModalToggleBtn.textContent = 'Отключить уведомления';
  } else {
    elements.pushModalStatus.textContent = 'Уведомления отключены';
    elements.pushModalStatus.style.color = '#888';
    elements.pushModalToggleBtn.textContent = 'Включить уведомления';
  }
}

async function subscribePush() {
  try {
    const res = await apiRequest('/api/user/push/public-key');
    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(res.publicKey)
    });

    await apiRequest('/api/user/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
      })
    });

    pushSubscription = subscription;
    checkPushSubscription();
    showToast('Уведомления включены');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

async function unsubscribePush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    if (pushSubscription) {
      await apiRequest('/api/user/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: pushSubscription.endpoint })
      });
      await pushSubscription.unsubscribe();
      pushSubscription = null;
    }
    checkPushSubscription();
    showToast('Уведомления отключены');
  } catch (e) {
    showToast('Ошибка: ' + e.message, 'error');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.includes('android-app://');
}

const pushModalDismissedKey = 'pushModalDismissed';

function shouldShowPushModal() {
  if (!isStandaloneMode()) return false;
  if (!('serviceWorker' in navigator)) return false;
  if (localStorage.getItem(pushModalDismissedKey) === 'true') return false;
  return true;
}

async function tryShowPushModal() {
  if (!shouldShowPushModal()) return;
  if (!elements.pushModal) return;

  const swRegistered = await registerSW();
  if (swRegistered && state.user) {
    await checkPushSubscription();
    if (!pushSubscription) {
      elements.pushModal.classList.add('active');
    }
  }
}

if (elements.pushModalToggleBtn) {
  elements.pushModalToggleBtn.addEventListener('click', async () => {
    if (pushSubscription) {
      await unsubscribePush();
    } else {
      await subscribePush();
    }
  });
}

if (elements.pushModal) {
  elements.pushModal.querySelector('.modal-close').addEventListener('click', () => {
    closeModal(elements.pushModal);
    localStorage.setItem(pushModalDismissedKey, 'true');
  });
}

init();
