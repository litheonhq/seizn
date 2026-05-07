/**
 * BYOK setup wizard — 3-step page (provider → key paste → verify).
 *
 * Locked 2026-05-07. New users land here after signup if they don't have
 * an active BYOK key. Wires to:
 *   - POST /api/onboarding/byok/test   (validate key)
 *   - POST /api/account/byok           (persist key, marks BYOK active)
 */

import type { Metadata } from 'next';
import ByokWizardClient from './wizard-client';

export const metadata: Metadata = {
  title: 'Connect your API key — Seizn Author Memory',
  description:
    'Bring your own Anthropic or OpenAI key to start using Seizn Author Memory v3. Free tier includes 50 calls/day and 5 monthly Checks/Dialogs.',
};

export default function ByokOnboardingPage() {
  return <ByokWizardClient />;
}
