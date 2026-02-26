-- Migration: NextAuth Compatibility (v2)
-- Removes auth.users foreign key constraint for OAuth users
-- Fixed: Drop RLS policies before altering column types

-- 1. Drop ALL RLS policies first
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can delete own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can view own memories" ON memories;
DROP POLICY IF EXISTS "Users can insert own memories" ON memories;
DROP POLICY IF EXISTS "Users can update own memories" ON memories;
DROP POLICY IF EXISTS "Users can delete own memories" ON memories;
DROP POLICY IF EXISTS "Users can view own usage logs" ON usage_logs;

-- 2. Drop existing foreign key constraints
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_user_id_fkey;
ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_user_id_fkey;

-- 3. Drop the Supabase Auth trigger (no longer needed)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 4. Change column types from UUID to TEXT
ALTER TABLE profiles ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE api_keys ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE memories ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE usage_logs ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- 5. Re-add foreign keys to profiles (not auth.users)
ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE memories ADD CONSTRAINT memories_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 6. Create new service role policies (API server handles auth via service role key)
CREATE POLICY "Service role full access profiles" ON profiles
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access api_keys" ON api_keys
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access memories" ON memories
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access usage_logs" ON usage_logs
    FOR ALL USING (true) WITH CHECK (true);

-- 7. Update search_memories function for TEXT user_id
CREATE OR REPLACE FUNCTION search_memories(
    query_embedding VECTOR(1024),
    match_user_id TEXT,
    match_count INTEGER DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.7,
    match_namespace TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    memory_type TEXT,
    tags TEXT[],
    namespace TEXT,
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
        m.namespace,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE m.user_id = match_user_id
        AND NOT m.is_deleted
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
        AND (match_namespace IS NULL OR m.namespace = match_namespace)
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 8. Update update_memory_count function for TEXT
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
