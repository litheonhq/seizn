-- Seizn AI Memory Server - Initial Schema
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ===========================================
-- 1. Profiles (extends Supabase Auth users)
-- ===========================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,

    -- Subscription & Billing
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'pro', 'enterprise')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,

    -- Usage Limits (per plan)
    memory_limit INTEGER DEFAULT 10000,      -- Free: 10,000
    api_calls_limit INTEGER DEFAULT 1000,    -- Free: 1,000/month

    -- Current Usage
    memory_count INTEGER DEFAULT 0,
    api_calls_this_month INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ===========================================
-- 2. API Keys
-- ===========================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,           -- Store hashed key only
    key_prefix TEXT NOT NULL,         -- First 8 chars for identification (sk-xxx...)

    scopes TEXT[] DEFAULT ARRAY['memory:read', 'memory:write'],

    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ===========================================
-- 3. Memories (Core table with vector)
-- ===========================================
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Memory Content
    content TEXT NOT NULL,                    -- The actual memory text
    embedding VECTOR(1024),                   -- Voyage AI embedding dimension

    -- Categorization
    memory_type TEXT DEFAULT 'fact' CHECK (memory_type IN ('fact', 'preference', 'experience', 'relationship', 'instruction')),
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Multi-level memory support
    scope TEXT DEFAULT 'user' CHECK (scope IN ('user', 'session', 'agent')),
    session_id TEXT,                          -- For session-scoped memories
    agent_id TEXT,                            -- For agent-scoped memories

    -- Metadata
    source TEXT,                              -- Where this memory came from
    confidence FLOAT DEFAULT 1.0,             -- Extraction confidence (0-1)
    importance INTEGER DEFAULT 5,             -- 1-10 scale

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    accessed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ
);

-- Indexes for fast retrieval
CREATE INDEX idx_memories_user ON memories(user_id) WHERE NOT is_deleted;
CREATE INDEX idx_memories_scope ON memories(user_id, scope) WHERE NOT is_deleted;
CREATE INDEX idx_memories_session ON memories(user_id, session_id) WHERE NOT is_deleted;
CREATE INDEX idx_memories_agent ON memories(user_id, agent_id) WHERE NOT is_deleted;
CREATE INDEX idx_memories_tags ON memories USING GIN(tags) WHERE NOT is_deleted;
CREATE INDEX idx_memories_type ON memories(user_id, memory_type) WHERE NOT is_deleted;

-- Vector similarity search index (IVFFlat for large datasets)
CREATE INDEX idx_memories_embedding ON memories
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
    WHERE NOT is_deleted;

-- ===========================================
-- 4. Usage Logs
-- ===========================================
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,

    -- Request Info
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,

    -- Token Usage
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    embedding_tokens INTEGER DEFAULT 0,

    -- Cost tracking (in cents)
    cost_cents INTEGER DEFAULT 0,

    -- Response
    status_code INTEGER,
    latency_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_date ON usage_logs(user_id, created_at DESC);

-- Partition by month for better performance (optional, for scale)
-- CREATE TABLE usage_logs_2026_01 PARTITION OF usage_logs
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- ===========================================
-- 5. Waitlist (for Coming Soon page)
-- ===========================================
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    source TEXT DEFAULT 'website',
    referrer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_waitlist_email ON waitlist(email);

-- ===========================================
-- Row Level Security (RLS)
-- ===========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only access their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- API Keys: Users can only manage their own keys
CREATE POLICY "Users can view own API keys" ON api_keys
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own API keys" ON api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own API keys" ON api_keys
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own API keys" ON api_keys
    FOR DELETE USING (auth.uid() = user_id);

-- Memories: Users can only access their own memories
CREATE POLICY "Users can view own memories" ON memories
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON memories
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON memories
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON memories
    FOR DELETE USING (auth.uid() = user_id);

-- Usage Logs: Users can only view their own logs
CREATE POLICY "Users can view own usage logs" ON usage_logs
    FOR SELECT USING (auth.uid() = user_id);

-- ===========================================
-- Helper Functions
-- ===========================================

-- Search memories by vector similarity
CREATE OR REPLACE FUNCTION search_memories(
    query_embedding VECTOR(1024),
    match_user_id UUID,
    match_count INTEGER DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    memory_type TEXT,
    tags TEXT[],
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.memory_type,
        m.tags,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE m.user_id = match_user_id
        AND NOT m.is_deleted
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Update memory count for user
CREATE OR REPLACE FUNCTION update_memory_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE profiles SET memory_count = memory_count + 1 WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_deleted = true AND OLD.is_deleted = false) THEN
        UPDATE profiles SET memory_count = memory_count - 1 WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_memory_change
    AFTER INSERT OR UPDATE OR DELETE ON memories
    FOR EACH ROW EXECUTE FUNCTION update_memory_count();

-- Reset monthly API call count (run via cron)
CREATE OR REPLACE FUNCTION reset_monthly_api_calls()
RETURNS void AS $$
BEGIN
    UPDATE profiles SET api_calls_this_month = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
