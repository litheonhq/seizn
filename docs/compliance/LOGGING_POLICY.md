# Logging Policy

> Version: 1.0.0
> Last Updated: 2026-02-02
> Owner: Security Team
> Review Cycle: Quarterly

---

## 1. Purpose

This policy establishes requirements for logging, monitoring, and retention of system events to support security monitoring, incident response, and compliance requirements.

---

## 2. Scope

This policy applies to:
- All Seizn production systems
- All applications and services
- All infrastructure components
- All data processing activities

---

## 3. Logging Requirements

### 3.1 Mandatory Log Events

#### Authentication Events

| Event | Priority | Data Points |
|-------|----------|-------------|
| Login success | High | User ID, timestamp, IP, method, device |
| Login failure | High | User ID (if known), timestamp, IP, reason |
| Logout | Medium | User ID, timestamp, session duration |
| MFA challenge | High | User ID, method, result |
| Password change | High | User ID, timestamp, IP |
| Password reset | High | User ID, timestamp, IP, method |
| Session timeout | Low | User ID, timestamp |

#### Authorization Events

| Event | Priority | Data Points |
|-------|----------|-------------|
| Permission granted | High | User ID, resource, permission, grantor |
| Permission revoked | High | User ID, resource, permission, revoker |
| Access denied | High | User ID, resource, reason |
| Role change | High | User ID, old role, new role, modifier |
| API key created | High | Key ID (masked), scope, creator |
| API key revoked | High | Key ID (masked), revoker, reason |

#### Data Access Events

| Event | Priority | Data Points |
|-------|----------|-------------|
| Data read | Medium | User ID, resource type, resource ID |
| Data create | Medium | User ID, resource type, resource ID |
| Data update | Medium | User ID, resource type, resource ID |
| Data delete | High | User ID, resource type, resource ID |
| Data export | High | User ID, data type, volume, format |
| Bulk operations | High | User ID, operation, affected count |

#### Administrative Events

| Event | Priority | Data Points |
|-------|----------|-------------|
| Config change | High | Admin ID, setting, old value, new value |
| User created | High | Admin ID, new user ID, role |
| User deleted | High | Admin ID, deleted user ID |
| Policy change | High | Admin ID, policy, change details |
| Backup initiated | Medium | Admin ID, backup type, scope |
| Restore initiated | High | Admin ID, restore point, scope |

#### System Events

| Event | Priority | Data Points |
|-------|----------|-------------|
| Service start/stop | Medium | Service name, reason, initiator |
| Error/exception | High | Service, error type, stack trace |
| Performance degradation | Medium | Service, metric, threshold, value |
| Resource exhaustion | High | Resource type, threshold, value |
| Certificate events | High | Cert ID, event type, expiry |

#### Security Events

| Event | Priority | Data Points |
|-------|----------|-------------|
| Threat detected | Critical | Threat type, source, target, action |
| Malware detected | Critical | File, hash, location, action |
| Policy violation | High | Policy, user, violation details |
| Rate limit exceeded | Medium | User/IP, endpoint, limit, count |
| Unusual activity | Medium | User, activity type, details |

### 3.2 Log Levels

| Level | Usage | Examples |
|-------|-------|----------|
| CRITICAL | System unusable | Data breach, complete outage |
| ERROR | Operation failed | Database error, API failure |
| WARNING | Potential issue | High latency, disk 80% |
| INFO | Normal operations | User login, API call |
| DEBUG | Troubleshooting | Request details (dev only) |

---

## 4. Log Format

### 4.1 Standard Log Structure

```json
{
  "timestamp": "2026-02-02T10:30:00.000Z",
  "level": "INFO",
  "service": "api-gateway",
  "environment": "production",
  "trace_id": "abc123",
  "span_id": "def456",
  "event": {
    "type": "auth.login",
    "result": "success"
  },
  "actor": {
    "type": "user",
    "id": "usr_xxx",
    "ip": "203.0.113.1",
    "user_agent": "Mozilla/5.0..."
  },
  "resource": {
    "type": "session",
    "id": "ses_xxx"
  },
  "metadata": {
    "mfa_used": true,
    "auth_method": "password"
  }
}
```

### 4.2 Required Fields

| Field | Description | Required |
|-------|-------------|----------|
| timestamp | ISO 8601 UTC | Always |
| level | Log level | Always |
| service | Source service | Always |
| environment | prod/staging/dev | Always |
| trace_id | Distributed trace ID | When available |
| event.type | Event category | Always |
| actor.id | Who performed action | When available |
| actor.ip | Source IP address | When available |

### 4.3 Sensitive Data Handling

**Never Log:**
- Passwords or password hashes
- Full API keys or tokens
- Credit card numbers
- Social Security Numbers
- Private encryption keys

**Mask or Truncate:**
- API keys: `szn_***...abc` (first 4, last 3)
- Email: `j***@example.com`
- IP addresses: Consider hashing for analytics

**Redaction Format:**
```json
{
  "api_key": "[REDACTED:szn_***abc]",
  "password": "[REDACTED]",
  "ssn": "[REDACTED:PII]"
}
```

---

## 5. Log Collection Architecture

### 5.1 Collection Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Application │────▶│    Agent    │────▶│   Axiom/    │
│   Logs      │     │ (Vector.dev)│     │   SIEM      │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Archive   │
                    │    (S3)     │
                    └─────────────┘
```

### 5.2 Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| Log Agent | Collection, forwarding | Vector.dev |
| Log Store | Search, analysis | Axiom |
| Archive | Long-term retention | S3 (encrypted) |
| SIEM | Security analysis | Customer's SIEM |

### 5.3 Reliability

- Logs buffered locally before forwarding
- At-least-once delivery guarantee
- Automatic retry with backoff
- Dead letter queue for failed logs

---

## 6. Retention Policy

### 6.1 Retention Periods

| Log Type | Hot Storage | Warm Storage | Archive | Total |
|----------|-------------|--------------|---------|-------|
| Security | 90 days | 1 year | 2 years | 3+ years |
| Access | 30 days | 6 months | 1 year | 2 years |
| Application | 14 days | 90 days | 6 months | 1 year |
| Debug | 7 days | - | - | 7 days |
| Audit | 90 days | 1 year | 5 years | 7 years |

### 6.2 Storage Tiers

| Tier | Access Time | Cost | Use Case |
|------|-------------|------|----------|
| Hot | < 1 second | $$$ | Active monitoring |
| Warm | < 1 minute | $$ | Recent investigations |
| Archive | < 4 hours | $ | Compliance, legal |

### 6.3 Deletion

- Automated deletion based on retention policy
- Secure deletion (overwrite) for archive
- Deletion logged for compliance
- Legal hold override when required

---

## 7. Log Access

### 7.1 Access Levels

| Role | Access |
|------|--------|
| Security Team | All logs (production) |
| Engineering | Application logs (own services) |
| Support | Sanitized access logs |
| Customer | Own organization's logs |

### 7.2 Access Controls

- All log access requires authentication
- Access logged and auditable
- Sensitive logs require MFA
- Bulk export requires approval

### 7.3 Customer Log Access

Customers can access:
- User activity logs
- API access logs
- Security event logs

Via:
- Dashboard UI
- Log export API
- SIEM integration

---

## 8. Monitoring & Alerting

### 8.1 Real-Time Alerts

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| Brute force | >10 failed logins/5min | High | Block IP, notify |
| Data exfil | Bulk export > threshold | Critical | Investigate |
| Priv escalation | Admin role granted | High | Verify |
| Anomaly | ML-detected anomaly | Medium | Review |
| Error spike | Error rate > 5% | High | Investigate |

### 8.2 Alert Routing

```yaml
routes:
  - match: severity == "critical"
    notify:
      - pagerduty: security-oncall
      - slack: #security-alerts

  - match: severity == "high"
    notify:
      - slack: #security-alerts

  - match: severity == "medium"
    notify:
      - slack: #ops-alerts
```

### 8.3 Dashboards

| Dashboard | Audience | Metrics |
|-----------|----------|---------|
| Security Overview | Security Team | Threats, anomalies, auth |
| Application Health | Engineering | Errors, latency, throughput |
| Access Patterns | Compliance | Who accessed what when |
| Customer Activity | Support | User sessions, API calls |

---

## 9. SIEM Integration

### 9.1 Supported SIEMs

- Splunk (via HTTP Event Collector)
- Elastic/ELK (via Logstash)
- Datadog (via API)
- Sumo Logic (via collector)
- Azure Sentinel (via connector)
- Custom (via webhook)

### 9.2 Integration Format

```json
{
  "endpoint": "https://customer-siem.example.com/logs",
  "format": "json",
  "authentication": {
    "type": "bearer",
    "token_ref": "siem_token"
  },
  "filters": {
    "levels": ["ERROR", "CRITICAL"],
    "event_types": ["security.*", "auth.*"]
  },
  "batching": {
    "max_size": 1000,
    "max_wait_seconds": 5
  }
}
```

### 9.3 Customer Configuration

Customers can configure:
- Which log types to export
- Filtering rules
- Destination endpoints
- Export format

---

## 10. Compliance Requirements

### 10.1 SOC 2

- Log integrity protected
- Access to logs audited
- Retention meets requirements
- Alerts for security events

### 10.2 GDPR

- Personal data in logs minimized
- Retention limited to necessary
- Subject access requests supported
- Deletion upon request (where legal)

### 10.3 HIPAA

- PHI logging minimized
- Access strictly controlled
- Audit trail maintained
- 6-year retention minimum

### 10.4 PCI DSS

- Cardholder data never logged
- Daily log review
- Log tampering detection
- 1-year retention minimum

---

## 11. Log Integrity

### 11.1 Tamper Detection

- Logs signed with HMAC
- Hash chain for integrity
- Immutable storage (WORM)
- Integrity verification on access

### 11.2 Chain of Custody

For legal/compliance purposes:
- Timestamps from trusted source
- Source system identification
- Collection chain documented
- Access history maintained

---

## 12. Troubleshooting Access

### 12.1 Debug Logging

- Enabled per-request via header
- Auto-disabled after 1 hour
- Sanitization still applies
- Requires elevated permissions

### 12.2 Log Search

```
# Example queries

# Failed logins from IP
event.type:auth.login AND event.result:failure AND actor.ip:203.0.113.1

# Data access by user
event.type:data.* AND actor.id:usr_xxx

# Errors in last hour
level:ERROR AND timestamp:[now-1h TO now]
```

---

## 13. Incident Response

### 13.1 Log Preservation

During incidents:
- Affected logs preserved immediately
- Retention extended (legal hold)
- Access restricted to IR team
- Chain of custody documented

### 13.2 Forensic Analysis

- Export to isolated environment
- Hash verification before analysis
- Document all queries/findings
- Maintain evidence integrity

---

## 14. Roles & Responsibilities

| Role | Responsibilities |
|------|------------------|
| Security Team | Policy, monitoring, alerts |
| Engineering | Implementation, maintenance |
| Compliance | Audit, retention verification |
| Support | Customer log access requests |

---

## 15. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-02 | Security Team | Initial release |

---

*Questions about this policy? Contact security@seizn.com*
