-- Gateway Infrastructure Migration
-- Epic A: AI Gateway - routes, policies, cost ledgers

-- =====================================================
-- Gateway Routes Table
-- Defines API routes and their configurations
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path_pattern TEXT NOT NULL,  -- e.g., '/chat', '/embed', '/tool/*'
    methods TEXT[] NOT NULL DEFAULT ARRAY['POST'],
    target_provider TEXT NOT NULL,  -- 'openai', 'anthropic', 'azure', 'bedrock'
    target_model TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 100,

    -- Rate limiting
    rate_limit_requests INTEGER,  -- requests per window
    rate_limit_tokens INTEGER,    -- tokens per window
    rate_limit_window_seconds INTEGER DEFAULT 60,

    -- Retry configuration
    retry_enabled BOOLEAN NOT NULL DEFAULT true,
    retry_max_attempts INTEGER NOT NULL DEFAULT 3,
    retry_backoff_multiplier NUMERIC(3,1) NOT NULL DEFAULT 2.0,

    -- Circuit breaker
    circuit_breaker_enabled BOOLEAN NOT NULL DEFAULT true,
    circuit_breaker_threshold INTEGER NOT NULL DEFAULT 5,
    circuit_breaker_timeout_seconds INTEGER NOT NULL DEFAULT 30,

    -- Load balancing
    load_balancer_strategy TEXT NOT NULL DEFAULT 'round_robin',  -- 'round_robin', 'least_connections', 'weighted', 'failover'
    load_balancer_weights JSONB DEFAULT '{}',

    -- Caching
    cache_enabled BOOLEAN NOT NULL DEFAULT false,
    cache_ttl_seconds INTEGER DEFAULT 3600,
    cache_key_template TEXT,  -- e.g., '${model}:${hash(messages)}'

    -- Metadata
    description TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_load_balancer_strategy CHECK (
        load_balancer_strategy IN ('round_robin', 'least_connections', 'weighted', 'failover')
    ),
    CONSTRAINT valid_provider CHECK (
        target_provider IN ('openai', 'anthropic', 'azure', 'bedrock', 'google', 'cohere', 'custom')
    )
);

-- Index for route matching
CREATE INDEX idx_gateway_routes_org_active ON gateway_routes(org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_gateway_routes_path ON gateway_routes(path_pattern);
CREATE INDEX idx_gateway_routes_priority ON gateway_routes(org_id, priority DESC);

-- =====================================================
-- Gateway Policies Table
-- Fine-grained access control and transformation rules
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    route_id UUID REFERENCES gateway_routes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 100,

    -- Matching conditions (all must match)
    conditions JSONB NOT NULL DEFAULT '{}',
    /*
    Example conditions:
    {
        "user_roles": ["admin", "developer"],
        "api_key_scopes": ["chat:write"],
        "request_headers": {"X-Custom-Header": "value"},
        "time_window": {"start": "09:00", "end": "18:00", "timezone": "UTC"},
        "ip_allowlist": ["192.168.1.0/24"],
        "model_allowlist": ["gpt-4", "claude-3-opus"]
    }
    */

    -- Actions to apply when conditions match
    actions JSONB NOT NULL DEFAULT '{}',
    /*
    Example actions:
    {
        "allow": true,
        "rate_limit_override": {"requests": 100, "window": 60},
        "model_override": "gpt-4-turbo",
        "add_headers": {"X-Priority": "high"},
        "transform_request": "strip_pii",
        "transform_response": "add_watermark",
        "log_level": "debug",
        "alert_on_match": true
    }
    */

    -- Policy type
    policy_type TEXT NOT NULL DEFAULT 'allow',  -- 'allow', 'deny', 'transform', 'rate_limit', 'audit'

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_policy_type CHECK (
        policy_type IN ('allow', 'deny', 'transform', 'rate_limit', 'audit')
    )
);

-- Index for policy evaluation
CREATE INDEX idx_gateway_policies_route ON gateway_policies(route_id, is_active) WHERE is_active = true;
CREATE INDEX idx_gateway_policies_org_active ON gateway_policies(org_id, is_active, priority DESC);

-- =====================================================
-- Gateway Cost Ledgers Table
-- FinOps: Track costs by org/project/user/model
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_cost_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID,  -- Optional project grouping
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    api_key_id UUID,  -- Reference to scoped API key used

    -- Request details
    route_id UUID REFERENCES gateway_routes(id) ON DELETE SET NULL,
    request_id TEXT NOT NULL,  -- Unique request identifier

    -- Provider and model
    provider TEXT NOT NULL,
    model TEXT NOT NULL,

    -- Token usage
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cached_tokens INTEGER NOT NULL DEFAULT 0,  -- Tokens served from cache

    -- Cost calculation (in USD microcents for precision)
    prompt_cost_microcents BIGINT NOT NULL DEFAULT 0,
    completion_cost_microcents BIGINT NOT NULL DEFAULT 0,
    total_cost_microcents BIGINT NOT NULL DEFAULT 0,

    -- Performance metrics
    latency_ms INTEGER,
    time_to_first_token_ms INTEGER,

    -- Request metadata
    endpoint TEXT NOT NULL,  -- '/chat', '/embed', '/tool'
    status_code INTEGER NOT NULL,
    is_cached BOOLEAN NOT NULL DEFAULT false,
    is_streaming BOOLEAN NOT NULL DEFAULT false,

    -- Error tracking
    error_type TEXT,
    error_message TEXT,

    -- Billing period (for aggregation)
    billing_period TEXT NOT NULL,  -- 'YYYY-MM' format

    -- Metadata
    request_metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for cost analysis queries
CREATE INDEX idx_cost_ledgers_org_period ON gateway_cost_ledgers(org_id, billing_period);
CREATE INDEX idx_cost_ledgers_user_period ON gateway_cost_ledgers(user_id, billing_period) WHERE user_id IS NOT NULL;
CREATE INDEX idx_cost_ledgers_model ON gateway_cost_ledgers(org_id, model, billing_period);
CREATE INDEX idx_cost_ledgers_project ON gateway_cost_ledgers(org_id, project_id, billing_period) WHERE project_id IS NOT NULL;
CREATE INDEX idx_cost_ledgers_created ON gateway_cost_ledgers(created_at DESC);

-- =====================================================
-- Gateway Rate Limit Counters (for distributed rate limiting)
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_rate_limit_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,  -- Composite key: org:user:route:window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_rate_limit_key_window UNIQUE (key, window_start)
);

-- Index for rate limit lookups
CREATE INDEX idx_rate_limit_key_window ON gateway_rate_limit_counters(key, window_start DESC);

-- Auto-expire old rate limit counters
CREATE INDEX idx_rate_limit_window_end ON gateway_rate_limit_counters(window_end);

-- =====================================================
-- Gateway Circuit Breaker State
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_circuit_breaker_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES gateway_routes(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,

    state TEXT NOT NULL DEFAULT 'closed',  -- 'closed', 'open', 'half_open'
    failure_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- When circuit is open, this is when to try half-open
    retry_after TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_circuit_route_provider UNIQUE (route_id, provider),
    CONSTRAINT valid_circuit_state CHECK (state IN ('closed', 'open', 'half_open'))
);

-- =====================================================
-- Gateway Semantic Cache Table
-- For caching semantically similar requests
-- =====================================================
CREATE TABLE IF NOT EXISTS gateway_semantic_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Cache key components
    cache_key_hash TEXT NOT NULL,  -- Hash of normalized request
    model TEXT NOT NULL,

    -- Semantic embedding for similarity matching
    embedding vector(1536),  -- For semantic similarity search

    -- Cached response
    response JSONB NOT NULL,
    response_tokens INTEGER NOT NULL,

    -- TTL management
    expires_at TIMESTAMPTZ NOT NULL,

    -- Usage tracking
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_hit_at TIMESTAMPTZ,

    -- Metadata
    original_request_hash TEXT NOT NULL,
    similarity_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.95,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_cache_key UNIQUE (org_id, cache_key_hash, model)
);

-- Index for cache lookups
CREATE INDEX idx_semantic_cache_lookup ON gateway_semantic_cache(org_id, model, cache_key_hash);
CREATE INDEX idx_semantic_cache_expires ON gateway_semantic_cache(expires_at);

-- Vector index for semantic similarity (if pgvector is available)
-- CREATE INDEX idx_semantic_cache_embedding ON gateway_semantic_cache
--     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =====================================================
-- Cost Aggregation Views
-- =====================================================
CREATE OR REPLACE VIEW gateway_cost_summary_by_org AS
SELECT
    org_id,
    billing_period,
    COUNT(*) as total_requests,
    SUM(prompt_tokens) as total_prompt_tokens,
    SUM(completion_tokens) as total_completion_tokens,
    SUM(total_tokens) as total_tokens,
    SUM(cached_tokens) as total_cached_tokens,
    SUM(total_cost_microcents) as total_cost_microcents,
    SUM(total_cost_microcents)::NUMERIC / 100000 as total_cost_usd,
    AVG(latency_ms) as avg_latency_ms,
    COUNT(*) FILTER (WHERE is_cached) as cached_requests,
    COUNT(*) FILTER (WHERE error_type IS NOT NULL) as error_requests
FROM gateway_cost_ledgers
GROUP BY org_id, billing_period;

CREATE OR REPLACE VIEW gateway_cost_summary_by_model AS
SELECT
    org_id,
    model,
    provider,
    billing_period,
    COUNT(*) as total_requests,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost_microcents)::NUMERIC / 100000 as total_cost_usd,
    AVG(latency_ms) as avg_latency_ms
FROM gateway_cost_ledgers
GROUP BY org_id, model, provider, billing_period;

CREATE OR REPLACE VIEW gateway_cost_summary_by_user AS
SELECT
    org_id,
    user_id,
    billing_period,
    COUNT(*) as total_requests,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost_microcents)::NUMERIC / 100000 as total_cost_usd,
    AVG(latency_ms) as avg_latency_ms
FROM gateway_cost_ledgers
WHERE user_id IS NOT NULL
GROUP BY org_id, user_id, billing_period;

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to record gateway cost
CREATE OR REPLACE FUNCTION record_gateway_cost(
    p_org_id UUID,
    p_user_id UUID,
    p_route_id UUID,
    p_request_id TEXT,
    p_provider TEXT,
    p_model TEXT,
    p_prompt_tokens INTEGER,
    p_completion_tokens INTEGER,
    p_prompt_cost_microcents BIGINT,
    p_completion_cost_microcents BIGINT,
    p_latency_ms INTEGER,
    p_endpoint TEXT,
    p_status_code INTEGER,
    p_is_cached BOOLEAN DEFAULT false,
    p_is_streaming BOOLEAN DEFAULT false,
    p_error_type TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_billing_period TEXT;
BEGIN
    v_billing_period := TO_CHAR(NOW(), 'YYYY-MM');

    INSERT INTO gateway_cost_ledgers (
        org_id, user_id, route_id, request_id,
        provider, model,
        prompt_tokens, completion_tokens, total_tokens,
        prompt_cost_microcents, completion_cost_microcents, total_cost_microcents,
        latency_ms, endpoint, status_code,
        is_cached, is_streaming,
        error_type, error_message,
        billing_period, request_metadata
    ) VALUES (
        p_org_id, p_user_id, p_route_id, p_request_id,
        p_provider, p_model,
        p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens,
        p_prompt_cost_microcents, p_completion_cost_microcents,
        p_prompt_cost_microcents + p_completion_cost_microcents,
        p_latency_ms, p_endpoint, p_status_code,
        p_is_cached, p_is_streaming,
        p_error_type, p_error_message,
        v_billing_period, p_metadata
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and update rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_key TEXT,
    p_window_seconds INTEGER,
    p_max_requests INTEGER,
    p_max_tokens INTEGER DEFAULT NULL,
    p_token_increment INTEGER DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
    v_current_requests INTEGER;
    v_current_tokens INTEGER;
    v_allowed BOOLEAN;
BEGIN
    v_window_start := DATE_TRUNC('second', NOW()) - (EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second';
    v_window_end := v_window_start + (p_window_seconds * INTERVAL '1 second');

    -- Upsert rate limit counter
    INSERT INTO gateway_rate_limit_counters (key, window_start, window_end, request_count, token_count)
    VALUES (p_key, v_window_start, v_window_end, 1, p_token_increment)
    ON CONFLICT (key, window_start) DO UPDATE
    SET
        request_count = gateway_rate_limit_counters.request_count + 1,
        token_count = gateway_rate_limit_counters.token_count + p_token_increment,
        updated_at = NOW()
    RETURNING request_count, token_count INTO v_current_requests, v_current_tokens;

    -- Check limits
    v_allowed := v_current_requests <= p_max_requests;
    IF p_max_tokens IS NOT NULL AND v_allowed THEN
        v_allowed := v_current_tokens <= p_max_tokens;
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'current_requests', v_current_requests,
        'current_tokens', v_current_tokens,
        'max_requests', p_max_requests,
        'max_tokens', p_max_tokens,
        'window_start', v_window_start,
        'window_end', v_window_end,
        'retry_after', CASE WHEN NOT v_allowed THEN v_window_end ELSE NULL END
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE gateway_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_cost_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_circuit_breaker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_semantic_cache ENABLE ROW LEVEL SECURITY;

-- Routes: org members can read, admins can write
CREATE POLICY gateway_routes_select ON gateway_routes FOR SELECT
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_routes_insert ON gateway_routes FOR INSERT
    WITH CHECK (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_routes_update ON gateway_routes FOR UPDATE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_routes_delete ON gateway_routes FOR DELETE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Policies: same as routes
CREATE POLICY gateway_policies_select ON gateway_policies FOR SELECT
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_policies_insert ON gateway_policies FOR INSERT
    WITH CHECK (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_policies_update ON gateway_policies FOR UPDATE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_policies_delete ON gateway_policies FOR DELETE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Cost ledgers: users see their own, admins see org
CREATE POLICY gateway_cost_ledgers_select ON gateway_cost_ledgers FOR SELECT
    USING (
        user_id = auth.uid()
        OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_cost_ledgers_insert ON gateway_cost_ledgers FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Rate limit counters: service role only
CREATE POLICY gateway_rate_limit_counters_all ON gateway_rate_limit_counters FOR ALL
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Circuit breaker: service role only
CREATE POLICY gateway_circuit_breaker_all ON gateway_circuit_breaker_state FOR ALL
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Semantic cache: org members can read
CREATE POLICY gateway_semantic_cache_select ON gateway_semantic_cache FOR SELECT
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_semantic_cache_insert ON gateway_semantic_cache FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_semantic_cache_update ON gateway_semantic_cache FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY gateway_semantic_cache_delete ON gateway_semantic_cache FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- =====================================================
-- Triggers for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_gateway_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_gateway_routes_updated_at
    BEFORE UPDATE ON gateway_routes
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_gateway_policies_updated_at
    BEFORE UPDATE ON gateway_policies
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_gateway_rate_limit_updated_at
    BEFORE UPDATE ON gateway_rate_limit_counters
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_gateway_circuit_breaker_updated_at
    BEFORE UPDATE ON gateway_circuit_breaker_state
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_gateway_semantic_cache_updated_at
    BEFORE UPDATE ON gateway_semantic_cache
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

-- =====================================================
-- Cleanup job for expired data (run via pg_cron or external scheduler)
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_gateway_expired_data()
RETURNS void AS $$
BEGIN
    -- Clean expired rate limit counters (older than 1 hour)
    DELETE FROM gateway_rate_limit_counters
    WHERE window_end < NOW() - INTERVAL '1 hour';

    -- Clean expired semantic cache
    DELETE FROM gateway_semantic_cache
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
