const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Setting = require('../models/Setting');
const pasarguardService = require('./pasarguardService');

class VpnProvisioningService {
  parseConfigData(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  getDefaultTemplateId() {
    const raw = Setting.get('pasarguard_default_template_id');
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  buildUsername(userUuid) {
    const compact = String(userUuid || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const body = (compact || 'user').slice(0, 29);
    return `u_${body}`;
  }

  makeResource({ username, subscriptionLink }) {
    return {
      key: 'pasarguard:main',
      protocol: 'subscription',
      title: 'VPN',
      description: 'Единая ссылка для всех конфигов',
      username,
      subscriptionLink: subscriptionLink || null
    };
  }

  toProtocolApiItem(resource) {
    return {
      key: resource.key,
      protocol: resource.protocol,
      title: resource.title,
      description: resource.description,
      subscriptionLink: resource.subscriptionLink
    };
  }

  pickPrimarySubscriptionLink(resources = []) {
    for (const item of Array.isArray(resources) ? resources : []) {
      const link = String(item?.subscriptionLink || '').trim();
      if (link) return link;
    }
    return null;
  }

  buildResponsePayload(configData) {
    const resources = Array.isArray(configData?.resources) ? configData.resources : [];
    return {
      configData,
      subscriptionLink: this.pickPrimarySubscriptionLink(resources),
      protocols: resources.map((item) => this.toProtocolApiItem(item))
    };
  }

  parseLegacyResources(configData) {
    if (!configData || typeof configData !== 'object') return [];
    const resources = [];
    if (configData?.vless?.subscriptionLink) {
      resources.push({
        key: 'legacy:vless',
        protocol: 'vless',
        title: 'VPN',
        description: 'Legacy конфиг',
        username: null,
        subscriptionLink: configData.vless.subscriptionLink
      });
    }
    return resources;
  }

  async ensurePasarguardUser({ username, templateId, note }) {
    let user = null;
    try {
      user = await pasarguardService.getUser(username);
    } catch (_) {
      user = null;
    }

    if (!user) {
      const created = await pasarguardService.createUserFromTemplate({
        username,
        userTemplateId: templateId,
        note
      });
      const subscriptionLink = pasarguardService.buildAbsoluteSubscriptionUrl(created?.subscription_url);
      return {
        username,
        existing: false,
        subscriptionLink
      };
    }

    const rawLink = user?.subscription_url || user?.subscriptionLink || null;
    const subscriptionLink = pasarguardService.buildAbsoluteSubscriptionUrl(rawLink);
    return {
      username,
      existing: true,
      status: String(user?.status || '').toLowerCase(),
      subscriptionLink
    };
  }

  async provisionForUser(user, existingConfigData = null) {
    const userUuid = user.user_uuid || User.ensureUuid(user.id);
    const username = this.buildUsername(userUuid);
    const templateId = this.getDefaultTemplateId();
    if (!templateId) {
      throw new Error('Не выбран шаблон PasarGuard в настройках админ-панели');
    }

    const existing = this.parseConfigData(existingConfigData) || {};
    const existingResources = Array.isArray(existing.resources) ? existing.resources : this.parseLegacyResources(existing);
    const previousResource = existingResources[0] || null;
    const note = previousResource?.note || `EL-DUCK: ${String(user.email || `user-${user.id}`)}`;

    const ensured = await this.ensurePasarguardUser({ username, templateId, note });
    if (ensured.status === 'disabled') {
      await pasarguardService.setUserStatus(username, 'active');
    }

    const resource = this.makeResource({
      username,
      subscriptionLink: ensured.subscriptionLink || previousResource?.subscriptionLink || null
    });

    const configData = {
      provider: 'pasarguard',
      resources: [resource],
      subscriptionLink: resource.subscriptionLink,
      username,
      pausedAt: null,
      deleteAfter: null,
      pauseReason: null,
      updatedAt: new Date().toISOString()
    };

    return {
      configData,
      createdResources: ensured.existing ? [] : [{ username }],
      protocols: [this.toProtocolApiItem(resource)]
    };
  }

  async ensureProvisionedForSubscription(subscription, user) {
    const provisioned = await this.provisionForUser(user, subscription?.config_data);
    Subscription.update(subscription.id, { config_data: provisioned.configData });
    return provisioned;
  }

  async disconnectSubscriptionResources(subscriptionOrConfig, { mode = 'delete' } = {}) {
    const configData = subscriptionOrConfig?.config_data
      ? this.parseConfigData(subscriptionOrConfig.config_data)
      : this.parseConfigData(subscriptionOrConfig);
    if (!configData) return;

    const resources = Array.isArray(configData.resources)
      ? configData.resources
      : this.parseLegacyResources(configData);

    for (const item of resources) {
      const username = String(item?.username || '').trim();
      if (!username) continue;
      if (mode === 'pause') {
        await pasarguardService.setUserStatus(username, 'disabled').catch(() => {});
      } else {
        await pasarguardService.deleteUser(username).catch(() => {});
      }
    }
  }

  async unpauseSubscriptionResources(subscriptionOrConfig) {
    const configData = subscriptionOrConfig?.config_data
      ? this.parseConfigData(subscriptionOrConfig.config_data)
      : this.parseConfigData(subscriptionOrConfig);
    if (!configData) return;

    const resources = Array.isArray(configData.resources)
      ? configData.resources
      : this.parseLegacyResources(configData);

    for (const item of resources) {
      const username = String(item?.username || '').trim();
      if (!username) continue;
      await pasarguardService.setUserStatus(username, 'active').catch(() => {});
    }
  }

  async getUserProtocols(subscription, user) {
    const configData = this.parseConfigData(subscription?.config_data);
    if (!configData || String(configData.provider || '').toLowerCase() !== 'pasarguard') {
      const reprovisioned = await this.ensureProvisionedForSubscription(subscription, user);
      return this.buildResponsePayload(reprovisioned.configData);
    }

    const resources = Array.isArray(configData.resources) ? configData.resources : [];
    const main = resources[0] || null;
    const username = String(main?.username || configData.username || '').trim();
    if (!username) {
      const reprovisioned = await this.ensureProvisionedForSubscription(subscription, user);
      return this.buildResponsePayload(reprovisioned.configData);
    }

    let pgUser = null;
    try {
      pgUser = await pasarguardService.getUser(username);
    } catch (_) {
      pgUser = null;
    }

    const refreshedLink = pasarguardService.buildAbsoluteSubscriptionUrl(
      pgUser?.subscription_url || main?.subscriptionLink || configData.subscriptionLink
    );
    if (refreshedLink && refreshedLink !== main.subscriptionLink) {
      main.subscriptionLink = refreshedLink;
      configData.subscriptionLink = refreshedLink;
      configData.updatedAt = new Date().toISOString();
      Subscription.update(subscription.id, { config_data: configData });
    }

    return this.buildResponsePayload(configData);
  }
}

module.exports = new VpnProvisioningService();
