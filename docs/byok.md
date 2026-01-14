# BYOK (Bring Your Own Key) Guide

> Use your own API keys for embedding and LLM providers with Seizn.

## Overview

BYOK allows you to connect your existing OpenAI, Anthropic, Cohere, or Voyage API keys to Seizn. This gives you:

- **Cost Control**: Pay providers directly, use Seizn for orchestration only
- **Compliance**: Keep API traffic within your existing agreements
- **Flexibility**: Switch providers without changing your Seizn integration

## Supported Providers

| Provider | Models | Use Case |
|----------|--------|----------|
| **OpenAI** | text-embedding-3-small/large, GPT-4o | Embedding, RAG |
| **Anthropic** | Claude 3.5 Sonnet/Haiku | RAG Generation |
| **Cohere** | embed-v3, rerank-v3 | Embedding, Reranking |
| **Voyage** | voyage-3, voyage-3-lite | Embedding |

## Setup

### 1. Dashboard Configuration

1. Go to **Dashboard > Settings > API Keys**
2. Click **Add Provider Key**
3. Select your provider and paste your API key
4. Test the connection

### 2. SDK Configuration

```typescript
import { Seizn } from 'seizn';

const seizn = new Seizn({
  apiKey: 'szn_...',
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },
    cohere: {
      apiKey: process.env.COHERE_API_KEY,
    }
  }
});
```

### 3. Per-Request Override

```typescript
const results = await seizn.search({
  query: "authentication best practices",
  provider: {
    embedding: "openai",
    reranking: "cohere"
  }
});
```

## Cost Comparison

| Mode | Embedding Cost | Seizn Fee | Total |
|------|---------------|-----------|-------|
| **Managed** | Included | $0.001/query | $0.001/query |
| **BYOK** | Your provider rate | $0.0005/query | Provider + $0.0005 |

## Security

- Keys are encrypted at rest (AES-256)
- Keys are never logged or exposed in traces
- You can rotate keys anytime without downtime
- Keys are scoped to your organization only

## Best Practices

1. **Use separate keys** for Seizn vs. production apps
2. **Set usage limits** on provider dashboards
3. **Monitor costs** via Seizn's Budget Dashboard
4. **Rotate keys** quarterly

## Troubleshooting

### "Provider key invalid"
- Verify the key is active in your provider dashboard
- Check the key has the required permissions (embeddings, completions)

### "Rate limit exceeded"
- Your provider rate limits apply
- Consider upgrading your provider tier or using Seizn's managed option

## FAQ

**Q: Can I mix BYOK and Managed?**
A: Yes. Use BYOK for embeddings, Managed for reranking, etc.

**Q: Are BYOK queries counted against my Seizn quota?**
A: Yes, API calls count regardless of key source. Only LLM costs differ.

**Q: What happens if my provider key expires?**
A: Queries fail with `SEIZN_401` error. Seizn does not fall back automatically.

---

Need help? Contact [support@seizn.com](mailto:support@seizn.com)
