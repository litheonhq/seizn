-- Shared Traces table for shareable trace links
-- This enables users to share retrieval traces publicly via short URLs

CREATE TABLE IF NOT EXISTS shared_traces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id varchar(16) UNIQUE NOT NULL,
    trace_id uuid NOT NULL,
    user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    trace_snapshot jsonb NOT NULL,
    view_count int DEFAULT 0,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by share_id
CREATE INDEX IF NOT EXISTS idx_shared_traces_share_id ON shared_traces(share_id);

-- Index for cleanup of expired traces
CREATE INDEX IF NOT EXISTS idx_shared_traces_expires_at ON shared_traces(expires_at);

-- Index for user's shared traces
CREATE INDEX IF NOT EXISTS idx_shared_traces_user_id ON shared_traces(user_id);

-- RLS policies
ALTER TABLE shared_traces ENABLE ROW LEVEL SECURITY;

-- Users can create shared traces for their own traces
CREATE POLICY "Users can create their own shared traces"
    ON shared_traces FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid()::text);

-- Users can view their own shared traces
CREATE POLICY "Users can view their own shared traces"
    ON shared_traces FOR SELECT
    TO authenticated
    USING (user_id = auth.uid()::text);

-- Public can view shared traces by share_id (via service role)
-- Note: Public access is handled through API routes with service role

-- Users can delete their own shared traces
CREATE POLICY "Users can delete their own shared traces"
    ON shared_traces FOR DELETE
    TO authenticated
    USING (user_id = auth.uid()::text);

-- Service role can do everything (for API routes)
CREATE POLICY "Service role has full access to shared_traces"
    ON shared_traces FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE shared_traces IS 'Stores shareable trace links with snapshots of trace data';
COMMENT ON COLUMN shared_traces.share_id IS 'Short URL-safe identifier for sharing (e.g., "Ab3xY8z2")';
COMMENT ON COLUMN shared_traces.trace_snapshot IS 'Snapshot of trace data at time of sharing';
