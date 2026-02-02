# Single-Tenant Hosted SKU Architecture

> Version: 1.0.0
> Last Updated: 2026-02-02
> Status: Design Document

---

## 1. Overview

The Single-Tenant Hosted SKU provides dedicated, isolated infrastructure for enterprise customers in regulated industries who require complete data isolation and compliance controls beyond what multi-tenant architecture can offer.

---

## 2. Target Use Cases

### 2.1 Customer Profiles

| Industry | Requirements | Compliance |
|----------|--------------|------------|
| Financial Services | Data isolation, audit trail | SOX, PCI-DSS |
| Healthcare | PHI isolation, HIPAA compliance | HIPAA, HITRUST |
| Government | FedRAMP, data sovereignty | FedRAMP, ITAR |
| Legal | Client confidentiality | ABA Model Rules |

### 2.2 Key Differentiators from Multi-Tenant

| Aspect | Multi-Tenant | Single-Tenant |
|--------|--------------|---------------|
| Database | Shared, row-level isolation | Dedicated instance |
| Compute | Shared pods | Dedicated namespace/cluster |
| Network | Shared VPC | Dedicated VPC or VPC peering |
| Encryption | Platform-managed | Customer-managed (BYOK) |
| Updates | Automatic | Controlled rollout |
| SLA | 99.9% | 99.95% with custom options |

---

## 3. Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Customer's Cloud Account                          │
│                         (Optional: VPC Peering)                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ VPC Peering / PrivateLink
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Seizn Single-Tenant Environment                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Dedicated VPC (10.X.0.0/16)                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Kubernetes Namespace                      │  │  │
│  │  │                    (customer-{id}-prod)                      │  │  │
│  │  │                                                              │  │  │
│  │  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │  │  │
│  │  │   │   API    │  │  Spring  │  │  Summer  │  │  Winter  │   │  │  │
│  │  │   │ Gateway  │  │  Service │  │  Service │  │  Service │   │  │  │
│  │  │   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │  │  │
│  │  │        │             │             │             │          │  │  │
│  │  │        └─────────────┴──────┬──────┴─────────────┘          │  │  │
│  │  └─────────────────────────────┼───────────────────────────────┘  │  │
│  │                                │                                   │  │
│  │  ┌─────────────────────────────┼───────────────────────────────┐  │  │
│  │  │                    Data Layer                                │  │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │  │  │
│  │  │  │  PostgreSQL  │  │   pgvector   │  │     S3       │       │  │  │
│  │  │  │  (Dedicated) │  │  (Dedicated) │  │  (Dedicated) │       │  │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘       │  │  │
│  │  │                                                              │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐   │  │  │
│  │  │  │         Customer KMS (AWS/Azure/GCP)                  │   │  │  │
│  │  │  │         Encryption at Rest + Key Rotation             │   │  │  │
│  │  │  └──────────────────────────────────────────────────────┘   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Isolation

| Component | Isolation Method | Configuration |
|-----------|------------------|---------------|
| Kubernetes | Dedicated namespace | Resource quotas, network policies |
| Database | Dedicated RDS/Cloud SQL | Customer-specific instance |
| Vector DB | Dedicated pgvector | Same instance as main DB |
| Object Storage | Dedicated S3 bucket | Customer KMS encryption |
| Redis | Dedicated instance | Persistence enabled |
| Secrets | Dedicated Vault namespace | Customer-managed keys |

### 3.3 Network Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Dedicated VPC: 10.{customer_id}.0.0/16          │
│                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │   Public Subnet      │  │   Public Subnet      │                 │
│  │   10.X.1.0/24        │  │   10.X.2.0/24        │                 │
│  │   (AZ-a)             │  │   (AZ-b)             │                 │
│  │   ┌──────────────┐   │  │   ┌──────────────┐   │                 │
│  │   │     ALB      │   │  │   │     ALB      │   │                 │
│  │   └──────────────┘   │  │   └──────────────┘   │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │   Private Subnet     │  │   Private Subnet     │                 │
│  │   10.X.10.0/24       │  │   10.X.11.0/24       │                 │
│  │   (AZ-a)             │  │   (AZ-b)             │                 │
│  │   ┌──────────────┐   │  │   ┌──────────────┐   │                 │
│  │   │  App Pods    │   │  │   │  App Pods    │   │                 │
│  │   └──────────────┘   │  │   └──────────────┘   │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │   Data Subnet        │  │   Data Subnet        │                 │
│  │   10.X.20.0/24       │  │   10.X.21.0/24       │                 │
│  │   (AZ-a)             │  │   (AZ-b)             │                 │
│  │   ┌──────────────┐   │  │   ┌──────────────┐   │                 │
│  │   │  Database    │   │  │   │  Replica     │   │                 │
│  │   └──────────────┘   │  │   └──────────────┘   │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    VPC Endpoints                               │  │
│  │  S3 | KMS | Secrets Manager | CloudWatch | ECR               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Provisioning

### 4.1 Provisioning Flow

```
1. Sales Agreement
   └── Contract signed, requirements documented

2. Configuration
   ├── Region selection
   ├── Instance sizing
   ├── Network configuration
   ├── BYOK setup (optional)
   └── Integration requirements

3. Infrastructure Provisioning (Terraform)
   ├── VPC creation
   ├── Kubernetes namespace
   ├── Database provisioning
   ├── Storage buckets
   └── KMS configuration

4. Application Deployment
   ├── Helm chart deployment
   ├── Configuration injection
   ├── SSL certificate setup
   └── DNS configuration

5. Validation
   ├── Health checks
   ├── Security scan
   ├── Performance baseline
   └── Customer acceptance

6. Handoff
   ├── Admin credentials
   ├── Documentation
   ├── Support channels
   └── Training (optional)
```

### 4.2 Terraform Modules

```hcl
# Main provisioning module
module "seizn_single_tenant" {
  source = "./modules/single-tenant"

  # Customer identification
  customer_id   = var.customer_id
  customer_name = var.customer_name
  environment   = "production"

  # Region and availability
  region             = var.region
  availability_zones = var.azs

  # Sizing
  instance_class = var.instance_class  # "small", "medium", "large", "xlarge"

  # Network
  vpc_cidr           = "10.${var.customer_id}.0.0/16"
  enable_vpc_peering = var.enable_vpc_peering
  peer_vpc_id        = var.peer_vpc_id

  # Security
  byok_enabled    = var.byok_enabled
  kms_key_arn     = var.kms_key_arn
  allowed_ip_cidrs = var.allowed_ip_cidrs

  # Features
  enable_high_availability = true
  enable_backup            = true
  backup_retention_days    = 30

  tags = {
    Customer    = var.customer_name
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
```

### 4.3 Instance Sizing

| Size | vCPU | Memory | Storage | Connections | Price/Month |
|------|------|--------|---------|-------------|-------------|
| Small | 2 | 4 GB | 100 GB | 100 | $2,000 |
| Medium | 4 | 8 GB | 250 GB | 250 | $4,000 |
| Large | 8 | 16 GB | 500 GB | 500 | $8,000 |
| XLarge | 16 | 32 GB | 1 TB | 1000 | $15,000 |
| Custom | - | - | - | - | Contact Sales |

---

## 5. Operations

### 5.1 Update Management

| Update Type | Strategy | Customer Control |
|-------------|----------|------------------|
| Security patches | Automatic (within 48h) | Notification only |
| Bug fixes | Staged rollout | 7-day delay option |
| Minor versions | Customer-scheduled | Full control |
| Major versions | Coordinated | Full control |

### 5.2 Maintenance Windows

- **Default**: Sundays 02:00-06:00 (customer timezone)
- **Emergency**: As needed with 1-hour notice
- **Planned**: 7-day advance notice

### 5.3 Monitoring

```yaml
# Dedicated monitoring stack
monitoring:
  prometheus:
    retention: 90d
    storage: 100Gi

  grafana:
    dashboards:
      - seizn-overview
      - database-performance
      - api-latency
      - security-events

  alerting:
    channels:
      - pagerduty: customer-oncall
      - email: customer-ops@example.com
      - webhook: customer-siem
```

### 5.4 Backup Strategy

| Data Type | Frequency | Retention | Recovery |
|-----------|-----------|-----------|----------|
| Database | Continuous (WAL) | 30 days | Point-in-time |
| Daily snapshot | Daily | 30 days | Full restore |
| Weekly snapshot | Weekly | 90 days | Full restore |
| Monthly archive | Monthly | 1 year | Full restore |
| Object storage | Versioned | 90 days | Object-level |

---

## 6. Security

### 6.1 Network Security

- **Ingress**: ALB with WAF, DDoS protection
- **Egress**: NAT Gateway with allowlist
- **Internal**: mTLS between services
- **Database**: Private subnet, no public IP

### 6.2 Access Control

```yaml
# Customer admin access
customer_admins:
  - role: tenant_admin
    permissions:
      - manage_users
      - view_audit_logs
      - configure_settings
      - manage_api_keys
    restrictions:
      - no_infrastructure_access
      - no_database_direct_access

# Seizn support access
seizn_support:
  - role: support_engineer
    permissions:
      - view_logs
      - view_metrics
      - restart_services
    restrictions:
      - no_data_access
      - requires_customer_approval
      - session_recorded
```

### 6.3 Compliance Controls

| Control | Implementation |
|---------|----------------|
| Encryption at rest | AES-256 with customer KMS |
| Encryption in transit | TLS 1.3 |
| Key rotation | Automatic (90-day) or customer-managed |
| Audit logging | Immutable, 2-year retention |
| Access reviews | Quarterly automated reports |
| Vulnerability scanning | Weekly automated scans |
| Penetration testing | Annual (customer can request) |

---

## 7. SLA and Support

### 7.1 Service Level Agreement

| Metric | Target | Measurement |
|--------|--------|-------------|
| Uptime | 99.95% | Monthly |
| API latency (p99) | < 500ms | Hourly |
| Data durability | 99.999999999% | Annual |
| RTO | 4 hours | Per incident |
| RPO | 1 hour | Per incident |

### 7.2 Support Tiers

| Tier | Response (Critical) | Response (High) | Included |
|------|---------------------|-----------------|----------|
| Standard | 1 hour | 4 hours | Email, portal |
| Premium | 15 minutes | 1 hour | + Phone, Slack |
| Enterprise | 15 minutes | 1 hour | + TAM, on-site |

---

## 8. Customer Onboarding Checklist

### 8.1 Pre-Provisioning

- [ ] Contract signed
- [ ] Technical requirements documented
- [ ] Region selected
- [ ] Instance size determined
- [ ] Network configuration planned
- [ ] BYOK keys provisioned (if applicable)
- [ ] Admin contacts identified

### 8.2 Provisioning

- [ ] Infrastructure deployed
- [ ] Application deployed
- [ ] SSL certificates configured
- [ ] DNS configured
- [ ] Health checks passing
- [ ] Security scan completed

### 8.3 Post-Provisioning

- [ ] Admin accounts created
- [ ] SSO configured (if applicable)
- [ ] API keys generated
- [ ] Documentation provided
- [ ] Training completed (if requested)
- [ ] Go-live confirmed

---

## 9. Pricing

### 9.1 Base Pricing

| Component | Small | Medium | Large |
|-----------|-------|--------|-------|
| Platform | $2,000 | $4,000 | $8,000 |
| Database | Included | Included | Included |
| Storage (first 100GB) | Included | Included | Included |
| Support (Standard) | Included | Included | Included |

### 9.2 Add-Ons

| Add-On | Price |
|--------|-------|
| Premium Support | +$1,000/mo |
| Enterprise Support | +$3,000/mo |
| Additional storage | $0.10/GB/mo |
| VPC Peering | $500/mo |
| Dedicated TAM | $5,000/mo |
| Custom SLA | Contact Sales |

---

## 10. Migration Path

### 10.1 Multi-Tenant to Single-Tenant

1. **Assessment** (1 week)
   - Data volume analysis
   - Configuration export
   - Dependency mapping

2. **Provisioning** (1-2 weeks)
   - Infrastructure deployment
   - Configuration migration
   - Integration setup

3. **Data Migration** (1-2 weeks)
   - Schema migration
   - Data transfer
   - Validation

4. **Cutover** (1 day)
   - DNS switch
   - Final sync
   - Verification

5. **Decommission** (1 week)
   - Multi-tenant cleanup
   - Final verification
   - Documentation update

---

*This document is maintained by the Platform Team. Contact platform@seizn.com for questions.*
