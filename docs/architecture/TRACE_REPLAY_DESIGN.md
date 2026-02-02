# Trace Replay UI Design Document

> Version: 1.0.0
> Last Updated: 2026-02-02
> Status: Design Document

---

## 1. Overview

The Trace Replay UI enables users to visualize, replay, and analyze agent execution traces. This feature supports debugging, evaluation, and compliance review of AI agent behavior.

---

## 2. User Stories

### 2.1 Primary Users

| User | Goal |
|------|------|
| Developer | Debug why an agent made certain decisions |
| QA Engineer | Verify agent behavior against test cases |
| Compliance Officer | Audit agent actions for policy compliance |
| Product Manager | Understand user journey and agent effectiveness |

### 2.2 Key Use Cases

1. **Debug Failed Execution**
   - View step-by-step execution
   - Identify where things went wrong
   - Inspect inputs/outputs at each step

2. **Compare Executions**
   - A/B compare two traces
   - Identify behavior differences
   - Evaluate prompt changes

3. **Compliance Audit**
   - Review tool usage
   - Verify approval workflows
   - Export evidence

4. **Performance Analysis**
   - Identify slow steps
   - Analyze token usage
   - Optimize execution paths

---

## 3. Data Model

### 3.1 Trace Structure

```typescript
interface Trace {
  id: string;
  sessionId: string;
  conversationId?: string;
  organizationId: string;

  // Metadata
  agentId: string;
  agentVersion: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs: number;

  // Status
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;

  // Input/Output
  input: {
    userMessage: string;
    context?: Record<string, unknown>;
  };
  output?: {
    finalResponse: string;
    artifacts?: Artifact[];
  };

  // Steps
  steps: TraceStep[];

  // Metrics
  metrics: TraceMetrics;

  // Tags for filtering
  tags: string[];
}

interface TraceStep {
  id: string;
  index: number;
  type: 'llm_call' | 'tool_call' | 'retrieval' | 'approval' | 'user_input' | 'system';

  // Timing
  startedAt: Date;
  completedAt?: Date;
  durationMs: number;

  // Content
  name: string;
  input: unknown;
  output?: unknown;

  // Status
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: {
    code: string;
    message: string;
    stack?: string;
  };

  // LLM-specific
  llm?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    temperature: number;
  };

  // Tool-specific
  tool?: {
    toolId: string;
    toolName: string;
    riskLevel: string;
    approvalRequired: boolean;
    approvalId?: string;
  };

  // Retrieval-specific
  retrieval?: {
    query: string;
    sources: RetrievalSource[];
    relevanceScores: number[];
  };

  // Children (for nested steps)
  children?: TraceStep[];
}

interface TraceMetrics {
  totalSteps: number;
  llmCalls: number;
  toolCalls: number;
  retrievals: number;
  totalTokens: number;
  estimatedCostUsd: number;
  avgStepDurationMs: number;
}
```

### 3.2 Database Schema

```sql
-- Traces table (main)
CREATE TABLE IF NOT EXISTS agent_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  conversation_id UUID REFERENCES spring_conversations(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  agent_id TEXT NOT NULL,
  agent_version TEXT,

  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,

  input JSONB NOT NULL,
  output JSONB,

  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  tags TEXT[] DEFAULT '{}',

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- For querying
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trace steps table
CREATE TABLE IF NOT EXISTS agent_trace_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES agent_traces(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES agent_trace_steps(id),

  index INTEGER NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending',
  error JSONB,

  input JSONB,
  output JSONB,

  -- Type-specific data
  llm_data JSONB,
  tool_data JSONB,
  retrieval_data JSONB,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Indexes
CREATE INDEX idx_traces_org ON agent_traces(organization_id);
CREATE INDEX idx_traces_session ON agent_traces(session_id);
CREATE INDEX idx_traces_status ON agent_traces(status);
CREATE INDEX idx_traces_created ON agent_traces(created_at DESC);
CREATE INDEX idx_trace_steps_trace ON agent_trace_steps(trace_id);
CREATE INDEX idx_trace_steps_type ON agent_trace_steps(type);
```

---

## 4. UI Components

### 4.1 Component Hierarchy

```
TraceReplayPage
├── TraceListPanel
│   ├── TraceFilters
│   │   ├── DateRangePicker
│   │   ├── StatusFilter
│   │   ├── AgentFilter
│   │   └── TagFilter
│   └── TraceList
│       └── TraceListItem (repeated)
│
├── TraceDetailPanel
│   ├── TraceHeader
│   │   ├── TraceStatus
│   │   ├── TraceMetrics
│   │   └── TraceActions
│   │
│   ├── TraceTimeline
│   │   ├── TimelineControls
│   │   │   ├── PlayButton
│   │   │   ├── StepButtons
│   │   │   ├── SpeedControl
│   │   │   └── ProgressBar
│   │   └── TimelineSteps
│   │       └── TimelineStep (repeated)
│   │
│   └── StepDetailPanel
│       ├── StepHeader
│       ├── StepInput
│       ├── StepOutput
│       └── StepMetrics
│
└── ComparePanel (optional)
    ├── TraceA
    └── TraceB
```

### 4.2 Main Components

#### TraceTimeline

```tsx
interface TraceTimelineProps {
  trace: Trace;
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onStepChange: (index: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
}

const TraceTimeline: React.FC<TraceTimelineProps> = ({
  trace,
  currentStepIndex,
  isPlaying,
  playbackSpeed,
  onStepChange,
  onPlayPause,
  onSpeedChange,
}) => {
  return (
    <div className="trace-timeline">
      {/* Controls */}
      <div className="timeline-controls">
        <button onClick={onPlayPause}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button onClick={() => onStepChange(Math.max(0, currentStepIndex - 1))}>
          <StepBackIcon />
        </button>
        <button onClick={() => onStepChange(Math.min(trace.steps.length - 1, currentStepIndex + 1))}>
          <StepForwardIcon />
        </button>
        <select value={playbackSpeed} onChange={(e) => onSpeedChange(Number(e.target.value))}>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>

      {/* Progress bar */}
      <div className="timeline-progress">
        <div
          className="timeline-progress-fill"
          style={{ width: `${(currentStepIndex / (trace.steps.length - 1)) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="timeline-steps">
        {trace.steps.map((step, index) => (
          <TimelineStep
            key={step.id}
            step={step}
            isActive={index === currentStepIndex}
            isPast={index < currentStepIndex}
            onClick={() => onStepChange(index)}
          />
        ))}
      </div>
    </div>
  );
};
```

#### StepDetail

```tsx
interface StepDetailProps {
  step: TraceStep;
}

const StepDetail: React.FC<StepDetailProps> = ({ step }) => {
  return (
    <div className="step-detail">
      {/* Header */}
      <div className="step-header">
        <StepTypeIcon type={step.type} />
        <h3>{step.name}</h3>
        <StatusBadge status={step.status} />
        <span className="step-duration">{step.durationMs}ms</span>
      </div>

      {/* Type-specific content */}
      {step.type === 'llm_call' && <LLMCallDetail step={step} />}
      {step.type === 'tool_call' && <ToolCallDetail step={step} />}
      {step.type === 'retrieval' && <RetrievalDetail step={step} />}
      {step.type === 'approval' && <ApprovalDetail step={step} />}

      {/* Input/Output */}
      <div className="step-io">
        <Tabs>
          <Tab label="Input">
            <JsonViewer data={step.input} />
          </Tab>
          <Tab label="Output">
            <JsonViewer data={step.output} />
          </Tab>
          {step.error && (
            <Tab label="Error">
              <ErrorDisplay error={step.error} />
            </Tab>
          )}
        </Tabs>
      </div>
    </div>
  );
};
```

### 4.3 Visualization Types

#### Timeline View (Default)

```
┌─────────────────────────────────────────────────────────────────┐
│ ▶ ⏮ ⏭  1x  ═══════════●══════════════════════════════  3/12   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐          │
│  │ LLM  │──▶│ Tool │──▶│ LLM  │──▶│Apprvl│──▶│ Tool │          │
│  │ 120ms│   │ 45ms │   │ 89ms │   │ wait │   │ 23ms │          │
│  └──────┘   └──────┘   └──────┘   └──────┘   └──────┘          │
│     ●          ○          ○          ○          ○               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Waterfall View

```
┌─────────────────────────────────────────────────────────────────┐
│ Step                    │ Duration │ Timeline                   │
├─────────────────────────┼──────────┼────────────────────────────┤
│ 1. Parse user input     │    5ms   │ ██                         │
│ 2. LLM: Plan            │  120ms   │   ████████████             │
│ 3. Tool: file_read      │   45ms   │              █████         │
│ 4. LLM: Analyze         │   89ms   │                   █████████│
│ 5. Approval: email_send │ waiting  │                            │
└─────────────────────────────────────────────────────────────────┘
```

#### Tree View (for nested steps)

```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ LLM Call: Plan execution                           120ms  ✓  │
│   ├─ ▶ Prompt preparation                              3ms  ✓  │
│   ├─ ▶ API call to gpt-4                             115ms  ✓  │
│   └─ ▶ Response parsing                                2ms  ✓  │
│ ▼ Tool: file_read                                     45ms  ✓  │
│   ├─ ▶ Permission check                                1ms  ✓  │
│   └─ ▶ Read file content                              44ms  ✓  │
│ ▼ LLM Call: Analyze results                           89ms  ✓  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Features

### 5.1 Playback Controls

- **Play/Pause**: Auto-advance through steps
- **Step Forward/Back**: Manual navigation
- **Jump to Step**: Click timeline or list
- **Speed Control**: 0.5x, 1x, 2x, 4x
- **Loop**: Repeat specific range

### 5.2 Filtering & Search

- **Date Range**: Filter by execution time
- **Status**: running, completed, failed
- **Agent**: Filter by agent ID
- **Tags**: Custom tags
- **Full-text Search**: Search inputs/outputs

### 5.3 Comparison Mode

- Side-by-side trace comparison
- Diff highlighting for inputs/outputs
- Metrics comparison table
- Step alignment (when possible)

### 5.4 Export Options

- **JSON**: Full trace data
- **CSV**: Metrics and summary
- **PDF**: Formatted report
- **Share Link**: Temporary shareable URL

---

## 6. API Endpoints

### 6.1 List Traces

```
GET /api/traces
Query params:
  - organization_id: UUID (required)
  - status: string (optional)
  - agent_id: string (optional)
  - from: ISO date (optional)
  - to: ISO date (optional)
  - limit: number (default: 50)
  - offset: number (default: 0)
```

### 6.2 Get Trace

```
GET /api/traces/:id
Response: Trace with all steps
```

### 6.3 Get Trace Steps

```
GET /api/traces/:id/steps
Query params:
  - type: string (optional)
  - status: string (optional)
```

### 6.4 Compare Traces

```
POST /api/traces/compare
Body:
  - trace_a_id: UUID
  - trace_b_id: UUID
Response: Comparison result with diffs
```

### 6.5 Export Trace

```
GET /api/traces/:id/export
Query params:
  - format: 'json' | 'csv' | 'pdf'
```

---

## 7. Implementation Plan

### 7.1 Phase 1: Core Replay (2 weeks)

- [ ] Database schema and migrations
- [ ] Basic trace list UI
- [ ] Timeline component
- [ ] Step detail panel
- [ ] Playback controls

### 7.2 Phase 2: Enhanced Features (2 weeks)

- [ ] Filtering and search
- [ ] Tree view for nested steps
- [ ] Waterfall visualization
- [ ] Export functionality

### 7.3 Phase 3: Advanced Features (2 weeks)

- [ ] Comparison mode
- [ ] Real-time trace streaming
- [ ] Eval dashboard integration
- [ ] SIEM export

---

## 8. Technical Considerations

### 8.1 Performance

- Virtualized list for large trace sets
- Lazy loading of step details
- Compressed storage for inputs/outputs
- Client-side caching

### 8.2 Security

- Organization-scoped access
- PII redaction in exports
- Audit logging of trace access
- Time-limited share links

### 8.3 Scalability

- Partitioned storage by date
- Archival of old traces
- Configurable retention periods
- Sampling for high-volume agents

---

*Questions? Contact platform@seizn.com*
