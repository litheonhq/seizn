# Data Residency and Region Selection

## Overview

Seizn supports data residency requirements by allowing organizations to select their preferred data storage region. This feature ensures compliance with local data protection regulations such as GDPR, CCPA, and APPI.

## Supported Regions

### Currently Available

| Region Code | Name | Location | Compliance |
|-------------|------|----------|------------|
| `us-east` | US East (Virginia) | Ashburn, USA | SOC 2, HIPAA, CCPA |
| `eu-west` | EU West (Ireland) | Dublin, Ireland | GDPR, SOC 2, ISO 27001 |
| `ap-northeast` | Asia Pacific (Tokyo) | Tokyo, Japan | SOC 2, APPI, ISO 27001 |

### Coming Soon

| Region Code | Name | Location | Compliance |
|-------------|------|----------|------------|
| `us-west` | US West (Oregon) | Portland, USA | SOC 2, HIPAA, CCPA |
| `eu-central` | EU Central (Frankfurt) | Frankfurt, Germany | GDPR, SOC 2, ISO 27001, BSI C5 |
| `ap-southeast` | Asia Pacific (Singapore) | Singapore | SOC 2, PDPA, ISO 27001 |

## Plan Availability

| Plan | Available Regions |
|------|-------------------|
| Free | us-east, eu-west, ap-northeast |
| Starter | us-east, eu-west, ap-northeast |
| Plus | All available regions |
| Pro | All regions (including coming soon) |
| Enterprise | All regions + custom deployment options |

## How It Works

### 1. Initial Setup

When creating an organization, the default region is automatically selected based on:
- User's locale preference
- Recommended region for their geographic location

Default mapping:
- English (US) users → `us-east`
- English (UK), German, French users → `eu-west`
- Japanese, Korean, Chinese users → `ap-northeast`

### 2. Changing Regions

Organizations can change their data region through:
- Dashboard Settings → Data Residency
- API: `PATCH /api/organizations/{orgId}/region`

**Requirements:**
- User must be organization owner or admin
- Region must not be locked
- Target region must be available for the organization's plan

### 3. Region Locking

Organization owners can lock the region to prevent accidental changes:
- Locked regions require admin/support intervention to change
- Useful for compliance-sensitive organizations

## API Reference

### Get Region Information

```http
GET /api/organizations/{orgId}/region
Authorization: Bearer {token}
```

Response:
```json
{
  "success": true,
  "region": {
    "current": "us-east",
    "locked": false,
    "lastChanged": null,
    "config": {
      "code": "us-east",
      "name": "US East (Virginia)",
      "compliance": ["SOC 2", "HIPAA", "CCPA"]
    },
    "residency": {
      "storageLocation": "United States (Virginia)",
      "processingLocation": "United States",
      "applicableLaws": ["US Federal Law", "Virginia CDPA", "CCPA"]
    }
  },
  "history": []
}
```

### Change Region

```http
PATCH /api/organizations/{orgId}/region
Authorization: Bearer {token}
Content-Type: application/json

{
  "region": "eu-west",
  "reason": "GDPR compliance requirement"
}
```

Response:
```json
{
  "success": true,
  "previousRegion": "us-east",
  "newRegion": "eu-west",
  "migration": {
    "estimatedDuration": "24-48 hours",
    "expectedDowntime": "< 5 minutes"
  }
}
```

### Lock/Unlock Region

```http
POST /api/organizations/{orgId}/region
Authorization: Bearer {token}
Content-Type: application/json

{
  "lock": true
}
```

## Data Residency Implications

### US Regions (us-east, us-west)

- **Storage**: Data stored in United States data centers
- **Processing**: Data processed within United States
- **Applicable Laws**: US Federal Law, State Privacy Laws (CCPA, CDPA, etc.)
- **Data Transfer**: May be accessed from other US regions for redundancy

### EU Regions (eu-west, eu-central)

- **Storage**: Data stored within European Union
- **Processing**: Data processed within European Union
- **Applicable Laws**: GDPR, Local Member State Laws
- **Data Transfer**: Data remains within the EU; no transfer to third countries without explicit consent
- **DPA**: Data Processing Agreement available for Enterprise customers

### APAC Regions (ap-northeast, ap-southeast)

- **Storage**: Data stored in respective APAC country
- **Processing**: Data processed locally
- **Applicable Laws**: Local data protection laws (APPI, PDPA, etc.)
- **Data Transfer**: Subject to local cross-border transfer regulations

## Migration Process

When changing regions:

1. **Request Initiated**: User requests region change via dashboard or API
2. **Validation**: System validates permissions and plan eligibility
3. **History Recorded**: Change is logged in region history for audit
4. **Data Replication**: Data is replicated to the new region
5. **DNS Update**: Routing is updated to new region
6. **Verification**: System verifies data integrity
7. **Cleanup**: Old region data is purged (after retention period)

### Migration Timeline

| Migration Type | Estimated Duration | Expected Downtime |
|----------------|-------------------|-------------------|
| Same continent | 4-8 hours | < 5 minutes |
| Cross-continental | 24-48 hours | < 5 minutes |

## Compliance Considerations

### GDPR (EU)

- Select `eu-west` or `eu-central` for EU data residency
- Data remains within EU borders
- Right to erasure honored within 72 hours
- Data Processing Agreement available

### CCPA (California)

- US regions comply with CCPA requirements
- Consumer request handling within 45 days
- Data sale opt-out supported

### APPI (Japan)

- `ap-northeast` region provides Japan data residency
- Complies with APPI requirements
- Cross-border transfer handled according to APPI rules

## Best Practices

1. **Choose region early**: Select region during organization creation to avoid migration
2. **Consider latency**: Choose a region close to your primary user base
3. **Lock for compliance**: Lock region after setup for compliance-sensitive data
4. **Document changes**: Always provide a reason when changing regions for audit trails
5. **Plan upgrades**: Upgrade plan before accessing restricted regions

## FAQ

**Q: Can I have data in multiple regions?**
A: Currently, each organization has a single data region. Enterprise customers can discuss multi-region deployments.

**Q: What happens to my data during migration?**
A: Data is replicated to the new region, verified, then the old region data is removed after confirmation.

**Q: Is there additional cost for specific regions?**
A: No additional cost for standard regions. Some future specialized regions may have different pricing.

**Q: Can I export my data before migration?**
A: Yes, we recommend exporting a backup before any region change.
