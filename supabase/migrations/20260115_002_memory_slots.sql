-- Migration: Memory Slots (Phase 2)
-- Slot Memory for O(1) deterministic lookups (name, preferences, settings, etc.)
-- Slots provide instant recall for structured user data without vector search.

-- Create memory_slots table
CREATE TABLE IF NOT EXISTS memory_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'default',

    -- Slot key: hierarchical structure (e.g., "user.name", "preference.theme")
    slot_key TEXT NOT NULL,

    -- Slot value: the actual data
    slot_value TEXT NOT NULL,

    -- Metadata
    slot_type TEXT NOT NULL DEFAULT 'string', -- string, number, boolean, json, list
    confidence DECIMAL(3,2) DEFAULT 1.0,
    source TEXT DEFAULT 'extract', -- extract, api, manual, import

    -- Optional link to source memory
    source_memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,

    -- PII handling
    is_pii BOOLEAN DEFAULT false,
    pii_category TEXT, -- name, email, phone, address, ssn, etc.

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional TTL for sensitive data

    -- Unique constraint: one value per slot per user/namespace
    UNIQUE(user_id, namespace, slot_key)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_memory_slots_user_namespace
    ON memory_slots(user_id, namespace);

CREATE INDEX IF NOT EXISTS idx_memory_slots_user_key
    ON memory_slots(user_id, slot_key);

CREATE INDEX IF NOT EXISTS idx_memory_slots_pii
    ON memory_slots(user_id, is_pii) WHERE is_pii = true;

CREATE INDEX IF NOT EXISTS idx_memory_slots_expires
    ON memory_slots(expires_at) WHERE expires_at IS NOT NULL;

-- Function to upsert a slot value
CREATE OR REPLACE FUNCTION upsert_memory_slot(
    p_user_id UUID,
    p_slot_key TEXT,
    p_slot_value TEXT,
    p_namespace TEXT DEFAULT 'default',
    p_slot_type TEXT DEFAULT 'string',
    p_confidence DECIMAL DEFAULT 1.0,
    p_source TEXT DEFAULT 'api',
    p_source_memory_id UUID DEFAULT NULL,
    p_is_pii BOOLEAN DEFAULT false,
    p_pii_category TEXT DEFAULT NULL,
    p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS memory_slots AS $$
DECLARE
    result memory_slots;
BEGIN
    INSERT INTO memory_slots (
        user_id, namespace, slot_key, slot_value, slot_type,
        confidence, source, source_memory_id, is_pii, pii_category, expires_at
    ) VALUES (
        p_user_id, p_namespace, p_slot_key, p_slot_value, p_slot_type,
        p_confidence, p_source, p_source_memory_id, p_is_pii, p_pii_category, p_expires_at
    )
    ON CONFLICT (user_id, namespace, slot_key)
    DO UPDATE SET
        slot_value = EXCLUDED.slot_value,
        slot_type = EXCLUDED.slot_type,
        confidence = GREATEST(memory_slots.confidence, EXCLUDED.confidence),
        source = EXCLUDED.source,
        source_memory_id = COALESCE(EXCLUDED.source_memory_id, memory_slots.source_memory_id),
        is_pii = EXCLUDED.is_pii,
        pii_category = EXCLUDED.pii_category,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    RETURNING * INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get slots by keys (batch lookup)
CREATE OR REPLACE FUNCTION get_memory_slots(
    p_user_id UUID,
    p_slot_keys TEXT[],
    p_namespace TEXT DEFAULT 'default'
)
RETURNS SETOF memory_slots AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM memory_slots
    WHERE user_id = p_user_id
      AND namespace = p_namespace
      AND slot_key = ANY(p_slot_keys)
      AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

-- Function to get all slots for a user (with optional prefix filter)
CREATE OR REPLACE FUNCTION get_all_memory_slots(
    p_user_id UUID,
    p_namespace TEXT DEFAULT 'default',
    p_key_prefix TEXT DEFAULT NULL
)
RETURNS SETOF memory_slots AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM memory_slots
    WHERE user_id = p_user_id
      AND namespace = p_namespace
      AND (p_key_prefix IS NULL OR slot_key LIKE p_key_prefix || '%')
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY slot_key;
END;
$$ LANGUAGE plpgsql;

-- Function to delete expired slots (cleanup job)
CREATE OR REPLACE FUNCTION cleanup_expired_slots()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM memory_slots
    WHERE expires_at IS NOT NULL AND expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE memory_slots ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own slots
CREATE POLICY memory_slots_user_policy ON memory_slots
    FOR ALL
    USING (auth.uid() = user_id);

-- Policy: Service role can access all
CREATE POLICY memory_slots_service_policy ON memory_slots
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_slot_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memory_slots_updated ON memory_slots;
CREATE TRIGGER trg_memory_slots_updated
    BEFORE UPDATE ON memory_slots
    FOR EACH ROW
    EXECUTE FUNCTION update_slot_timestamp();

-- Comments
COMMENT ON TABLE memory_slots IS 'Key-value storage for deterministic memory lookups (O(1))';
COMMENT ON FUNCTION upsert_memory_slot IS 'Insert or update a slot value, keeping higher confidence';
COMMENT ON FUNCTION get_memory_slots IS 'Batch lookup of slots by keys';
COMMENT ON FUNCTION get_all_memory_slots IS 'Get all slots with optional prefix filter';
