# Partner Integrations Design

> Version: 1.0.0
> Last Updated: 2026-02-02
> Status: Design Document

---

## 1. Overview

This document outlines the integration architecture for connecting Seizn with enterprise security, identity, and data protection systems.

---

## 2. SIEM Integrations

### 2.1 Supported Platforms

| Platform | Protocol | Status |
|----------|----------|--------|
| Splunk | HTTP Event Collector (HEC) | Planned |
| Elastic/ELK | Logstash/Beats | Planned |
| Datadog | Log Forwarding API | Planned |
| Sumo Logic | HTTP Source | Planned |
| Azure Sentinel | Log Analytics API | Planned |
| IBM QRadar | Log Source API | Future |
| Google Chronicle | Ingestion API | Future |

### 2.2 Event Types

```yaml
# Events sent to SIEM
events:
  authentication:
    - auth.login.success
    - auth.login.failure
    - auth.logout
    - auth.mfa.challenge
    - auth.password.change
    - auth.session.expired

  authorization:
    - authz.permission.granted
    - authz.permission.denied
    - authz.role.changed
    - authz.policy.evaluated

  data_access:
    - data.read
    - data.write
    - data.delete
    - data.export

  agent_activity:
    - agent.session.start
    - agent.session.end
    - agent.tool.called
    - agent.tool.blocked
    - agent.approval.requested
    - agent.approval.granted
    - agent.approval.denied

  governance:
    - policy.violation
    - policy.updated
    - rtbf.requested
    - rtbf.completed

  system:
    - system.error
    - system.config.changed
    - system.maintenance
```

### 2.3 Splunk Integration

#### Configuration

```typescript
interface SplunkConfig {
  endpoint: string;        // HEC endpoint URL
  token: string;           // HEC token
  index: string;           // Target index
  sourcetype: string;      // Default: 'seizn:events'
  ssl_verify: boolean;     // Verify SSL cert
  batch_size: number;      // Events per batch
  flush_interval: number;  // Seconds
}
```

#### Event Format

```json
{
  "time": 1706860800,
  "host": "api.seizn.com",
  "source": "seizn",
  "sourcetype": "seizn:events",
  "index": "main",
  "event": {
    "event_type": "auth.login.success",
    "timestamp": "2026-02-02T10:30:00Z",
    "organization_id": "org_xxx",
    "user_id": "usr_xxx",
    "user_email": "user@example.com",
    "ip_address": "203.0.113.1",
    "user_agent": "Mozilla/5.0...",
    "session_id": "ses_xxx",
    "mfa_used": true,
    "auth_method": "password"
  }
}
```

#### Setup API

```
POST /api/integrations/siem/splunk
{
  "name": "Production Splunk",
  "config": {
    "endpoint": "https://splunk.example.com:8088/services/collector",
    "token": "xxx-xxx-xxx",
    "index": "seizn_prod",
    "sourcetype": "seizn:events"
  },
  "event_filters": {
    "include": ["auth.*", "authz.*", "data.*"],
    "exclude": ["*.debug"]
  }
}
```

### 2.4 Datadog Integration

#### Configuration

```typescript
interface DatadogConfig {
  api_key: string;
  site: 'datadoghq.com' | 'datadoghq.eu' | 'us3.datadoghq.com' | 'us5.datadoghq.com';
  service: string;
  env: string;
  tags: string[];
}
```

#### Log Format

```json
{
  "ddsource": "seizn",
  "ddtags": "env:production,service:seizn-api,version:1.0.0",
  "hostname": "api.seizn.com",
  "service": "seizn",
  "status": "info",
  "message": "User login successful",
  "seizn": {
    "event_type": "auth.login.success",
    "organization_id": "org_xxx",
    "user_id": "usr_xxx"
  }
}
```

### 2.5 Elastic Integration

#### Configuration

```typescript
interface ElasticConfig {
  hosts: string[];
  api_key?: string;
  username?: string;
  password?: string;
  index_prefix: string;
  ilm_policy?: string;
  ssl?: {
    ca_cert?: string;
    verify: boolean;
  };
}
```

#### Index Template

```json
{
  "index_patterns": ["seizn-*"],
  "template": {
    "settings": {
      "number_of_shards": 2,
      "number_of_replicas": 1,
      "index.lifecycle.name": "seizn-logs-policy"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "event_type": { "type": "keyword" },
        "organization_id": { "type": "keyword" },
        "user_id": { "type": "keyword" },
        "ip_address": { "type": "ip" },
        "message": { "type": "text" }
      }
    }
  }
}
```

---

## 3. DLP Integrations

### 3.1 Supported Platforms

| Platform | Integration Type | Status |
|----------|-----------------|--------|
| Microsoft Purview | API | Planned |
| Symantec DLP | ICAP | Planned |
| Forcepoint | REST API | Future |
| Digital Guardian | Agent | Future |
| Netskope | CASB API | Future |

### 3.2 Microsoft Purview Integration

#### Capabilities

- **Content Inspection**: Send content for DLP policy evaluation
- **Sensitivity Labels**: Apply Microsoft sensitivity labels
- **Audit Events**: Forward compliance events to Purview

#### Configuration

```typescript
interface PurviewConfig {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  policies: {
    content_inspection: boolean;
    sensitivity_labeling: boolean;
    audit_forwarding: boolean;
  };
  inspection_endpoints: string[];
}
```

#### Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Seizn     │────▶│   Purview   │────▶│   Policy    │
│   Agent     │     │   API       │     │   Engine    │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                    │
      │                   ▼                    │
      │           ┌─────────────┐              │
      │           │   Audit     │◀─────────────┘
      │           │   Log       │
      │           └─────────────┘
      │                   │
      │                   ▼
      │           ┌─────────────┐
      └──────────▶│   Action    │
                  │  (Block/    │
                  │   Warn)     │
                  └─────────────┘
```

### 3.3 Symantec DLP Integration

#### ICAP Integration

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Seizn     │────▶│    ICAP     │────▶│  Symantec   │
│   Proxy     │     │   Client    │     │   DLP       │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌───────────┐
                    │  RESPMOD  │
                    │  Response │
                    └───────────┘
```

#### Configuration

```typescript
interface SymantecConfig {
  icap_server: string;
  icap_port: number;
  service_path: string;
  preview_enabled: boolean;
  preview_size: number;
  timeout_ms: number;
}
```

---

## 4. IdP Integrations

### 4.1 Supported Providers

| Provider | Protocol | Status |
|----------|----------|--------|
| Okta | SAML 2.0, OIDC | ✅ Implemented |
| Azure AD | SAML 2.0, OIDC | ✅ Implemented |
| Google Workspace | SAML 2.0, OIDC | ✅ Implemented |
| OneLogin | SAML 2.0 | Planned |
| PingIdentity | SAML 2.0, OIDC | Planned |
| Auth0 | OIDC | Planned |
| JumpCloud | SAML 2.0 | Future |

### 4.2 Advanced Okta Integration

#### SCIM 2.0 Endpoints

```
Base URL: https://api.seizn.com/scim/v2

Endpoints:
  GET    /Users              # List users
  POST   /Users              # Create user
  GET    /Users/{id}         # Get user
  PUT    /Users/{id}         # Replace user
  PATCH  /Users/{id}         # Update user
  DELETE /Users/{id}         # Deactivate user

  GET    /Groups             # List groups
  POST   /Groups             # Create group
  GET    /Groups/{id}        # Get group
  PUT    /Groups/{id}        # Replace group
  PATCH  /Groups/{id}        # Update group
  DELETE /Groups/{id}        # Delete group
```

#### Okta Workflows Integration

```yaml
# Okta Workflow: Seizn User Provisioning
trigger:
  type: user.lifecycle.create
  source: okta

actions:
  - type: http
    method: POST
    url: https://api.seizn.com/scim/v2/Users
    headers:
      Authorization: Bearer {{secrets.seizn_scim_token}}
    body:
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"]
      userName: "{{user.email}}"
      emails:
        - value: "{{user.email}}"
          primary: true
      name:
        givenName: "{{user.firstName}}"
        familyName: "{{user.lastName}}"
```

### 4.3 Azure AD Conditional Access

#### Integration Points

1. **Device Compliance**: Check device compliance before granting access
2. **Risk-Based Access**: Integrate with Azure AD Identity Protection
3. **Session Controls**: Enforce session restrictions

#### Configuration

```typescript
interface AzureADConfig {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  features: {
    device_compliance: boolean;
    risk_based_access: boolean;
    session_controls: boolean;
    conditional_access_evaluation: boolean;
  };
  policies: {
    require_compliant_device: boolean;
    max_risk_level: 'low' | 'medium' | 'high';
    session_lifetime_hours: number;
  };
}
```

---

## 5. Integration API

### 5.1 Common Endpoints

```
# Integration Management
GET    /api/integrations                    # List all integrations
POST   /api/integrations                    # Create integration
GET    /api/integrations/{id}               # Get integration details
PUT    /api/integrations/{id}               # Update integration
DELETE /api/integrations/{id}               # Delete integration

# Integration Health
GET    /api/integrations/{id}/health        # Check health
POST   /api/integrations/{id}/test          # Test connection

# Integration Logs
GET    /api/integrations/{id}/logs          # Get integration logs
```

### 5.2 Webhook Outbound

```typescript
interface WebhookConfig {
  url: string;
  secret: string;  // For HMAC signature
  events: string[];
  headers?: Record<string, string>;
  retry_policy: {
    max_retries: number;
    backoff_type: 'linear' | 'exponential';
    initial_delay_ms: number;
  };
}
```

#### Webhook Payload

```json
{
  "id": "evt_xxx",
  "type": "agent.tool.blocked",
  "created_at": "2026-02-02T10:30:00Z",
  "data": {
    "organization_id": "org_xxx",
    "session_id": "ses_xxx",
    "tool_name": "shell_execute",
    "reason": "risk_level_exceeded"
  },
  "signature": "sha256=xxx"
}
```

### 5.3 Database Schema

```sql
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  type TEXT NOT NULL, -- 'siem', 'dlp', 'idp', 'webhook'
  provider TEXT NOT NULL, -- 'splunk', 'purview', 'okta', etc.
  name TEXT NOT NULL,

  config JSONB NOT NULL,
  secrets_ref TEXT, -- Reference to secrets manager

  status TEXT NOT NULL DEFAULT 'active',
  health_status TEXT DEFAULT 'unknown',
  last_health_check_at TIMESTAMPTZ,
  last_error TEXT,

  event_filters JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id),

  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. Implementation Roadmap

### Phase 1: Q1 2026

- [ ] Splunk HEC integration
- [ ] Datadog log forwarding
- [ ] Webhook outbound framework
- [ ] Integration management UI

### Phase 2: Q2 2026

- [ ] Elastic integration
- [ ] Azure Sentinel integration
- [ ] Microsoft Purview DLP
- [ ] Advanced Okta workflows

### Phase 3: Q3 2026

- [ ] Symantec DLP (ICAP)
- [ ] QRadar integration
- [ ] Custom integration SDK
- [ ] Integration marketplace

---

## 7. Security Considerations

### 7.1 Credential Storage

- All secrets stored in external secrets manager
- Encryption at rest with customer keys (BYOK)
- Automatic credential rotation support
- Audit logging of secret access

### 7.2 Data in Transit

- TLS 1.3 for all outbound connections
- Certificate pinning for critical integrations
- Mutual TLS support

### 7.3 Access Control

- Integration management requires admin role
- Per-integration access controls
- Audit trail of all configuration changes

---

*Questions? Contact integrations@seizn.com*
