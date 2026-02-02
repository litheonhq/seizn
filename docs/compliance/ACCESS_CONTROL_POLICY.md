# Access Control Policy

> Version: 1.0.0
> Last Updated: 2026-02-02
> Owner: Security Team
> Review Cycle: Quarterly

---

## 1. Purpose

This policy establishes access control requirements for Seizn's systems, data, and facilities to ensure appropriate authorization and protect against unauthorized access.

---

## 2. Scope

This policy applies to:
- All Seizn employees, contractors, and vendors
- All information systems and data
- All physical and logical access

---

## 3. Principles

### 3.1 Least Privilege

Users receive only the minimum access required to perform their job functions.

### 3.2 Need-to-Know

Access to sensitive data is granted only when necessary for specific tasks.

### 3.3 Separation of Duties

Critical functions are divided among multiple individuals to prevent fraud or error.

### 3.4 Defense in Depth

Multiple layers of access controls protect sensitive resources.

---

## 4. Access Control Model

### 4.1 Role-Based Access Control (RBAC)

Seizn implements hierarchical RBAC:

```
Organization Level
├── Owner
│   └── Full administrative control
├── Admin
│   └── User management, settings, billing
├── Member
│   └── Create and manage resources
└── Viewer
    └── Read-only access

Project Level
├── Owner
│   └── Project administration
├── Editor
│   └── Create, modify resources
└── Viewer
    └── Read-only access
```

### 4.2 Permission Matrix

| Permission | Owner | Admin | Member | Viewer |
|------------|-------|-------|--------|--------|
| View resources | ✓ | ✓ | ✓ | ✓ |
| Create resources | ✓ | ✓ | ✓ | ✗ |
| Modify resources | ✓ | ✓ | Own only | ✗ |
| Delete resources | ✓ | ✓ | Own only | ✗ |
| Manage users | ✓ | ✓ | ✗ | ✗ |
| Billing/subscription | ✓ | ✓ | ✗ | ✗ |
| Security settings | ✓ | ✗ | ✗ | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ | ✗ |

### 4.3 OPA Policy Enforcement

Custom policies extend RBAC:

```rego
package seizn.access

# Default deny
default allow = false

# Allow if user has required role
allow {
    required_role := data.permissions[input.action]
    user_has_role(input.user, required_role)
}

# Check user role hierarchy
user_has_role(user, required) {
    role_hierarchy[user.role] >= role_hierarchy[required]
}

role_hierarchy := {
    "owner": 100,
    "admin": 80,
    "member": 50,
    "viewer": 10
}
```

---

## 5. Authentication Requirements

### 5.1 Password Policy

| Requirement | Standard | Privileged |
|-------------|----------|------------|
| Minimum length | 12 characters | 16 characters |
| Complexity | Upper, lower, number, special | Same + no dictionary words |
| Expiration | 90 days | 60 days |
| History | Last 12 passwords | Last 24 passwords |
| Lockout | 5 failed attempts | 3 failed attempts |
| Lockout duration | 30 minutes | Manual unlock |

### 5.2 Multi-Factor Authentication (MFA)

| Access Type | MFA Required |
|-------------|--------------|
| Administrative access | Mandatory |
| Production systems | Mandatory |
| Customer data access | Mandatory |
| Standard user access | Strongly recommended |
| API access | Optional (via scoped keys) |

**Approved MFA Methods:**
- Hardware security keys (preferred)
- Authenticator apps (TOTP)
- SMS (backup only, not recommended)

### 5.3 Single Sign-On (SSO)

Enterprise customers can enforce SSO via:
- SAML 2.0
- OpenID Connect
- Supported IdPs: Okta, Azure AD, Google Workspace, OneLogin

---

## 6. Authorization Controls

### 6.1 API Key Management

| Key Type | Scope | Rotation | Use Case |
|----------|-------|----------|----------|
| Organization Key | All org resources | 90 days | Backend services |
| Project Key | Single project | 90 days | Application integration |
| Personal Token | User permissions | 30 days | Development/CLI |

**API Key Best Practices:**
- Use project-scoped keys when possible
- Rotate regularly (automated reminders)
- Never commit keys to source control
- Use environment variables or secrets managers

### 6.2 Service Account Management

- Service accounts require documented owner
- No interactive login allowed
- Keys must be rotated every 90 days
- Access logged and audited

### 6.3 Third-Party Access

| Requirement | Implementation |
|-------------|----------------|
| Justification | Documented business need |
| Approval | Security + data owner |
| Duration | Time-limited (max 90 days) |
| Scope | Minimum necessary access |
| Monitoring | Enhanced logging |
| Review | Monthly access review |

---

## 7. Access Lifecycle

### 7.1 Provisioning

```
1. Request
   - Manager submits access request
   - Specifies role, resources, justification

2. Approval
   - Resource owner approves
   - Security reviews (privileged access)

3. Implementation
   - IT/Security provisions access
   - User notified

4. Verification
   - User confirms access
   - Access logged
```

### 7.2 Modification

- Access changes follow same approval process
- Privilege escalation requires security review
- Changes logged in audit trail

### 7.3 Deprovisioning

| Event | Timeline | Actions |
|-------|----------|---------|
| Voluntary departure | Last day | Disable accounts, revoke keys |
| Involuntary departure | Immediate | Disable accounts, revoke keys, escort |
| Role change | Within 24 hours | Adjust permissions |
| Project completion | Within 7 days | Remove project access |
| Contractor end | Last day | Full access removal |

**Offboarding Checklist:**
- [ ] Disable all accounts
- [ ] Revoke API keys and tokens
- [ ] Remove from groups/teams
- [ ] Transfer ownership of resources
- [ ] Collect hardware (if applicable)
- [ ] Exit interview (security reminder)

---

## 8. Privileged Access

### 8.1 Definition

Privileged access includes:
- Administrative accounts
- Root/sudo access
- Database admin access
- Cloud console access
- Security tool access

### 8.2 Controls

| Control | Requirement |
|---------|-------------|
| MFA | Mandatory |
| Session recording | Required |
| Just-in-time access | Preferred |
| Break-glass procedures | Documented |
| Access reviews | Monthly |

### 8.3 Break-Glass Procedures

For emergency access outside normal channels:

```
1. Emergency Declared
   - Document reason
   - Notify Security team

2. Access Granted
   - Time-limited (max 4 hours)
   - Full session logging
   - Immediate notification to management

3. Post-Emergency
   - Access revoked immediately
   - Full audit review within 24 hours
   - Incident report if applicable
```

---

## 9. Access Reviews

### 9.1 Review Schedule

| Access Type | Frequency | Reviewer |
|-------------|-----------|----------|
| Privileged access | Monthly | Security Team |
| Administrative roles | Quarterly | Managers + Security |
| Standard access | Semi-annual | Managers |
| Third-party access | Monthly | Security Team |
| Service accounts | Quarterly | Service owners |

### 9.2 Review Process

1. Generate access report
2. Distribute to reviewers
3. Reviewers confirm or revoke
4. Implement changes
5. Document completion

### 9.3 Certification

Managers must certify:
- Access is still required
- Role is appropriate
- No orphaned accounts

---

## 10. Physical Access

### 10.1 Office Access

| Area | Access Control |
|------|----------------|
| General office | Badge + PIN |
| Server room | Badge + biometric |
| Executive areas | Restricted badges |

### 10.2 Data Center Access

- Managed by cloud providers (AWS, GCP, Hetzner)
- Seizn personnel require documented justification
- Escort required
- Full logging

---

## 11. Monitoring & Logging

### 11.1 Logged Events

| Event | Retention |
|-------|-----------|
| Login attempts (success/fail) | 2 years |
| Permission changes | 2 years |
| Data access | 1 year |
| API calls | 90 days |
| Administrative actions | 2 years |

### 11.2 Alerting

Real-time alerts for:
- Failed login attempts (>5 in 5 minutes)
- Privilege escalation
- Access from unusual locations
- After-hours access to sensitive data
- Service account anomalies

### 11.3 Audit Reports

| Report | Frequency | Audience |
|--------|-----------|----------|
| Access summary | Weekly | Security Team |
| Privileged access | Monthly | Leadership |
| Compliance audit | Quarterly | Compliance/Auditors |

---

## 12. Customer Access Controls

### 12.1 Organization Settings

Customers can configure:
- Allowed authentication methods
- MFA requirements
- Session timeout
- IP allowlisting
- SSO enforcement

### 12.2 API Key Controls

Customers can:
- Create scoped API keys
- Set key expiration
- Define allowed operations
- Restrict by IP range

### 12.3 Audit Logs

Customers have access to:
- User activity logs
- API access logs
- Security event logs
- Export to SIEM

---

## 13. Exceptions

### 13.1 Exception Process

1. Submit exception request with:
   - Business justification
   - Risk assessment
   - Compensating controls
   - Duration

2. Review by:
   - Security Team
   - Data/Resource owner
   - CISO (privileged access)

3. If approved:
   - Document in exception register
   - Implement compensating controls
   - Set review date

### 13.2 Exception Limits

- Maximum duration: 90 days
- Must be re-approved for extension
- Compensating controls required

---

## 14. Compliance

This policy supports compliance with:
- SOC 2 (CC6.1, CC6.2, CC6.3)
- ISO 27001 (A.9)
- GDPR (Article 32)
- HIPAA (164.312)

---

## 15. Enforcement

Violations of this policy may result in:
- Access revocation
- Disciplinary action
- Termination
- Legal action (if applicable)

---

## 16. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-02 | Security Team | Initial release |

---

*Questions about this policy? Contact security@seizn.com*
