# Seizn Telemetry Module

OpenTelemetry-based tracing for LLM operations with full GenAI semantic conventions compliance.

## Features

- **OTEL GenAI Semconv**: Full compliance with [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- **Privacy-Safe Content Capture**: Hash-only mode by default, configurable per organization
- **Seizn Extensions**: Custom attributes for memory, guard, and policy tracking
- **Backend Agnostic**: Works with any OTEL-compatible backend (Collector, Jaeger, Grafana, etc.)

## Usage

### Basic LLM Call Instrumentation

```typescript
import { instrumentLLMCall, recordGenAIResponse } from '@/lib/telemetry';

const result = await instrumentLLMCall(
  'chat.completion',
  {
    system: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 1000,
  },
  async (span) => {
    const response = await openai.chat.completions.create({ ... });

    recordGenAIResponse(span, {
      id: response.id,
      model: response.model,
      finishReasons: [response.choices[0].finish_reason],
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });

    return response;
  },
  {
    seiznContext: {
      organizationId: 'org-123',
      userId: 'user-456',
      conversationId: 'conv-789',
      guardEnabled: true,
    },
    contentCapture: { mode: 'hash' },
  }
);
```

### Manual Span Management

```typescript
import {
  createGenAISpan,
  recordPrompt,
  recordGenAIResponse,
  endSpanSuccess,
  endSpanWithError,
} from '@/lib/telemetry';

const span = createGenAISpan('embedding.create', {
  system: 'openai',
  model: 'text-embedding-3-small',
});

try {
  recordPrompt(span, userInput, { mode: 'hash' });

  const result = await embed(userInput);

  recordGenAIResponse(span, {
    inputTokens: result.usage.prompt_tokens,
  });

  endSpanSuccess(span);
} catch (error) {
  endSpanWithError(span, error);
  throw error;
}
```

## Semantic Convention Attributes

### Standard GenAI Attributes

| Attribute | Description |
|-----------|-------------|
| `gen_ai.system` | AI provider (openai, anthropic, etc.) |
| `gen_ai.request.model` | Model name |
| `gen_ai.request.temperature` | Sampling temperature |
| `gen_ai.request.max_tokens` | Max output tokens |
| `gen_ai.usage.input_tokens` | Input token count |
| `gen_ai.usage.output_tokens` | Output token count |
| `gen_ai.response.finish_reasons` | Completion reasons |

### Seizn Extensions

| Attribute | Description |
|-----------|-------------|
| `seizn.organization.id` | Organization ID |
| `seizn.user.id` | User ID |
| `seizn.conversation.id` | Conversation ID |
| `seizn.memory.id` | Memory operation ID |
| `seizn.guard.enabled` | Guard feature status |
| `seizn.policy.applied` | Applied policies |

## Content Capture Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `off` | No content captured | Maximum privacy |
| `hash` | SHA-256 hash prefix only | Default, debugging without exposure |
| `full` | Full content captured | Development/audit only |

## OTEL Collector Configuration

See `OTEL_COLLECTOR_CONFIG_TEMPLATE` export for a ready-to-use collector configuration.

## API Endpoint

`GET /api/telemetry/config` returns client-side OTLP configuration including:
- Exporter endpoint and protocol
- Service metadata
- Organization-specific resource attributes
- Content capture policy
- Sampling configuration
