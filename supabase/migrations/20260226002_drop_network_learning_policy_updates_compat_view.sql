-- Migration: remove deprecated network-learning compatibility view
-- Canonical relation is public.network_policy_updates

BEGIN;

DROP VIEW IF EXISTS public.network_learning_policy_updates;

COMMIT;
