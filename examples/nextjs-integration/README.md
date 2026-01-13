# Seizn + Next.js Integration

Full-stack Next.js example with Seizn Spring (memory) and Summer (RAG) SDKs.

## Features

- **Server-side SDK usage** in API routes
- **Memory API** for storing and querying semantic memories
- **RAG API** with hybrid search, reranking, and answer generation
- **Trace visibility** with shareable debug links
- **React frontend** with real-time results

## Setup

```bash
npm install
export SEIZN_API_KEY=szn_your_api_key_here
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the demo.

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── memories/
│   │   │   └── route.ts    # Spring SDK - semantic memory
│   │   └── rag/
│   │       └── route.ts    # Summer SDK - RAG pipeline
│   └── page.tsx            # React frontend
├── package.json
└── README.md
```

## API Routes

### POST /api/memories

Store a new semantic memory:

```bash
curl -X POST http://localhost:3000/api/memories \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers dark mode", "type": "preference"}'
```

### GET /api/memories?q=query

Query memories semantically:

```bash
curl "http://localhost:3000/api/memories?q=user%20preferences&limit=5"
```

### POST /api/rag

RAG query with answer generation:

```bash
curl -X POST http://localhost:3000/api/rag \
  -H "Content-Type: application/json" \
  -d '{"query": "How does RAG work?", "collection": "docs"}'
```

Response includes:
- `answer`: Generated answer
- `sources`: Retrieved documents
- `trace`: Debug info with shareable link

## Security Notes

- API key is server-side only (never exposed to client)
- Add authentication before production deployment
- Rate limit your API routes

## Next Steps

- Add user authentication
- Implement collections management
- Add real-time streaming responses
- Deploy to Vercel
