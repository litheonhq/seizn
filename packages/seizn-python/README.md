# Seizn Python SDK

Semantic Memory & RAG Infrastructure for AI Applications.

## Installation

```bash
pip install seizn
```

## Quick Start

```python
from seizn import SeizClient

# Initialize client
client = SeizClient(api_key="szn_xxx")

# Add a memory
memory = client.add(
    "User prefers dark mode and quiet notifications",
    user_id="user123"
)

# Search memories
results = client.search("What are user preferences?", user_id="user123")
for r in results:
    print(f"{r.score:.2f}: {r.content}")

# Extract memories from conversation
from seizn import MemoryMessage

messages = [
    MemoryMessage(role="user", content="I love hiking in the mountains"),
    MemoryMessage(role="assistant", content="That's great! Do you have a favorite trail?"),
    MemoryMessage(role="user", content="Yes, I really enjoy the Pacific Crest Trail"),
]

memories = client.add_messages(messages, user_id="user123")
```

## Features

- **Semantic Search**: Find relevant memories using natural language
- **Auto-extraction**: Automatically extract memories from conversations
- **Multi-tenant**: Organize by user_id, agent_id, or namespace
- **Metadata**: Attach custom metadata to memories

## API Reference

### SeizClient

```python
client = SeizClient(
    api_key="szn_xxx",           # Required
    base_url="https://seizn.com/api",  # Optional
    timeout=30.0,                # Optional
    retries=3,                   # Optional
)
```

### Methods

| Method | Description |
|--------|-------------|
| `add(content, user_id, ...)` | Add a memory |
| `add_messages(messages, ...)` | Extract memories from conversation |
| `search(query, user_id, ...)` | Search memories |
| `get(memory_id)` | Get a memory by ID |
| `delete(memory_id)` | Delete a memory |
| `delete_all(user_id, ...)` | Delete all matching memories |
| `list(user_id, ...)` | List memories |

## Environment Variables

```bash
SEIZN_API_KEY=szn_xxx
```

## Links

- [Documentation](https://docs.seizn.com)
- [Dashboard](https://seizn.com/dashboard)
- [GitHub](https://github.com/litheonhq/seizn)

## License

MIT
