# Seizn Self-Hosting Guide

Deploy your own AI Memory Infrastructure.

## Prerequisites

- Docker and Docker Compose
- API keys:
  - **Anthropic API Key** (Claude) - https://console.anthropic.com
  - **Voyage AI API Key** (embeddings) - https://www.voyageai.com

## Quick Start

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/seizn.git
cd seizn

# Copy environment template
cp .env.docker.example .env.docker

# Edit with your API keys
nano .env.docker
```

### 2. Generate Security Keys

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate POSTGRES_PASSWORD
openssl rand -base64 24
```

### 3. Start Services

```bash
# Start all services
docker-compose --env-file .env.docker up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f seizn
```

### 4. Access

- **Application**: http://localhost:3000
- **API Health**: http://localhost:3000/api/health

## Services

| Service | Port | Description |
|---------|------|-------------|
| seizn | 3000 | Main application |
| db | 5432 | PostgreSQL with pgvector |
| redis | 6379 | Cache & rate limiting |

## Configuration

### Required Environment Variables

```env
# AI Services
ANTHROPIC_API_KEY=sk-ant-xxxxx
VOYAGE_API_KEY=pa-xxxxx

# Database
POSTGRES_PASSWORD=your_secure_password

# Auth
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=http://localhost:3000
```

### Optional: OAuth Providers

Add GitHub/Google login:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### Optional: Email

Add email notifications:

```env
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@your-domain.com
```

## Database Migrations

Migrations run automatically on first start. To run manually:

```bash
# Connect to database
docker-compose exec db psql -U postgres

# Run a specific migration
\i /docker-entrypoint-initdb.d/001_initial_schema.sql
```

## Scaling

### Horizontal Scaling

```bash
# Scale web servers
docker-compose up -d --scale seizn=3
```

### Production Recommendations

1. **Use a reverse proxy** (nginx, Traefik, Caddy)
2. **Enable HTTPS** with Let's Encrypt
3. **Set up backups** for PostgreSQL
4. **Monitor** with Prometheus/Grafana

## Backup & Restore

### Backup Database

```bash
docker-compose exec db pg_dump -U postgres postgres > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker-compose exec -T db psql -U postgres postgres
```

## Troubleshooting

### Check Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f seizn
```

### Reset Everything

```bash
# Stop and remove containers, volumes
docker-compose down -v

# Start fresh
docker-compose up -d
```

### Common Issues

**Port already in use**
```bash
# Change port in docker-compose.yml or stop conflicting service
lsof -i :3000  # Find what's using port 3000
```

**Database connection failed**
```bash
# Wait for database to be ready
docker-compose exec db pg_isready
```

**API keys not working**
- Verify keys in `.env.docker`
- Check API key format (Anthropic: `sk-ant-`, Voyage: `pa-`)

## Updates

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d
```

## License

Self-hosting is available under the same license as the main project.
