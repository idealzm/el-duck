// EL-DUCK VPN Admin Login
// =====================================

const API_URL = '';

// DOM элементы
const elements = {
  loginForm: document.getElementById('loginForm'),
  emailInput: document.getElementById('email'),
  passwordInput: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
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

function showLoading(btn, isLoading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  if (text) { if (isLoading) text.classList.add('hidden'); else text.classList.remove('hidden'); }
  if (loader) { if (isLoading) loader.classList.remove('hidden'); else loader.classList.add('hidden'); }
  btn.disabled = isLoading;
}

// =====================================
// API запросы
// =====================================

async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'same-origin',
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Ошибка запроса');
  }

  return data;
}

// =====================================
// Авторизация
// =====================================

async function login(email, password) {
  try {
    const response = await apiRequest('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return response;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

async function checkAdminAccess() {
  try {
    const response = await apiRequest('/api/admin/auth/me');
    return response.success;
  } catch (error) {
    return false;
  }
}

// =====================================
// События
// =====================================

elements.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = elements.emailInput.value.trim().toLowerCase();
  const password = elements.passwordInput.value;

  if (!email) {
    showToast('Введите email', 'error');
    return;
  }
  
  if (!password) {
    showToast('Введите пароль', 'error');
    return;
  }
  
  showLoading(elements.loginBtn, true);
  
  try {
    await login(email, password);
    
    // Проверяем права администратора
    const isAdmin = await checkAdminAccess();
    
    if (!isAdmin) {
      showToast('Ошибка проверки прав', 'error');
      return;
    }
    
    // Перенаправляем в админ-панель
    window.location.href = '/admin';
  } catch (error) {
    // Ошибка уже показана
  } finally {
    showLoading(elements.loginBtn, false);
  }
});

// =====================================
// Проверка авторизации
// =====================================

async function init() {
  const isAdmin = await checkAdminAccess();
  if (isAdmin) {
    window.location.href = '/admin';
  }
}

init();
