# Seizn - 5-Minute Quickstart

Semantic memory layer for AI applications. Get started in 5 minutes.

## Installation

### JavaScript/TypeScript

```bash
# Memory Layer (Spring)
npm install @seizn/spring

# RAG/Document Search (Summer)
npm install @seizn/summer
```

### Python

```bash
pip install seizn
```

## Get API Key

1. Sign up at [seizn.com/signup](https://seizn.com/signup)
2. Copy your API key from the dashboard
3. Set as environment variable:

```bash
# Linux/Mac
export SEIZN_API_KEY=szn_your_api_key

# Windows (PowerShell)
$env:SEIZN_API_KEY="szn_your_api_key"

# Windows (CMD)
set SEIZN_API_KEY=szn_your_api_key
```

## Quick Start

### TypeScript (Spring SDK)

```typescript
import { SpringClient } from '@seizn/spring';

const client = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY!,
});

// Add a memory
await client.add({
  content: 'User prefers dark mode and quiet notifications',
  userId: 'user123',
});

// Search memories
const results = await client.search({
  query: 'user preferences',
  userId: 'user123',
});

results.forEach(r => console.log(`${r.score}: ${r.content}`));
```

### Python (seizn SDK)

```python
from seizn import SeizClient

client = SeizClient(api_key="szn_your_api_key")

# Add a memory
memory = client.add(
    "User prefers dark mode and quiet notifications",
    user_id="user123"
)

# Search memories
results = client.search("user preferences", user_id="user123")
for r in results:
    print(f"{r.score:.2f}: {r.content}")
```

## Extract Memories from Conversations

### TypeScript

```typescript
const messages = [
  { role: 'user', content: 'I love hiking in the mountains' },
  { role: 'assistant', content: 'Great! Do you have a favorite trail?' },
  { role: 'user', content: 'Yes, I really enjoy the Pacific Crest Trail' },
];

const memories = await client.addMessages({
  messages,
  userId: 'user123',
});
```

### Python

```python
from seizn import MemoryMessage

messages = [
    MemoryMessage(role="user", content="I love hiking in the mountains"),
    MemoryMessage(role="assistant", content="Great! Do you have a favorite trail?"),
    MemoryMessage(role="user", content="Yes, I really enjoy the Pacific Crest Trail"),
]

memories = client.add_messages(messages, user_id="user123")
```

## Core Features

| Feature | Description |
|---------|-------------|
| **Semantic Search** | Find relevant memories using natural language |
| **Auto-extraction** | Automatically extract memories from conversations |
| **Multi-tenant** | Organize by user_id, agent_id, or namespace |
| **Metadata** | Attach custom metadata to memories |

## Memory Types

| Type | Use Case |
|------|----------|
| `fact` | Objective information |
| `preference` | User preferences |
| `experience` | Events, experiences |
| `instruction` | Rules, directives |

## SDKs

| Package | Platform | Purpose |
|---------|----------|---------|
| `@seizn/spring` | npm | Memory Layer |
| `@seizn/summer` | npm | RAG/Document Search |
| `seizn` | PyPI | Python SDK (Memory) |

## Next Steps

- [Spring SDK Guide](./spring-sdk-quickstart.md) - Detailed memory management
- [Summer SDK Guide](./summer-sdk-quickstart.md) - Document search & RAG
- [API Reference](./openapi.yaml) - Full API documentation
- [Dashboard](https://seizn.com/dashboard) - Manage API keys & usage

## Support

- Docs: [docs.seizn.com](https://docs.seizn.com)
- GitHub: [github.com/iruhana/seizn](https://github.com/iruhana/seizn)
