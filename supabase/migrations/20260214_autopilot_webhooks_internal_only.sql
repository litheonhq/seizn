-- Ensure autopilot_webhooks is internal-only.
-- We rely on service_role (server-side) to read/write, and keep anon/authenticated locked down.

REVOKE ALL ON TABLE autopilot_webhooks FROM anon;
REVOKE ALL ON TABLE autopilot_webhooks FROM authenticated;
REVOKE ALL ON TABLE autopilot_webhooks FROM public;

GRANT ALL ON TABLE autopilot_webhooks TO service_role;

