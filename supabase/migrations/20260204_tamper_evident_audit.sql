-- ============================================
-- Tamper-Evident Audit Log System
-- Phase 4: Hash chain + Merkle digest
-- ============================================

-- Tamper-evident audit logs table
-- Each entry contains hash of previous entry for chain integrity
CREATE TABLE IF NOT EXISTS audit_logs_tamper_evident (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Actor information
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,

    -- Action details
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB DEFAULT '{}',

    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'denied')),
    error_message TEXT,

    -- Hash chain fields (CRITICAL - cannot be modified)
    sequence_number BIGINT NOT NULL,
    prev_hash TEXT,  -- SHA-256 hash of previous entry (null for first)
    entry_hash TEXT NOT NULL,  -- SHA-256 hash of this entry including prev_hash

    -- Merkle batch reference
    merkle_batch_id UUID,
    merkle_root TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Ensure unique sequence per organization
    CONSTRAINT unique_org_sequence UNIQUE (organization_id, sequence_number)
);

-- Create index for chain traversal
CREATE INDEX IF NOT EXISTS idx_audit_tamper_evident_org_seq
    ON audit_logs_tamper_evident(organization_id, sequence_number DESC);

-- Create index for Merkle batch queries
CREATE INDEX IF NOT EXISTS idx_audit_tamper_evident_batch
    ON audit_logs_tamper_evident(merkle_batch_id) WHERE merkle_batch_id IS NOT NULL;

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_audit_tamper_evident_created
    ON audit_logs_tamper_evident(organization_id, created_at DESC);

-- Merkle batch table
-- Stores Merkle root for groups of audit entries
CREATE TABLE IF NOT EXISTS audit_merkle_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Merkle tree root
    merkle_root TEXT NOT NULL,

    -- Batch metadata
    entry_count INTEGER NOT NULL,
    first_sequence BIGINT NOT NULL,
    last_sequence BIGINT NOT NULL,
    first_entry_id UUID NOT NULL REFERENCES audit_logs_tamper_evident(id),
    last_entry_id UUID NOT NULL REFERENCES audit_logs_tamper_evident(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    verified_at TIMESTAMPTZ,

    -- Verification history
    last_verification_result JSONB,

    CONSTRAINT valid_sequence_range CHECK (first_sequence <= last_sequence),
    CONSTRAINT valid_entry_count CHECK (entry_count > 0)
);

-- Index for batch queries
CREATE INDEX IF NOT EXISTS idx_merkle_batches_org
    ON audit_merkle_batches(organization_id, created_at DESC);

-- Foreign key for merkle_batch_id (add after table created)
ALTER TABLE audit_logs_tamper_evident
    ADD CONSTRAINT fk_merkle_batch
    FOREIGN KEY (merkle_batch_id) REFERENCES audit_merkle_batches(id);

-- ============================================
-- Row Level Security
-- ============================================

-- Enable RLS
ALTER TABLE audit_logs_tamper_evident ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_merkle_batches ENABLE ROW LEVEL SECURITY;

-- Policy: Organization members can read their own audit logs
CREATE POLICY "org_members_read_audit_tamper_evident" ON audit_logs_tamper_evident
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

-- Policy: Only system can insert (via service role)
CREATE POLICY "service_insert_audit_tamper_evident" ON audit_logs_tamper_evident
    FOR INSERT WITH CHECK (
        -- Service role only (checked via JWT claim)
        auth.jwt() ->> 'role' = 'service_role'
        OR
        -- Or user inserting for their own org
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
    );

-- Policy: No one can update tamper-evident logs (immutable)
-- Only merkle_batch_id and merkle_root can be updated by service
CREATE POLICY "service_update_merkle_ref" ON audit_logs_tamper_evident
    FOR UPDATE USING (
        auth.jwt() ->> 'role' = 'service_role'
    )
    WITH CHECK (
        auth.jwt() ->> 'role' = 'service_role'
    );

-- Policy: No deletes allowed (tamper-evident)
-- If you need to delete, archive to cold storage first

-- Merkle batches policies
CREATE POLICY "org_members_read_merkle_batches" ON audit_merkle_batches
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "service_insert_merkle_batches" ON audit_merkle_batches
    FOR INSERT WITH CHECK (
        auth.jwt() ->> 'role' = 'service_role'
    );

CREATE POLICY "service_update_merkle_batches" ON audit_merkle_batches
    FOR UPDATE USING (
        auth.jwt() ->> 'role' = 'service_role'
    );

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get the next sequence number for an organization
CREATE OR REPLACE FUNCTION get_next_audit_sequence(p_organization_id UUID)
RETURNS BIGINT AS $$
DECLARE
    next_seq BIGINT;
BEGIN
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO next_seq
    FROM audit_logs_tamper_evident
    WHERE organization_id = p_organization_id;

    RETURN next_seq;
END;
$$ LANGUAGE plpgsql;

-- Function to get the latest entry hash for an organization
CREATE OR REPLACE FUNCTION get_latest_entry_hash(p_organization_id UUID)
RETURNS TEXT AS $$
DECLARE
    latest_hash TEXT;
BEGIN
    SELECT entry_hash
    INTO latest_hash
    FROM audit_logs_tamper_evident
    WHERE organization_id = p_organization_id
    ORDER BY sequence_number DESC
    LIMIT 1;

    RETURN latest_hash;
END;
$$ LANGUAGE plpgsql;

-- Function to verify chain integrity (basic check)
CREATE OR REPLACE FUNCTION verify_audit_chain_basic(
    p_organization_id UUID,
    p_start_seq BIGINT DEFAULT 1,
    p_end_seq BIGINT DEFAULT NULL
)
RETURNS TABLE (
    is_valid BOOLEAN,
    checked_entries BIGINT,
    first_invalid_seq BIGINT,
    error_message TEXT
) AS $$
DECLARE
    prev_entry RECORD;
    curr_entry RECORD;
    entry_count BIGINT := 0;
    actual_end_seq BIGINT;
BEGIN
    -- Get actual end sequence if not provided
    IF p_end_seq IS NULL THEN
        SELECT MAX(sequence_number)
        INTO actual_end_seq
        FROM audit_logs_tamper_evident
        WHERE organization_id = p_organization_id;
    ELSE
        actual_end_seq := p_end_seq;
    END IF;

    -- Iterate through entries
    FOR curr_entry IN
        SELECT sequence_number, prev_hash, entry_hash
        FROM audit_logs_tamper_evident
        WHERE organization_id = p_organization_id
        AND sequence_number BETWEEN p_start_seq AND actual_end_seq
        ORDER BY sequence_number
    LOOP
        entry_count := entry_count + 1;

        -- Check prev_hash links correctly
        IF prev_entry IS NOT NULL THEN
            IF curr_entry.prev_hash IS DISTINCT FROM prev_entry.entry_hash THEN
                is_valid := FALSE;
                checked_entries := entry_count;
                first_invalid_seq := curr_entry.sequence_number;
                error_message := 'prev_hash mismatch at sequence ' || curr_entry.sequence_number;
                RETURN NEXT;
                RETURN;
            END IF;
        ELSIF curr_entry.sequence_number > 1 AND curr_entry.prev_hash IS NULL THEN
            -- First entry should have null prev_hash, others should not
            is_valid := FALSE;
            checked_entries := entry_count;
            first_invalid_seq := curr_entry.sequence_number;
            error_message := 'null prev_hash for non-first entry at sequence ' || curr_entry.sequence_number;
            RETURN NEXT;
            RETURN;
        END IF;

        prev_entry := curr_entry;
    END LOOP;

    -- All checks passed
    is_valid := TRUE;
    checked_entries := entry_count;
    first_invalid_seq := NULL;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE audit_logs_tamper_evident IS 'Tamper-evident audit logs with hash chain integrity';
COMMENT ON COLUMN audit_logs_tamper_evident.sequence_number IS 'Monotonically increasing sequence per organization';
COMMENT ON COLUMN audit_logs_tamper_evident.prev_hash IS 'SHA-256 hash of previous entry (null for first entry)';
COMMENT ON COLUMN audit_logs_tamper_evident.entry_hash IS 'SHA-256 hash of this entry including prev_hash';
COMMENT ON COLUMN audit_logs_tamper_evident.merkle_batch_id IS 'Reference to Merkle batch this entry belongs to';

COMMENT ON TABLE audit_merkle_batches IS 'Merkle tree batches for periodic audit verification';
COMMENT ON COLUMN audit_merkle_batches.merkle_root IS 'Root hash of Merkle tree built from entry hashes';
