-- Expand language preference to support all 18 locales
-- Previously only supported: en, ko, ja
-- Now supports: en, ko, ja, zh-hans, zh-hant, es, ru, uk, he, ar, fr, de, sv, nl, vi, pl, pt-BR, pt-PT

-- Drop existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_language_check;

-- Add new constraint with all supported languages
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
