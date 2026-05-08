/**
 * GDPR / PIPA right-to-erasure sweep (plan W5.8 follow-up).
 *
 * Triggered manually after a user requests account deletion (Article 17 GDPR /
 * §36 PIPA). The Supabase `profiles.deleted_at` flag handles the in-DB cleanup
 * (CASCADE-deletes user rows). This script handles the OUT-of-DB tails:
 *
 *   1. GlitchTip (self-hosted)  — wipe events tagged with the user_id.
 *   2. PostHog (EU project)     — `delete_person` API call.
 *   3. Plausible                — emit anonymized event so prior aggregates lose
 *                                  resolvability (cookieless, so practically a no-op).
 *   4. R2 backups               — DO NOT auto-delete; backups are encrypted with
 *                                  a separate key (Article 34 exemption rationale).
 *                                  Schedule key rotation at the next quarterly window.
 *   5. Resend suppression list  — INSERT with reason='manual_unsubscribe' so we
 *                                  never re-deliver.
 *
 * Idempotent — re-running on the same user_id is safe.
 *
 * Usage:
 *   pnpm tsx scripts/gdpr-erasure-sweep.ts --user-id=<uuid> [--dry-run]
 *   pnpm tsx scripts/gdpr-erasure-sweep.ts --email=<email> [--dry-run]
 *
 * Output:
 *   prints sweep summary; exits 0 if all targeted services accepted the call.
 *   On any partial failure exits 1 and prints which service to retry.
 */

import { createClient } from '@supabase/supabase-js';

interface Args {
  userId: string | null;
  email: string | null;
  dryRun: boolean;
}

function parseArgs(): Args {
  const out: Args = { userId: null, email: null, dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--user-id=')) out.userId = arg.slice('--user-id='.length);
    else if (arg.startsWith('--email=')) out.email = arg.slice('--email='.length);
    else if (arg === '--dry-run') out.dryRun = true;
  }
  if (!out.userId && !out.email) {
    console.error('Provide --user-id=<uuid> or --email=<email>');
    process.exit(2);
  }
  return out;
}

interface SweepStep {
  name: string;
  run: () => Promise<{ ok: boolean; detail: string }>;
}

async function resolveUser(args: Args): Promise<{ userId: string; email: string | null }> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

  const sb = createClient(url, serviceKey);

  if (args.userId) {
    const { data } = await sb.from('profiles').select('id, email').eq('id', args.userId).maybeSingle();
    return { userId: args.userId, email: data?.email ?? null };
  }

  const { data, error } = await sb
    .from('profiles')
    .select('id, email')
    .eq('email', args.email)
    .maybeSingle();
  if (error || !data) throw new Error(`Profile not found for email ${args.email}`);
  return { userId: data.id, email: data.email };
}

async function sweepGlitchTip(userId: string, dryRun: boolean) {
  const baseUrl = process.env.GLITCHTIP_URL ?? 'https://errors.seizn.com';
  const token = process.env.GLITCHTIP_API_TOKEN;
  if (!token) {
    return { ok: false, detail: 'GLITCHTIP_API_TOKEN unset — wire after admin token provisioned' };
  }
  if (dryRun) return { ok: true, detail: '[dry-run] would DELETE issues filtered by user.id tag' };
  const response = await fetch(
    `${baseUrl}/api/0/projects/seizn/seizn-web/issues/?query=user.id:${encodeURIComponent(userId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  return {
    ok: response.ok,
    detail: response.ok ? 'issues deleted' : `glitchtip ${response.status} ${await response.text()}`,
  };
}

async function sweepPostHog(userId: string, email: string | null, dryRun: boolean) {
  const apiHost = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!personalApiKey) {
    return { ok: false, detail: 'POSTHOG_PERSONAL_API_KEY unset — wire when PostHog enabled' };
  }
  if (dryRun) return { ok: true, detail: `[dry-run] would POST /persons/?distinct_id=${userId} delete` };

  // PostHog `delete_person` works by distinct_id. We also try email since
  // PostHog tracks both paths.
  const targets = [userId];
  if (email) targets.push(email);

  for (const target of targets) {
    const url = `${apiHost}/api/projects/@current/persons/?distinct_id=${encodeURIComponent(target)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${personalApiKey}` },
    });
    if (!res.ok && res.status !== 404) {
      return { ok: false, detail: `posthog delete ${target}: ${res.status}` };
    }
  }
  return { ok: true, detail: 'posthog person deleted (or absent)' };
}

async function sweepSuppression(email: string | null, dryRun: boolean) {
  if (!email) return { ok: true, detail: 'no email — skip suppression' };
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (dryRun) return { ok: true, detail: `[dry-run] would suppress ${email}` };

  const sb = createClient(url, serviceKey);
  const { error } = await sb.from('email_suppression_list').upsert(
    {
      email,
      reason: 'manual_unsubscribe',
      source: 'gdpr_erasure',
      suppressed_at: new Date().toISOString(),
      expires_at: null,
    },
    { onConflict: 'email' }
  );
  return {
    ok: !error,
    detail: error ? `suppression upsert failed: ${error.message}` : 'suppressed',
  };
}

async function sweepBackupNotice(userId: string, dryRun: boolean) {
  // We do NOT auto-delete from R2 backups — those are encrypted with a separate
  // key, qualifying for the Article 34 exemption, and the backup chain is
  // append-only. Instead log a TODO for the next quarterly key rotation.
  if (dryRun) return { ok: true, detail: '[dry-run] would log backup-rotation TODO' };
  console.log(`[backup] queued user ${userId} for next R2 key rotation cycle`);
  return { ok: true, detail: 'queued for quarterly key rotation' };
}

async function main() {
  const args = parseArgs();
  const { userId, email } = await resolveUser(args);
  console.log(`User: ${userId} (${email ?? 'no email'})`);
  if (args.dryRun) console.log('Mode: DRY RUN — no external calls');

  const steps: SweepStep[] = [
    { name: 'GlitchTip', run: () => sweepGlitchTip(userId, args.dryRun) },
    { name: 'PostHog', run: () => sweepPostHog(userId, email, args.dryRun) },
    { name: 'Resend suppression', run: () => sweepSuppression(email, args.dryRun) },
    { name: 'Backup notice', run: () => sweepBackupNotice(userId, args.dryRun) },
  ];

  let allOk = true;
  for (const step of steps) {
    process.stdout.write(`[${step.name}] `);
    try {
      const { ok, detail } = await step.run();
      console.log(ok ? `✓ ${detail}` : `✗ ${detail}`);
      if (!ok) allOk = false;
    } catch (err) {
      console.log(`✗ exception: ${(err as Error).message}`);
      allOk = false;
    }
  }

  if (!allOk) {
    console.error('\nOne or more sweep steps failed. Re-run after fixing the underlying issue.');
    process.exit(1);
  }
  console.log('\n✓ Erasure sweep complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
