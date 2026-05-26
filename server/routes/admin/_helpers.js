const User = require('../../models/User');
const { fail } = require('../../utils/httpResponse');
const AppError = require('../../utils/AppError');

function getUserByPublicId(publicId) {
  return User.getByPublicId(publicId);
}

function toPublicUser(user, subscriptions = []) {
  return {
    id: user.user_uuid || User.ensureUuid(user.id),
    email: user.email,
    balance: user.balance,
    unlimitedBalance: !!user.unlimited_balance,
    groups: User.getGroups(user.id),
    referralCode: User.ensureReferralCode(user.id),
    referredByUserId: user.referred_by_user_id || null,
    referredAt: user.referred_at || null,
    createdAt: user.created_at,
    subscriptions
  };
}

function parsePaging(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function failFromError(res, error, defaultMessage) {
  if (error instanceof AppError) {
    return fail(res, error.message, error.statusCode);
  }
  return fail(res, defaultMessage, 500);
}

module.exports = {
  getUserByPublicId,
  toPublicUser,
  parsePaging,
  failFromError
};
