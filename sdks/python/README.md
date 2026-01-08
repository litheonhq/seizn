# Seizn Python SDK

AI Memory Infrastructure for Developers.

## Installation

```bash
pip install seizn
```

## Quick Start

```python
from seizn import Seizn

# Initialize client
client = Seizn(api_key="sk_your_api_key")

# Add a memory
memory = client.add(
    content="User prefers dark mode and uses TypeScript",
    memory_type="preference",
    tags=["ui", "tech"]
)

# Search memories
results = client.search("user preferences", limit=5)
for result in results:
    print(f"{result.content} (similarity: {result.similarity:.2f})")

# Extract memories from conversation
memories = client.extract("""
User: I'm a software engineer at Google.
Assistant: What do you work on?
User: Machine learning infrastructure, mostly Python and TensorFlow.
""")

# Query with memory context (RAG)
response = client.query("What programming languages does the user know?")
print(response.response)
```

## Features

### Memory Operations

```python
# Add memory
memory = client.add("User lives in Seoul", memory_type="fact")

# Get memory
memory = client.get("memory-uuid")

# Update memory
memory = client.update("memory-uuid", tags=["location"], importance=8)

# Delete memory
client.delete("memory-uuid")

# Search with different modes
results = client.search("query", mode="vector")   # Semantic search
results = client.search("query", mode="keyword")  # BM25 search
results = client.search("query", mode="hybrid")   # Combined
```

### AI Operations

```python
# Extract memories from conversation
memories = client.extract(conversation_text, model="haiku", auto_store=True)

# RAG query
response = client.query("What do you know about me?", top_k=5)
print(response.response)
print(response.memories_used)

# Summarize conversation
summary = client.summarize([
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there!"},
])
print(summary.text)
print(summary.key_points)
```

### Webhooks

```python
# Create webhook
webhook = client.create_webhook(
    name="My Webhook",
    url="https://example.com/webhook",
    events=["memory.created", "memory.deleted"]
)
print(f"Secret: {webhook.secret}")  # Save this!

# List webhooks
webhooks = client.list_webhooks()

# Delete webhook
client.delete_webhook("webhook-uuid")
```

## Error Handling

```python
from seizn import Seizn, SeiznError

client = Seizn(api_key="sk_...")

try:
    memory = client.get("invalid-uuid")
except SeiznError as e:
    print(f"Error: {e.message}")
    print(f"Status: {e.status_code}")
```

## Context Manager

```python
with Seizn(api_key="sk_...") as client:
    client.add("Memory content")
# Connection automatically closed
```

## Configuration

```python
client = Seizn(
    api_key="sk_...",
    base_url="https://api.seizn.dev",  # Custom endpoint
    timeout=30.0,  # Request timeout
)
```

## Models Used

- **Embedding**: Voyage-3 (1024 dimensions)
- **Extraction/Query**: Claude 3.5 Haiku or Claude Sonnet 4

## Links

- [Documentation](https://docs.seizn.dev)
- [API Reference](https://docs.seizn.dev/api)
- [Dashboard](https://seizn.dev/dashboard)
