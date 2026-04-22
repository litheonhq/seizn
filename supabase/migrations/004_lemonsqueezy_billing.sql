-- Seizn AI Memory Server - Lemon Squeezy Billing Support
-- Migration to add Lemon Squeezy billing columns to profiles

-- Add Lemon Squeezy columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS lemonsqueezy_customer_id INTEGER,
ADD COLUMN IF NOT EXISTS lemonsqueezy_subscription_id INTEGER,
ADD COLUMN IF NOT EXISTS plan_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_cancelled BOOLEAN DEFAULT false;

-- Index for quick customer lookup
CREATE INDEX IF NOT EXISTS idx_profiles_lemonsqueezy_customer
    ON profiles(lemonsqueezy_customer_id)
    WHERE lemonsqueezy_customer_id IS NOT NULL;

-- Update plan limits when plan changes
CREATE OR REPLACE FUNCTION update_plan_limits()
RETURNS TRIGGER AS $$
BEGIN
    -- Update limits based on plan
    CASE NEW.plan
        WHEN 'free' THEN
            NEW.memory_limit := 10000;
            NEW.api_calls_limit := 1000;
        WHEN 'plus' THEN
            NEW.memory_limit := 50000;
            NEW.api_calls_limit := 10000;
        WHEN 'pro' THEN
            NEW.memory_limit := 200000;
            NEW.api_calls_limit := 50000;
        WHEN 'enterprise' THEN
            NEW.memory_limit := -1;  -- Unlimited
            NEW.api_calls_limit := -1;  -- Unlimited
        ELSE
            -- Default to free limits
            NEW.memory_limit := 10000;
            NEW.api_calls_limit := 1000;
    END CASE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update limits when plan changes
DROP TRIGGER IF EXISTS on_plan_change ON profiles;
CREATE TRIGGER on_plan_change
    BEFORE UPDATE OF plan ON profiles
    FOR EACH ROW
    WHEN (OLD.plan IS DISTINCT FROM NEW.plan)
    EXECUTE FUNCTION update_plan_limits();

-- Also apply on insert
DROP TRIGGER IF EXISTS on_plan_set ON profiles;
CREATE TRIGGER on_plan_set
    BEFORE INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_plan_limits();

-- Allow service role to update profiles (for webhook)
DROP POLICY IF EXISTS "Service role can update profiles" ON profiles;
CREATE POLICY "Service role can update profiles" ON profiles
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

COMMENT ON COLUMN profiles.lemonsqueezy_customer_id IS 'Lemon Squeezy customer ID for billing';
COMMENT ON COLUMN profiles.lemonsqueezy_subscription_id IS 'Lemon Squeezy subscription ID';
COMMENT ON COLUMN profiles.plan_updated_at IS 'When the plan was last changed';
COMMENT ON COLUMN profiles.subscription_ends_at IS 'When the current subscription period ends';
COMMENT ON COLUMN profiles.subscription_renews_at IS 'When the subscription will auto-renew';
COMMENT ON COLUMN profiles.subscription_cancelled IS 'Whether user has cancelled (still has access until period ends)';
