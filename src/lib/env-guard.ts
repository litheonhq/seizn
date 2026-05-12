interface RequiredEnvVar {
  name: string;
  condition: () => boolean;
  description: string;
}

export const REQUIRED_PRODUCTION_ENV_VARS: RequiredEnvVar[] = [
  {
    name: 'STRIPE_SECRET_KEY',
    condition: () =>
      Boolean(
        process.env.STRIPE_RESTRICTED_KEY ||
          process.env.STRIPE_SECRET_KEY_SEIZN ||
          process.env.STRIPE_SECRET_KEY,
      ),
    description: 'Stripe live restricted or secret key for all billing API calls',
  },
  {
    name: 'STRIPE_METERED_PRICE_ID_MEMORIES',
    condition: () => Boolean(process.env.STRIPE_METERED_PRICE_ID_MEMORIES),
    description: 'Metered price for memories overage; missing value silently disables overage billing',
  },
  {
    name: 'STRIPE_METERED_PRICE_ID_OPS',
    condition: () => Boolean(process.env.STRIPE_METERED_PRICE_ID_OPS),
    description: 'Metered price for ops overage; missing value silently disables overage billing',
  },
  {
    name: 'STRIPE_METER_ID_MEMORIES',
    condition: () => Boolean(process.env.STRIPE_METER_ID_MEMORIES),
    description: 'Meter ID for memories overage event reporting',
  },
  {
    name: 'STRIPE_METER_ID_OPS',
    condition: () => Boolean(process.env.STRIPE_METER_ID_OPS),
    description: 'Meter ID for ops overage event reporting',
  },
  {
    name: 'SEIZN_DESIGN_PARTNER_COUPON',
    condition: () => Boolean(process.env.SEIZN_DESIGN_PARTNER_COUPON),
    description: 'Design Partner coupon code for Studio checkout gating',
  },
  {
    name: 'CRON_SECRET',
    condition: () => Boolean(process.env.CRON_SECRET),
    description: 'Protects /api/internal/usage/flush cron endpoint',
  },
];

export interface EnvGuardResult {
  ok: boolean;
  missing: string[];
  present: string[];
}

export function checkProductionEnv(): EnvGuardResult {
  const missing: string[] = [];
  const present: string[] = [];

  for (const variable of REQUIRED_PRODUCTION_ENV_VARS) {
    if (variable.condition()) {
      present.push(variable.name);
    } else {
      missing.push(variable.name);
    }
  }

  return { ok: missing.length === 0, missing, present };
}
