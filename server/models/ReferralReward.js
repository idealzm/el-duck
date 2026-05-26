const { db } = require('../config/database');

class ReferralReward {
  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO referral_rewards (
        inviter_user_id,
        invitee_user_id,
        payment_id,
        reward_for,
        reward_type,
        reward_value,
        bonus_amount,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
    `);
    return stmt.run(
      data.inviterUserId,
      data.inviteeUserId,
      data.paymentId,
      data.rewardFor,
      data.rewardType,
      data.rewardValue,
      data.bonusAmount
    );
  }

  static getStats() {
    return db.prepare(`
      SELECT
        COUNT(*) as totalRewards,
        COALESCE(SUM(CASE WHEN reward_for = 'inviter' THEN bonus_amount ELSE 0 END), 0) as totalInviterBonus,
        COALESCE(SUM(CASE WHEN reward_for = 'invitee' THEN bonus_amount ELSE 0 END), 0) as totalInviteeBonus,
        COUNT(DISTINCT invitee_user_id) as totalReferrals
      FROM referral_rewards
      WHERE status = 'completed'
    `).get();
  }

  static getRecent(limit = 200, offset = 0) {
    return db.prepare(`
      SELECT
        rr.*,
        inviter.email as inviter_email,
        invitee.email as invitee_email
      FROM referral_rewards rr
      JOIN users inviter ON inviter.id = rr.inviter_user_id
      JOIN users invitee ON invitee.id = rr.invitee_user_id
      ORDER BY rr.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  static getUserSummary(userId) {
    return db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN reward_for = 'inviter' AND inviter_user_id = ? THEN bonus_amount ELSE 0 END), 0) as earnedAsInviter,
        COALESCE(SUM(CASE WHEN reward_for = 'invitee' AND invitee_user_id = ? THEN bonus_amount ELSE 0 END), 0) as earnedAsInvitee,
        COUNT(DISTINCT CASE WHEN reward_for = 'inviter' AND inviter_user_id = ? THEN invitee_user_id END) as invitedUsers
      FROM referral_rewards
      WHERE status = 'completed' AND (inviter_user_id = ? OR invitee_user_id = ?)
    `).get(userId, userId, userId, userId, userId);
  }

  static getTopInviters(limit = 100) {
    return db.prepare(`
      SELECT
        u.id,
        u.email,
        u.referral_code,
        COUNT(DISTINCT rr.invitee_user_id) as invited_count,
        COALESCE(SUM(CASE WHEN rr.reward_for = 'inviter' THEN rr.bonus_amount ELSE 0 END), 0) as earned_as_inviter,
        COALESCE(SUM(CASE WHEN rr.reward_for = 'invitee' THEN rr.bonus_amount ELSE 0 END), 0) as earned_as_invitee
      FROM users u
      INNER JOIN referral_rewards rr ON rr.inviter_user_id = u.id AND rr.status = 'completed'
      WHERE u.referral_code IS NOT NULL
      GROUP BY u.id
      ORDER BY invited_count DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = ReferralReward;
