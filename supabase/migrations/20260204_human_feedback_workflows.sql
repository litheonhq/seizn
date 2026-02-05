-- Human Feedback Workflows Migration
-- Epic F: Annotation Queues, Review Workflows, Dataset Building

-- =====================================================
-- Annotation Queues Table
-- Queue system for human review of AI outputs
-- =====================================================
CREATE TABLE IF NOT EXISTS annotation_queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Queue configuration
    queue_type TEXT NOT NULL DEFAULT 'general',  -- 'general', 'safety', 'quality', 'accuracy', 'feedback'
    priority INTEGER NOT NULL DEFAULT 100,  -- Higher = more urgent

    -- Assignment settings
    assignment_strategy TEXT NOT NULL DEFAULT 'round_robin',  -- 'round_robin', 'load_balanced', 'skill_based', 'manual'
    max_items_per_annotator INTEGER DEFAULT 50,  -- Daily limit per annotator

    -- Quality control
    require_consensus BOOLEAN NOT NULL DEFAULT false,
    min_reviewers INTEGER NOT NULL DEFAULT 1,
    consensus_threshold NUMERIC(3,2) DEFAULT 0.67,  -- Agreement ratio needed

    -- Auto-assignment rules
    auto_assign_rules JSONB DEFAULT '{}',
    /*
    Example:
    {
        "model_filter": ["gpt-4", "claude-3"],
        "confidence_threshold": 0.7,
        "error_types": ["hallucination", "unsafe"],
        "sample_rate": 0.1
    }
    */

    -- SLA settings
    sla_hours INTEGER,  -- Target hours to complete review
    escalation_policy JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_queue_type CHECK (
        queue_type IN ('general', 'safety', 'quality', 'accuracy', 'feedback', 'custom')
    ),
    CONSTRAINT valid_assignment_strategy CHECK (
        assignment_strategy IN ('round_robin', 'load_balanced', 'skill_based', 'manual')
    )
);

-- Index for queue lookups
CREATE INDEX idx_annotation_queues_org ON annotation_queues(org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_annotation_queues_type ON annotation_queues(queue_type, priority DESC);

-- =====================================================
-- Annotation Items Table
-- Individual items queued for annotation
-- =====================================================
CREATE TABLE IF NOT EXISTS annotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES annotation_queues(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Source reference
    source_type TEXT NOT NULL,  -- 'trace', 'message', 'completion', 'tool_call', 'search'
    source_id UUID NOT NULL,

    -- Content to annotate
    content JSONB NOT NULL,
    /*
    Example for completion:
    {
        "prompt": "...",
        "completion": "...",
        "model": "gpt-4",
        "metadata": {...}
    }
    */

    -- Context
    context JSONB DEFAULT '{}',  -- Additional context for annotators

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'assigned', 'in_progress', 'completed', 'skipped', 'escalated'
    priority INTEGER NOT NULL DEFAULT 100,

    -- Assignment
    assigned_to UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ,

    -- Deadlines
    due_at TIMESTAMPTZ,
    sla_breached BOOLEAN NOT NULL DEFAULT false,

    -- Completion
    completed_at TIMESTAMPTZ,
    time_spent_seconds INTEGER,

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_item_status CHECK (
        status IN ('pending', 'assigned', 'in_progress', 'completed', 'skipped', 'escalated')
    ),
    CONSTRAINT valid_source_type CHECK (
        source_type IN ('trace', 'message', 'completion', 'tool_call', 'search', 'document')
    )
);

-- Indexes for annotation items
CREATE INDEX idx_annotation_items_queue ON annotation_items(queue_id, status);
CREATE INDEX idx_annotation_items_assigned ON annotation_items(assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_annotation_items_pending ON annotation_items(queue_id, priority DESC, created_at) WHERE status = 'pending';
CREATE INDEX idx_annotation_items_source ON annotation_items(source_type, source_id);

-- =====================================================
-- Annotations Table
-- Actual annotations/labels provided by reviewers
-- =====================================================
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES annotation_items(id) ON DELETE CASCADE,
    annotator_id UUID NOT NULL REFERENCES auth.users(id),

    -- Annotation data
    annotation_type TEXT NOT NULL,  -- 'label', 'rating', 'edit', 'flag', 'comment'

    -- Labels (for classification tasks)
    labels JSONB DEFAULT '[]',
    /*
    Example:
    [
        {"name": "accuracy", "value": "correct"},
        {"name": "helpfulness", "value": 4, "scale": 5},
        {"name": "safety", "value": "safe"}
    ]
    */

    -- Rating (for scoring tasks)
    rating INTEGER,
    rating_scale INTEGER DEFAULT 5,

    -- Text annotations
    correction TEXT,  -- Corrected/edited version
    reasoning TEXT,   -- Why this annotation
    comments TEXT,    -- Additional notes

    -- Highlighted spans (for detailed feedback)
    highlights JSONB DEFAULT '[]',
    /*
    Example:
    [
        {"start": 10, "end": 50, "label": "hallucination", "comment": "..."},
        {"start": 100, "end": 120, "label": "unsafe", "severity": "high"}
    ]
    */

    -- Quality metrics
    confidence NUMERIC(3,2),  -- Annotator's confidence 0-1
    time_spent_seconds INTEGER,

    -- Review status (for consensus/QA)
    is_reviewed BOOLEAN NOT NULL DEFAULT false,
    reviewed_by UUID REFERENCES auth.users(id),
    review_outcome TEXT,  -- 'approved', 'rejected', 'needs_revision'

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_annotation_type CHECK (
        annotation_type IN ('label', 'rating', 'edit', 'flag', 'comment', 'multi')
    )
);

-- Indexes for annotations
CREATE INDEX idx_annotations_item ON annotations(item_id);
CREATE INDEX idx_annotations_annotator ON annotations(annotator_id, created_at DESC);
CREATE INDEX idx_annotations_type ON annotations(annotation_type);

-- =====================================================
-- Review Workflows Table
-- Approve/reject workflows for high-risk tool calls
-- =====================================================
CREATE TABLE IF NOT EXISTS review_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Trigger conditions
    trigger_type TEXT NOT NULL,  -- 'tool_call', 'completion', 'action', 'threshold'
    trigger_conditions JSONB NOT NULL,
    /*
    Example:
    {
        "tool_names": ["execute_code", "delete_file", "send_email"],
        "risk_level": ["high", "critical"],
        "cost_threshold_usd": 10,
        "model_filter": ["gpt-4"]
    }
    */

    -- Workflow configuration
    workflow_type TEXT NOT NULL DEFAULT 'approval',  -- 'approval', 'review', 'audit'
    require_approval BOOLEAN NOT NULL DEFAULT true,
    auto_approve_after_seconds INTEGER,  -- Auto-approve if no response (null = never)

    -- Escalation
    escalation_chain JSONB DEFAULT '[]',
    /*
    Example:
    [
        {"level": 1, "users": ["user1"], "timeout_seconds": 3600},
        {"level": 2, "roles": ["admin"], "timeout_seconds": 7200}
    ]
    */

    -- Notification settings
    notification_channels JSONB DEFAULT '[]',
    /*
    Example:
    [
        {"type": "email", "recipients": ["admin@org.com"]},
        {"type": "slack", "webhook": "https://..."}
    ]
    */

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 100,

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_trigger_type CHECK (
        trigger_type IN ('tool_call', 'completion', 'action', 'threshold', 'custom')
    ),
    CONSTRAINT valid_workflow_type CHECK (
        workflow_type IN ('approval', 'review', 'audit', 'notification')
    )
);

-- Index for workflow matching
CREATE INDEX idx_review_workflows_org ON review_workflows(org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_review_workflows_trigger ON review_workflows(trigger_type, is_active);

-- =====================================================
-- Review Requests Table
-- Pending reviews triggered by workflows
-- =====================================================
CREATE TABLE IF NOT EXISTS review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES review_workflows(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Request details
    request_type TEXT NOT NULL,  -- 'tool_call', 'completion', 'action'

    -- Source reference
    source_type TEXT NOT NULL,
    source_id UUID NOT NULL,

    -- Content awaiting review
    content JSONB NOT NULL,
    context JSONB DEFAULT '{}',

    -- Risk assessment
    risk_level TEXT NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
    risk_factors JSONB DEFAULT '[]',

    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'expired', 'escalated'

    -- Assignment
    assigned_to UUID REFERENCES auth.users(id),
    escalation_level INTEGER NOT NULL DEFAULT 1,

    -- Decision
    decision TEXT,  -- 'approve', 'reject', 'modify'
    decision_by UUID REFERENCES auth.users(id),
    decision_at TIMESTAMPTZ,
    decision_reason TEXT,

    -- Modified content (if decision = 'modify')
    modified_content JSONB,

    -- Timeouts
    expires_at TIMESTAMPTZ,
    auto_action TEXT,  -- What happens on expiry: 'approve', 'reject', 'escalate'

    -- Audit trail
    notification_sent_at TIMESTAMPTZ,
    notification_channels TEXT[],

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_request_status CHECK (
        status IN ('pending', 'approved', 'rejected', 'expired', 'escalated', 'cancelled')
    ),
    CONSTRAINT valid_risk_level CHECK (
        risk_level IN ('low', 'medium', 'high', 'critical')
    )
);

-- Indexes for review requests
CREATE INDEX idx_review_requests_workflow ON review_requests(workflow_id, status);
CREATE INDEX idx_review_requests_pending ON review_requests(org_id, status, expires_at) WHERE status = 'pending';
CREATE INDEX idx_review_requests_assigned ON review_requests(assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_review_requests_source ON review_requests(source_type, source_id);

-- =====================================================
-- Training Datasets Table
-- Curated datasets built from production annotations
-- =====================================================
CREATE TABLE IF NOT EXISTS training_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Dataset type
    dataset_type TEXT NOT NULL,  -- 'fine_tune', 'evaluation', 'rlhf', 'dpo', 'custom'
    format TEXT NOT NULL DEFAULT 'jsonl',  -- 'jsonl', 'parquet', 'csv'

    -- Source configuration
    source_config JSONB NOT NULL DEFAULT '{}',
    /*
    Example:
    {
        "queue_ids": ["queue1", "queue2"],
        "annotation_types": ["label", "rating"],
        "min_consensus": 0.8,
        "date_range": {"from": "2024-01-01", "to": "2024-06-01"}
    }
    */

    -- Dataset stats
    total_examples INTEGER NOT NULL DEFAULT 0,
    approved_examples INTEGER NOT NULL DEFAULT 0,

    -- Quality metrics
    avg_consensus_score NUMERIC(3,2),
    avg_annotator_agreement NUMERIC(3,2),

    -- Export status
    last_export_at TIMESTAMPTZ,
    export_location TEXT,
    export_checksum TEXT,

    -- Version control
    version INTEGER NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES training_datasets(id),

    -- Status
    status TEXT NOT NULL DEFAULT 'draft',  -- 'draft', 'building', 'ready', 'exported', 'archived'

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_dataset_type CHECK (
        dataset_type IN ('fine_tune', 'evaluation', 'rlhf', 'dpo', 'preference', 'custom')
    ),
    CONSTRAINT valid_dataset_status CHECK (
        status IN ('draft', 'building', 'ready', 'exported', 'archived')
    )
);

-- Index for datasets
CREATE INDEX idx_training_datasets_org ON training_datasets(org_id, status);
CREATE INDEX idx_training_datasets_type ON training_datasets(dataset_type);

-- =====================================================
-- Dataset Examples Table
-- Individual examples in a training dataset
-- =====================================================
CREATE TABLE IF NOT EXISTS dataset_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES training_datasets(id) ON DELETE CASCADE,

    -- Source
    annotation_id UUID REFERENCES annotations(id) ON DELETE SET NULL,
    source_item_id UUID REFERENCES annotation_items(id) ON DELETE SET NULL,

    -- Example data (format depends on dataset_type)
    example_data JSONB NOT NULL,
    /*
    Fine-tune format:
    {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}

    DPO format:
    {"prompt": "...", "chosen": "...", "rejected": "..."}

    Evaluation format:
    {"input": "...", "expected_output": "...", "metadata": {...}}
    */

    -- Quality
    quality_score NUMERIC(3,2),
    consensus_score NUMERIC(3,2),

    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_example_status CHECK (
        status IN ('pending', 'approved', 'rejected')
    )
);

-- Indexes for dataset examples
CREATE INDEX idx_dataset_examples_dataset ON dataset_examples(dataset_id, status);
CREATE INDEX idx_dataset_examples_annotation ON dataset_examples(annotation_id) WHERE annotation_id IS NOT NULL;

-- =====================================================
-- Annotator Performance Table
-- Track annotator quality and throughput
-- =====================================================
CREATE TABLE IF NOT EXISTS annotator_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annotator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    queue_id UUID REFERENCES annotation_queues(id) ON DELETE CASCADE,

    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Volume metrics
    items_completed INTEGER NOT NULL DEFAULT 0,
    items_skipped INTEGER NOT NULL DEFAULT 0,
    total_time_seconds INTEGER NOT NULL DEFAULT 0,

    -- Quality metrics
    accuracy_score NUMERIC(3,2),  -- Agreement with consensus/gold
    consistency_score NUMERIC(3,2),  -- Self-consistency over time

    -- Speed metrics
    avg_time_per_item_seconds INTEGER,

    -- Agreement with others
    inter_annotator_agreement NUMERIC(3,2),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_annotator_period UNIQUE (annotator_id, org_id, queue_id, period_start)
);

-- Index for performance queries
CREATE INDEX idx_annotator_performance_user ON annotator_performance(annotator_id, period_start DESC);
CREATE INDEX idx_annotator_performance_org ON annotator_performance(org_id, period_start DESC);

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to assign next item to annotator
CREATE OR REPLACE FUNCTION get_next_annotation_item(
    p_queue_id UUID,
    p_annotator_id UUID
) RETURNS UUID AS $$
DECLARE
    v_item_id UUID;
    v_max_items INTEGER;
    v_current_count INTEGER;
BEGIN
    -- Check annotator's daily limit
    SELECT max_items_per_annotator INTO v_max_items
    FROM annotation_queues WHERE id = p_queue_id;

    SELECT COUNT(*) INTO v_current_count
    FROM annotation_items
    WHERE queue_id = p_queue_id
      AND assigned_to = p_annotator_id
      AND assigned_at >= CURRENT_DATE
      AND status IN ('assigned', 'in_progress', 'completed');

    IF v_max_items IS NOT NULL AND v_current_count >= v_max_items THEN
        RETURN NULL;  -- Daily limit reached
    END IF;

    -- Get highest priority pending item
    SELECT id INTO v_item_id
    FROM annotation_items
    WHERE queue_id = p_queue_id
      AND status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_item_id IS NOT NULL THEN
        -- Assign to annotator
        UPDATE annotation_items
        SET status = 'assigned',
            assigned_to = p_annotator_id,
            assigned_at = NOW(),
            updated_at = NOW()
        WHERE id = v_item_id;
    END IF;

    RETURN v_item_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create annotation item from trace
CREATE OR REPLACE FUNCTION create_annotation_item_from_trace(
    p_queue_id UUID,
    p_trace_id UUID,
    p_content JSONB,
    p_context JSONB DEFAULT '{}',
    p_priority INTEGER DEFAULT 100
) RETURNS UUID AS $$
DECLARE
    v_item_id UUID;
    v_org_id UUID;
    v_due_at TIMESTAMPTZ;
    v_sla_hours INTEGER;
BEGIN
    -- Get queue info
    SELECT org_id, sla_hours INTO v_org_id, v_sla_hours
    FROM annotation_queues WHERE id = p_queue_id;

    IF v_sla_hours IS NOT NULL THEN
        v_due_at := NOW() + (v_sla_hours * INTERVAL '1 hour');
    END IF;

    INSERT INTO annotation_items (
        queue_id, org_id, source_type, source_id,
        content, context, priority, due_at
    ) VALUES (
        p_queue_id, v_org_id, 'trace', p_trace_id,
        p_content, p_context, p_priority, v_due_at
    ) RETURNING id INTO v_item_id;

    RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to submit review decision
CREATE OR REPLACE FUNCTION submit_review_decision(
    p_request_id UUID,
    p_decision TEXT,
    p_reason TEXT DEFAULT NULL,
    p_modified_content JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF p_decision NOT IN ('approve', 'reject', 'modify') THEN
        RAISE EXCEPTION 'Invalid decision: %', p_decision;
    END IF;

    UPDATE review_requests
    SET status = CASE
            WHEN p_decision = 'approve' THEN 'approved'
            WHEN p_decision = 'reject' THEN 'rejected'
            ELSE status
        END,
        decision = p_decision,
        decision_by = v_user_id,
        decision_at = NOW(),
        decision_reason = p_reason,
        modified_content = p_modified_content,
        updated_at = NOW()
    WHERE id = p_request_id
      AND status = 'pending';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE annotation_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotator_performance ENABLE ROW LEVEL SECURITY;

-- Annotation queues: org members can view, admins can manage
CREATE POLICY annotation_queues_select ON annotation_queues FOR SELECT
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY annotation_queues_insert ON annotation_queues FOR INSERT
    WITH CHECK (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY annotation_queues_update ON annotation_queues FOR UPDATE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY annotation_queues_delete ON annotation_queues FOR DELETE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Annotation items: assigned annotators can access
CREATE POLICY annotation_items_select ON annotation_items FOR SELECT
    USING (
        assigned_to = auth.uid()
        OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY annotation_items_update ON annotation_items FOR UPDATE
    USING (
        assigned_to = auth.uid()
        OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Annotations: annotators can manage their own
CREATE POLICY annotations_select ON annotations FOR SELECT
    USING (
        annotator_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM annotation_items ai
            JOIN annotation_queues aq ON ai.queue_id = aq.id
            WHERE ai.id = annotations.item_id
              AND aq.org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        )
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY annotations_insert ON annotations FOR INSERT
    WITH CHECK (
        annotator_id = auth.uid()
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY annotations_update ON annotations FOR UPDATE
    USING (
        annotator_id = auth.uid()
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Review workflows: org admins
CREATE POLICY review_workflows_select ON review_workflows FOR SELECT
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY review_workflows_insert ON review_workflows FOR INSERT
    WITH CHECK (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY review_workflows_update ON review_workflows FOR UPDATE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY review_workflows_delete ON review_workflows FOR DELETE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Review requests: assigned reviewers and admins
CREATE POLICY review_requests_select ON review_requests FOR SELECT
    USING (
        assigned_to = auth.uid()
        OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY review_requests_update ON review_requests FOR UPDATE
    USING (
        assigned_to = auth.uid()
        OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Training datasets: org members
CREATE POLICY training_datasets_select ON training_datasets FOR SELECT
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY training_datasets_insert ON training_datasets FOR INSERT
    WITH CHECK (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY training_datasets_update ON training_datasets FOR UPDATE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

CREATE POLICY training_datasets_delete ON training_datasets FOR DELETE
    USING (
        org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Dataset examples: inherit from dataset
CREATE POLICY dataset_examples_select ON dataset_examples FOR SELECT
    USING (
        dataset_id IN (
            SELECT id FROM training_datasets
            WHERE org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text)
        )
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- Annotator performance: own performance or org admin
CREATE POLICY annotator_performance_select ON annotator_performance FOR SELECT
    USING (
        annotator_id = auth.uid()
        OR org_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service_role')
    );

-- =====================================================
-- Triggers
-- =====================================================
CREATE TRIGGER trigger_annotation_queues_updated_at
    BEFORE UPDATE ON annotation_queues
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_annotation_items_updated_at
    BEFORE UPDATE ON annotation_items
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_annotations_updated_at
    BEFORE UPDATE ON annotations
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_review_workflows_updated_at
    BEFORE UPDATE ON review_workflows
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_review_requests_updated_at
    BEFORE UPDATE ON review_requests
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_training_datasets_updated_at
    BEFORE UPDATE ON training_datasets
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();

CREATE TRIGGER trigger_annotator_performance_updated_at
    BEFORE UPDATE ON annotator_performance
    FOR EACH ROW EXECUTE FUNCTION update_gateway_updated_at();
