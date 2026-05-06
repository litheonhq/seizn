-- Per-user Author LLM provider preference.
--
-- Locked 2026-05-07. Lets a Track 1 web user pick whether their Author Memory
-- v3 calls land on Anthropic Claude Opus 4.7 (extended-thinking xhigh) or
-- OpenAI GPT-5.5 (reasoning_effort xhigh). NULL means "inherit AUTHOR_LLM_PROVIDER
-- env default", which today is 'anthropic'. The provider router consults this
-- column when the request itself carries no explicit provider override.
--
-- Migration is additive — existing rows get NULL, no behavior change until a
-- user opts in via the dashboard toggle.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS author_llm_provider TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_author_llm_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_author_llm_provider_check
  CHECK (author_llm_provider IS NULL OR author_llm_provider IN ('anthropic', 'openai'));

COMMENT ON COLUMN public.profiles.author_llm_provider IS
  'Per-user Author Memory v3 LLM provider preference: anthropic | openai | NULL (inherit env default).';
