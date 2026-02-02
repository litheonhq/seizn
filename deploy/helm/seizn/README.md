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

## Security

- All pods run as non-root (UID 1000)
- Network policies enabled by default
- TLS enforced for ingress
- Secrets encrypted at rest (use external secrets manager)
