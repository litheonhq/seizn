-- Seizn AI Memory Server - Paddle Billing Support
-- Migration to add Paddle billing columns to profiles
-- Note: This replaces Lemon Squeezy as the primary payment processor.
--       Lemon Squeezy columns (lemonsqueezy_customer_id, lemonsqueezy_subscription_id)
--       are kept for backward compatibility and historical data.

-- Add Paddle columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT;

-- Index for quick Paddle customer lookup
CREATE INDEX IF NOT EXISTS idx_profiles_paddle_customer
    ON profiles(paddle_customer_id)
    WHERE paddle_customer_id IS NOT NULL;

-- Index for quick Paddle subscription lookup
CREATE INDEX IF NOT EXISTS idx_profiles_paddle_subscription
    ON profiles(paddle_subscription_id)
    WHERE paddle_subscription_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.paddle_customer_id IS 'Paddle customer ID for billing (e.g., ctm_01h844p3h41s12zs5mn4axja51). Primary payment processor as of 2026-01.';
COMMENT ON COLUMN profiles.paddle_subscription_id IS 'Paddle subscription ID (e.g., sub_01h8441jqv1vcsj1rw78wtqk9r). Links to active subscription in Paddle.';

-- Note: The existing update_plan_limits() trigger from migration 004
-- continues to work as it only watches the 'plan' column.
-- Paddle webhooks should update the 'plan' column to trigger limit updates.
