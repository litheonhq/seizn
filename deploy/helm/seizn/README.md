# Seizn Helm Chart

Enterprise-grade AI Agent Platform for on-premises deployment.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- PV provisioner (for persistence)
- (Optional) Ingress Controller
- (Optional) cert-manager for TLS

## Installation

### Add Bitnami repo for dependencies

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

### Install with default values

```bash
helm install seizn ./deploy/helm/seizn \
  --namespace seizn \
  --create-namespace
```

### Install with custom values

```bash
helm install seizn ./deploy/helm/seizn \
  --namespace seizn \
  --create-namespace \
  --values custom-values.yaml
```

## Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.imageRegistry` | Global container registry | `""` |
| `global.imagePullSecrets` | Global image pull secrets | `[]` |
| `apiGateway.enabled` | Enable API Gateway | `true` |
| `apiGateway.replicaCount` | Number of replicas | `2` |
| `apiGateway.autoscaling.enabled` | Enable HPA | `true` |
| `spring.enabled` | Enable Spring service | `true` |
| `summer.enabled` | Enable Summer service | `true` |
| `winter.enabled` | Enable Winter service | `true` |
| `postgresql.enabled` | Deploy PostgreSQL | `true` |
| `redis.enabled` | Deploy Redis | `true` |
| `ingress.enabled` | Enable Ingress | `false` |

## External Secrets

For production, use External Secrets Operator:

```yaml
externalSecrets:
  enabled: true
  secretStoreRef:
    name: "vault-backend"
    kind: "ClusterSecretStore"
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: seizn/database
        property: url
```

## Air-Gapped Installation

1. Pull all images and push to internal registry
2. Update `global.imageRegistry`
3. Run `helm dependency build`
4. Install with local charts

## Enterprise Features

### License Configuration

```yaml
enterprise:
  license:
    enabled: true
    key: "your-license-key"
    # Or use existing secret
    existingSecret: "seizn-license"
    existingSecretKey: "license-key"
```

### SSO/OIDC Configuration

```yaml
enterprise:
  sso:
    enabled: true
    provider: "oidc"
    oidc:
      issuerUrl: "https://your-idp.com"
      clientId: "seizn-client"
      clientSecret: "your-secret"
      scopes:
        - openid
        - email
        - profile
    allowedDomains:
      - "yourcompany.com"
```

### KMS Integration (Evidence Pack Signing)

#### AWS KMS
```yaml
enterprise:
  kms:
    enabled: true
    provider: "aws"
    aws:
      region: "us-east-1"
      keyId: "arn:aws:kms:us-east-1:123456789:key/..."
      useIRSA: true  # Recommended: Use IAM Roles for Service Accounts
```

#### Azure Key Vault
```yaml
enterprise:
  kms:
    enabled: true
    provider: "azure"
    azure:
      keyVaultUrl: "https://your-vault.vault.azure.net"
      keyName: "seizn-signing-key"
      useWorkloadIdentity: true
```

#### Google Cloud KMS
```yaml
enterprise:
  kms:
    enabled: true
    provider: "gcp"
    gcp:
      projectId: "your-project"
      locationId: "global"
      keyRingId: "seizn-keyring"
      keyId: "signing-key"
```

### Audit Log Export

```yaml
enterprise:
  audit:
    enabled: true
    retentionDays: 90
    export:
      enabled: true
      type: "splunk"  # or "syslog", "datadog", "custom"
      endpoint: "https://your-splunk:8088"
      splunkToken: "your-hec-token"
```

### Data Residency

```yaml
enterprise:
  dataResidency:
    enabled: true
    region: "eu"
    enforceLocality: true
    allowedRegions:
      - eu-west-1
      - eu-central-1
```

### Resource Quotas

```yaml
enterprise:
  quotas:
    enabled: true
    defaults:
      maxUsers: 100
      maxMemoryGB: 50
      maxRequestsPerMonth: 1000000
```

## Air-Gapped Installation

1. **Prepare Images**
   ```bash
   # Pull all required images
   ./scripts/pull-images.sh

   # Push to internal registry
   ./scripts/push-to-registry.sh your-registry.internal
   ```

2. **Configure Air-Gapped Mode**
   ```yaml
   enterprise:
     airGapped:
       enabled: true
       imageRegistry: "your-registry.internal"
       imagePullSecrets:
         - name: private-registry-creds
     license:
       enabled: true
       offlineValidation: true
   ```

3. **Build Dependencies Locally**
   ```bash
   helm dependency build ./deploy/helm/seizn
   ```

4. **Install**
   ```bash
   helm install seizn ./deploy/helm/seizn \
     --namespace seizn \
     --create-namespace \
     --values air-gapped-values.yaml
   ```

## Monitoring & Observability

### Prometheus Metrics

```yaml
monitoring:
  enabled: true
  prometheus:
    enabled: true
    serviceMonitor:
      enabled: true
      interval: 30s
```

### Distributed Tracing

```yaml
monitoring:
  tracing:
    enabled: true
    provider: "otlp"
    endpoint: "http://otel-collector:4318"
    samplingRate: 0.1
```

## Backup & Recovery

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"  # Daily at 2 AM
  retention: 30
  storage:
    type: "s3"
    bucket: "seizn-backups"
    prefix: "prod"
```

## Security

- All pods run as non-root (UID 1000)
- Network policies enabled by default
- TLS enforced for ingress
- Secrets encrypted at rest (use external secrets manager)
- Pod Security Standards: Restricted
- Service mesh compatible (Istio, Linkerd)

## Upgrading

```bash
# Update dependencies
helm dependency update ./deploy/helm/seizn

# Upgrade release
helm upgrade seizn ./deploy/helm/seizn \
  --namespace seizn \
  --values custom-values.yaml
```

## Uninstallation

```bash
helm uninstall seizn --namespace seizn
```

**Note:** PersistentVolumeClaims are not deleted automatically. To remove all data:

```bash
kubectl delete pvc -n seizn -l app.kubernetes.io/instance=seizn
```
