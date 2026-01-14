# Seizn Overage Policy

## Overview

Seizn uses a **soft limit** approach for plan quotas. When you exceed your plan's included limits, you won't be cut off immediately. Instead:

1. **Free plans**: Quality degrades (reranking disabled, reduced results)
2. **Paid plans**: Overage charges apply at published rates

## Plan Limits

| Plan | Daily API Calls | Memories | Monthly Queries |
|------|-----------------|----------|-----------------|
| **Free** | 1,000 | 10,000 | 30,000 |
| **Plus** ($29) | 10,000 | 100,000 | 300,000 |
| **Pro** ($99) | 100,000 | 1,000,000 | 3,000,000 |
| **Enterprise** | Unlimited | Unlimited | Unlimited |

## Overage Rates (Paid Plans)

| Resource | Overage Rate |
|----------|--------------|
| API Calls | $0.001 per call |
| Memories | $0.0001 per memory/month |
| Embeddings | $0.00002 per 1K tokens |
| Reranking | $0.002 per rerank call |

## Free Tier Behavior

Free tier does **not** incur overage charges. Instead, when limits are reached:

### 85% of Daily Budget
- Warning notification sent
- Dashboard alert displayed

### 100% of Daily Budget
- `degraded=true` flag in API responses
- Reranking disabled
- Max results reduced to 5
- PII detection disabled
- Answer contracts disabled

### Reset
- Daily limits reset at midnight UTC
- Monthly limits reset on the 1st of each month

## Paid Tier Behavior

### Within Plan Limits
- Full feature access
- No additional charges

### Exceeding Plan Limits
- Service continues uninterrupted
- Overage charges calculated hourly
- Billed at end of billing cycle

### Overage Allowance by Plan
- **Plus**: 10% overage allowed before hard limit
- **Pro**: 20% overage allowed before hard limit
- **Enterprise**: No hard limits

## Budget Controls

You can prevent unexpected overage charges:

### 1. Set Hard Limits
```typescript
// In dashboard or via API
await seizn.setBudget({
  dailyMax: 50.00,  // USD
  monthlyMax: 500.00,
  action: 'block'   // or 'degrade'
});
```

### 2. Configure Alerts
- 50% threshold alert
- 80% threshold alert
- 100% threshold alert

### 3. View Usage
- Real-time usage in Dashboard > Budget
- Historical usage in Dashboard > Usage
- Per-query cost in Flight Recorder traces

## Example Scenarios

### Scenario A: Free User
- Plan: Free (1,000 daily calls)
- Usage: 1,500 calls
- Result: Last 500 calls return degraded results
- Charge: $0

### Scenario B: Plus User
- Plan: Plus ($29/mo, 10,000 daily calls)
- Usage: 12,000 calls
- Overage: 2,000 calls × $0.001 = $2.00
- Total bill: $31.00

### Scenario C: Pro User with Budget Cap
- Plan: Pro ($99/mo)
- Budget cap: $150/mo (hard limit)
- Usage: Reaches $150 mid-month
- Result: API returns 429 until next billing cycle

## FAQ

**Q: Will I be charged without warning?**
A: No. You'll receive alerts at 50%, 80%, and 100% of your limits. Overages are visible in real-time on your dashboard.

**Q: Can I set a hard cap to prevent any overage?**
A: Yes. Set `action: 'block'` in your budget settings. API will return 429 when limit is reached.

**Q: How are overages billed?**
A: Overages are calculated hourly and added to your monthly invoice. You can see accumulated overages anytime in the dashboard.

**Q: What happens if I don't pay overage charges?**
A: Your account will be downgraded to Free tier. Data is retained for 30 days.

---

Questions? Contact [billing@seizn.com](mailto:billing@seizn.com)
