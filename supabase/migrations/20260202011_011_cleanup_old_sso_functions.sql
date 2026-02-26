-- Migration: 20260202_011_cleanup_old_sso_functions.sql
-- Description: Remove old SSO function versions with different signatures
-- These old functions have no search_path set and are flagged by Security Advisor
-- Created: 2026-02-02

-- Drop old versions with character varying / sso_provider_type signatures
DROP FUNCTION IF EXISTS find_sso_connection_by_email(character varying);
DROP FUNCTION IF EXISTS generate_sp_entity_id(character varying);
DROP FUNCTION IF EXISTS generate_sp_acs_url(character varying);
DROP FUNCTION IF EXISTS create_sso_connection(uuid, character varying, sso_provider_type, text);
