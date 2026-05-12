import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv(import.meta.url);

const EXPECTED_STRIPE_WEBHOOK_URL =
  process.env.STRIPE_WEBHOOK_EXPECTED_URL || 'https://www.seizn.com/api/webhooks/stripe';

function getStripeSecretKey() {
  return (
    process.env.STRIPE_RESTRICTED_KEY ||
    process.env.STRIPE_SECRET_KEY_SEIZN ||
    process.env.STRIPE_SECRET_KEY ||
    ''
  ).trim();
}

async function listWebhookEndpoints(secretKey) {
  const response = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
    headers: {
      authorization: `Bearer ${secretKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Stripe webhook endpoint query failed: HTTP ${response.status} ${body}`);
  }

  const json = await response.json();
  return Array.isArray(json.data) ? json.data : [];
}

const secretKey = getStripeSecretKey();
if (!secretKey) {
  console.error('Missing Stripe secret key env: STRIPE_RESTRICTED_KEY, STRIPE_SECRET_KEY_SEIZN, or STRIPE_SECRET_KEY');
  process.exit(1);
}

const endpoints = await listWebhookEndpoints(secretKey);
const activeStripeWebhookEndpoints = endpoints.filter(
  (endpoint) =>
    endpoint &&
    endpoint.status !== 'disabled' &&
    typeof endpoint.url === 'string' &&
    endpoint.url.includes('/api/webhooks/stripe'),
);

const exactMatches = activeStripeWebhookEndpoints.filter(
  (endpoint) => endpoint.url === EXPECTED_STRIPE_WEBHOOK_URL,
);
const drifted = activeStripeWebhookEndpoints.filter(
  (endpoint) => endpoint.url !== EXPECTED_STRIPE_WEBHOOK_URL,
);

if (exactMatches.length === 0 || drifted.length > 0) {
  const driftSummary = drifted
    .map((endpoint) => `${endpoint.id || 'unknown'}:${endpoint.url}`)
    .join(', ');
  console.error(`Expected active Stripe webhook URL: ${EXPECTED_STRIPE_WEBHOOK_URL}`);
  console.error(`Matching endpoints: ${exactMatches.length}`);
  if (driftSummary) {
    console.error(`Drifted endpoints: ${driftSummary}`);
  }
  process.exit(1);
}

console.log(
  `Stripe webhook URL verified: ${EXPECTED_STRIPE_WEBHOOK_URL} (${exactMatches.length} active endpoint${exactMatches.length === 1 ? '' : 's'})`,
);
