-- W3.0 — pricing redesign + desktop waitlist + EU AI Act §50 transparency log.
--
-- Locked 2026-05-09. Plan reference: ~/.claude/plans/https-www-seizn-com-ko-distributed-sutherland.md §W3.0.
--
-- Adds:
--   1. desktop_waitlist             — Track 3 Coming Soon email collection (replaces
--                                      pricing card with waitlist form per W3.1).
--   2. profiles.track / billing     — Stripe Litheon SKU support + Charter lock + legal
--                                      version stamp at checkout.
--   3. profiles.email_verified_at + — Free tier abuse defense (W3.9).
--      profiles.signup_locale +
--      profiles.email_normalized
--   4. ai_transparency_events       — EU AI Act Article 50 (effective 2026-08-02): when
--                                      a user interacts with AI-generated/affected output,
--                                      we must record disclosure delivery + user consent.
--
-- stripe_webhook_events already exists (20260508003) — reused, not re-created.
--
-- Rollback at bottom.

BEGIN;

-- 1. desktop_waitlist ------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS public.desktop_waitlist (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                           CITEXT NOT NULL UNIQUE,
  locale                          TEXT,
  source_utm                      JSONB,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at                    TIMESTAMPTZ,
  confirmation_token              TEXT,
  confirmation_token_expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS desktop_waitlist_created_idx
  ON public.desktop_waitlist (created_at DESC);

CREATE INDEX IF NOT EXISTS desktop_waitlist_pending_idx
  ON public.desktop_waitlist (confirmation_token_expires_at)
  WHERE confirmed_at IS NULL;

ALTER TABLE public.desktop_waitlist ENABLE ROW LEVEL SECURITY;

-- service_role only — users cannot enumerate or read the waitlist directly.
-- Form submission goes through /api/waitlist/desktop which uses service role.
DROP POLICY IF EXISTS desktop_waitlist_service_only ON public.desktop_waitlist;
CREATE POLICY desktop_waitlist_service_only
  ON public.desktop_waitlist
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.desktop_waitlist IS
  'Track 3 (Desktop) Coming Soon email waitlist. Confirmation flow via Resend transactional email.';

-- 2. profiles — Stripe Litheon SKU + Charter + legal stamp ----------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS track                   TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS charter_locked_until    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legal_version_accepted  TEXT,
  ADD COLUMN IF NOT EXISTS legal_accepted_at       TIMESTAMPTZ;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_track_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_track_check
  CHECK (track IN ('web', 'api', 'desktop'));

CREATE INDEX IF NOT EXISTS profiles_stripe_customer_idx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_stripe_subscription_idx
  ON public.profiles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.track IS
  'Pricing track: web=Author landing, api=NPC SDK Track 2, desktop=Track 3 (post-launch).';
COMMENT ON COLUMN public.profiles.charter_locked_until IS
  'Charter pricing lock expiry. Source of truth: seizn-author-pricing-2026-05.md §Charter (2027-05-01).';
COMMENT ON COLUMN public.profiles.legal_version_accepted IS
  'Semver of /legal/terms + /legal/privacy version accepted at checkout. Trigger re-consent on bump.';

-- 3. profiles — email verification + locale + normalized email -------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signup_locale      TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS email_normalized   CITEXT;

-- Normalized email (gmail+alias collapsed) for free-tier abuse defense.
-- Kept in sync by application logic; no trigger because Supabase auth.users
-- is the source of truth for raw email and we don't want a circular trigger.
CREATE INDEX IF NOT EXISTS profiles_email_normalized_idx
  ON public.profiles (email_normalized)
  WHERE email_normalized IS NOT NULL;

COMMENT ON COLUMN public.profiles.email_verified_at IS
  'Set by Supabase Auth email confirmation flow. NULL = unverified, blocked from API.';
COMMENT ON COLUMN public.profiles.email_normalized IS
  'Lowercased + dotless gmail-alias-collapsed email. Used to detect alias-based free-tier abuse.';

-- 4. ai_transparency_events — EU AI Act Article 50 (effective 2026-08-02) -
-- Article 50: providers of AI systems intended for direct interaction with
-- natural persons must inform users they are interacting with an AI system,
-- and AI-generated/manipulated content must be disclosed as such.
-- We record each disclosure delivery so we have audit evidence per session.
CREATE TABLE IF NOT EXISTS public.ai_transparency_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id mirrors profiles.id which is TEXT (legacy, see migration 0001).
  user_id         TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      TEXT,
  event_type      TEXT NOT NULL,
  surface         TEXT NOT NULL,
  ai_system       TEXT NOT NULL,
  disclosure_text TEXT,
  user_ack        BOOLEAN NOT NULL DEFAULT FALSE,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_transparency_events
  DROP CONSTRAINT IF EXISTS ai_transparency_events_event_type_check;
ALTER TABLE public.ai_transparency_events
  ADD CONSTRAINT ai_transparency_events_event_type_check
  CHECK (event_type IN (
    'disclosure_shown',     -- banner/modal first impression
    'disclosure_dismissed', -- user dismissed the banner
    'disclosure_ack',       -- user clicked "I understand"
    'content_marked_ai',    -- AI-generated content tagged for the user
    'deepfake_disclosed'    -- synthetic audio/video disclosure (Article 50.4)
  ));

ALTER TABLE public.ai_transparency_events
  DROP CONSTRAINT IF EXISTS ai_transparency_events_surface_check;
ALTER TABLE public.ai_transparency_events
  ADD CONSTRAINT ai_transparency_events_surface_check
  CHECK (surface IN (
    'workspace_inbox',
    'workspace_review',
    'workspace_simulation',
    'memory_extract',
    'memory_review',
    'mindmap_generate',
    'replay_view',
    'engine_npc_dialog',
    'cli_command',
    'api_response'
  ));

ALTER TABLE public.ai_transparency_events
  DROP CONSTRAINT IF EXISTS ai_transparency_events_ai_system_check;
ALTER TABLE public.ai_transparency_events
  ADD CONSTRAINT ai_transparency_events_ai_system_check
  CHECK (ai_system IN (
    'claude-opus',
    'claude-sonnet',
    'claude-haiku',
    'gpt-4o',
    'gpt-4o-mini',
    'gemini-pro',
    'voyage-embed',
    'cohere-rerank',
    'byok-other'
  ));

CREATE INDEX IF NOT EXISTS ai_transparency_events_user_idx
  ON public.ai_transparency_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_transparency_events_session_idx
  ON public.ai_transparency_events (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_transparency_events_surface_idx
  ON public.ai_transparency_events (surface, created_at DESC);

ALTER TABLE public.ai_transparency_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_transparency_events_self_select ON public.ai_transparency_events;
CREATE POLICY ai_transparency_events_self_select
  ON public.ai_transparency_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS ai_transparency_events_service_insert ON public.ai_transparency_events;
CREATE POLICY ai_transparency_events_service_insert
  ON public.ai_transparency_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE public.ai_transparency_events IS
  'EU AI Act Article 50 disclosure log. Append-only audit evidence that AI interaction notices were delivered. Effective 2026-08-02.';

COMMIT;

-- ============================================================================
-- ROLLBACK (run as separate statement if needed):
-- ============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS ai_transparency_events_service_insert ON public.ai_transparency_events;
--   DROP POLICY IF EXISTS ai_transparency_events_self_select ON public.ai_transparency_events;
--   DROP TABLE IF EXISTS public.ai_transparency_events;
--
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS email_normalized,
--     DROP COLUMN IF EXISTS signup_locale,
--     DROP COLUMN IF EXISTS email_verified_at,
--     DROP COLUMN IF EXISTS legal_accepted_at,
--     DROP COLUMN IF EXISTS legal_version_accepted,
--     DROP COLUMN IF EXISTS charter_locked_until,
--     DROP COLUMN IF EXISTS stripe_subscription_id,
--     DROP COLUMN IF EXISTS stripe_customer_id;
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_track_check;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS track;
--
--   DROP POLICY IF EXISTS desktop_waitlist_service_only ON public.desktop_waitlist;
--   DROP TABLE IF EXISTS public.desktop_waitlist;
-- COMMIT;
