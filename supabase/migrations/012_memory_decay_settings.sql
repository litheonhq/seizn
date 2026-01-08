-- Memory Decay Settings per Plan
-- Free: 60 days, Plus: 120 days, Pro/Enterprise: configurable (can disable)

-- Add decay settings to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS memory_decay_enabled BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS memory_decay_days INTEGER;

-- Set default decay days based on plan (NULL means use plan default)
COMMENT ON COLUMN profiles.memory_decay_enabled IS 'Pro+ only: can disable memory decay';
COMMENT ON COLUMN profiles.memory_decay_days IS 'Custom decay days (NULL = use plan default)';

-- Function to get decay days for a user based on plan
CREATE OR REPLACE FUNCTION get_memory_decay_days(user_plan TEXT, custom_days INTEGER, decay_enabled BOOLEAN)
RETURNS INTEGER AS $$
BEGIN
  -- Pro/Enterprise can disable decay
  IF user_plan IN ('pro', 'enterprise') AND decay_enabled = false THEN
    RETURN NULL;  -- NULL means no decay
  END IF;

  -- Custom days override (Pro+ only)
  IF user_plan IN ('pro', 'enterprise') AND custom_days IS NOT NULL THEN
    RETURN custom_days;
  END IF;

  -- Plan defaults
  CASE user_plan
    WHEN 'free' THEN RETURN 60;
    WHEN 'plus' THEN RETURN 120;
    WHEN 'pro' THEN RETURN 180;      -- Default for Pro if enabled
    WHEN 'enterprise' THEN RETURN 365;  -- Default for Enterprise if enabled
    ELSE RETURN 60;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- View to easily check user decay settings
CREATE OR REPLACE VIEW user_decay_settings AS
SELECT
  p.id as user_id,
  p.plan,
  p.memory_decay_enabled,
  p.memory_decay_days as custom_days,
  get_memory_decay_days(p.plan, p.memory_decay_days, p.memory_decay_enabled) as effective_decay_days
FROM profiles p;

COMMENT ON VIEW user_decay_settings IS 'Shows effective memory decay settings per user';
