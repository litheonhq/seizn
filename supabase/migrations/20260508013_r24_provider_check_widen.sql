-- R24 — widen provider CHECK constraints to admit OpenAI and Google.
--
-- Locked 2026-05-08 (post-R23 audit on R22 Gemini integration).
--
-- Two CHECK constraints were lagging behind the application's provider
-- list and would 500 every Gemini call (and, on inspection, every
-- OpenAI call too — long-standing latent bug, never tripped because
-- prod traffic to OpenAI has been low).
--
--   1. (CRITICAL C2 from R23) public.model_usage.provider had
--      `CHECK (provider IN ('anthropic'))`. Every recordAuthorModelUsage
--      insert with provider='openai' or 'google' raises 23514, which
--      usage-store.ts wraps as MODEL_USAGE_RECORD_FAILED → 500. The
--      app billed the LLM call before recording usage, so users saw
--      a hard error AFTER the model spent tokens.
--
--   2. (CRITICAL C1 from R23) public.profiles.author_llm_provider
--      had `CHECK (... IN ('anthropic','openai'))`. R22 widened the
--      AuthorLlmProvider type to admit 'google' but never updated the
--      DB-side constraint, so setUserAuthorLlmProvider for Google
--      preference would 500.
--
-- Both constraints are widened to cover all three providers Author
-- Memory v3 ships with today. New providers added in the future need
-- a matching DB migration; this comment is the canonical reminder.
--
-- Rollback: re-add the narrower constraint with the original IN-list.
-- Note that rollback is destructive only if rows already exist with
-- the new values — verify before reverting in prod.

BEGIN;

ALTER TABLE public.model_usage
  DROP CONSTRAINT IF EXISTS model_usage_provider_check;

ALTER TABLE public.model_usage
  ADD CONSTRAINT model_usage_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'google'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_author_llm_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_author_llm_provider_check
  CHECK (
    author_llm_provider IS NULL
    OR author_llm_provider IN ('anthropic', 'openai', 'google')
  );

COMMENT ON COLUMN public.profiles.author_llm_provider IS
  'Per-user Author Memory v3 LLM provider preference: anthropic | openai | google | NULL (inherit env default).';

COMMIT;
