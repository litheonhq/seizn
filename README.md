# Seizn - AI Memory Infrastructure

> Seize your memories. Persistent memory for AI agents with built-in governance, tracing, and cost control.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-seizn.com-green.svg)](https://seizn.com/docs)

## What is Seizn?

Seizn is a production-ready AI memory SaaS platform that provides:

- **Spring** - Semantic memory layer with pgvector for long-term context
- **Summer** - RAG and document search with intelligent caching
- **Fall** - Observability, tracing, and experiment tracking
- **Winter** - Policy engine (OPA) for governance and compliance

## Quick Start

### 1. Get API Key

Sign up at [seizn.com/signup](https://seizn.com/signup) and copy your API key from the dashboard.

### 2. Install SDK

```bash
# Python
pip install seizn

# JavaScript/TypeScript
npm install @seizn/spring
```

### 3. Add Your First Memory

**Python:**
```python
from seizn import SeizClient

client = SeizClient(api_key="szn_your_api_key")

# Add a memory
client.add("User prefers dark mode", user_id="user123")

# Search memories
results = client.search("user preferences", user_id="user123")
for r in results:
    print(f"{r.score:.2f}: {r.content}")
```

**TypeScript:**
```typescript
import { SpringClient } from '@seizn/spring';

const client = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY!,
});

// Add a memory
await client.add({
  content: 'User prefers dark mode',
  userId: 'user123',
});

// Search memories
const results = await client.search({
  query: 'user preferences',
  userId: 'user123',
});
```

### MCP Integration (Claude Desktop)

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["@seizn/mcp-server"],
      "env": {
        "SEIZN_API_KEY": "szn_your_api_key"
      }
    }
  }
}
```

## Features

| Feature | Description |
|---------|-------------|
| **Semantic Search** | Find relevant memories using natural language |
| **Auto-extraction** | Automatically extract memories from conversations |
| **Multi-tenant** | Organize by user_id, agent_id, or namespace |
| **Policy Engine** | OPA-based governance for memory access |
| **Observability** | Built-in tracing with OpenTelemetry |
| **Forgetting Curve** | Configurable memory decay for relevance |

## Pricing

| Plan | Price | Memories | API Calls/mo |
|------|-------|----------|--------------|
| Free | $0 | 10,000 | 1,000 |
| Plus | $9/mo | 50,000 | 10,000 |
| Pro | $29/mo | 200,000 | 50,000 |
| Enterprise | Contact | Unlimited | Unlimited |

## Local Development

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- API keys: Anthropic, Voyage AI

### Quick Start

```bash
# Clone the repository
git clone https://github.com/iruhana/seizn.git
cd seizn

# Copy environment variables
cp .env.example .env.local

# Start the stack
docker-compose up -d

# Or start just the database and develop locally
docker-compose up -d db redis
npm install
npm run dev
```

### With Observability (Jaeger Tracing)

```bash
docker-compose --profile observability up -d
# Access Jaeger UI at http://localhost:16686
```

## SDKs

| Package | Platform | Purpose |
|---------|----------|---------|
| `seizn` | PyPI | Python SDK |
| `@seizn/spring` | npm | Memory Layer |
| `@seizn/summer` | npm | RAG/Document Search |
| `@seizn/mcp-server` | npm | MCP Server for Claude |

## CLI

The Seizn CLI lives in `cli/seizn` and provides a `seizn` command for interacting with the platform.

### Offline Local Memory (No Network)

The CLI includes an **offline-only** local memory store (no API key required):

- Storage: `~/.seizn/local/memories.jsonl` (JSONL)
- Commands: `seizn local save/search/list/export/clear`
- Encryption at rest: set `SEIZN_LOCAL_ENCRYPTION_PASSPHRASE` to encrypt `content` (AES-256-GCM)
- Secret safety: the CLI refuses to save content that appears to include secrets by default (override: `SEIZN_LOCAL_ALLOW_SENSITIVE=1`, not recommended)

## Documentation

- [Quickstart Guide](./docs/quickstart.md)
- [API Reference](./docs/openapi.yaml)
- [Self-Hosting Guide](./SELF_HOSTING.md)
- [Security Whitepaper](./docs/compliance/SECURITY_WHITEPAPER.md)

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## Links

- Website: [seizn.com](https://seizn.com)
- Documentation: [seizn.com/docs](https://seizn.com/docs)
- Dashboard: [seizn.com/dashboard](https://seizn.com/dashboard)
- GitHub: [github.com/iruhana/seizn](https://github.com/iruhana/seizn)

## License

MIT License - see [LICENSE](LICENSE) for details.
