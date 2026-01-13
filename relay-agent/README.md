# Seizn Relay Agent

Edge federated agent for on-premises vector search. Deploy this lightweight agent in your VPC to keep sensitive data on-premises while using Seizn for orchestration.

## Overview

The Seizn Relay Agent enables enterprises to:

- **Keep data on-premises**: Your documents and vectors never leave your infrastructure
- **Use Seizn orchestration**: Benefit from Seizn's RAG pipeline, autopilot, and observability
- **Minimal data exposure**: Only query results (IDs, scores, short snippets) are sent to Seizn cloud

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your VPC / On-Premises                  │
│  ┌─────────────────┐       ┌────────────────────────────┐   │
│  │  Your Documents │──────▶│  Vector DB (pgvector, etc)│   │
│  └─────────────────┘       └──────────┬─────────────────┘   │
│                                       │                     │
│                            ┌──────────▼─────────────────┐   │
│                            │    Seizn Relay Agent       │   │
│                            │  - Local vector search     │   │
│                            │  - Returns snippets only   │   │
│                            └──────────┬─────────────────┘   │
└───────────────────────────────────────│─────────────────────┘
                                        │
                              (IDs, scores, snippets)
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │        Seizn Cloud            │
                        │  - Query orchestration        │
                        │  - Reranking                  │
                        │  - Context compression        │
                        │  - Observability              │
                        └───────────────────────────────┘
```

## Quick Start

### 1. Create a Relay Agent in Seizn

```bash
curl -X POST https://seizn.com/api/relay/agents \
  -H "x-api-key: YOUR_SEIZN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-vpc-relay",
    "collections": ["my-collection"],
    "connectionMode": "callback"
  }'
```

Save the returned `agentKey` - it will only be shown once.

### 2. Deploy the Relay Agent

#### Option A: Docker (Recommended)

```bash
# Pull the image
docker pull ghcr.io/seizn/relay-agent:latest

# Run with environment variables
docker run -d \
  --name seizn-relay \
  -e SEIZN_RELAY_AGENT_KEY=szn_relay_xxx \
  -e SEIZN_RELAY_COLLECTIONS=my-collection \
  -e VECTOR_DB_TYPE=pgvector \
  -e VECTOR_DB_CONNECTION_STRING=postgresql://user:pass@host:5432/db \
  -p 3001:3001 \
  ghcr.io/seizn/relay-agent:latest
```

#### Option B: Docker Compose

```yaml
version: '3.8'
services:
  seizn-relay:
    image: ghcr.io/seizn/relay-agent:latest
    environment:
      - SEIZN_RELAY_AGENT_KEY=${SEIZN_RELAY_AGENT_KEY}
      - SEIZN_RELAY_COLLECTIONS=my-collection
      - VECTOR_DB_TYPE=pgvector
      - VECTOR_DB_CONNECTION_STRING=postgresql://user:pass@postgres:5432/vectors
    ports:
      - "3001:3001"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### Option C: Node.js

```bash
# Clone and install
git clone https://github.com/seizn/relay-agent.git
cd relay-agent
npm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Build and run
npm run build
npm start
```

### 3. Verify Connection

Check the relay status in your Seizn dashboard or via API:

```bash
curl https://seizn.com/api/relay/health \
  -H "x-api-key: YOUR_SEIZN_API_KEY"
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEIZN_RELAY_AGENT_KEY` | Yes | - | Agent key from Seizn dashboard |
| `SEIZN_RELAY_COLLECTIONS` | Yes | - | Collections to serve (comma-separated) |
| `VECTOR_DB_TYPE` | Yes | pgvector | Vector DB type |
| `VECTOR_DB_CONNECTION_STRING` | Yes* | - | DB connection string |
| `VECTOR_DB_HOST` | Yes* | - | DB host (for HTTP-based DBs) |
| `VECTOR_DB_PORT` | No | - | DB port |
| `VECTOR_DB_DIMENSIONS` | No | 1024 | Embedding dimensions |
| `SEIZN_RELAY_DIRECT_MODE` | No | false | Enable direct mode |
| `PORT` | No | 3001 | Server port (direct mode) |
| `LOG_LEVEL` | No | info | Logging level |

*Either `VECTOR_DB_CONNECTION_STRING` or `VECTOR_DB_HOST` is required.

### Connection Modes

#### Callback Mode (Default)
The relay polls Seizn for pending requests and sends results back. Best for:
- Relays behind NAT or firewall
- No inbound internet access required

#### Direct Mode
Seizn calls the relay directly. Best for:
- Lowest latency
- Relay has a public endpoint

## Supported Vector Databases

- **pgvector** (PostgreSQL) - Recommended
- **Qdrant**
- **Pinecone** (coming soon)
- **Weaviate** (coming soon)
- **Milvus** (coming soon)
- **Chroma** (coming soon)

## Security

### Data Privacy
- Full documents and embeddings never leave your infrastructure
- Only search results (IDs, scores, short snippets) are sent to Seizn
- All communication uses TLS encryption
- HMAC-SHA256 request signing

### Network Requirements
- **Callback mode**: Outbound HTTPS to `seizn.com`
- **Direct mode**: Inbound HTTPS on configured port

### Best Practices
- Use a dedicated service account for the vector DB
- Rotate agent keys periodically
- Monitor relay health and metrics
- Use IP whitelisting in Seizn dashboard

## Troubleshooting

### Relay shows "inactive"
1. Check logs: `docker logs seizn-relay`
2. Verify agent key is correct
3. Ensure vector DB is accessible
4. Check outbound connectivity to seizn.com

### Connection timeouts
1. Increase `SEIZN_RELAY_HEARTBEAT_INTERVAL`
2. Check network latency to Seizn
3. Verify firewall rules

### Vector DB errors
1. Verify connection string/credentials
2. Check DB is running and accessible
3. Ensure collection/index exists

## Support

- Documentation: https://seizn.com/docs/relay
- Issues: https://github.com/seizn/relay-agent/issues
- Email: support@seizn.com

## License

MIT License - see LICENSE file for details.
