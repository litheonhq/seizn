# Seizn Self-Hosted Deployment Guide

This guide covers deploying Seizn on your own infrastructure using Docker Compose or Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Docker Compose)](#quick-start-docker-compose)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Configuration](#configuration)
- [SSL/TLS Setup](#ssltls-setup)
- [Monitoring](#monitoring)
- [Backup & Recovery](#backup--recovery)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Docker Compose
- Docker 24.0+
- Docker Compose v2.20+
- 4GB RAM minimum (8GB recommended)
- 20GB disk space

### Kubernetes
- Kubernetes 1.25+
- Helm 3.10+
- kubectl configured
- Persistent volume provisioner
- Ingress controller (nginx recommended)

## Quick Start (Docker Compose)

### 1. Clone and Configure

```bash
cd deploy
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Required settings
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
POSTGRES_PASSWORD=<secure password>
OPENAI_API_KEY=sk-your-key
```

### 2. Start Services

```bash
# Basic deployment (app + databases)
docker compose up -d

# With nginx reverse proxy
docker compose --profile with-nginx up -d

# With monitoring (Prometheus + Grafana)
docker compose --profile with-monitoring up -d

# Full deployment
docker compose --profile with-nginx --profile with-monitoring up -d
```

### 3. Verify Installation

```bash
# Check service health
docker compose ps

# View logs
docker compose logs -f seizn-app

# Test health endpoint
curl http://localhost:3000/api/health
```

### 4. Access Application

- Application: http://localhost:3000
- Grafana (if enabled): http://localhost:3001

## Kubernetes Deployment

### 1. Add Helm Repository Dependencies

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

### 2. Create Namespace

```bash
kubectl create namespace seizn
```

### 3. Create Secrets

```bash
# Create secrets file
cat <<EOF > seizn-secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: seizn-secrets
  namespace: seizn
type: Opaque
stringData:
  NEXTAUTH_SECRET: "$(openssl rand -base64 32)"
  OPENAI_API_KEY: "sk-your-key"
  POSTGRES_PASSWORD: "your-secure-password"
  REDIS_PASSWORD: "your-redis-password"
EOF

kubectl apply -f seizn-secrets.yaml
```

### 4. Create PostgreSQL Secret

```bash
kubectl create secret generic seizn-postgres-secret \
  --namespace seizn \
  --from-literal=postgres-password=your-secure-password
```

### 5. Create Redis Secret

```bash
kubectl create secret generic seizn-redis-secret \
  --namespace seizn \
  --from-literal=redis-password=your-redis-password
```

### 6. Install Helm Chart

```bash
# Install with default values
helm install seizn ./helm/seizn -n seizn

# Or with custom values
helm install seizn ./helm/seizn -n seizn \
  --set seizn.ingress.hosts[0].host=seizn.your-domain.com \
  --set seizn.ingress.tls[0].hosts[0]=seizn.your-domain.com
```

### 7. Verify Installation

```bash
# Check pods
kubectl get pods -n seizn

# Check services
kubectl get svc -n seizn

# Check ingress
kubectl get ingress -n seizn
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_URL` | Yes | Public URL of your deployment |
| `NEXTAUTH_SECRET` | Yes | Session encryption key |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings |
| `COHERE_API_KEY` | No | Cohere API key for reranking |
| `REDIS_PASSWORD` | No | Redis password (optional) |

### Feature Flags

```bash
FEATURE_AUTOPILOT=true
FEATURE_FEDERATED_SEARCH=true
FEATURE_ENTERPRISE_SSO=false
FEATURE_SCIM_PROVISIONING=false
```

### Resource Requirements

| Service | CPU (min) | Memory (min) | Storage |
|---------|-----------|--------------|---------|
| seizn-app | 500m | 1Gi | 10Gi |
| PostgreSQL | 500m | 1Gi | 50Gi |
| Redis | 250m | 512Mi | 10Gi |
| Qdrant | 500m | 1Gi | 50Gi |

## SSL/TLS Setup

### Docker Compose with Let's Encrypt

1. Create SSL directory:
```bash
mkdir -p ssl
```

2. Generate certificates with certbot:
```bash
certbot certonly --standalone -d your-domain.com
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/
```

3. Enable nginx profile:
```bash
docker compose --profile with-nginx up -d
```

### Kubernetes with cert-manager

1. Install cert-manager:
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

2. Create ClusterIssuer:
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@domain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

3. Certificate is automatically provisioned via ingress annotations.

## Monitoring

### Enable Monitoring (Docker Compose)

```bash
docker compose --profile with-monitoring up -d
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

### Kubernetes ServiceMonitor

The Helm chart includes ServiceMonitor resources when `monitoring.enabled=true`.

```bash
helm install seizn ./helm/seizn -n seizn \
  --set monitoring.enabled=true
```

## Backup & Recovery

### Database Backup

```bash
# Docker Compose
docker compose exec postgres pg_dump -U seizn seizn > backup.sql

# Kubernetes
kubectl exec -n seizn seizn-postgresql-0 -- pg_dump -U seizn seizn > backup.sql
```

### Database Restore

```bash
# Docker Compose
docker compose exec -T postgres psql -U seizn seizn < backup.sql

# Kubernetes
kubectl exec -n seizn -i seizn-postgresql-0 -- psql -U seizn seizn < backup.sql
```

### Qdrant Backup

```bash
# Create snapshot
curl -X POST 'http://localhost:6333/collections/seizn/snapshots'

# Download snapshot
curl 'http://localhost:6333/collections/seizn/snapshots/<snapshot-name>' --output qdrant-backup.snapshot
```

## Troubleshooting

### Common Issues

#### Container won't start
```bash
# Check logs
docker compose logs seizn-app

# Check resource usage
docker stats
```

#### Database connection failed
```bash
# Verify PostgreSQL is running
docker compose exec postgres pg_isready

# Check connection string
docker compose exec seizn-app env | grep DATABASE_URL
```

#### Health check failing
```bash
# Manual health check
curl -v http://localhost:3000/api/health

# Check application logs
docker compose logs -f seizn-app
```

### Kubernetes Troubleshooting

```bash
# Check pod status
kubectl describe pod -n seizn <pod-name>

# Check logs
kubectl logs -n seizn <pod-name>

# Check events
kubectl get events -n seizn --sort-by='.lastTimestamp'
```

## Upgrading

### Docker Compose

```bash
# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d

# Run database migrations (if needed)
docker compose exec seizn-app npx prisma migrate deploy
```

### Kubernetes

```bash
# Update Helm chart
helm upgrade seizn ./helm/seizn -n seizn

# Check rollout status
kubectl rollout status deployment/seizn -n seizn
```

## Security Recommendations

1. **Change default passwords** - Never use default passwords in production
2. **Enable SSL/TLS** - Always use HTTPS in production
3. **Network isolation** - Use network policies to restrict pod communication
4. **Regular updates** - Keep images and dependencies updated
5. **Audit logging** - Enable audit logs for compliance
6. **Backup encryption** - Encrypt backups at rest

## Support

For issues and questions:
- Documentation: https://docs.seizn.com
- GitHub Issues: https://github.com/seizn/seizn/issues
- Email: support@seizn.com
