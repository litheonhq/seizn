-- Migration: 20260202_010_security_fixes_v4.sql
-- Description: Fix remaining SSO functions with mutable search_path
-- CREATE OR REPLACE doesn't update search_path attribute, need explicit DROP
-- Based on Supabase Security Advisor report (file 11)
-- Created: 2026-02-02

-- #############################################
-- Drop all SSO functions first
-- #############################################

DROP FUNCTION IF EXISTS find_sso_connection_by_email(TEXT);
DROP FUNCTION IF EXISTS generate_sp_entity_id(UUID);
DROP FUNCTION IF EXISTS generate_sp_acs_url(UUID);
DROP FUNCTION IF EXISTS create_sso_connection(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

-- #############################################
-- Recreate with SET search_path = public
-- #############################################

-- find_sso_connection_by_email
CREATE FUNCTION find_sso_connection_by_email(p_email TEXT)
RETURNS TABLE (
  connection_id UUID,
  organization_id UUID,
  provider TEXT,
  idp_entity_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Extract domain from email
  v_domain := split_part(p_email, '@', 2);

  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sc.id AS connection_id,
    sc.organization_id,
    sc.provider,
    sc.idp_entity_id
  FROM sso_connections sc
  WHERE sc.is_active = TRUE
    AND v_domain = ANY(sc.email_domains)
  ORDER BY sc.created_at DESC
  LIMIT 1;
END;
$$;

-- generate_sp_entity_id
CREATE FUNCTION generate_sp_entity_id(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN 'urn:seizn:sp:' || p_org_id::TEXT;
END;
$$;

-- generate_sp_acs_url
CREATE FUNCTION generate_sp_acs_url(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN 'https://seizn.com/api/auth/sso/callback/' || p_org_id::TEXT;
END;
$$;

-- create_sso_connection
CREATE FUNCTION create_sso_connection(
  p_organization_id UUID,
  p_provider TEXT,
  p_idp_entity_id TEXT,
  p_idp_sso_url TEXT,
  p_idp_certificate TEXT,
  p_email_domains TEXT[],
  p_created_by TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_id UUID;
  v_sp_entity_id TEXT;
  v_sp_acs_url TEXT;
BEGIN
  -- Generate SP metadata
  v_sp_entity_id := generate_sp_entity_id(p_organization_id);
  v_sp_acs_url := generate_sp_acs_url(p_organization_id);

  -- Insert connection
  INSERT INTO sso_connections (
    organization_id,
    provider,
    idp_entity_id,
    idp_sso_url,
    idp_certificate,
    sp_entity_id,
    sp_acs_url,
    email_domains,
    created_by
  ) VALUES (
    p_organization_id,
    p_provider,
    p_idp_entity_id,
    p_idp_sso_url,
    p_idp_certificate,
    v_sp_entity_id,
    v_sp_acs_url,
    p_email_domains,
    p_created_by
  )
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$;
