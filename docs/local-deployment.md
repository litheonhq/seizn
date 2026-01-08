# Local Deployment Guide

Seizn can be self-hosted for maximum data privacy and security. When running locally, your memory data never leaves your infrastructure.

## Security Benefits of Local Deployment

| Aspect | Cloud (seizn.com) | Self-Hosted |
|--------|-------------------|-------------|
| Data Location | Seizn servers | Your infrastructure |
| Server Breach Risk | Affected | Not affected |
| Compliance | Shared responsibility | Full control |
| Encryption Keys | Managed by Seizn | Managed by you |

## Prerequisites

- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- OpenAI API key (for embeddings)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/seizn/seizn.git
cd seizn
npm install
```

### 2. Set Up PostgreSQL with pgvector

```bash
# Using Docker (recommended)
docker run -d \
  --name seizn-postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=seizn \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Or install pgvector on existing PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Configure Environment

Create `.env.local`:

```env
# Database (direct connection, not Supabase)
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/seizn

# For local auth (not using Supabase Auth)
NEXTAUTH_SECRET=your-random-secret-key
NEXTAUTH_URL=http://localhost:3000

# Embeddings
OPENAI_API_KEY=sk-your-openai-key

# Optional: Use local embedding model instead of OpenAI
# EMBEDDING_PROVIDER=local
# LOCAL_EMBEDDING_URL=http://localhost:8080/embed
```

### 4. Run Migrations

```bash
# Apply database schema
npx prisma migrate deploy
# Or using raw SQL
psql $DATABASE_URL < supabase/migrations/001_initial_schema.sql
psql $DATABASE_URL < supabase/migrations/002_add_namespace.sql
# ... apply all migrations in order
```

### 5. Start the Server

```bash
npm run build
npm start
```

Access at `http://localhost:3000`

## Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: seizn
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  seizn:
    build: .
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/seizn
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: http://localhost:3000
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    ports:
      - "3000:3000"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

Run:

```bash
docker-compose up -d
```

## Using Local Embedding Models

For complete data isolation (no OpenAI calls), use a local embedding model:

### Option 1: Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull embedding model
ollama pull nomic-embed-text

# Run
ollama serve
```

Configure in `.env.local`:

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### Option 2: Text-Embeddings-Inference

```bash
docker run -d \
  --name embeddings \
  -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
  --model-id BAAI/bge-small-en-v1.5
```

Configure:

```env
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_URL=http://localhost:8080/embed
```

## Network Isolation

For maximum security, run Seizn on an isolated network:

```bash
# Create isolated Docker network
docker network create --internal seizn-internal

# Run with no external access
docker run -d \
  --network seizn-internal \
  --name seizn \
  seizn:latest
```

Access only via VPN or internal network.

## Audit Logs for Self-Hosted

When self-hosting, audit logs are stored in your own database:

```sql
-- View recent audit events
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100;

-- Check for suspicious activity
SELECT * FROM suspicious_activity;

-- Export audit logs
COPY audit_logs TO '/backup/audit_logs.csv' CSV HEADER;
```

## Backup and Disaster Recovery

### Automated Backup

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d)
pg_dump $DATABASE_URL > /backup/seizn_$DATE.sql
# Encrypt backup
gpg --encrypt --recipient your@email.com /backup/seizn_$DATE.sql
```

### Restore

```bash
gpg --decrypt /backup/seizn_20250109.sql.gpg | psql $DATABASE_URL
```

## Enterprise Self-Hosted

For enterprise deployments with advanced requirements:

- Kubernetes Helm charts
- High-availability PostgreSQL (Patroni)
- Centralized logging (ELK stack)
- Metrics and monitoring (Prometheus/Grafana)

Contact: enterprise@seizn.com

## Comparison: Cloud vs Self-Hosted

| Feature | Cloud | Self-Hosted |
|---------|-------|-------------|
| Setup Time | Instant | 30min - 2hrs |
| Maintenance | None | You manage |
| Updates | Automatic | Manual |
| Data Location | US/EU | Your choice |
| Compliance | SOC2, GDPR | Your responsibility |
| Cost | Subscription | Infrastructure only |
| Server Breach Impact | Potential exposure | Isolated |
| Support | Included | Community/Enterprise |

## When to Choose Self-Hosted

- Regulatory requirements (HIPAA, GDPR, local data laws)
- Air-gapped environments
- Maximum data privacy
- Custom security requirements
- Cost optimization at scale
