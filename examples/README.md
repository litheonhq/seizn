# Seizn SDK Examples

Production-ready examples for integrating Seizn into your applications.

## Examples

| Example | Description | SDKs Used |
|---------|-------------|-----------|
| [spring-basic](./spring-basic) | Semantic memory storage and retrieval | `@seizn/spring` |
| [summer-rag](./summer-rag) | RAG pipeline with hybrid search & reranking | `@seizn/summer` |
| [nextjs-integration](./nextjs-integration) | Full-stack Next.js app | Both |

## Quick Start

1. Get your API key at [seizn.com/dashboard/keys](https://seizn.com/dashboard/keys)
2. Choose an example and follow its README

```bash
# Example: Run the Spring basic example
cd spring-basic
npm install
export SEIZN_API_KEY=szn_your_api_key_here
npm start
```

## SDK Installation

```bash
# For semantic memory (Spring)
npm install @seizn/spring

# For RAG pipelines (Summer)
npm install @seizn/summer

# Both
npm install @seizn/spring @seizn/summer
```

## Features Demonstrated

### Spring SDK (Semantic Memory)
- Store memories with types (fact, preference, experience)
- Semantic query with similarity threshold
- Full trace for debugging

### Summer SDK (RAG Pipeline)
- Document indexing with automatic chunking
- Hybrid search (semantic + keyword)
- Reranking for improved relevance
- Answer generation with source attribution
- Cost tracking and trace sharing

## Documentation

- [Full Documentation](https://seizn.com/docs)
- [API Reference](https://seizn.com/docs/api-reference)
- [FAQ](https://seizn.com/docs/faq)

## Support

- [GitHub Issues](https://github.com/litheonhq/seizn/issues)
- [Discord Community](https://discord.gg/seizn)
- Email: support@seizn.com
