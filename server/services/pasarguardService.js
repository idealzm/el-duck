const axios = require('axios');
const https = require('https');
const config = require('../config/env');

class PasarguardService {
  constructor() {
    this.token = null;
    this.tokenExpMs = 0;
    this._httpsAgent = null;
  }

  getHttpsAgent() {
    if (this._httpsAgent) return this._httpsAgent;
    if (config.pasarguard?.skipTls) {
      this._httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    return this._httpsAgent;
  }

  getBaseUrl() {
    return String(config.pasarguard?.baseUrl || '').replace(/\/$/, '');
  }

  ensureConfig() {
    const baseUrl = this.getBaseUrl();
    const username = String(config.pasarguard?.adminUsername || '').trim();
    const password = String(config.pasarguard?.adminPassword || '').trim();
    if (!baseUrl || !username || !password) {
      throw new Error('PasarGuard не настроен: заполните PASARGUARD_BASE_URL, PASARGUARD_ADMIN_USERNAME и PASARGUARD_ADMIN_PASSWORD');
    }
    return { baseUrl, username, password };
  }

  buildAbsoluteSubscriptionUrl(url) {
    const value = String(url || '').trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${this.getBaseUrl()}${value}`;
    return `${this.getBaseUrl()}/${value}`;
  }

  async getAdminToken(force = false) {
    const now = Date.now();
    if (!force && this.token && now < this.tokenExpMs - 15000) {
      return this.token;
    }

    const { baseUrl, username, password } = this.ensureConfig();
    const payload = new URLSearchParams();
    payload.set('username', username);
    payload.set('password', password);

    const response = await axios.post(`${baseUrl}/api/admin/token`, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      httpsAgent: this.getHttpsAgent()
    });

    const token = String(response?.data?.access_token || '').trim();
    if (!token) {
      throw new Error('PasarGuard не вернул access_token');
    }

    this.token = token;
    const exp = Number(response?.data?.expires_at || 0);
    this.tokenExpMs = Number.isFinite(exp) && exp > 0 ? exp * 1000 : now + 30 * 60 * 1000;
    return this.token;
  }

  async request(method, path, { params, data, headers } = {}) {
    const { baseUrl } = this.ensureConfig();
    let token = await this.getAdminToken(false);
    const httpsAgent = this.getHttpsAgent();

    const send = async () => axios({
      method,
      url: `${baseUrl}${path}`,
      params,
      data,
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${token}`,
        ...headers
      },
      ...(httpsAgent ? { httpsAgent } : {})
    });

    try {
      const response = await send();
      return response.data;
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if (status === 401 || status === 403) {
        token = await this.getAdminToken(true);
        const retry = await send();
        return retry.data;
      }
      const detail = error?.response?.data?.detail || error?.message || 'PasarGuard request failed';
      throw new Error(String(detail));
    }
  }

  async listUserTemplatesSimple() {
    const data = await this.request('GET', '/api/user_templates/simple', { params: { all: true } });
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.users)) return data.users;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.templates)) return data.templates;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }

  async getUser(username) {
    return this.request('GET', `/api/user/${encodeURIComponent(username)}`);
  }

  async createUserFromTemplate({ username, userTemplateId, note }) {
    return this.request('POST', '/api/user/from_template', {
      data: {
        user_template_id: Number(userTemplateId),
        username,
        ...(note ? { note } : {})
      },
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async setUserStatus(username, status) {
    return this.request('PUT', `/api/user/${encodeURIComponent(username)}`, {
      data: { status },
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async deleteUser(username) {
    return this.request('DELETE', `/api/user/${encodeURIComponent(username)}`);
  }
}

module.exports = new PasarguardService();
