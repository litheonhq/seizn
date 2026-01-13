-- Seizn PostgreSQL Initialization Script
-- This script runs automatically on first database creation
--
-- Note: Prisma migrations handle the main schema.
-- This file is for additional database setup (extensions, roles, etc.)

-- ============================================
-- Extensions
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable JSON path queries
CREATE EXTENSION IF NOT EXISTS "jsonb_plperl" CASCADE;

-- Vector similarity search (if using pgvector instead of Qdrant)
-- Uncomment if needed:
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- Performance Settings
-- ============================================

-- Increase work memory for complex queries
ALTER SYSTEM SET work_mem = '256MB';

-- Increase maintenance work memory for index creation
ALTER SYSTEM SET maintenance_work_mem = '512MB';

-- Enable parallel query execution
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;

-- ============================================
-- Security Settings
-- ============================================

-- Revoke public schema access by default
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Grant access to seizn user
GRANT ALL ON SCHEMA public TO seizn;

-- ============================================
-- Audit Log Table
-- ============================================

-- Create audit log table for tracking changes
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- ============================================
-- Audit Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_row JSONB := NULL;
    new_row JSONB := NULL;
BEGIN
    IF TG_OP = 'DELETE' THEN
        old_row := to_jsonb(OLD);
        INSERT INTO audit_log (table_name, record_id, action, old_values, created_at)
        VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', old_row, NOW());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        old_row := to_jsonb(OLD);
        new_row := to_jsonb(NEW);
        INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, created_at)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', old_row, new_row, NOW());
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        new_row := to_jsonb(NEW);
        INSERT INTO audit_log (table_name, record_id, action, new_values, created_at)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', new_row, NOW());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Session Storage Table (for production)
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- ============================================
-- Rate Limiting Table
-- ============================================

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    requests INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(identifier, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- Cleanup function for expired rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- API Keys Table (for enterprise)
-- ============================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(10) NOT NULL,
    organization_id VARCHAR(255),
    user_id VARCHAR(255),
    scopes TEXT[] DEFAULT '{}',
    rate_limit INTEGER DEFAULT 1000,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================
-- Cleanup Jobs
-- ============================================

-- Function to clean up old audit logs (keep 90 days by default)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_log
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Grants
-- ============================================

-- Grant permissions on all tables to seizn user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO seizn;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO seizn;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO seizn;

-- ============================================
-- Notify on completion
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Seizn database initialization completed successfully';
END $$;
