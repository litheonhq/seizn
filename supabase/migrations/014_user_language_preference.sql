-- Add language preference to profiles
-- Supports: en (English), ko (Korean), ja (Japanese)

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'
CHECK (language IN ('en', 'ko', 'ja'));

COMMENT ON COLUMN profiles.language IS 'User language preference for UI';
