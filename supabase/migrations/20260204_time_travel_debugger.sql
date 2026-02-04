-- ============================================
-- Time-Travel Debugger & Deterministic Replay
-- Tier-S Feature 1: FALL Run Checkpoints
-- ============================================

-- FALL Runs table - stores complete agent execution runs
CREATE TABLE IF NOT EXISTS fall_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Trace linkage
    trace_id TEXT NOT NULL,
    root_span_id TEXT,

    -- Run metadata
    name TEXT,
    description TEXT,

    -- Agent configuration snapshot
    agent_config JSONB DEFAULT '{}',
    model_id TEXT,
    system_prompt TEXT,

    -- Input/Output
    initial_input JSONB NOT NULL,
    final_output JSONB,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
        'running', 'completed', 'failed', 'paused', 'forked'
    )),
    error_message TEXT,

    -- Metrics
    total_steps INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_latency_ms BIGINT DEFAULT 0,

    -- User tracking
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

-- Indexes for fall_runs
CREATE INDEX IF NOT EXISTS idx_fall_runs_org_created
    ON fall_runs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_runs_trace
    ON fall_runs(trace_id);

CREATE INDEX IF NOT EXISTS idx_fall_runs_status
    ON fall_runs(status) WHERE status IN ('running', 'paused');

-- FALL Run Checkpoints - snapshots at each step
CREATE TABLE IF NOT EXISTS fall_run_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent run
    run_id UUID NOT NULL REFERENCES fall_runs(id) ON DELETE CASCADE,

    -- Step information
    step_number INTEGER NOT NULL,
    span_id TEXT,

    -- Checkpoint type
    checkpoint_type TEXT NOT NULL DEFAULT 'auto' CHECK (checkpoint_type IN (
        'auto',      -- Automatic checkpoint at each step
        'manual',    -- User-triggered checkpoint
        'breakpoint', -- Breakpoint-triggered
        'error'      -- Error state capture
    )),

    -- Complete state snapshot
    state_json JSONB NOT NULL,

    -- State components (for efficient diffing)
    messages_snapshot JSONB DEFAULT '[]',
    context_snapshot JSONB DEFAULT '{}',
    memory_snapshot JSONB DEFAULT '{}',
    tool_calls_snapshot JSONB DEFAULT '[]',

    -- Step metadata
    step_type TEXT, -- 'llm_call', 'tool_use', 'user_input', 'system'
    step_input JSONB,
    step_output JSONB,

    -- Metrics at this step
    tokens_used INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,

    -- Hash for integrity verification
    state_hash TEXT NOT NULL,
    prev_checkpoint_hash TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Ensure unique step per run
    CONSTRAINT unique_run_step UNIQUE (run_id, step_number)
);

-- Indexes for checkpoints
CREATE INDEX IF NOT EXISTS idx_fall_checkpoints_run_step
    ON fall_run_checkpoints(run_id, step_number);

CREATE INDEX IF NOT EXISTS idx_fall_checkpoints_span
    ON fall_run_checkpoints(span_id) WHERE span_id IS NOT NULL;

-- FALL Run Forks - branching from checkpoints
CREATE TABLE IF NOT EXISTS fall_run_forks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Fork relationship
    parent_run_id UUID NOT NULL REFERENCES fall_runs(id) ON DELETE CASCADE,
    fork_run_id UUID NOT NULL REFERENCES fall_runs(id) ON DELETE CASCADE,

    -- Fork point
    fork_checkpoint_id UUID NOT NULL REFERENCES fall_run_checkpoints(id) ON DELETE CASCADE,
    fork_step_number INTEGER NOT NULL,

    -- Fork reason and modifications
    reason TEXT,
    patch_json JSONB DEFAULT '{}', -- Changes applied at fork point

    -- What was modified
    modified_input BOOLEAN DEFAULT FALSE,
    modified_context BOOLEAN DEFAULT FALSE,
    modified_system_prompt BOOLEAN DEFAULT FALSE,
    modified_model BOOLEAN DEFAULT FALSE,

    -- User tracking
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Prevent duplicate forks
    CONSTRAINT unique_fork_pair UNIQUE (parent_run_id, fork_run_id)
);

-- Index for fork queries
CREATE INDEX IF NOT EXISTS idx_fall_forks_parent
    ON fall_run_forks(parent_run_id);

CREATE INDEX IF NOT EXISTS idx_fall_forks_fork
    ON fall_run_forks(fork_run_id);

-- Breakpoints table - debugging breakpoints
CREATE TABLE IF NOT EXISTS fall_breakpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Breakpoint definition
    name TEXT NOT NULL,
    description TEXT,

    -- Condition (evaluated at each step)
    condition_type TEXT NOT NULL CHECK (condition_type IN (
        'step_number',    -- Break at specific step
        'tool_call',      -- Break when specific tool is called
        'token_threshold', -- Break when token count exceeds
        'output_pattern', -- Break when output matches pattern
        'custom'          -- Custom JS condition
    )),
    condition_value JSONB NOT NULL,

    -- Breakpoint behavior
    action TEXT NOT NULL DEFAULT 'pause' CHECK (action IN (
        'pause',     -- Pause execution
        'checkpoint', -- Create checkpoint but continue
        'log'        -- Log but continue
    )),

    -- Active status
    is_active BOOLEAN DEFAULT TRUE,

    -- Usage tracking
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ,

    -- User tracking
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for breakpoints
CREATE INDEX IF NOT EXISTS idx_fall_breakpoints_org_active
    ON fall_breakpoints(organization_id) WHERE is_active = TRUE;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE fall_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_run_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_run_forks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fall_breakpoints ENABLE ROW LEVEL SECURITY;

-- fall_runs policies
CREATE POLICY "org_read_fall_runs" ON fall_runs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_insert_fall_runs" ON fall_runs
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_update_fall_runs" ON fall_runs
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "service_all_fall_runs" ON fall_runs
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- fall_run_checkpoints policies (inherit from parent run)
CREATE POLICY "org_read_fall_checkpoints" ON fall_run_checkpoints
    FOR SELECT USING (
        run_id IN (
            SELECT id FROM fall_runs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "org_insert_fall_checkpoints" ON fall_run_checkpoints
    FOR INSERT WITH CHECK (
        run_id IN (
            SELECT id FROM fall_runs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "service_all_fall_checkpoints" ON fall_run_checkpoints
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- fall_run_forks policies
CREATE POLICY "org_read_fall_forks" ON fall_run_forks
    FOR SELECT USING (
        parent_run_id IN (
            SELECT id FROM fall_runs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "org_insert_fall_forks" ON fall_run_forks
    FOR INSERT WITH CHECK (
        parent_run_id IN (
            SELECT id FROM fall_runs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "service_all_fall_forks" ON fall_run_forks
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- fall_breakpoints policies
CREATE POLICY "org_read_fall_breakpoints" ON fall_breakpoints
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_manage_fall_breakpoints" ON fall_breakpoints
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin', 'developer')
        )
    );

CREATE POLICY "service_all_fall_breakpoints" ON fall_breakpoints
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to compute checkpoint state hash
CREATE OR REPLACE FUNCTION compute_checkpoint_hash(
    p_run_id UUID,
    p_step_number INTEGER,
    p_state_json JSONB,
    p_prev_hash TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    hash_input TEXT;
BEGIN
    hash_input := p_run_id::TEXT || '|' || p_step_number::TEXT || '|' ||
                  p_state_json::TEXT || '|' || COALESCE(p_prev_hash, 'genesis');
    RETURN encode(sha256(hash_input::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get checkpoint at specific step
CREATE OR REPLACE FUNCTION get_checkpoint_at_step(
    p_run_id UUID,
    p_step_number INTEGER
)
RETURNS fall_run_checkpoints AS $$
DECLARE
    checkpoint fall_run_checkpoints;
BEGIN
    SELECT * INTO checkpoint
    FROM fall_run_checkpoints
    WHERE run_id = p_run_id AND step_number = p_step_number;

    RETURN checkpoint;
END;
$$ LANGUAGE plpgsql;

-- Function to get latest checkpoint for a run
CREATE OR REPLACE FUNCTION get_latest_checkpoint(p_run_id UUID)
RETURNS fall_run_checkpoints AS $$
DECLARE
    checkpoint fall_run_checkpoints;
BEGIN
    SELECT * INTO checkpoint
    FROM fall_run_checkpoints
    WHERE run_id = p_run_id
    ORDER BY step_number DESC
    LIMIT 1;

    RETURN checkpoint;
END;
$$ LANGUAGE plpgsql;

-- Function to count checkpoints for a run
CREATE OR REPLACE FUNCTION count_run_checkpoints(p_run_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM fall_run_checkpoints
        WHERE run_id = p_run_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get fork tree for a run
CREATE OR REPLACE FUNCTION get_fork_tree(p_run_id UUID)
RETURNS TABLE (
    run_id UUID,
    parent_run_id UUID,
    fork_step INTEGER,
    depth INTEGER,
    path UUID[]
) AS $$
WITH RECURSIVE fork_tree AS (
    -- Base case: the original run
    SELECT
        r.id AS run_id,
        NULL::UUID AS parent_run_id,
        0 AS fork_step,
        0 AS depth,
        ARRAY[r.id] AS path
    FROM fall_runs r
    WHERE r.id = p_run_id

    UNION ALL

    -- Recursive case: forks
    SELECT
        f.fork_run_id AS run_id,
        f.parent_run_id,
        f.fork_step_number AS fork_step,
        ft.depth + 1 AS depth,
        ft.path || f.fork_run_id
    FROM fall_run_forks f
    JOIN fork_tree ft ON f.parent_run_id = ft.run_id
)
SELECT * FROM fork_tree;
$$ LANGUAGE sql;

-- Function to verify checkpoint chain integrity
CREATE OR REPLACE FUNCTION verify_checkpoint_chain(p_run_id UUID)
RETURNS TABLE (
    is_valid BOOLEAN,
    checked_count INTEGER,
    first_invalid_step INTEGER,
    error_message TEXT
) AS $$
DECLARE
    prev_checkpoint RECORD;
    curr_checkpoint RECORD;
    expected_hash TEXT;
    check_count INTEGER := 0;
BEGIN
    FOR curr_checkpoint IN
        SELECT * FROM fall_run_checkpoints
        WHERE run_id = p_run_id
        ORDER BY step_number
    LOOP
        check_count := check_count + 1;

        -- Verify hash chain
        IF prev_checkpoint IS NOT NULL THEN
            IF curr_checkpoint.prev_checkpoint_hash IS DISTINCT FROM prev_checkpoint.state_hash THEN
                is_valid := FALSE;
                checked_count := check_count;
                first_invalid_step := curr_checkpoint.step_number;
                error_message := 'Hash chain broken at step ' || curr_checkpoint.step_number;
                RETURN NEXT;
                RETURN;
            END IF;
        END IF;

        -- Verify state hash
        expected_hash := compute_checkpoint_hash(
            p_run_id,
            curr_checkpoint.step_number,
            curr_checkpoint.state_json,
            curr_checkpoint.prev_checkpoint_hash
        );

        IF curr_checkpoint.state_hash != expected_hash THEN
            is_valid := FALSE;
            checked_count := check_count;
            first_invalid_step := curr_checkpoint.step_number;
            error_message := 'State hash mismatch at step ' || curr_checkpoint.step_number;
            RETURN NEXT;
            RETURN;
        END IF;

        prev_checkpoint := curr_checkpoint;
    END LOOP;

    is_valid := TRUE;
    checked_count := check_count;
    first_invalid_step := NULL;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update fall_runs.updated_at
CREATE OR REPLACE FUNCTION update_fall_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fall_runs_updated_at
    BEFORE UPDATE ON fall_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_fall_runs_updated_at();

-- Trigger to update total_steps on checkpoint insert
CREATE OR REPLACE FUNCTION update_run_step_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE fall_runs
    SET total_steps = (
        SELECT MAX(step_number) FROM fall_run_checkpoints WHERE run_id = NEW.run_id
    )
    WHERE id = NEW.run_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fall_checkpoints_update_step_count
    AFTER INSERT ON fall_run_checkpoints
    FOR EACH ROW
    EXECUTE FUNCTION update_run_step_count();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE fall_runs IS 'FALL agent execution runs with full state tracking';
COMMENT ON TABLE fall_run_checkpoints IS 'State snapshots at each step for time-travel debugging';
COMMENT ON TABLE fall_run_forks IS 'Fork relationships between runs for what-if analysis';
COMMENT ON TABLE fall_breakpoints IS 'Debugging breakpoints for pausing execution';

COMMENT ON COLUMN fall_run_checkpoints.state_hash IS 'SHA-256 hash of state for integrity verification';
COMMENT ON COLUMN fall_run_checkpoints.prev_checkpoint_hash IS 'Hash of previous checkpoint for chain integrity';

COMMENT ON FUNCTION compute_checkpoint_hash IS 'Compute deterministic hash for checkpoint state';
COMMENT ON FUNCTION verify_checkpoint_chain IS 'Verify integrity of checkpoint hash chain';
COMMENT ON FUNCTION get_fork_tree IS 'Get complete fork tree starting from a run';
