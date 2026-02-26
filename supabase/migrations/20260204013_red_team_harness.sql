-- ============================================
-- Autonomous Red-Team Harness
-- Tier-S Feature 6: Security Testing
-- ============================================

-- Red team runs table
CREATE TABLE IF NOT EXISTS red_team_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Target info
    target_endpoint TEXT NOT NULL,
    target_model TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'stopped'
    )),

    -- Test counts
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,

    -- Finding counts by severity
    critical_findings INTEGER DEFAULT 0,
    high_findings INTEGER DEFAULT 0,
    medium_findings INTEGER DEFAULT 0,
    low_findings INTEGER DEFAULT 0,

    -- Configuration
    config JSONB DEFAULT '{}',

    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for red_team_runs
CREATE INDEX IF NOT EXISTS idx_red_team_runs_org
    ON red_team_runs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_red_team_runs_status
    ON red_team_runs(status) WHERE status IN ('pending', 'running');

-- Red team findings table
CREATE TABLE IF NOT EXISTS red_team_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent run
    run_id UUID NOT NULL REFERENCES red_team_runs(id) ON DELETE CASCADE,

    -- Attack info
    attack_category TEXT NOT NULL CHECK (attack_category IN (
        'jailbreak', 'prompt_injection', 'data_extraction',
        'policy_bypass', 'hallucination_induction', 'context_manipulation',
        'encoding_attack', 'roleplay_exploit'
    )),
    attack_name TEXT NOT NULL,

    -- Severity
    severity TEXT NOT NULL CHECK (severity IN (
        'critical', 'high', 'medium', 'low', 'info'
    )),

    -- Attack details
    prompt TEXT NOT NULL,
    response TEXT,
    indicators JSONB DEFAULT '[]',

    -- Metrics
    latency_ms INTEGER,

    -- Timestamps
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for red_team_findings
CREATE INDEX IF NOT EXISTS idx_red_team_findings_run
    ON red_team_findings(run_id);

CREATE INDEX IF NOT EXISTS idx_red_team_findings_severity
    ON red_team_findings(severity);

CREATE INDEX IF NOT EXISTS idx_red_team_findings_category
    ON red_team_findings(attack_category);

-- Attack vectors table (custom vectors)
CREATE TABLE IF NOT EXISTS red_team_attack_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope (null = global)
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Vector definition
    category TEXT NOT NULL CHECK (category IN (
        'jailbreak', 'prompt_injection', 'data_extraction',
        'policy_bypass', 'hallucination_induction', 'context_manipulation',
        'encoding_attack', 'roleplay_exploit', 'custom'
    )),
    name TEXT NOT NULL,
    description TEXT,
    template TEXT NOT NULL,
    mutations JSONB DEFAULT '[]',
    success_indicators JSONB DEFAULT '[]',
    failure_indicators JSONB DEFAULT '[]',
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN (
        'critical', 'high', 'medium', 'low', 'info'
    )),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for attack vectors
CREATE INDEX IF NOT EXISTS idx_red_team_vectors_org
    ON red_team_attack_vectors(organization_id) WHERE is_active = TRUE;

-- Scheduled red team runs
CREATE TABLE IF NOT EXISTS red_team_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Schedule config
    name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    target_endpoint TEXT NOT NULL,
    config JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_run_id UUID REFERENCES red_team_runs(id) ON DELETE SET NULL,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,

    -- Timestamps
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for schedules
CREATE INDEX IF NOT EXISTS idx_red_team_schedules_org
    ON red_team_schedules(organization_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_red_team_schedules_next
    ON red_team_schedules(next_run_at) WHERE is_active = TRUE;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE red_team_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_team_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_team_attack_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_team_schedules ENABLE ROW LEVEL SECURITY;

-- red_team_runs policies
CREATE POLICY "org_read_red_team_runs" ON red_team_runs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_insert_red_team_runs" ON red_team_runs
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin', 'developer')
        )
    );

CREATE POLICY "org_update_red_team_runs" ON red_team_runs
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin', 'developer')
        )
    );

CREATE POLICY "service_all_red_team_runs" ON red_team_runs
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- red_team_findings policies (inherit from run)
CREATE POLICY "org_read_red_team_findings" ON red_team_findings
    FOR SELECT USING (
        run_id IN (
            SELECT id FROM red_team_runs
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE user_id = auth.uid()::TEXT
            )
        )
    );

CREATE POLICY "service_all_red_team_findings" ON red_team_findings
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- red_team_attack_vectors policies
CREATE POLICY "org_read_attack_vectors" ON red_team_attack_vectors
    FOR SELECT USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_manage_attack_vectors" ON red_team_attack_vectors
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "service_all_attack_vectors" ON red_team_attack_vectors
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- red_team_schedules policies
CREATE POLICY "org_read_schedules" ON red_team_schedules
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
        )
    );

CREATE POLICY "org_manage_schedules" ON red_team_schedules
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()::TEXT
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "service_all_schedules" ON red_team_schedules
    FOR ALL USING ((auth.jwt() ->> 'role')::TEXT = 'service_role');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get run summary
CREATE OR REPLACE FUNCTION get_red_team_run_summary(p_run_id UUID)
RETURNS TABLE (
    total_tests INTEGER,
    passed_tests INTEGER,
    failed_tests INTEGER,
    pass_rate NUMERIC,
    critical_count INTEGER,
    high_count INTEGER,
    medium_count INTEGER,
    low_count INTEGER,
    top_categories JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.total_tests,
        r.passed_tests,
        r.failed_tests,
        CASE WHEN r.total_tests > 0
            THEN ROUND((r.passed_tests::NUMERIC / r.total_tests) * 100, 2)
            ELSE 0
        END AS pass_rate,
        r.critical_findings,
        r.high_findings,
        r.medium_findings,
        r.low_findings,
        (
            SELECT jsonb_agg(cat_counts)
            FROM (
                SELECT attack_category, COUNT(*) as count
                FROM red_team_findings
                WHERE run_id = p_run_id
                GROUP BY attack_category
                ORDER BY count DESC
                LIMIT 5
            ) cat_counts
        ) AS top_categories
    FROM red_team_runs r
    WHERE r.id = p_run_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get organization security score
CREATE OR REPLACE FUNCTION get_security_score(p_organization_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    score NUMERIC,
    trend TEXT,
    total_runs INTEGER,
    avg_pass_rate NUMERIC,
    critical_findings INTEGER,
    last_run_at TIMESTAMPTZ
) AS $$
DECLARE
    current_pass_rate NUMERIC;
    prev_pass_rate NUMERIC;
BEGIN
    -- Get current period stats
    SELECT
        COUNT(*),
        AVG(CASE WHEN total_tests > 0 THEN (passed_tests::NUMERIC / total_tests) * 100 ELSE 100 END),
        SUM(critical_findings),
        MAX(completed_at)
    INTO total_runs, avg_pass_rate, critical_findings, last_run_at
    FROM red_team_runs
    WHERE organization_id = p_organization_id
    AND completed_at >= NOW() - (p_days || ' days')::INTERVAL;

    current_pass_rate := COALESCE(avg_pass_rate, 100);

    -- Get previous period stats for trend
    SELECT AVG(CASE WHEN total_tests > 0 THEN (passed_tests::NUMERIC / total_tests) * 100 ELSE 100 END)
    INTO prev_pass_rate
    FROM red_team_runs
    WHERE organization_id = p_organization_id
    AND completed_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
    AND completed_at < NOW() - (p_days || ' days')::INTERVAL;

    -- Calculate score (0-100, higher is better)
    score := GREATEST(0, LEAST(100, current_pass_rate - (COALESCE(critical_findings, 0) * 10)));

    -- Determine trend
    IF prev_pass_rate IS NULL THEN
        trend := 'new';
    ELSIF current_pass_rate > prev_pass_rate + 5 THEN
        trend := 'improving';
    ELSIF current_pass_rate < prev_pass_rate - 5 THEN
        trend := 'declining';
    ELSE
        trend := 'stable';
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update schedules updated_at
CREATE OR REPLACE FUNCTION update_red_team_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER red_team_schedules_updated_at
    BEFORE UPDATE ON red_team_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_red_team_schedule_updated_at();

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE red_team_runs IS 'Red team test execution runs';
COMMENT ON TABLE red_team_findings IS 'Security vulnerabilities discovered during red team testing';
COMMENT ON TABLE red_team_attack_vectors IS 'Custom attack vectors for red team testing';
COMMENT ON TABLE red_team_schedules IS 'Scheduled automated red team tests';

COMMENT ON COLUMN red_team_findings.attack_category IS 'Category of the attack (jailbreak, injection, etc.)';
COMMENT ON COLUMN red_team_findings.severity IS 'Impact severity if attack succeeds';
COMMENT ON COLUMN red_team_findings.indicators IS 'Evidence that attack succeeded or failed';

COMMENT ON FUNCTION get_red_team_run_summary IS 'Get summary statistics for a red team run';
COMMENT ON FUNCTION get_security_score IS 'Calculate organization security score based on red team results';
