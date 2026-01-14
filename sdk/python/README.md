# Seizn Python SDK

Official SDK for [Seizn](https://seizn.com) - AI Memory Infrastructure.

## Installation

```bash
pip install seizn
# or
poetry add seizn
# or
uv add seizn
```

## Quick Start

```python
from seizn import Seizn

# Initialize the client
client = Seizn(api_key="your_api_key")  # or set SEIZN_API_KEY env var

# Store a memory
memory = client.add(
    "User prefers dark mode",
    memory_type="preference",
    tags=["ui", "settings"]
)

# Search memories
results = client.search("user preferences", limit=5, threshold=0.7)

# Extract memories from conversation
extracted = client.extract(
    "User: I love Python programming!\nAssistant: Great choice!",
    model="haiku",
    auto_store=True
)

# Query with RAG (memory-augmented response)
response = client.query("What are my preferences?", model="sonnet")
print(response.response)
```

## Async Support

```python
from seizn import AsyncSeizn

client = AsyncSeizn(api_key="your_api_key")

# All methods support async/await
memory = await client.add("User likes Python")
results = await client.search("programming")
```

## API Reference

### Constructor

```python
Seizn(
    api_key: str,              # Required (or SEIZN_API_KEY env)
    base_url: str = None,      # Default: 'https://seizn.com'
    timeout: float = 30.0,     # Request timeout in seconds
)
```

### Methods

#### `add(content, **options)`
Store a new memory.

```python
memory = client.add(
    "User lives in Seoul",
    memory_type="fact",       # 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction'
    tags=["location"],
    namespace="user_123",
    scope="user",             # 'user' | 'session' | 'agent'
)
```

#### `search(query, **options)`
Search memories by semantic similarity.

```python
results = client.search(
    "location",
    limit=10,
    threshold=0.7,
    namespace="user_123",
)
```

#### `delete(ids)`
Delete memories by ID.

```python
deleted = client.delete(["mem_abc123", "mem_def456"])
```

#### `extract(conversation, **options)`
Extract memories from conversation text.

```python
result = client.extract(
    conversation_text,
    model="haiku",        # 'haiku' (fast) | 'sonnet' (accurate)
    auto_store=True,
    namespace="user_123",
)
```

#### `query(query, **options)`
Get AI response using memories as context (RAG).

```python
result = client.query(
    "What do I like?",
    model="sonnet",
    top_k=5,
    namespace="user_123",
    include_memories=True,
)
```

## Error Handling

```python
from seizn import Seizn, AuthenticationError, RateLimitError, SeiznError

try:
    client.add("...")
except AuthenticationError:
    print("Invalid API key")
except RateLimitError:
    print("Rate limit exceeded, retry later")
except SeiznError as e:
    print(f"Error: {e.message} ({e.status_code})")
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SEIZN_API_KEY` | Your Seizn API key |
| `SEIZN_BASE_URL` | Custom API base URL |

## Type Hints

Full type hint support:

```python
from seizn import (
    Memory,
    ExtractResult,
    QueryResult,
)
```

## Links

- [Documentation](https://seizn.com/docs)
- [API Reference](https://seizn.com/docs/api-reference)
- [Dashboard](https://seizn.com/dashboard)
- [GitHub](https://github.com/seizn/seizn-python)

## License

MIT
