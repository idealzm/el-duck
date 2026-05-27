// EL-DUCK VPN Admin Panel
// =====================================

const API_URL = '';

function showEl(el) { if (el) el.classList.remove('hidden'); }
function hideEl(el) { if (el) el.classList.add('hidden'); }
function toggleEl(el, visible) { if (el) { if (visible) el.classList.remove('hidden'); else el.classList.add('hidden'); } }

// Состояние
const state = {
  currentPage: 'dashboard',
  users: [],
  selectedUserIds: new Set(),
  userRowSelection: {
    mouseDown: false,
    targetState: null,
    anchorUserId: null
  },
  stats: null,
  settings: null,
  pasarguardTemplates: [],
  support: {
    tickets: [],
    currentTicket: null,
    messages: [],
    socket: null
  },
  groups: [],
  selectedGroupId: null
};

// DOM элементы
const elements = {
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  navItems: document.querySelectorAll('.sidebar-nav .nav-item'),
  pages: document.querySelectorAll('.page'),
  pageTitle: document.getElementById('pageTitle'),
  refreshData: document.getElementById('refreshData'),
  adminLogout: document.getElementById('adminLogout'),
  adminName: document.querySelector('.admin-name'),
  
  // Dashboard
  statTotalUsers: document.getElementById('statTotalUsers'),
  statActiveSubs: document.getElementById('statActiveSubs'),
  statRevenue: document.getElementById('statRevenue'),
  statTotalBalance: document.getElementById('statTotalBalance'),
  subVpn: document.getElementById('subVpn'),
  recentUsersTable: document.getElementById('recentUsersTable'),
  
  // Users
  userSearch: document.getElementById('userSearch'),
  userFilter: document.getElementById('userFilter'),
  usersTable: document.getElementById('usersTable'),
  selectAllUsers: document.getElementById('selectAllUsers'),
  usersBulkToolbar: document.getElementById('usersBulkToolbar'),
  usersBulkInfo: document.getElementById('usersBulkInfo'),
  bulkBalanceBtn: document.getElementById('bulkBalanceBtn'),
  bulkSubscriptionBtn: document.getElementById('bulkSubscriptionBtn'),
  bulkClearBtn: document.getElementById('bulkClearBtn'),
  
  // Payments
  paymentsTable: document.getElementById('paymentsTable'),

  // Support
  supportStatusFilter: document.getElementById('supportStatusFilter'),
  supportTicketsList: document.getElementById('supportTicketsList'),
  adminSupportTitle: document.getElementById('adminSupportTitle'),
  adminSupportMeta: document.getElementById('adminSupportMeta'),
  adminSupportCloseBtn: document.getElementById('adminSupportCloseBtn'),
  adminSupportMessages: document.getElementById('adminSupportMessages'),
  adminSupportMessageForm: document.getElementById('adminSupportMessageForm'),
  adminSupportMessageInput: document.getElementById('adminSupportMessageInput'),
  
  // Settings
  pricesForm: document.getElementById('pricesForm'),
  vpnPrice: document.getElementById('vpnPrice'),
  minTopUp: document.getElementById('minTopUp'),
  maxTopUp: document.getElementById('maxTopUp'),
  defaultUserTemplateId: document.getElementById('defaultUserTemplateId'),
  refreshPasarguardTemplatesBtn: document.getElementById('refreshPasarguardTemplatesBtn'),
  pasarguardTemplatesHint: document.getElementById('pasarguardTemplatesHint'),
  
  // Billing
  runBillingBtn: document.getElementById('runBillingBtn'),
  refreshBillingBtn: document.getElementById('refreshBillingBtn'),
  billingResult: document.getElementById('billingResult'),
  billingProcessed: document.getElementById('billingProcessed'),
  billingSuccess: document.getElementById('billingSuccess'),
  billingFailed: document.getElementById('billingFailed'),
  billingSuspended: document.getElementById('billingSuspended'),
  billingTable: document.getElementById('billingTable'),

  // Notifications
  notificationForm: document.getElementById('notificationForm'),
  notifTitle: document.getElementById('notifTitle'),
  notifTargetType: document.getElementById('notifTargetType'),
  notifUsersGroup: document.getElementById('notifUsersGroup'),
  notifUsersSelect: document.getElementById('notifUsersSelect'),
  notifUsersToggle: document.getElementById('notifUsersToggle'),
  notifUsersMenu: document.getElementById('notifUsersMenu'),
  notifUsersList: document.getElementById('notifUsersList'),
  notifUserIds: document.getElementById('notifUserIds'),
  notifBody: document.getElementById('notifBody'),
  notifSendBtn: document.getElementById('notifSendBtn'),
  notifResult: document.getElementById('notifResult'),
  notifSubscribers: document.getElementById('notifSubscribers'),
  notifPriority: document.getElementById('notifPriority'),
  notifExpiresAt: document.getElementById('notifExpiresAt'),
  notifMinReadTime: document.getElementById('notifMinReadTime'),
  popupListBody: document.getElementById('popupListBody'),
  popupListTable: document.getElementById('popupListTable'),
  popupListEmpty: document.getElementById('popupListEmpty'),
  popupListPagination: document.getElementById('popupListPagination'),
  cleanupExpiredPopupsBtn: document.getElementById('cleanupExpiredPopupsBtn'),

  // Admins
  adminCreateForm: document.getElementById('adminCreateForm'),
  adminCreateNickname: document.getElementById('adminCreateNickname'),
  adminCreateEmail: document.getElementById('adminCreateEmail'),
  adminCreatePassword: document.getElementById('adminCreatePassword'),
  adminsTable: document.getElementById('adminsTable'),

  // Referrals
  referralSettingsForm: document.getElementById('referralSettingsForm'),
  refEnabled: document.getElementById('refEnabled'),
  refMinTopup: document.getElementById('refMinTopup'),
  refInviterBonus: document.getElementById('refInviterBonus'),
  refInviteeBonus: document.getElementById('refInviteeBonus'),
  referralUsersTable: document.getElementById('referralUsersTable'),

  // Promo codes
  promoCreateForm: document.getElementById('promoCreateForm'),
  promoCode: document.getElementById('promoCode'),
  promoInstantGrant: document.getElementById('promoInstantGrant'),
  promoRewardValue: document.getElementById('promoRewardValue'),
  promoMinTopup: document.getElementById('promoMinTopup'),
  promoStartsAt: document.getElementById('promoStartsAt'),
  promoEndsAt: document.getElementById('promoEndsAt'),
  promoPerUserLimit: document.getElementById('promoPerUserLimit'),
  promoIsActive: document.getElementById('promoIsActive'),
  promoCodesTable: document.getElementById('promoCodesTable'),

  // Groups
  groupsTable: document.getElementById('groupsTable'),
  groupCreateForm: document.getElementById('groupCreateForm'),
  groupName: document.getElementById('groupName'),
  groupColor: document.getElementById('groupColor'),

  // Modals
  balanceModal: document.getElementById('balanceModal'),
  subscriptionModal: document.getElementById('subscriptionModal'),
  adminCreateModal: document.getElementById('adminCreateModal'),
  openAdminCreateModal: document.getElementById('openAdminCreateModal'),
  groupCreateModal: document.getElementById('groupCreateModal'),
  openGroupCreateModal: document.getElementById('openGroupCreateModal'),
  groupCreateModalForm: document.getElementById('groupCreateModalForm'),
  groupCreateModalName: document.getElementById('groupCreateModalName'),
  groupCreateModalColor: document.getElementById('groupCreateModalColor'),
  groupSelectModal: document.getElementById('groupSelectModal'),
  groupSelectUserId: document.getElementById('groupSelectUserId'),
  groupSelectList: document.getElementById('groupSelectList'),
  groupSelectConfirm: document.getElementById('groupSelectConfirm'),
  toast: document.getElementById('toast')
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

function formatBalance(balance) {
  return parseFloat(balance).toFixed(2);
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function toNumberOrFallback(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
}

function parseUserIdsInput(raw) {
  return Array.from(new Set(
    String(raw || '')
      .split(/[\n,;]+/)
      .map((token) => token.trim())
      .filter(Boolean)
  ));
}

function buildAdminSettingsPayload() {
  const templateRaw = elements.defaultUserTemplateId?.value;
  const templateId = Number(templateRaw);
  return {
    vpnPrice: toNumberOrFallback(elements.vpnPrice?.value, state.settings?.vpnPrice),
    minTopup: toNumberOrFallback(elements.minTopUp?.value, state.settings?.minTopup),
    maxTopup: toNumberOrFallback(elements.maxTopUp?.value, state.settings?.maxTopup),
    defaultUserTemplateId: Number.isInteger(templateId) && templateId > 0 ? templateId : null
  };
}

async function saveAdminSettings({ silent = false } = {}) {
  await apiRequest('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(buildAdminSettingsPayload())
  });
  if (!silent) {
    showToast('Настройки сохранены', 'success');
  }
}

// =====================================
// API запросы
// =====================================

async function apiRequest(endpoint, options = {}) {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs) || 15000);

  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      credentials: 'same-origin',
      headers,
      signal: fetchOptions.signal || controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Превышено время ожидания запроса');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || `Ошибка запроса (${response.status})`);
  }

  return data || { success: true };
}

// =====================================
// Авторизация
// =====================================

async function checkAuth() {
  try {
    const data = await apiRequest('/api/admin/auth/me');
    const nickname = String(data?.user?.nickname || '').trim();
    const email = String(data?.user?.email || '').trim();
    if (elements.adminName) {
      elements.adminName.textContent = nickname || email || 'Admin';
    }
    return true;
  } catch (error) {
    window.location.href = '/admin/login';
    return false;
  }
}

async function logout() {
  try {
    await apiRequest('/api/admin/auth/logout', { method: 'POST' });
  } catch (_) {}
  window.location.href = '/admin/login';
}

// =====================================
// Навигация
// =====================================

function navigateTo(page) {
  state.currentPage = page;

  elements.navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  elements.pages.forEach(pg => {
    pg.classList.toggle('active', pg.id === `page-${page}`);
  });

  const titles = {
    dashboard: 'Дашборд',
    users: 'Пользователи',
    payments: 'Платежи',
    support: 'Поддержка',
    settings: 'Настройки',
    billing: 'Биллинг',
    promocodes: 'Маркетинг'
  };

  elements.pageTitle.textContent = titles[page] || 'Дашборд';
  
  // Загружаем данные для страницы
  loadPageData(page);
  
  // На мобильных закрываем меню
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}

async function loadPageData(page) {
  switch (page) {
    case 'dashboard':
      await loadDashboard();
      break;
    case 'users':
      await loadUsers();
      await loadGroups();
      break;
    case 'payments':
      await loadPayments();
      break;
    case 'support':
      await loadSupportTickets();
      break;
    case 'settings':
      await loadSettings();
      break;
    case 'billing':
      await loadBilling();
      break;
    case 'promocodes':
      await loadReferrals();
      await loadReferralUsers();
      await loadPromoCodes();
      break;
    case 'groups':
      await loadGroups();
      break;
  }
}

// =====================================
// Дашборд
// =====================================

async function loadDashboard() {
  try {
    const data = await apiRequest('/api/admin/stats');
    state.stats = data.stats;
    
    elements.statTotalUsers.textContent = data.stats.totalUsers;
    elements.statActiveSubs.textContent = data.stats.activeSubs;
    elements.statRevenue.textContent = `${data.stats.revenue} ₽`;
    elements.statTotalBalance.textContent = `${formatBalance(data.stats.totalBalance)} ₽`;
    elements.subVpn.textContent = data.stats.vpnSubs;
    
    // Последние пользователи
    const usersData = await apiRequest('/api/admin/recent-users?limit=5');
    renderRecentUsers(usersData.users);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderRecentUsers(users) {
  const tbody = elements.recentUsersTable.querySelector('tbody');
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${escapeHtml(user.email)}</td>
      <td>${formatBalance(user.balance)} ₽</td>
      <td>${user.subscriptions.length > 0 ? '✅' : '❌'}</td>
      <td>${formatDate(user.createdAt)}</td>
    </tr>
  `).join('');
}

// =====================================
// Пользователи
// =====================================

async function loadUsers() {
  try {
    const search = elements.userSearch.value.trim();
    const filter = elements.userFilter.value;
    
    let url = '/api/admin/users?limit=100';
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (filter !== 'all') url += `&filter=${filter}`;
    
    const data = await apiRequest(url);
    state.users = data.users;
    state.selectedUserIds = new Set(
      Array.from(state.selectedUserIds).filter((id) => state.users.some((user) => user.id === id))
    );
    renderUsersTable(data.users);
    renderUserBulkToolbar();
    renderNotificationUsersList();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function getSelectedUsers() {
  const selected = new Set(state.selectedUserIds);
  return state.users.filter((user) => selected.has(user.id));
}

function renderUserBulkToolbar() {
  const selectedCount = state.selectedUserIds.size;
  if (elements.usersBulkToolbar) {
    elements.usersBulkToolbar.classList.toggle('active', selectedCount > 0);
  }
  if (elements.usersBulkInfo) {
    elements.usersBulkInfo.textContent = selectedCount > 0
      ? `Выбрано пользователей: ${selectedCount}. Можно выделять мышью, зажав левую кнопку.`
      : 'Выберите пользователей';
  }
  const hasSelection = selectedCount > 0;
  if (elements.bulkBalanceBtn) elements.bulkBalanceBtn.disabled = !hasSelection;
  if (elements.bulkSubscriptionBtn) elements.bulkSubscriptionBtn.disabled = !hasSelection;
  if (elements.bulkClearBtn) elements.bulkClearBtn.disabled = !hasSelection;

  if (elements.selectAllUsers) {
    const total = state.users.length;
    elements.selectAllUsers.checked = total > 0 && selectedCount === total;
    elements.selectAllUsers.indeterminate = selectedCount > 0 && selectedCount < total;
  }
}

function setUserRowSelected(userId, selected) {
  if (!userId) return;
  if (selected) {
    state.selectedUserIds.add(userId);
  } else {
    state.selectedUserIds.delete(userId);
  }
}

function getUserIndexById(userId) {
  return state.users.findIndex((user) => user.id === userId);
}

function setUserRangeSelected(fromUserId, toUserId, selected) {
  const fromIndex = getUserIndexById(fromUserId);
  const toIndex = getUserIndexById(toUserId);
  if (fromIndex < 0 || toIndex < 0) return;
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  for (let idx = start; idx <= end; idx += 1) {
    const user = state.users[idx];
    if (!user?.id) continue;
    setUserRowSelected(user.id, selected);
  }
}

function paintUserRowSelection(row, selected) {
  if (!row) return;
  row.classList.toggle('user-row-selected', !!selected);
  const checkbox = row.querySelector('[data-user-checkbox]');
  if (checkbox) checkbox.checked = !!selected;
}

function renderUsersTable(users) {
  const tbody = elements.usersTable.querySelector('tbody');
  tbody.innerHTML = users.map(user => {
    const subscriptionStatus = user.subscriptions.some((s) => s.status === 'active')
      ? 'Активна'
      : 'Неактивна';

    // Проверяем есть ли cancelled подписки
    const hasCancelled = user.subscriptions.some(s => s.status === 'cancelled');

    // Рассчитываем дневную ставку и дни
    const dailySubs = user.subscriptions.filter(s => s.dailyRate && s.status === 'active');
    const totalDailyRate = dailySubs.reduce((sum, s) => sum + s.dailyRate, 0);
    const daysRemaining = totalDailyRate > 0 ? Math.floor(user.balance / totalDailyRate) : '—';

    // Определяем цвет для дней
    let daysColorClass = '';
    if (typeof daysRemaining === 'number') {
      if (daysRemaining > 3) {
        daysColorClass = 'days-green';
      } else if (daysRemaining >= 2) {
        daysColorClass = 'days-yellow';
      } else {
        daysColorClass = 'days-red';
      }
    }

    const shortId = user.id.length > 8 ? user.id.slice(0, 8) + '…' : user.id;
    const isSelected = state.selectedUserIds.has(user.id);
    const groupBadges = (user.groups || []).map(g => `<span class="user-group-badge" style="background:${g.color};color:#fff;" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>`).join(' ');

    return `
      <tr data-user-row="${escapeHtml(user.id)}" class="${isSelected ? 'user-row-selected' : ''}${(user.groups || []).length ? ' has-groups' : ''}" style="${(user.groups || []).length ? `--group-color:${user.groups[0].color}` : ''}">
        <td><input type="checkbox" data-user-checkbox="${escapeHtml(user.id)}" ${isSelected ? 'checked' : ''} aria-label="Выбрать пользователя ${escapeHtml(user.email)}" /></td>
        <td title="${escapeHtml(user.id)}">${shortId}</td>
        <td>${escapeHtml(user.email)}${groupBadges ? ' ' + groupBadges : ''}</td>
        <td>${user.unlimitedBalance ? '∞' : `${formatBalance(user.balance)} ₽`}</td>
        <td>${subscriptionStatus}</td>
        <td>${user.subscriptions[0] ? formatDate(user.subscriptions[0].expiresAt) : '—'}</td>
        <td class="${daysColorClass}">${typeof daysRemaining === 'number' ? `${daysRemaining} дн.` : '—'}</td>
        <td>${formatDate(user.createdAt)}</td>
        <td>
          <div class="ctx-wrap">
            <button class="ctx-btn" data-ctx-toggle>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
            <div class="ctx-menu">
              <button class="ctx-menu-item" data-action="uuid" data-uuid="${escapeHtml(user.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>
                UUID
              </button>
              <button class="ctx-menu-item" data-action="balance" data-user-id="${escapeHtml(user.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Баланс
              </button>
              <button class="ctx-menu-item" data-action="unlimited-balance" data-user-id="${escapeHtml(user.id)}" data-unlimited="${user.unlimitedBalance ? 1 : 0}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
                ${user.unlimitedBalance ? 'Отключить безлимит' : 'Безлимитный баланс'}
              </button>
              <button class="ctx-menu-item" data-action="subscription" data-user-id="${escapeHtml(user.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Подписка
              </button>
              <button class="ctx-menu-item" data-action="test" data-user-id="${escapeHtml(user.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                Тест подписки
              </button>
              <div class="ctx-menu-sep"></div>
              <button class="ctx-menu-item" data-action="add-to-group" data-user-id="${escapeHtml(user.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Добавить в группу
              </button>
              <div class="ctx-menu-sep"></div>
              <button class="ctx-menu-item danger" data-action="delete" data-user-id="${escapeHtml(user.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m4 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                Удалить
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// =====================================
// Биллинг пользователя
// =====================================

async function deleteUser(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) {
    showToast('Пользователь не найден', 'error');
    return;
  }

  const hasSubs = Array.isArray(user.subscriptions) && user.subscriptions.length > 0;
  const confirmText = hasSubs
    ? `Удалить пользователя ${user.email}? Будут удалены данные пользователя и его подписки. Действие необратимо.`
    : `Удалить пользователя ${user.email}? Действие необратимо.`;

  if (!confirm(confirmText)) {
    return;
  }

  try {
    await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    showToast('Пользователь удалён', 'success');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}


// =====================================
// Дашборд
// =====================================
// Платежи
// =====================================

async function loadPayments() {
  try {
    const data = await apiRequest('/api/payments/admin/all?limit=100');
    renderPaymentsTable(data.payments);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderPaymentsTable(payments) {
  const tbody = elements.paymentsTable.querySelector('tbody');
  const groupOrder = ['topup', 'admin_adjustment', 'promo_bonus', 'referral_bonus'];
  const grouped = {};
  for (const item of payments) {
    const key = item.paymentKind || 'topup';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  const groupTitle = {
    topup: 'Пополнения',
    admin_adjustment: 'Пополнения админом',
    promo_bonus: 'Бонусы промокодов',
    referral_bonus: 'Бонусы рефералов'
  };

  const sections = [];
  for (const kind of groupOrder) {
    const rows = grouped[kind] || [];
    if (!rows.length) continue;
    sections.push(`<tr><td colspan="5" class="payment-group-header">${groupTitle[kind] || kind}</td></tr>`);
    sections.push(...rows.map((payment) => {
      const statusClass = {
        completed: 'status-active',
        pending: 'status-pending',
        failed: 'status-inactive',
        refunded: 'status-inactive'
      }[payment.status] || 'status-inactive';

      const adminBadge = payment.is_admin ? ' <span class="admin-payment-badge">ADMIN</span>' : '';
      const actorName = payment.actorAdminNickname || payment.actorAdminEmail || '';
      const actorTail = payment.actorAdminNickname && payment.actorAdminEmail
        ? ` (${escapeHtml(payment.actorAdminEmail)})`
        : '';
      const actorLine = actorName ? `<div class="actor-line">кто: ${escapeHtml(actorName)}${actorTail}</div>` : '';

      return `
        <tr>
          <td>${payment.id}</td>
          <td>${escapeHtml(payment.email)}${actorLine}</td>
          <td>${formatBalance(payment.amount)} ₽${adminBadge}</td>
          <td><span class="status ${statusClass}">${escapeHtml(payment.status)}</span></td>
          <td>${formatDateTime(payment.createdAt)}</td>
        </tr>
      `;
    }));
  }

  tbody.innerHTML = sections.join('');
}

// =====================================
// Поддержка
// =====================================

function supportStatusText(status) {
  return ({ open: 'Открыт', pending: 'Ожидает пользователя', closed: 'Закрыт' })[status] || status || '—';
}

async function loadSupportTickets() {
  try {
    const status = elements.supportStatusFilter?.value || '';
    const data = await apiRequest(`/api/admin/support/tickets?limit=100${status ? `&status=${encodeURIComponent(status)}` : ''}`);
    state.support.tickets = data.tickets || [];
    renderSupportTickets();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderSupportTickets() {
  const list = elements.supportTicketsList;
  if (!list) return;
  if (!state.support.tickets.length) {
    list.innerHTML = '<div class="support-admin-empty">Обращений нет</div>';
    return;
  }

  const renderTicketItem = (ticket) => {
    const active = state.support.currentTicket?.id === ticket.id ? ' active' : '';
    const closed = ticket.status === 'closed' ? ' closed' : '';
    return `
      <button class="support-ticket-item${active}${closed}" data-ticket-id="${escapeHtml(ticket.id)}" type="button">
        <span class="support-ticket-subject">${escapeHtml(ticket.subject)}</span>
        <span class="support-ticket-email">${escapeHtml(ticket.email)}</span>
        <span class="support-ticket-foot">${supportStatusText(ticket.status)} · ${formatDateTime(ticket.lastMessageAt)}</span>
      </button>
    `;
  };

  const activeTickets = state.support.tickets.filter(ticket => ticket.status !== 'closed');
  const closedTickets = state.support.tickets.filter(ticket => ticket.status === 'closed');
  const sections = [];

  if (activeTickets.length) {
    sections.push('<div class="support-ticket-group-title">Активные</div>');
    sections.push(...activeTickets.map(renderTicketItem));
  }

  if (closedTickets.length) {
    sections.push('<div class="support-ticket-group-title closed">Закрытые</div>');
    sections.push(...closedTickets.map(renderTicketItem));
  }

  list.innerHTML = sections.join('');
}

function renderAdminSupportChat() {
  const ticket = state.support.currentTicket;
  if (!ticket) {
    if (elements.adminSupportMessages) elements.adminSupportMessages.innerHTML = '<div class="support-admin-empty">Выберите обращение слева</div>';
    return;
  }

  elements.adminSupportTitle.textContent = ticket.subject;
  elements.adminSupportMeta.textContent = `${ticket.email} · #${ticket.id.slice(0, 8)}`;
  const isClosed = ticket.status === 'closed';
  if (elements.adminSupportCloseBtn) toggleEl(elements.adminSupportCloseBtn, !isClosed);
  if (elements.adminSupportMessageInput) {
    elements.adminSupportMessageInput.disabled = isClosed;
    elements.adminSupportMessageInput.placeholder = isClosed ? 'Обращение закрыто без возможности восстановления' : 'Ответ пользователю';
  }
  const submitBtn = elements.adminSupportMessageForm?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = isClosed;
    submitBtn.textContent = isClosed ? 'Закрыто' : 'Отправить';
  }

  if (!state.support.messages.length) {
    elements.adminSupportMessages.innerHTML = '<div class="support-admin-empty">Сообщений нет</div>';
    return;
  }

  elements.adminSupportMessages.innerHTML = state.support.messages.map(msg => {
    const own = msg.senderType === 'admin';
    const name = msg.senderType === 'admin' ? (msg.senderAdminName || 'Админ') : 'Пользователь';
    return `
      <div class="support-admin-message ${own ? 'own' : 'user'}">
        <div class="support-admin-message-meta">${escapeHtml(name)} · ${formatDateTime(msg.createdAt)}</div>
        <div class="support-admin-message-body">${escapeHtml(msg.body)}</div>
      </div>
    `;
  }).join('');
  elements.adminSupportMessages.scrollTop = elements.adminSupportMessages.scrollHeight;
}

function connectAdminSupportSocket(ticketUuid) {
  if (!window.io) return;
  if (state.support.socket) state.support.socket.disconnect();
  const socket = window.io();
  state.support.socket = socket;
  socket.on('connect', () => {
    socket.emit('support:join', { ticketUuid, role: 'admin' }, (ack) => {
      if (!ack?.success) showToast(ack?.error || 'Не удалось подключить чат', 'error');
    });
  });
  socket.on('support:message', (event) => {
    if (!state.support.currentTicket || event.ticket?.id !== state.support.currentTicket.id) return;
    state.support.currentTicket = event.ticket;
    if (event.message && !state.support.messages.some(m => Number(m.id) === Number(event.message.id))) {
      state.support.messages.push(event.message);
    }
    renderAdminSupportChat();
    socket.emit('support:read');
    loadSupportTickets();
  });
  socket.on('support:status', (event) => {
    if (!state.support.currentTicket || event.ticket?.id !== state.support.currentTicket.id) return;
    state.support.currentTicket = event.ticket;
    renderAdminSupportChat();
    loadSupportTickets();
  });
}

async function openAdminSupportTicket(ticketUuid) {
  try {
    const data = await apiRequest(`/api/admin/support/tickets/${encodeURIComponent(ticketUuid)}`);
    state.support.currentTicket = data.ticket;
    state.support.messages = data.messages || [];
    renderSupportTickets();
    renderAdminSupportChat();
    connectAdminSupportSocket(ticketUuid);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function closeAdminSupportTicket() {
  const ticket = state.support.currentTicket;
  if (!ticket || ticket.status === 'closed') return;
  const confirmed = confirm('Закрыть обращение без возможности восстановления? После закрытия пользователь и админ не смогут писать в этот чат.');
  if (!confirmed) return;

  try {
    const data = await apiRequest(`/api/admin/support/tickets/${encodeURIComponent(ticket.id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'closed' })
    });
    state.support.currentTicket = data.ticket;
    renderAdminSupportChat();
    await loadSupportTickets();
    showToast('Обращение закрыто', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// =====================================
// Настройки
// =====================================

function renderPasarguardTemplatesSelect(selectedId = null) {
  if (!elements.defaultUserTemplateId) return;
  const select = elements.defaultUserTemplateId;
  const options = ['<option value="">Не выбран</option>'];
  const rows = Array.isArray(state.pasarguardTemplates) ? state.pasarguardTemplates : [];

  rows.forEach((item) => {
    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0) return;
    const selected = Number(selectedId) === id ? ' selected' : '';
    options.push(`<option value="${id}"${selected}>${escapeHtml(item.name || `Template #${id}`)} (ID: ${id})</option>`);
  });

  select.innerHTML = options.join('');
  if (!selectedId) {
    select.value = '';
  }
}

async function loadPasarguardTemplates({ selectedId = null, silent = false } = {}) {
  if (!elements.defaultUserTemplateId) return;
  if (elements.refreshPasarguardTemplatesBtn) elements.refreshPasarguardTemplatesBtn.disabled = true;
  if (elements.pasarguardTemplatesHint) {
    elements.pasarguardTemplatesHint.textContent = 'Загрузка шаблонов...';
  }

  try {
    const data = await apiRequest('/api/admin/pasarguard/templates');
    state.pasarguardTemplates = Array.isArray(data.templates) ? data.templates : [];
    renderPasarguardTemplatesSelect(selectedId);
    if (elements.pasarguardTemplatesHint) {
      elements.pasarguardTemplatesHint.textContent = `Шаблонов: ${state.pasarguardTemplates.length}`;
    }
  } catch (error) {
    if (!silent) showToast(error.message, 'error');
    renderPasarguardTemplatesSelect(selectedId);
    if (elements.pasarguardTemplatesHint) {
      elements.pasarguardTemplatesHint.textContent = `Ошибка: ${error.message}`;
    }
  } finally {
    if (elements.refreshPasarguardTemplatesBtn) elements.refreshPasarguardTemplatesBtn.disabled = false;
  }
}

async function loadSettings() {
  try {
    const data = await apiRequest('/api/admin/settings');
    state.settings = data.settings;
    
    elements.vpnPrice.value = data.settings.vpnPrice;
    elements.minTopUp.value = data.settings.minTopup;
    elements.maxTopUp.value = data.settings.maxTopup;
    await loadPasarguardTemplates({ selectedId: data.settings.defaultUserTemplateId, silent: true });
    if (elements.defaultUserTemplateId && data.settings.defaultUserTemplateId) {
      elements.defaultUserTemplateId.value = String(data.settings.defaultUserTemplateId);
    }
    await loadNotifications();
    await loadAdmins();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadAdmins() {
  if (!elements.adminsTable) return;
  try {
    const data = await apiRequest('/api/admin/admins');
    renderAdminsTable(data.admins || []);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderAdminsTable(admins) {
  if (!elements.adminsTable) return;
  const tbody = elements.adminsTable.querySelector('tbody');
  if (!tbody) return;
  if (!admins.length) {
     tbody.innerHTML = '<tr><td colspan="4" class="table-empty-cell">Администраторы не созданы</td></tr>';
    return;
  }

  tbody.innerHTML = admins.map((admin) => `
    <tr>
      <td>${escapeHtml(admin.nickname || '—')}</td>
      <td>${escapeHtml(admin.email)}</td>
      <td>${admin.isActive ? 'active' : 'inactive'}</td>
      <td>
        <div class="ctx-wrap" data-admin-ctx="${escapeHtml(admin.id)}" data-active="${admin.isActive ? 1 : 0}">
          <button class="ctx-btn" data-ctx-toggle>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
          <div class="ctx-menu">
            <button class="ctx-menu-item" data-admin-action="toggle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
              ${admin.isActive ? 'Отключить' : 'Включить'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-ctx-toggle]').forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = toggleBtn.closest('.ctx-wrap');
      const menu = wrap.querySelector('.ctx-menu');
      document.querySelectorAll('.ctx-wrap.open').forEach(w => {
        if (w !== wrap) w.classList.remove('open');
      });
      wrap.classList.toggle('open');
      const rect = toggleBtn.getBoundingClientRect();
      menu.style.top = rect.bottom + 4 + 'px';
      menu.style.left = rect.left + 'px';
    });
  });

  tbody.querySelectorAll('[data-admin-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const wrap = btn.closest('.ctx-wrap');
      const id = wrap.dataset.adminCtx;
      const active = wrap.dataset.active === '1';
      wrap.classList.remove('open');
      try {
        await apiRequest(`/api/admin/admins/${encodeURIComponent(id)}/active`, {
          method: 'PUT',
          body: JSON.stringify({ isActive: !active })
        });
        showToast('Статус администратора обновлён', 'success');
        await loadAdmins();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

// =====================================
// Модальные окна
// =====================================

let selectedUserIdsForAction = [];
const balanceChangeEl = document.getElementById('balanceChange');
const balanceHintEl = document.getElementById('balanceHint');
const subscriptionActionRow = document.getElementById('subscriptionActionRow');
const subscriptionResumeActions = document.getElementById('subscriptionResumeActions');
const balanceMessageEl = document.getElementById('balanceMessage');
const subscriptionMessageEl = document.getElementById('subMessage');
const selectedNotificationUsers = new Set();

async function applyBalanceOperation(operation) {
  const rawAmount = Number(balanceChangeEl?.value);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    showToast('Введите сумму больше 0', 'error');
    return;
  }

  const targetIds = selectedUserIdsForAction.length ? selectedUserIdsForAction : [];
  if (!targetIds.length) {
    showToast('Не выбраны пользователи', 'error');
    return;
  }

  const errors = [];
  const adminMessage = String(balanceMessageEl?.value || '').trim();
  for (const userId of targetIds) {
    const user = state.users.find((u) => u.id === userId);
    const current = Number(user?.balance) || 0;
    let amount = rawAmount;
    if (operation === 'subtract') amount = -rawAmount;
    if (operation === 'set') amount = rawAmount - current;

    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/balance`, {
        method: 'PUT',
        body: JSON.stringify({ amount, message: adminMessage || undefined })
      });
    } catch (error) {
      errors.push({ userId, message: error.message });
    }
  }

  if (errors.length === 0) {
    showToast(targetIds.length > 1 ? `Готово: ${targetIds.length} пользователей` : 'Готово', 'success');
  } else {
    showToast(`Изменено: ${targetIds.length - errors.length}, ошибок: ${errors.length}`, 'error');
  }

  await loadUsers();
  await loadDashboard();
}

function openBalanceModal(userIds) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const users = ids.map((id) => state.users.find((u) => u.id === id)).filter(Boolean);
  if (!users.length) return;

  selectedUserIdsForAction = users.map((u) => u.id);
  const isBulk = users.length > 1;
  document.getElementById('balanceUserId').value = isBulk ? users.map((u) => u.id).join(',') : users[0].id;
  document.getElementById('balanceUserEmail').value = isBulk
    ? `${users.length} пользователей`
    : users[0].email;
  document.getElementById('balanceCurrent').value = isBulk
    ? 'Множественное изменение'
    : `${formatBalance(users[0].balance)} ₽`;
  if (balanceChangeEl) balanceChangeEl.value = '';
  if (balanceMessageEl) balanceMessageEl.value = '';
  if (balanceHintEl) {
    balanceHintEl.textContent = isBulk
      ? 'Действие и сумма применяются к каждому выбранному пользователю.'
      : 'Введите сумму и нажмите кнопку действия: пополнить, списать или установить баланс.';
  }
  
  elements.balanceModal.classList.add('active');
}

function getSelectedNotificationUserIds() {
  return Array.from(selectedNotificationUsers);
}

function syncHiddenNotificationUserIds() {
  if (elements.notifUserIds) {
    elements.notifUserIds.value = getSelectedNotificationUserIds().join(',');
  }
}

function updateNotificationUsersToggleLabel() {
  if (!elements.notifUsersToggle) return;
  const count = selectedNotificationUsers.size;
  if (!count) {
    elements.notifUsersToggle.textContent = 'Выберите пользователей';
    return;
  }
  elements.notifUsersToggle.textContent = `Выбрано: ${count}`;
}

function renderNotificationUsersList() {
  if (!elements.notifUsersList) return;
  if (!state.users.length) {
    elements.notifUsersList.innerHTML = '<div class="user-multiselect-item">Нет пользователей</div>';
    return;
  }

  elements.notifUsersList.innerHTML = state.users.map((user) => {
    const checked = selectedNotificationUsers.has(user.id) ? 'checked' : '';
    const shortId = user.id.length > 8 ? `${user.id.slice(0, 8)}...` : user.id;
    return `
      <label class="user-multiselect-item">
        <input type="checkbox" data-notif-user-id="${escapeHtml(user.id)}" ${checked} />
        <span class="user-multiselect-email">${escapeHtml(user.email)}</span>
        <span class="user-multiselect-id">${escapeHtml(shortId)}</span>
      </label>
    `;
  }).join('');
}

async function ensureNotificationUsersLoaded() {
  if (state.users.length > 0) {
    renderNotificationUsersList();
    return;
  }
  try {
    const data = await apiRequest('/api/admin/users?limit=200');
    const users = Array.isArray(data.users) ? data.users : [];
    state.users = users;
    renderNotificationUsersList();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openSubscriptionModal(userIds) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const users = ids.map((id) => state.users.find((u) => u.id === id)).filter(Boolean);
  if (!users.length) return;

  selectedUserIdsForAction = users.map((u) => u.id);
  const isBulk = users.length > 1;
  const user = users[0];
  document.getElementById('subUserId').value = isBulk ? users.map((u) => u.id).join(',') : user.id;
  document.getElementById('subUserEmail').value = isBulk ? `${users.length} пользователей` : user.email;

  // Показываем все подписки (active и cancelled)
  const activeSub = user.subscriptions.find(s => s.status === 'active');
  const cancelledSubs = isBulk ? [] : user.subscriptions.filter(s => s.status === 'cancelled');

  let currentText = activeSub ? 'Активна' : 'Неактивна';
  if (cancelledSubs.length > 0) {
    currentText += ' | Доступно возобновление';
  }
  document.getElementById('subCurrent').value = currentText;
  document.getElementById('subPlan').value = 'none';
  if (subscriptionMessageEl) subscriptionMessageEl.value = '';

  // Обновляем действия подписки
  const subPlan = document.getElementById('subPlan');
  const warningEl = document.getElementById('subscriptionWarning');

  // Удаляем старые resume-опции и кнопки
  subPlan.querySelectorAll('option:not([value="none"]):not([value="active"])').forEach((o) => o.remove());
  if (subscriptionResumeActions) {
    subscriptionResumeActions.innerHTML = '';
  }

  // Добавляем resume options и кнопки для cancelled подписок
  cancelledSubs.forEach(sub => {
    const option = document.createElement('option');
    option.value = `resume:${sub.type}`;
    option.textContent = `Возобновить ${sub.type}`;
    subPlan.appendChild(option);

    if (subscriptionResumeActions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn';
      btn.dataset.subAction = `resume:${sub.type}`;
      btn.textContent = 'Активировать';
      subscriptionResumeActions.appendChild(btn);
    }
  });

  // Показываем предупреждение если есть active подписки
  if (activeSub && !isBulk) {
    const isDaily = !!activeSub.dailyRate;
    const expiresText = isDaily && activeSub.nextChargeAt
      ? `до ${formatDateTime(activeSub.nextChargeAt)}`
      : `до ${formatDate(activeSub.expiresAt)}`;
    warningEl.innerHTML = `
      <div class="subscription-warning-box">
        <p class="subscription-warning-title">Статус: активна</p>
        <p class="subscription-warning-text">При деактивации подписка останется рабочей ${expiresText}, затем автоматически станет неактивной.</p>
      </div>
    `;
    warningEl.classList.remove('hidden');
  } else {
    warningEl.classList.add('hidden');
  }

  elements.subscriptionModal.classList.add('active');
}

async function applySubscriptionPlan(plan) {
  if (plan === 'none' && !confirm('Деактивировать подписку?')) {
    return;
  }

  const targetIds = selectedUserIdsForAction.length ? selectedUserIdsForAction : [];
  if (!targetIds.length) {
    showToast('Не выбраны пользователи', 'error');
    return;
  }

  const errors = [];
  const adminMessage = String(subscriptionMessageEl?.value || '').trim();
  if (plan.startsWith('resume:')) {
    const type = plan.split(':')[1];
    for (const userId of targetIds) {
      try {
        await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/subscription`, {
          method: 'PUT',
          body: JSON.stringify({ type, action: 'resume', message: adminMessage || undefined })
        });
      } catch (error) {
        errors.push({ userId, message: error.message });
      }
    }
  } else {
    for (const userId of targetIds) {
      try {
        await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/subscription`, {
          method: 'PUT',
          body: JSON.stringify({
            type: plan === 'active' ? 'vpn' : plan,
            status: plan === 'none' ? 'cancelled' : 'active',
            message: adminMessage || undefined
          })
        });
      } catch (error) {
        errors.push({ userId, message: error.message });
      }
    }
  }

  if (errors.length === 0) {
    showToast(targetIds.length > 1 ? `Подписка обновлена для ${targetIds.length} пользователей` : 'Подписка обновлена', 'success');
  } else {
    showToast(`Обновлено: ${targetIds.length - errors.length}, ошибок: ${errors.length}`, 'error');
  }

  await loadUsers();
  await loadDashboard();
}

function closeBalanceModal() {
  elements.balanceModal.classList.remove('active');
  selectedUserIdsForAction = [];
  if (balanceChangeEl) balanceChangeEl.value = '';
  if (balanceMessageEl) balanceMessageEl.value = '';
}

function closeSubscriptionModal() {
  elements.subscriptionModal.classList.remove('active');
  selectedUserIdsForAction = [];
  if (subscriptionMessageEl) subscriptionMessageEl.value = '';
}

// =====================================
// Тест подписки
// =====================================

const testModal = document.getElementById('subscriptionTestModal');
const testElements = {
  userId: document.getElementById('testUserId'),
  email: document.getElementById('testUserEmail'),
  balance: document.getElementById('testUserBalance'),
  subStatus: document.getElementById('testSubStatus'),
  subExpires: document.getElementById('testSubExpires'),
  subDailyRate: document.getElementById('testSubDailyRate'),
  vpnResources: document.getElementById('testVpnResources'),
  vpnResourcesList: document.getElementById('testVpnResourcesList'),
  vpnNone: document.getElementById('testVpnNone'),
  result: document.getElementById('testResult'),
  btnActivate: document.getElementById('testBtnActivate'),
  btnPause: document.getElementById('testBtnPause'),
  btnUnpause: document.getElementById('testBtnUnpause'),
  btnDeleteVpn: document.getElementById('testBtnDeleteVpn'),
  btnCancel: document.getElementById('testBtnCancel'),
  btnResume: document.getElementById('testBtnResume'),
  btnDryRun: document.getElementById('testBtnDryRun'),
};

const testScenarioPanel = document.getElementById('testScenarioPanel');
const testScenarioSelect = document.getElementById('testScenarioSelect');
const testScenarioHint = document.getElementById('testScenarioHint');
const testRunScenarioBtn = document.getElementById('testRunScenarioBtn');
const testScenarioResult = document.getElementById('testScenarioResult');
const testScenarioSummary = document.getElementById('testScenarioSummary');
const testScenarioSteps = document.getElementById('testScenarioSteps');

const testScenarioState = {
  enabled: false,
  scenarios: [],
  loaded: false
};

let testUserId = null;

function openSubscriptionTestModal(userId) {
  testUserId = userId;
  testElements.userId.value = userId;
  testElements.result.classList.add('hidden');
  testBillingResult.classList.add('hidden');
  testScenarioResult.classList.add('hidden');

  const user = state.users.find(u => u.id === userId);
  testElements.email.textContent = user ? user.email : userId;

  testModal.classList.add('active');
  loadTestModalState();
  loadScenarioDefinitions();
}

function closeTestModal() {
  testModal.classList.remove('active');
  testUserId = null;
}

function renderScenarioOptions() {
  if (!testScenarioSelect || !testScenarioPanel) return;

  const scenarios = Array.isArray(testScenarioState.scenarios) ? testScenarioState.scenarios : [];
  if (!testScenarioState.enabled || scenarios.length === 0) {
    testScenarioPanel.classList.add('hidden');
    return;
  }

  testScenarioPanel.classList.remove('hidden');
  testScenarioSelect.innerHTML = scenarios
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title || item.id)}</option>`)
    .join('');

  const selected = scenarios.find((item) => item.id === testScenarioSelect.value) || scenarios[0];
  testScenarioSelect.value = selected.id;
  testScenarioHint.textContent = selected.description || '';
}

async function loadScenarioDefinitions(force = false) {
  if (testScenarioState.loaded && !force) {
    renderScenarioOptions();
    return;
  }

  try {
    const data = await apiRequest('/api/admin/subscription-scenarios');
    testScenarioState.enabled = Boolean(data.enabled);
    testScenarioState.scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
    testScenarioState.loaded = true;
    renderScenarioOptions();
  } catch (_) {
    testScenarioState.enabled = false;
    testScenarioState.scenarios = [];
    testScenarioState.loaded = true;
    renderScenarioOptions();
  }
}

function renderScenarioReport(report) {
  if (!report) {
    testScenarioResult.classList.add('hidden');
    return;
  }

  const summary = report.summary || {};
  const scenarioTitle = report.scenario?.title || report.scenario?.id || '—';
  const statusClass = report.status === 'passed' ? 'test-step-ok' : 'test-step-fail';
  const statusText = report.status === 'passed' ? 'PASS' : 'FAIL';

  testScenarioSummary.innerHTML = `
    <div><strong>Сценарий:</strong> ${escapeHtml(scenarioTitle)}</div>
    <div><strong>Статус:</strong> <span class="${statusClass}">${statusText}</span></div>
    <div><strong>Шаги:</strong> ${summary.passed || 0} / ${summary.total || 0} пройдено</div>
    <div><strong>Пользователь:</strong> ${escapeHtml(report.user?.email || '—')}</div>
  `;

  const rows = (report.steps || []).map((step, index) => {
    const stepStatusClass = step.status === 'passed' ? 'test-step-ok' : 'test-step-fail';
    const stepStatusText = step.status === 'passed' ? 'PASS' : 'FAIL';
    const assertions = Array.isArray(step.assertions) ? step.assertions : [];
    const assertionText = assertions.length
      ? assertions.map((item) => `${item.pass ? 'OK' : 'ERR'}: ${item.key}`).join('<br>')
      : '—';
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(step.name || step.action || '—')}</td>
        <td><span class="${stepStatusClass}">${stepStatusText}</span></td>
        <td>${step.durationMs || 0} ms</td>
        <td>${assertionText}</td>
        <td>${escapeHtml(step.error || '—')}</td>
      </tr>
    `;
  }).join('');

  testScenarioSteps.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Шаг</th>
          <th>Статус</th>
          <th>Время</th>
          <th>Проверки</th>
          <th>Ошибка</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" class="table-empty-cell">Нет шагов</td></tr>'}</tbody>
    </table>
  `;

  testScenarioResult.classList.remove('hidden');
}

async function loadTestModalState() {
  if (!testUserId) return;
  try {
    const data = await apiRequest(`/api/admin/users/${encodeURIComponent(testUserId)}/subscription-state`);
    const user = data.user;
    testElements.balance.textContent = `${formatBalance(user.balance)} ₽`;

    const vpnSubs = (data.subscriptions || []).filter(s => s.type === 'vpn');

    if (vpnSubs.length > 0) {
      const sub = vpnSubs[0];
      testElements.subStatus.textContent = statusLabel(sub.status);
      testElements.subExpires.textContent = sub.expiresAt ? formatDateTime(sub.expiresAt) : '—';
      testElements.subDailyRate.textContent = sub.dailyRate ? `${sub.dailyRate} ₽` : '—';
    } else {
      testElements.subStatus.textContent = 'Нет подписки';
      testElements.subExpires.textContent = '—';
      testElements.subDailyRate.textContent = '—';
    }

    updateTestButtons(vpnSubs);
    loadTestVpnResources(vpnSubs);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function statusLabel(status) {
  const map = { active: '● Активна', cancelled: '● Неактивна', expired: '● Неактивна' };
  return map[status] || status;
}

function updateTestButtons(vpnSubs) {
  const sub = vpnSubs[0];
  const hasActive = sub && sub.status === 'active';
  const hasCancelled = sub && sub.status === 'cancelled';
  const hasExpired = sub && sub.status === 'expired';
  const hasNone = !sub;

  toggleEl(testElements.btnActivate, hasNone || hasExpired);
  toggleEl(testElements.btnPause, hasActive);
  toggleEl(testElements.btnUnpause, hasActive);
  toggleEl(testElements.btnDeleteVpn, hasActive);
  toggleEl(testElements.btnCancel, hasActive);
  toggleEl(testElements.btnResume, hasCancelled);
  toggleEl(testElements.btnDryRun, hasActive);
}

function loadTestVpnResources(vpnSubs) {
  const sub = vpnSubs[0];
  const configData = sub?.configData;

  if (!configData || !configData.resources || configData.resources.length === 0) {
    testElements.vpnResources.classList.add('hidden');
    toggleEl(testElements.vpnNone, sub && sub.status === 'active');
    return;
  }

  testElements.vpnNone.classList.add('hidden');
  testElements.vpnResources.classList.remove('hidden');

  testElements.vpnResourcesList.innerHTML = configData.resources.map(r => `
    <div class="test-vpn-res">
      <div class="test-vpn-res-row"><span class="test-vpn-res-label">Протокол</span><span class="test-vpn-res-value">${escapeHtml(r.protocol || '—')}</span></div>
      <div class="test-vpn-res-row"><span class="test-vpn-res-label">Inbound</span><span class="test-vpn-res-value">${escapeHtml(r.inboundId || '—')}</span></div>
      <div class="test-vpn-res-row"><span class="test-vpn-res-label">Email</span><span class="test-vpn-res-value">${escapeHtml(r.email || '—')}</span></div>
      <div class="test-vpn-res-row"><span class="test-vpn-res-label">Title</span><span class="test-vpn-res-value">${escapeHtml(r.title || '—')}</span></div>
      <div class="test-vpn-res-row"><span class="test-vpn-res-label">Sub Link</span><span class="test-vpn-res-value test-vpn-res-link">${r.subscriptionLink ? `<a href="${escapeHtml(r.subscriptionLink)}" target="_blank">${escapeHtml(r.subscriptionLink)}</a>` : '—'}</span></div>
    </div>
  `).join('');
}

const testActionConfirms = {
  pause: 'Поставить VPN на паузу? (status=disabled в PasarGuard, подписка остаётся active)',
  unpause: 'Снять VPN с паузы? (status=active в PasarGuard)',
  'delete-vpn': 'Удалить VPN пользователя из PasarGuard? Подписка останется active. Для восстановления потребуется пере-провижин.',
  cancel: 'Отменить подписку? В момент следующего списания пользователь будет переведён в disabled.',
  resume: 'Возобновить отменённую подписку? VPN будет пере-провижинен.',
  activate: 'Создать новую VPN подписку? Будет списана дневная ставка.',
  'dry-run': 'Запустить тест биллинга? (dry-run, никаких реальных изменений)',
  'email-code': 'Отправить тестовый email с кодом входа этому пользователю?',
  'email-low-balance': 'Отправить тестовый email «низкий баланс» этому пользователю?',
  'email-insufficient-funds': 'Отправить тестовый email «недостаточно средств» этому пользователю?',
  'push-low-balance': 'Отправить тестовый push «низкий баланс» этому пользователю?',
  'push-funds-depleted': 'Отправить тестовый push «средства закончились» этому пользователю?'
};

const testBillingResult = document.getElementById('testBillingResult');
const testBillingSummary = document.getElementById('testBillingSummary');
const testBillingDetails = document.getElementById('testBillingDetails');

document.getElementById('testActionsGrid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-test-action]');
  if (!btn || !testUserId) return;

  const action = btn.dataset.testAction;
  const confirmMsg = testActionConfirms[action];
  if (confirmMsg && !confirm(confirmMsg)) return;

  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = 'Выполняется...';

  testBillingResult.classList.add('hidden');

  try {
    if (action === 'dry-run') {
      const data = await apiRequest(`/api/admin/billing/run/${encodeURIComponent(testUserId)}`, { method: 'POST' });
      const result = data.result;
      const details = data.details;

      testBillingSummary.innerHTML = `
        <div class="test-billing-stats">
          <div class="test-billing-stat"><span class="test-billing-stat-val">${result.processed || 0}</span><span class="test-billing-stat-lbl">Обработано</span></div>
          <div class="test-billing-stat"><span class="test-billing-stat-val stat-success">${result.success || 0}</span><span class="test-billing-stat-lbl">Успешно</span></div>
          <div class="test-billing-stat"><span class="test-billing-stat-val stat-failed">${result.failed || 0}</span><span class="test-billing-stat-lbl">Ошибки</span></div>
          <div class="test-billing-stat"><span class="test-billing-stat-val stat-suspended">${result.suspended || 0}</span><span class="test-billing-stat-lbl">Приостан.</span></div>
        </div>
      `;

      if (details && details.subscriptions && details.subscriptions.length > 0) {
        const rows = details.subscriptions.map(sub => {
          const isCharged = sub.action === 'would_charge' || sub.action === 'charged';
          const statusText = isCharged ? '✅ Хватило бы' : '⏸ Не хватило бы';
          const statusColor = isCharged ? '#4caf50' : '#ef4444';
          return `
            <tr>
              <td>${escapeHtml(sub.type || 'vpn')}</td>
              <td>${sub.dailyRate ? sub.dailyRate.toFixed(2) : '—'} ₽</td>
              <td class="${isCharged ? 'stat-success' : 'stat-failed'}">${statusText}</td>
              <td>${escapeHtml(sub.reason || (isCharged ? 'Списание прошло бы' : '—'))}</td>
            </tr>
          `;
        }).join('');
        testBillingDetails.innerHTML = `
          <table class="data-table table-sm">
            <thead><tr><th>Тип</th><th>₽/день</th><th>Результат</th><th>Детали</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      } else {
        testBillingDetails.innerHTML = '<p class="table-empty-centered table-empty-padded">Нет подписок для обработки</p>';
      }

      testBillingResult.classList.remove('hidden');
      testElements.result.classList.remove('hidden');
      testElements.result.textContent = data.message;
      testElements.result.className = 'test-result test-result-ok';
      showToast(data.message, 'success');
    } else {
      const data = await apiRequest(`/api/admin/users/${encodeURIComponent(testUserId)}/subscription-test`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });

      testElements.result.classList.remove('hidden');
      testElements.result.textContent = data.message;
      testElements.result.className = 'test-result test-result-ok';

      await loadTestModalState();
      await loadUsers();
      showToast(data.message, 'success');
    }
  } catch (error) {
    testElements.result.classList.remove('hidden');
    testElements.result.textContent = error.message;
    testElements.result.className = 'test-result test-result-err';
    showToast(error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

if (testScenarioSelect) {
  testScenarioSelect.addEventListener('change', () => {
    const selected = testScenarioState.scenarios.find((item) => item.id === testScenarioSelect.value);
    testScenarioHint.textContent = selected?.description || '';
  });
}

if (testRunScenarioBtn) {
  testRunScenarioBtn.addEventListener('click', async () => {
    if (!testUserId) return;
    const scenarioId = String(testScenarioSelect?.value || '').trim();
    if (!scenarioId) {
      showToast('Выберите сценарий', 'error');
      return;
    }

    const selected = testScenarioState.scenarios.find((item) => item.id === scenarioId);
    const title = selected?.title || scenarioId;
    if (!confirm(`Запустить сценарий "${title}"? Будут выполнены реальные изменения подписки.`)) {
      return;
    }

    testRunScenarioBtn.disabled = true;
    const originalText = testRunScenarioBtn.textContent;
    testRunScenarioBtn.textContent = 'Выполняется...';
    testScenarioResult.classList.add('hidden');

    try {
      const data = await apiRequest(`/api/admin/subscription-scenarios/run/${encodeURIComponent(testUserId)}`, {
        method: 'POST',
        body: JSON.stringify({ scenarioId })
      });

      renderScenarioReport(data.report);
      testElements.result.classList.remove('hidden');
      testElements.result.textContent = data.message;
      testElements.result.className = data.report?.status === 'passed' ? 'test-result test-result-ok' : 'test-result test-result-err';

      await loadTestModalState();
      await loadUsers();
      showToast(data.message, data.report?.status === 'passed' ? 'success' : 'error');
    } catch (error) {
      testElements.result.classList.remove('hidden');
      testElements.result.textContent = error.message;
      testElements.result.className = 'test-result test-result-err';
      showToast(error.message, 'error');
    } finally {
      testRunScenarioBtn.disabled = false;
      testRunScenarioBtn.textContent = originalText;
    }
  });
}

// =====================================
// Формы
// =====================================

const balanceActionRow = document.getElementById('balanceActionRow');
if (balanceActionRow) {
  balanceActionRow.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-balance-action]');
    if (!btn) return;
    const operation = String(btn.dataset.balanceAction || 'add');
    if (!['add', 'subtract', 'set'].includes(operation)) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Выполняется...';
    try {
      await applyBalanceOperation(operation);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

const balanceFormEl = document.getElementById('balanceForm');
if (balanceFormEl) {
  balanceFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
  });
}

// Управление подпиской
if (subscriptionActionRow) {
  subscriptionActionRow.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sub-action]');
    if (!btn) return;
    const plan = String(btn.dataset.subAction || '').trim();
    if (!plan) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Выполняется...';
    try {
      await applySubscriptionPlan(plan);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

const subscriptionFormEl = document.getElementById('subscriptionForm');
if (subscriptionFormEl) {
  subscriptionFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
  });
}

// Цены
elements.pricesForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    await saveAdminSettings();
    loadSettings();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

if (elements.adminCreateForm) {
  elements.adminCreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = String(elements.adminCreateNickname?.value || '').trim();
    const email = String(elements.adminCreateEmail?.value || '').trim().toLowerCase();
    const password = String(elements.adminCreatePassword?.value || '');
    if (nickname.length < 2 || !email || password.length < 8) {
      showToast('Введите никнейм, email и пароль минимум 8 символов', 'error');
      return;
    }
    try {
      await apiRequest('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({ nickname, email, password })
      });
      showToast('Администратор создан', 'success');
      elements.adminCreateForm.reset();
      if (elements.adminCreateModal) elements.adminCreateModal.classList.remove('active');
      await loadAdmins();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

if (elements.openAdminCreateModal) {
  elements.openAdminCreateModal.addEventListener('click', () => {
    if (elements.adminCreateModal) elements.adminCreateModal.classList.add('active');
  });
}

if (elements.refreshPasarguardTemplatesBtn) {
  elements.refreshPasarguardTemplatesBtn.addEventListener('click', async () => {
    const selectedId = Number(elements.defaultUserTemplateId?.value || 0) || null;
    await loadPasarguardTemplates({ selectedId });
  });
}

// =====================================
// Биллинг
// =====================================

async function loadBilling() {
  try {
    const data = await apiRequest('/api/admin/billing/subscriptions');
    renderBillingTable(data.subscriptions);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderBillingTable(subscriptions) {
  const tbody = elements.billingTable.querySelector('tbody');
  if (!subscriptions || subscriptions.length === 0) {
     tbody.innerHTML = '<tr><td colspan="8" class="table-empty-padded">Нет ежедневных подписок</td></tr>';
    return;
  }
  
  tbody.innerHTML = subscriptions.map(sub => {
    const statusMap = {
      active: '<span class="status status-active">Активна</span>',
      cancelled: '<span class="status status-inactive">Неактивна</span>',
      expired: '<span class="status status-inactive">Неактивна</span>'
    };
    return `
      <tr>
        <td>${sub.id}</td>
        <td>${escapeHtml(sub.email)}</td>
        <td>${statusMap[sub.status] || escapeHtml(sub.status)}</td>
        <td>${sub.dailyRate ? `${sub.dailyRate.toFixed(2)} ₽` : '—'}</td>
        <td>${formatDateTime(sub.firstChargeAt)}</td>
        <td>${formatDateTime(sub.lastChargeAt)}</td>
        <td>${formatDateTime(sub.nextChargeAt)}</td>
        <td>${formatDateTime(sub.expiresAt)}</td>
      </tr>
    `;
  }).join('');
}

async function runBilling() {
  if (elements.runBillingBtn.disabled) return;
  elements.runBillingBtn.disabled = true;
  elements.runBillingBtn.innerHTML = '<span>Запуск...</span>';
  
  try {
    const data = await apiRequest('/api/admin/billing/run', { method: 'POST' });
    const result = data.result;
    
    elements.billingResult.classList.remove('hidden');
    elements.billingProcessed.textContent = result.processed || 0;
    elements.billingSuccess.textContent = result.success || 0;
    elements.billingFailed.textContent = result.failed || 0;
    elements.billingSuspended.textContent = result.suspended || 0;
    
    showToast(`Биллинг завершён: ${result.success || 0} успешно, ${result.failed || 0} ошибок`, 'success');
    
    await loadBilling();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.runBillingBtn.disabled = false;
    elements.runBillingBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Запустить биллинг
    `;
  }
}

// =====================================
// События
// =====================================

// Навигация
elements.navItems.forEach(item => {
  item.addEventListener('click', () => {
    navigateTo(item.dataset.page);
  });
});

// Мобильное меню
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.add('open');
  if (sidebarOverlay) sidebarOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

if (elements.sidebarToggle) {
  elements.sidebarToggle.addEventListener('click', () => {
    closeSidebar();
  });
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    if (document.getElementById('sidebar')?.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', closeSidebar);
}

// Обновление данных
elements.refreshData.addEventListener('click', async () => {
  elements.refreshData.style.transform = 'rotate(360deg)';
  setTimeout(() => {
    elements.refreshData.style.transform = '';
  }, 300);
  await loadPageData(state.currentPage);
  showToast('Данные обновлены', 'success');
});

// Выход
elements.adminLogout.addEventListener('click', logout);

// Биллинг
if (elements.runBillingBtn) {
  elements.runBillingBtn.addEventListener('click', runBilling);
}
if (elements.refreshBillingBtn) {
  elements.refreshBillingBtn.addEventListener('click', loadBilling);
}

if (elements.supportStatusFilter) {
  elements.supportStatusFilter.addEventListener('change', loadSupportTickets);
}

if (elements.supportTicketsList) {
  elements.supportTicketsList.addEventListener('click', (e) => {
    const item = e.target.closest('[data-ticket-id]');
    if (!item) return;
    openAdminSupportTicket(item.dataset.ticketId);
  });
}

if (elements.adminSupportCloseBtn) {
  elements.adminSupportCloseBtn.addEventListener('click', closeAdminSupportTicket);
}

if (elements.adminSupportMessageForm) {
  elements.adminSupportMessageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticket = state.support.currentTicket;
    const body = String(elements.adminSupportMessageInput?.value || '').trim();
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
      elements.adminSupportMessageInput.value = '';
      return;
    }

    try {
      await apiRequest(`/api/admin/support/tickets/${encodeURIComponent(ticket.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body })
      });
      elements.adminSupportMessageInput.value = '';
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// Уведомления
if (elements.notificationForm) {
  const toggleNotifUsersGroup = () => {
    if (!elements.notifUsersGroup || !elements.notifTargetType) return;
     const isSelectedMode = elements.notifTargetType.value === 'selected';
     toggleEl(elements.notifUsersGroup, isSelectedMode);
    if (isSelectedMode) {
      ensureNotificationUsersLoaded();
    }
  };

  if (elements.notifTargetType) {
    elements.notifTargetType.addEventListener('change', toggleNotifUsersGroup);
    toggleNotifUsersGroup();
  }

  elements.notificationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    elements.notifSendBtn.disabled = true;
    elements.notifSendBtn.textContent = 'Отправка...';
    elements.notifResult.classList.add('hidden');

    try {
        const targetType = elements.notifTargetType?.value === 'selected' ? 'selected' : 'all';
        const userIds = getSelectedNotificationUserIds();
        if (targetType === 'selected' && userIds.length === 0) {
          throw new Error('Укажите хотя бы одного пользователя');
        }

        const data = await apiRequest('/api/admin/notifications/send', {
          method: 'POST',
          body: JSON.stringify({
            title: elements.notifTitle.value || 'El-Duck VPN',
            body: elements.notifBody.value,
            targetType,
            userIds,
            priority: elements.notifPriority?.value || 'normal',
            expiresAt: elements.notifExpiresAt?.value ? new Date(elements.notifExpiresAt.value).toISOString() : null,
            minReadTime: parseInt(elements.notifMinReadTime?.value, 10) || 0
          })
        });

      elements.notifResult.classList.remove('hidden');
      elements.notifResult.className = 'result-msg success';
      elements.notifResult.textContent = `✅ Push: ${data.sent} успешно, ${data.failed} ошибок. Popup получателей: ${data.popupRecipients}`;
      elements.notifBody.value = '';
      selectedNotificationUsers.clear();
      syncHiddenNotificationUserIds();
      updateNotificationUsersToggleLabel();
      renderNotificationUsersList();
      await loadNotifications();
    } catch (err) {
      elements.notifResult.classList.remove('hidden');
      elements.notifResult.className = 'result-msg error';
      elements.notifResult.textContent = '❌ ' + err.message;
    }

    elements.notifSendBtn.disabled = false;
    elements.notifSendBtn.textContent = 'Отправить';
  });
}

if (elements.notifUsersToggle && elements.notifUsersSelect) {
  elements.notifUsersToggle.addEventListener('click', async () => {
    await ensureNotificationUsersLoaded();
    elements.notifUsersSelect.classList.toggle('open');
  });
}

if (elements.notifUsersList) {
  elements.notifUsersList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-notif-user-id]');
    if (!checkbox) return;
    const userId = String(checkbox.dataset.notifUserId || '').trim();
    if (!userId) return;
    if (checkbox.checked) selectedNotificationUsers.add(userId);
    else selectedNotificationUsers.delete(userId);
    syncHiddenNotificationUserIds();
    updateNotificationUsersToggleLabel();
  });
}

if (elements.popupListBody) {
  elements.popupListBody.addEventListener('click', (event) => {
    const btn = event.target.closest('.popup-delete-btn');
    if (btn) {
      deletePopup(btn.dataset.id);
    }
  });
}

if (elements.popupListPagination) {
  elements.popupListPagination.addEventListener('click', (event) => {
    const btn = event.target.closest('.pagination-btn');
    if (btn) {
      popupCurrentPage = Number(btn.dataset.page || 0);
      loadPopups();
    }
  });
}

if (elements.cleanupExpiredPopupsBtn) {
  elements.cleanupExpiredPopupsBtn.addEventListener('click', cleanupExpiredPopups);
}

if (elements.referralSettingsForm) {
  elements.referralSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/referrals/settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: !!elements.refEnabled.checked,
          minTopup: Number(elements.refMinTopup.value || 0),
          inviterBonus: Number(elements.refInviterBonus.value || 0),
          inviteeBonus: Number(elements.refInviteeBonus.value || 0)
        })
      });
      showToast('Реферальные настройки сохранены', 'success');
      loadReferrals();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

if (elements.promoCreateForm) {
  elements.promoCreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/promocodes', {
        method: 'POST',
        body: JSON.stringify({
          code: elements.promoCode.value,
          rewardType: 'fixed',
          instantGrant: !!elements.promoInstantGrant.checked,
          rewardValue: Number(elements.promoRewardValue.value || 0),
          minTopup: Number(elements.promoMinTopup.value || 0),
          perUserLimit: Number(elements.promoPerUserLimit?.value || 1),
          startsAt: elements.promoStartsAt?.value ? new Date(elements.promoStartsAt.value).toISOString() : null,
          endsAt: elements.promoEndsAt?.value ? new Date(elements.promoEndsAt.value).toISOString() : null,
          isActive: !!elements.promoIsActive.checked
        })
      });
      showToast('Промокод создан', 'success');
      elements.promoCreateForm.reset();
      if (elements.promoIsActive) elements.promoIsActive.checked = true;
      if (elements.promoInstantGrant) elements.promoInstantGrant.checked = false;
      if (elements.promoMinTopup) elements.promoMinTopup.value = '0';
      loadPromoCodes();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function loadNotifications() {
  try {
    const data = await apiRequest('/api/admin/notifications/stats');
    const subscribers = Number(data.subscribers || 0);
    const unread = Number(data.popupUnreadRecipients || 0);
    const totalMessages = Number(data.popupMessages || 0);
    elements.notifSubscribers.textContent = `${subscribers} (unread popup: ${unread}, всего popup: ${totalMessages})`;
  } catch (e) {}
  await loadPopups();
}

const POPUP_PAGE_SIZE = 10;
let popupCurrentPage = 0;

function formatPopupPriority(priority) {
  const map = { high: 'Высокий', normal: 'Обычный', low: 'Низкий' };
  return map[priority] || priority || 'Обычный';
}

async function loadPopups() {
  if (!elements.popupListBody) return;
  try {
    const data = await apiRequest('/api/admin/notifications/popups?limit=200&offset=0');
    const popups = data.popups || [];

    if (!popups.length) {
      if (elements.popupListTable) elements.popupListTable.closest('.table-scroll')?.classList.add('hidden');
      if (elements.popupListEmpty) elements.popupListEmpty.classList.remove('hidden');
      if (elements.popupListPagination) elements.popupListPagination.innerHTML = '';
      return;
    }

    if (elements.popupListTable) elements.popupListTable.closest('.table-scroll')?.classList.remove('hidden');
    if (elements.popupListEmpty) elements.popupListEmpty.classList.add('hidden');

    const totalPages = Math.ceil(popups.length / POPUP_PAGE_SIZE);
    if (popupCurrentPage >= totalPages) popupCurrentPage = Math.max(0, totalPages - 1);
    const start = popupCurrentPage * POPUP_PAGE_SIZE;
    const page = popups.slice(start, start + POPUP_PAGE_SIZE);

    elements.popupListBody.innerHTML = page.map(p => {
      const title = escapeHtml(p.title || '—');
      const priority = formatPopupPriority(p.priority);
      const total = Number(p.total_recipients || 0);
      const ack = Number(p.acknowledged_count || 0);
      const unread = Number(p.pending_count || 0);
      const date = p.created_at ? new Date(p.created_at).toLocaleDateString('ru-RU') : '—';
      return `<tr data-id="${p.id}">
        <td>${title}</td>
        <td><span class="popup-priority-badge popup-priority-${p.priority || 'normal'}">${priority}</span></td>
        <td>${ack}/${total} <span class="popup-unread-count">(${unread})</span></td>
        <td>${date}</td>
        <td><button type="button" class="action-btn danger popup-delete-btn" data-id="${p.id}">Удалить</button></td>
      </tr>`;
    }).join('');

    renderPopupPagination(totalPages);
  } catch (e) {
    console.error('Failed to load popups:', e);
  }
}

function renderPopupPagination(totalPages) {
  if (!elements.popupListPagination || totalPages <= 1) {
    if (elements.popupListPagination) elements.popupListPagination.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 0; i < totalPages; i++) {
    const active = i === popupCurrentPage ? ' pagination-btn-active' : '';
    html += `<button type="button" class="pagination-btn${active}" data-page="${i}">${i + 1}</button>`;
  }
  elements.popupListPagination.innerHTML = html;
}

async function deletePopup(id) {
  if (!confirm('Удалить это уведомление? Все пользователи перестанут его видеть.')) return;
  try {
    await apiRequest(`/api/admin/notifications/popups/${id}`, { method: 'DELETE' });
    showToast('Уведомление удалено', 'success');
    await loadPopups();
    await loadNotifications();
  } catch (e) {
    showToast(e.message || 'Ошибка удаления', 'error');
  }
}

async function cleanupExpiredPopups() {
  try {
    const result = await apiRequest('/api/admin/notifications/cleanup-expired', { method: 'POST' });
    showToast(`Удалено: ${result.removedMessages || 0} истёкших уведомлений`, 'success');
    await loadPopups();
    await loadNotifications();
  } catch (e) {
    showToast(e.message || 'Ошибка очистки', 'error');
  }
}

// =====================================
// Рефералы
// =====================================

async function loadReferrals() {
  try {
    const settingsData = await apiRequest('/api/admin/referrals/settings');

    const s = settingsData.settings;
    if (elements.refEnabled) elements.refEnabled.checked = !!s.enabled;
    if (elements.refMinTopup) elements.refMinTopup.value = s.minTopup;
    if (elements.refInviterBonus) elements.refInviterBonus.value = s.inviterBonus;
    if (elements.refInviteeBonus) elements.refInviteeBonus.value = s.inviteeBonus;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadReferralUsers() {
  try {
    const data = await apiRequest('/api/admin/referrals/inviters?limit=200');
    renderReferralUsersTable(data.inviters || []);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderReferralUsersTable(rows) {
  const tbody = elements.referralUsersTable?.querySelector('tbody');
  if (!tbody) return;
  if (!rows.length) {
     tbody.innerHTML = '<tr><td colspan="5" class="table-empty-cell">Нет пользователей с рефералами</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(u => {
    const email = u.email ? escapeHtml(u.email) : '—';
    const code = u.referral_code ? escapeHtml(u.referral_code) : '—';
    return `
      <tr>
        <td>${email}</td>
         <td><code class="admin-code-inline">${code}</code></td>
        <td>${u.invited_count || 0}</td>
        <td>${Number(u.earned_as_inviter || 0).toFixed(2)}</td>
        <td>${Number(u.earned_as_invitee || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

// =====================================
// Промокоды
// =====================================

async function loadPromoCodes() {
  try {
    const data = await apiRequest('/api/admin/promocodes?limit=300');
    renderPromoCodesTable(data.promoCodes || []);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderPromoCodesTable(rows) {
  const tbody = elements.promoCodesTable?.querySelector('tbody');
  if (!tbody) return;
  if (!rows.length) {
     tbody.innerHTML = '<tr><td colspan="7" class="table-empty-cell">Промокоды не созданы</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(p => {
    const timeInfo = [];
    if (p.starts_at) timeInfo.push(`с ${formatDate(p.starts_at)}`);
    if (p.ends_at) timeInfo.push(`до ${formatDate(p.ends_at)}`);
    const timeBadge = timeInfo.length ? `<br><span class="promo-time-badge">${timeInfo.join(' ')}</span>` : '';
    return `
      <tr>
        <td>${p.id}</td>
        <td>${escapeHtml(p.code)}${timeBadge}</td>
        <td>${p.instant_grant ? 'мгновенный' : 'к пополнению'}</td>
        <td>${Number(p.reward_value || 0).toFixed(2)} ₽</td>
        <td>${p.used_count || 0}</td>
        <td>${p.is_active ? 'active' : 'inactive'}</td>
        <td>
          <div class="ctx-wrap" data-promo-ctx="${p.id}" data-active="${p.is_active ? 1 : 0}">
            <button class="ctx-btn" data-ctx-toggle>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
            <div class="ctx-menu">
              <button class="ctx-menu-item" data-promo-action="toggle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                ${p.is_active ? 'Отключить' : 'Включить'}
              </button>
              <div class="ctx-menu-sep"></div>
              <button class="ctx-menu-item danger" data-promo-action="delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m4 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                Удалить
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

if (elements.promoCodesTable) {
  elements.promoCodesTable.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-ctx-toggle]');
    if (toggleBtn) {
      const wrap = toggleBtn.closest('.ctx-wrap');
      const menu = wrap.querySelector('.ctx-menu');
      document.querySelectorAll('.ctx-wrap.open').forEach(w => {
        if (w !== wrap) w.classList.remove('open');
      });
      wrap.classList.toggle('open');
      if (wrap.classList.contains('open')) {
        const rect = toggleBtn.getBoundingClientRect();
        const menuH = menu.offsetHeight || 120;
        let top = rect.bottom + 2;
        if (top + menuH > window.innerHeight) {
          top = rect.top - menuH - 2;
        }
        menu.style.top = top + 'px';
        menu.style.left = Math.min(rect.left, window.innerWidth - 184) + 'px';
      }
      return;
    }

    const menuItem = e.target.closest('.ctx-menu-item');
    if (!menuItem) return;

    const wrap = menuItem.closest('.ctx-wrap');
    wrap.classList.remove('open');

    const promoId = wrap.dataset.promoCtx;
    const isActive = wrap.dataset.active === '1';
    const action = menuItem.dataset.promoAction;

    if (action === 'toggle') {
      apiRequest(`/api/admin/promocodes/${promoId}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !isActive })
      }).then(() => {
        showToast('Статус промокода обновлён', 'success');
        loadPromoCodes();
      }).catch((error) => {
        showToast(error.message, 'error');
      });
    }

    if (action === 'delete') {
      if (!confirm('Удалить промокод? Это действие необратимо.')) return;
      apiRequest(`/api/admin/promocodes/${promoId}`, { method: 'DELETE' })
        .then(() => {
          showToast('Промокод удалён', 'success');
          loadPromoCodes();
        }).catch((error) => {
          showToast(error.message, 'error');
        });
    }
  });
}

// Поиск и фильтры
elements.userSearch.addEventListener('input', debounce(loadUsers, 500));
elements.userFilter.addEventListener('change', loadUsers);

if (elements.selectAllUsers) {
  elements.selectAllUsers.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.users.forEach((user) => state.selectedUserIds.add(user.id));
    } else {
      state.selectedUserIds.clear();
    }
    renderUsersTable(state.users);
    renderUserBulkToolbar();
  });
}

if (elements.bulkClearBtn) {
  elements.bulkClearBtn.addEventListener('click', () => {
    state.selectedUserIds.clear();
    renderUsersTable(state.users);
    renderUserBulkToolbar();
  });
}

if (elements.bulkBalanceBtn) {
  elements.bulkBalanceBtn.addEventListener('click', () => {
    const selected = getSelectedUsers();
    if (!selected.length) return;
    openBalanceModal(selected.map((user) => user.id));
  });
}

if (elements.bulkSubscriptionBtn) {
  elements.bulkSubscriptionBtn.addEventListener('click', () => {
    const selected = getSelectedUsers();
    if (!selected.length) return;
    openSubscriptionModal(selected.map((user) => user.id));
  });
}

// Закрытие модальных окон
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) {
      modal.classList.remove('active');
      if (modal === elements.balanceModal) closeBalanceModal();
      if (modal === elements.subscriptionModal) closeSubscriptionModal();
      if (modal === testModal) closeTestModal();
    }
  });
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      if (modal === elements.balanceModal) closeBalanceModal();
      if (modal === elements.subscriptionModal) closeSubscriptionModal();
      if (modal === testModal) closeTestModal();
    }
  });
});

// Контекстное меню пользователей
elements.usersTable.addEventListener('click', (e) => {
  const checkbox = e.target.closest('[data-user-checkbox]');
  if (checkbox) {
    const userId = checkbox.dataset.userCheckbox;
    const shouldSelect = checkbox.checked;
    if (e.shiftKey && state.userRowSelection.anchorUserId) {
      setUserRangeSelected(state.userRowSelection.anchorUserId, userId, shouldSelect);
    } else {
      setUserRowSelected(userId, shouldSelect);
    }
    state.userRowSelection.anchorUserId = userId;
    renderUsersTable(state.users);
    renderUserBulkToolbar();
    return;
  }

  const toggleBtn = e.target.closest('[data-ctx-toggle]');
  if (toggleBtn) {
    const wrap = toggleBtn.closest('.ctx-wrap');
    const menu = wrap.querySelector('.ctx-menu');
    document.querySelectorAll('.ctx-wrap.open').forEach(w => {
      if (w !== wrap) w.classList.remove('open');
    });
    wrap.classList.toggle('open');
    if (wrap.classList.contains('open')) {
      const rect = toggleBtn.getBoundingClientRect();
      const menuH = menu.offsetHeight || 200;
      let top = rect.bottom + 2;
      if (top + menuH > window.innerHeight) {
        top = rect.top - menuH - 2;
      }
      menu.style.top = top + 'px';
      menu.style.left = Math.min(rect.left, window.innerWidth - 184) + 'px';
    }
    return;
  }
});

elements.usersTable.addEventListener('mousedown', (e) => {
  const row = e.target.closest('[data-user-row]');
  if (!row || e.button !== 0 || e.target.closest('[data-ctx-toggle], .ctx-menu, .ctx-menu-item, [data-user-checkbox]')) return;
  e.preventDefault();
  const userId = row.dataset.userRow;
  state.userRowSelection.mouseDown = true;
  document.body.classList.add('user-selecting');

  if (e.shiftKey && state.userRowSelection.anchorUserId) {
    const shouldSelect = !state.selectedUserIds.has(userId);
    state.userRowSelection.targetState = shouldSelect;
    setUserRangeSelected(state.userRowSelection.anchorUserId, userId, shouldSelect);
    state.userRowSelection.anchorUserId = userId;
    renderUsersTable(state.users);
    renderUserBulkToolbar();
    return;
  }

  const shouldSelect = !state.selectedUserIds.has(userId);
  state.userRowSelection.targetState = shouldSelect;
  state.userRowSelection.anchorUserId = userId;
  setUserRowSelected(userId, shouldSelect);
  paintUserRowSelection(row, shouldSelect);
  renderUserBulkToolbar();
});

elements.usersTable.addEventListener('mouseover', (e) => {
  if (!state.userRowSelection.mouseDown) return;
  const row = e.target.closest('[data-user-row]');
  if (!row) return;
  const userId = row.dataset.userRow;

  if (e.shiftKey && state.userRowSelection.anchorUserId) {
    setUserRangeSelected(state.userRowSelection.anchorUserId, userId, !!state.userRowSelection.targetState);
    renderUsersTable(state.users);
    renderUserBulkToolbar();
    return;
  }

  const targetSelected = !!state.userRowSelection.targetState;
  const isAlreadySelected = state.selectedUserIds.has(userId);
  if (isAlreadySelected === targetSelected) return;
  setUserRowSelected(userId, targetSelected);
  row.classList.add('user-row-selecting');
  paintUserRowSelection(row, targetSelected);
  renderUserBulkToolbar();
});

document.addEventListener('mouseup', () => {
  if (!state.userRowSelection.mouseDown) return;
  state.userRowSelection.mouseDown = false;
  state.userRowSelection.targetState = null;
  document.body.classList.remove('user-selecting');
  elements.usersTable.querySelectorAll('.user-row-selecting').forEach((row) => row.classList.remove('user-row-selecting'));
});

document.addEventListener('selectstart', (e) => {
  if (!state.userRowSelection.mouseDown) return;
  e.preventDefault();
});

document.addEventListener('click', async (e) => {
  if (!e.target.closest('.user-multiselect') && elements.notifUsersSelect) {
    elements.notifUsersSelect.classList.remove('open');
  }

  if (!e.target.closest('.ctx-wrap') && !e.target.closest('.ctx-menu')) {
    document.querySelectorAll('.ctx-wrap.open').forEach(w => w.classList.remove('open'));
    return;
  }

  const menuItem = e.target.closest('.ctx-menu-item');
  if (!menuItem) return;

  const wrap = menuItem.closest('.ctx-wrap');
  wrap.classList.remove('open');

  const action = menuItem.dataset.action;
  const userId = menuItem.dataset.userId;

  if (action === 'uuid') {
    const uuid = menuItem.dataset.uuid;
    navigator.clipboard.writeText(uuid).then(() => {
      showToast(`UUID скопирован: ${uuid}`, 'success');
    }).catch(() => {
      showToast(uuid, 'info');
    });
    return;
  }
  if (action === 'balance') { openBalanceModal(userId); return; }
  if (action === 'unlimited-balance') {
    const isUnlimited = menuItem.dataset.unlimited === '1';
    if (!confirm(`${isUnlimited ? 'Отключить' : 'Включить'} безлимитный баланс для пользователя?`)) return;
    try {
      const data = await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/unlimited-balance`, {
        method: 'PUT',
        body: JSON.stringify({ unlimitedBalance: !isUnlimited })
      });
      showToast(data.message, 'success');
      await loadUsers();
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }
  if (action === 'add-to-group') {
    openGroupSelectModal(userId);
    return;
  }
  if (action === 'subscription') { openSubscriptionModal(userId); return; }
  if (action === 'test') { openSubscriptionTestModal(userId); return; }
  if (action === 'delete') { deleteUser(userId); return; }
});

// =====================================
// Утилиты
// =====================================

async function loadGroups() {
  try {
    const data = await apiRequest('/api/admin/groups');
    state.groups = Array.isArray(data.groups) ? data.groups : (Array.isArray(data) ? data : []);
    renderGroupsTable(state.groups);
  } catch (error) {
    showToast('Ошибка загрузки групп', 'error');
  }
}

function renderGroupsTable(groups) {
  if (!elements.groupsTable) return;
  const tbody = elements.groupsTable.querySelector('tbody');
  if (!tbody) return;
  const list = Array.isArray(groups) ? groups : [];

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty-cell">Группы не созданы</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(g => `
    <tr>
      <td>${g.id}</td>
      <td><span class="user-group-badge" style="background:${escapeHtml(g.color || '#888')};color:#fff;">${escapeHtml(g.name)}</span></td>
      <td><span class="color-swatch" style="background:${escapeHtml(g.color || '#888')};"></span> ${escapeHtml(g.color || '#888')}</td>
      <td>${g.member_count || 0}</td>
      <td>
        <div class="ctx-wrap" data-group-ctx="${g.id}">
          <button class="ctx-btn" data-ctx-toggle>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
          <div class="ctx-menu">
            <button class="ctx-menu-item" data-group-action="rename">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Переименовать
            </button>
            <div class="ctx-menu-sep"></div>
            <button class="ctx-menu-item danger" data-group-action="delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m4 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
              Удалить
            </button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-ctx-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = btn.closest('.ctx-wrap');
      const menu = wrap.querySelector('.ctx-menu');
      document.querySelectorAll('.ctx-wrap.open').forEach(w => { if (w !== wrap) w.classList.remove('open'); });
      wrap.classList.toggle('open');
      const rect = btn.getBoundingClientRect();
      menu.style.top = rect.bottom + 4 + 'px';
      menu.style.left = rect.left + 'px';
    });
  });

  tbody.querySelectorAll('[data-group-action]').forEach(item => {
    item.addEventListener('click', async () => {
      const wrap = item.closest('.ctx-wrap');
      const groupId = wrap.dataset.groupCtx;
      wrap.classList.remove('open');
      const action = item.dataset.groupAction;

      if (action === 'rename') {
        const group = state.groups.find(g => g.id == groupId);
        if (!group) return;
        const newName = prompt('Новое название группы:', group.name);
        if (!newName || !newName.trim()) return;
        const newColor = prompt('Новый цвет (HEX):', group.color || '#888888');
        try {
          await apiRequest(`/api/admin/groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName.trim(), color: newColor || group.color })
          });
          showToast('Группа обновлена', 'success');
          await loadGroups();
        } catch (error) {
          showToast(error.message, 'error');
        }
      } else if (action === 'delete') {
        if (!confirm('Удалить группу?')) return;
        try {
          await apiRequest(`/api/admin/groups/${groupId}`, { method: 'DELETE' });
          showToast('Группа удалена', 'success');
          await loadGroups();
        } catch (error) {
          showToast(error.message, 'error');
        }
      }
    });
  });
}

if (elements.groupCreateForm) {
  elements.groupCreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elements.groupName?.value?.trim();
    const color = elements.groupColor?.value || '#888888';
    if (!name) { showToast('Введите название группы', 'error'); return; }
    try {
      await apiRequest('/api/admin/groups', {
        method: 'POST',
        body: JSON.stringify({ name, color })
      });
      showToast('Группа создана', 'success');
      elements.groupCreateForm.reset();
      await loadGroups();
      if (state.currentPage === 'users') await loadUsers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function openGroupSelectModal(userId) {
  const groups = state.groups || [];
  if (!groups.length) {
    showToast('Нет групп. Создайте группу, нажав кнопку «Создать группу»', 'info');
    return;
  }
  state.selectedGroupId = null;
  elements.groupSelectUserId.value = userId;
  elements.groupSelectConfirm.disabled = true;
  elements.groupSelectList.innerHTML = groups.map(g => `
    <div class="group-select-item" data-group-id="${g.id}">
      <span class="group-select-swatch" style="background:${escapeHtml(g.color || '#888')};"></span>
      <span class="group-select-name">${escapeHtml(g.name)}</span>
      <span class="group-select-count">${g.member_count || 0} чел.</span>
    </div>
  `).join('');

  elements.groupSelectList.querySelectorAll('.group-select-item').forEach(item => {
    item.addEventListener('click', () => {
      elements.groupSelectList.querySelectorAll('.group-select-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      state.selectedGroupId = item.dataset.groupId;
      elements.groupSelectConfirm.disabled = false;
    });
  });

  elements.groupSelectModal.classList.add('active');
}

elements.groupSelectConfirm?.addEventListener('click', async () => {
  const userId = elements.groupSelectUserId.value;
  const groupId = state.selectedGroupId;
  if (!userId || !groupId) return;
  try {
    await apiRequest(`/api/admin/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds: [userId] })
    });
    showToast('Пользователь добавлен в группу', 'success');
    elements.groupSelectModal.classList.remove('active');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

if (elements.openGroupCreateModal) {
  elements.openGroupCreateModal.addEventListener('click', () => {
    if (elements.groupCreateModalName) elements.groupCreateModalName.value = '';
    if (elements.groupCreateModalColor) elements.groupCreateModalColor.value = '#888888';
    elements.groupCreateModal.classList.add('active');
  });
}

if (elements.groupCreateModalForm) {
  elements.groupCreateModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elements.groupCreateModalName?.value?.trim();
    const color = elements.groupCreateModalColor?.value || '#888888';
    if (!name) { showToast('Введите название группы', 'error'); return; }
    try {
      await apiRequest('/api/admin/groups', {
        method: 'POST',
        body: JSON.stringify({ name, color })
      });
      showToast('Группа создана', 'success');
      elements.groupCreateModalForm.reset();
      elements.groupCreateModal.classList.remove('active');
      await loadGroups();
      await loadUsers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// =====================================
// Инициализация
// =====================================

async function init() {
  // Проверяем права администратора
  const isAuthorized = await checkAuth();
  if (!isAuthorized) return;

  document.body.classList.remove('admin-auth-pending');

  // Загружаем дашборд
  await navigateTo('dashboard');
}

init();
