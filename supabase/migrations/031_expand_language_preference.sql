-- Add language column to profiles with support for all 18 locales
-- This replaces the original migration 014 which only supported en/ko/ja

-- Add language column if not exists
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Drop old constraint if exists (from migration 014)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_language_check;

-- Add new constraint with all 18 supported languages
ALTER TABLE profiles
ADD CONSTRAINT profiles_language_check
CHECK (language IN (
  'en',       -- English
  'ko',       -- Korean
  'ja',       -- Japanese
  'zh-hans',  -- Simplified Chinese
  'zh-hant',  -- Traditional Chinese
  'es',       -- Spanish
  'ru',       -- Russian
  'uk',       -- Ukrainian
  'he',       -- Hebrew
  'ar',       -- Arabic
  'fr',       -- French
  'de',       -- German
  'sv',       -- Swedish
  'nl',       -- Dutch
  'vi',       -- Vietnamese
  'pl',       -- Polish
  'pt-BR',    -- Brazilian Portuguese
  'pt-PT'     -- European Portuguese
));

COMMENT ON COLUMN profiles.language IS 'User language preference for UI (supports 18 locales)';
