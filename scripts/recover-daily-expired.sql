-- Recover wrongly expired daily subscriptions.
--
-- What it does:
-- 1) Finds expired subscriptions with daily_rate.
-- 2) Excludes clearly intentional expirations:
--    - pauseReason = cancelled
--    - pauseReason = insufficient_funds
-- 3) Restores status=active and moves charge window to now + 1 day.

BEGIN;

UPDATE subscriptions
SET
  status = 'active',
  expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 day'),
  next_charge_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 day')
WHERE status = 'expired'
  AND daily_rate IS NOT NULL
  AND (
    config_data IS NULL
    OR TRIM(config_data) = ''
    OR (
      json_valid(config_data) = 1
      AND COALESCE(json_extract(config_data, '$.pauseReason'), '') NOT IN ('cancelled', 'insufficient_funds')
    )
    OR (
      json_valid(config_data) = 0
      AND config_data NOT LIKE '%"pauseReason":"cancelled"%'
      AND config_data NOT LIKE '%"pauseReason":"insufficient_funds"%'
    )
  );

SELECT changes() AS recovered_rows;

COMMIT;
