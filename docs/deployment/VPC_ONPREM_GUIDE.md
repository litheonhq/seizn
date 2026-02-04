# Seizn VPC & On-Premises Deployment Guide

> Version: 1.0.0
> Last Updated: 2026-02-04
> Status: Production Ready

---

## 1. Overview

This guide covers self-hosted deployment options for Seizn in customer-managed infrastructure:

| Deployment Type | Description | Use Case |
|-----------------|-------------|----------|
| **VPC Deployment** | Deploy in customer's cloud VPC | AWS/GCP/Azure customers |
| **On-Premises** | Deploy on customer's physical hardware | Air-gapped, data sovereignty |
| **Hybrid** | Control plane in cloud, data on-prem | Compliance + convenience |

---

## 2. Prerequisites

### 2.1 Infrastructure Requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| Kubernetes | 1.28+ | 1.30+ | EKS, GKE, AKS, or vanilla K8s |
| Nodes | 3 | 5+ | For HA deployment |
| CPU (total) | 8 cores | 16+ cores | Per node |
| Memory (total) | 32 GB | 64+ GB | Per node |
| Storage | 500 GB SSD | 1+ TB NVMe | For PostgreSQL + vectors |
| Network | 1 Gbps | 10 Gbps | Internal bandwidth |

### 2.2 Software Dependencies

```yaml
dependencies:
  # Required
  kubernetes: ">=1.28"
  helm: ">=3.12"
  postgresql: ">=15"
  redis: ">=7.0"

  # Optional (for features)
  vault: ">=1.15"        # For secrets management
  cert-manager: ">=1.13" # For TLS certificates
  istio: ">=1.20"        # For service mesh (optional)
```

### 2.3 Network Requirements

| Port | Protocol | Purpose | Source |
|------|----------|---------|--------|
| 443 | HTTPS | API Gateway | External |
| 5432 | TCP | PostgreSQL | Internal |
| 6379 | TCP | Redis | Internal |
| 8080 | HTTP | Health checks | Internal |
| 9090 | HTTP | Metrics | Internal |

---

## 3. VPC Deployment (AWS)

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Customer AWS Account                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    VPC: 10.0.0.0/16                                │  │
│  │                                                                     │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐                  │  │
│  │  │   Public Subnet     │  │   Public Subnet     │                  │  │
│  │  │   (AZ-a)            │  │   (AZ-b)            │                  │  │
│  │  │   ┌─────────────┐   │  │   ┌─────────────┐   │                  │  │
│  │  │   │     NLB     │   │  │   │     NLB     │   │                  │  │
│  │  │   └─────────────┘   │  │   └─────────────┘   │                  │  │
│  │  └─────────────────────┘  └─────────────────────┘                  │  │
│  │                                                                     │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐                  │  │
│  │  │   Private Subnet    │  │   Private Subnet    │                  │  │
│  │  │   (EKS Nodes)       │  │   (EKS Nodes)       │                  │  │
│  │  │   ┌─────────────┐   │  │   ┌─────────────┐   │                  │  │
│  │  │   │ Seizn Pods  │   │  │   │ Seizn Pods  │   │                  │  │
│  │  │   └─────────────┘   │  │   └─────────────┘   │                  │  │
│  │  └─────────────────────┘  └─────────────────────┘                  │  │
│  │                                                                     │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐                  │  │
│  │  │   Data Subnet       │  │   Data Subnet       │                  │  │
│  │  │   ┌─────────────┐   │  │   ┌─────────────┐   │                  │  │
│  │  │   │    RDS      │   │  │   │   Replica   │   │                  │  │
│  │  │   │ PostgreSQL  │   │  │   │             │   │                  │  │
│  │  │   └─────────────┘   │  │   └─────────────┘   │                  │  │
│  │  └─────────────────────┘  └─────────────────────┘                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  VPC Endpoints: S3, KMS, Secrets Manager, ECR, CloudWatch          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Terraform Deployment

```bash
# Clone the infrastructure repository
git clone https://github.com/seizn/seizn-vpc-deploy.git
cd seizn-vpc-deploy

# Configure variables
cp terraform.tfvars.example terraform.tfvars
```

```hcl
# terraform.tfvars
# Customer Configuration
customer_name = "acme-corp"
environment   = "production"

# AWS Configuration
aws_region = "us-east-1"
vpc_cidr   = "10.0.0.0/16"

# EKS Configuration
eks_cluster_version = "1.30"
eks_node_groups = {
  main = {
    instance_types = ["m6i.xlarge"]
    desired_size   = 3
    min_size       = 3
    max_size       = 10
  }
}

# Database Configuration
db_instance_class    = "db.r6g.xlarge"
db_allocated_storage = 500
db_multi_az          = true

# Security Configuration
enable_byok           = true
kms_key_arn          = "arn:aws:kms:us-east-1:123456789:key/xxx"
allowed_cidr_blocks  = ["10.0.0.0/8"]

# Features
enable_waf           = true
enable_guard_duty    = true
enable_config_rules  = true
```

```bash
# Deploy infrastructure
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# Get cluster credentials
aws eks update-kubeconfig --name seizn-acme-corp-production
```

### 3.3 Helm Deployment

```bash
# Add Seizn Helm repository
helm repo add seizn https://charts.seizn.com
helm repo update

# Create namespace
kubectl create namespace seizn

# Create secrets
kubectl create secret generic seizn-secrets \
  --namespace seizn \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=REDIS_URL="redis://..." \
  --from-literal=ANTHROPIC_API_KEY="..." \
  --from-literal=VOYAGE_API_KEY="..."

# Install Seizn
helm install seizn seizn/seizn \
  --namespace seizn \
  --values values-production.yaml
```

```yaml
# values-production.yaml
global:
  environment: production
  domain: seizn.acme-corp.com

replicaCount:
  api: 3
  spring: 2
  summer: 2
  winter: 2

resources:
  api:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "2"
      memory: "4Gi"

database:
  external: true
  host: seizn-db.xxx.us-east-1.rds.amazonaws.com
  port: 5432
  database: seizn
  sslmode: require

redis:
  external: true
  host: seizn-redis.xxx.cache.amazonaws.com
  port: 6379
  tls: true

ingress:
  enabled: true
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
    alb.ingress.kubernetes.io/wafv2-acl-arn: arn:aws:wafv2:...

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPU: 70

monitoring:
  enabled: true
  prometheus:
    enabled: true
  grafana:
    enabled: true

security:
  networkPolicies: true
  podSecurityPolicy: restricted
  serviceAccountToken: false
```

---

## 4. On-Premises Deployment

### 4.1 Air-Gapped Installation

```bash
# 1. Download offline bundle (from internet-connected machine)
curl -L https://releases.seizn.com/v1.0.0/seizn-offline-bundle.tar.gz -o seizn-offline.tar.gz

# Bundle includes:
# - Container images (exported as tar)
# - Helm charts
# - PostgreSQL extensions (pgvector)
# - Configuration templates
# - Validation scripts

# 2. Transfer to air-gapped environment
scp seizn-offline.tar.gz admin@airgapped-host:/opt/seizn/

# 3. On air-gapped host, extract and load images
tar -xzf seizn-offline.tar.gz
cd seizn-offline

# Load images to local registry
./scripts/load-images.sh --registry registry.internal:5000

# 4. Deploy via Helm with offline values
helm install seizn ./charts/seizn \
  --namespace seizn \
  --values values-airgapped.yaml
```

```yaml
# values-airgapped.yaml
global:
  imageRegistry: registry.internal:5000
  imagePullPolicy: IfNotPresent

# Disable external dependencies
telemetry:
  enabled: false

externalServices:
  anthropic:
    # Use local LLM proxy or disable
    enabled: false
    # Or configure local endpoint
    # baseUrl: http://llm-proxy.internal:8080

  voyage:
    enabled: false
    # Use local embedding service
    # baseUrl: http://embedding.internal:8080

# Local database
database:
  internal: true
  persistence:
    size: 500Gi
    storageClass: local-path

# Local redis
redis:
  internal: true
  persistence:
    enabled: true
```

### 4.2 Bare Metal Kubernetes

```yaml
# kubeadm-config.yaml
apiVersion: kubeadm.k8s.io/v1beta3
kind: ClusterConfiguration
kubernetesVersion: v1.30.0
controlPlaneEndpoint: "k8s-api.internal:6443"
networking:
  podSubnet: 10.244.0.0/16
  serviceSubnet: 10.96.0.0/12
---
apiVersion: kubeadm.k8s.io/v1beta3
kind: InitConfiguration
nodeRegistration:
  kubeletExtraArgs:
    node-labels: "seizn.com/node-type=control-plane"
```

```bash
# Initialize control plane
sudo kubeadm init --config=kubeadm-config.yaml

# Install CNI (Calico for network policies)
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.0/manifests/calico.yaml

# Join worker nodes
kubeadm join k8s-api.internal:6443 --token xxx --discovery-token-ca-cert-hash sha256:xxx
```

### 4.3 Storage Configuration

```yaml
# local-storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: seizn-fast
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: seizn-db-pv
spec:
  capacity:
    storage: 500Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: seizn-fast
  local:
    path: /mnt/nvme/seizn-db
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values:
                - db-node-1
```

---

## 5. Hybrid Deployment

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Seizn Cloud (Control Plane)                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  - User Authentication (SSO/SAML)                                  │  │
│  │  - Policy Management                                               │  │
│  │  - Billing & Quota                                                 │  │
│  │  - Audit Log Aggregation                                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Secure Tunnel (mTLS)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Customer On-Premises (Data Plane)                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Seizn Edge Agent                                                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │   Memory    │  │   Vector    │  │   Trace     │               │  │
│  │  │   Service   │  │   Store     │  │   Store     │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Local PostgreSQL                          │  │  │
│  │  │                    (All data stays here)                     │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Edge Agent Configuration

```yaml
# edge-agent-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: seizn-edge-config
  namespace: seizn
data:
  config.yaml: |
    # Control plane connection
    controlPlane:
      url: https://api.seizn.com
      orgId: "org_xxx"
      tunnel:
        enabled: true
        reconnectInterval: 30s
        heartbeatInterval: 10s

    # Local data plane
    dataPlane:
      database:
        host: localhost
        port: 5432
        database: seizn
        sslmode: require

      vectorStore:
        type: pgvector
        # All embeddings stored locally

      objectStore:
        type: local
        path: /data/artifacts

    # Data residency enforcement
    residency:
      region: on-premises
      dataTypes:
        - memories
        - embeddings
        - traces
        - artifacts
      # These stay local, never sent to cloud

    # What syncs to cloud (metadata only)
    sync:
      enabled: true
      items:
        - type: audit_logs
          mode: hash_only  # Send hashes, not content
        - type: metrics
          mode: aggregated
        - type: policies
          mode: pull  # Receive from cloud
```

---

## 6. Security Hardening

### 6.1 Network Policies

```yaml
# network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: seizn-api-policy
  namespace: seizn
spec:
  podSelector:
    matchLabels:
      app: seizn-api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: seizn-db
      ports:
        - port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: seizn-redis
      ports:
        - port: 6379
    # Allow DNS
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - port: 53
          protocol: UDP
```

### 6.2 Pod Security Standards

```yaml
# pod-security.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: seizn
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### 6.3 Secrets Management

```yaml
# external-secrets.yaml (with Vault)
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: seizn
spec:
  provider:
    vault:
      server: "https://vault.internal:8200"
      path: "secret"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "seizn-app"
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: seizn-secrets
  namespace: seizn
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: seizn-secrets
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: seizn/database
        property: url
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: seizn/api-keys
        property: anthropic
```

---

## 7. Monitoring & Observability

### 7.1 Prometheus Stack

```yaml
# prometheus-values.yaml
prometheus:
  prometheusSpec:
    serviceMonitorSelector:
      matchLabels:
        app.kubernetes.io/part-of: seizn
    retention: 30d
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: seizn-fast
          resources:
            requests:
              storage: 100Gi

grafana:
  dashboardProviders:
    dashboardproviders.yaml:
      apiVersion: 1
      providers:
        - name: seizn
          orgId: 1
          folder: Seizn
          type: file
          options:
            path: /var/lib/grafana/dashboards/seizn

alertmanager:
  config:
    receivers:
      - name: seizn-ops
        webhook_configs:
          - url: 'http://pagerduty-adapter:8080'
```

### 7.2 Health Checks

```bash
# health-check.sh
#!/bin/bash

# API health
curl -sf https://seizn.internal/api/health || exit 1

# Database connectivity
kubectl exec -n seizn deploy/seizn-api -- \
  psql "$DATABASE_URL" -c "SELECT 1" || exit 1

# Redis connectivity
kubectl exec -n seizn deploy/seizn-api -- \
  redis-cli -h seizn-redis ping || exit 1

# Vector store health
curl -sf https://seizn.internal/api/health/vector || exit 1

echo "All health checks passed"
```

---

## 8. Backup & Recovery

### 8.1 Backup Configuration

```yaml
# velero-backup.yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: seizn-daily-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"
  template:
    includedNamespaces:
      - seizn
    includedResources:
      - "*"
    excludedResources:
      - events
      - pods
    storageLocation: default
    ttl: 720h  # 30 days
    hooks:
      resources:
        - name: seizn-db-backup
          includedNamespaces:
            - seizn
          labelSelector:
            matchLabels:
              app: seizn-db
          pre:
            - exec:
                command:
                  - /bin/sh
                  - -c
                  - pg_dump -Fc $DATABASE_URL > /backup/seizn-$(date +%Y%m%d).dump
                container: postgres
                onError: Fail
```

### 8.2 Disaster Recovery

```bash
# Restore from backup
velero restore create --from-backup seizn-daily-backup-20260204

# Point-in-time recovery (PostgreSQL)
pg_restore -d seizn_restored /backup/seizn-20260204.dump

# Verify data integrity
./scripts/verify-restore.sh --namespace seizn
```

---

## 9. Upgrade Procedures

### 9.1 Rolling Upgrade

```bash
# Check current version
helm list -n seizn

# Preview upgrade
helm diff upgrade seizn seizn/seizn \
  --namespace seizn \
  --values values-production.yaml \
  --version 1.1.0

# Execute upgrade
helm upgrade seizn seizn/seizn \
  --namespace seizn \
  --values values-production.yaml \
  --version 1.1.0 \
  --wait \
  --timeout 10m

# Verify
kubectl rollout status deployment/seizn-api -n seizn
```

### 9.2 Database Migrations

```bash
# Run migrations (automatically handled by Helm hooks)
# Manual execution if needed:
kubectl exec -n seizn deploy/seizn-api -- \
  npm run db:migrate

# Rollback if needed
kubectl exec -n seizn deploy/seizn-api -- \
  npm run db:migrate:rollback
```

---

## 10. Support & Troubleshooting

### 10.1 Log Collection

```bash
# Collect support bundle
./scripts/collect-support-bundle.sh --namespace seizn --output /tmp/seizn-bundle.tar.gz

# Bundle includes:
# - Pod logs (last 24h)
# - Events
# - Resource descriptions
# - Metrics snapshot
# - Configuration (sanitized)
```

### 10.2 Common Issues

| Issue | Symptom | Resolution |
|-------|---------|------------|
| Database connection timeout | 5xx errors | Check network policies, security groups |
| High memory usage | OOMKilled pods | Increase limits, check for memory leaks |
| Slow vector search | High latency | Check pgvector indexes, vacuum analyze |
| Certificate expiry | TLS errors | Renew certs via cert-manager |

### 10.3 Support Channels

- **Documentation**: https://docs.seizn.com/self-hosted
- **Community**: https://github.com/seizn/seizn/discussions
- **Enterprise Support**: support@seizn.com
- **Security Issues**: security@seizn.com (PGP key available)

---

*This guide is maintained by the Platform Team. Last reviewed: 2026-02-04*
