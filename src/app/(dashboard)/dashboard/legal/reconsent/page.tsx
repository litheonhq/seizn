import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { CURRENT_LEGAL_VERSION_STAMP } from '@/lib/checkout-copy';
import { ReconsentClient } from './reconsent-client';

export const dynamic = 'force-dynamic';

export default async function ReconsentPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/dashboard/legal/reconsent');
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('legal_version_accepted, legal_accepted_at')
    .eq('id', session.user.id)
    .maybeSingle();

  const acceptedVersion = data?.legal_version_accepted ?? null;
  const upToDate = acceptedVersion === CURRENT_LEGAL_VERSION_STAMP;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
      <ReconsentClient
        currentVersion={CURRENT_LEGAL_VERSION_STAMP}
        acceptedVersion={acceptedVersion}
        acceptedAt={data?.legal_accepted_at ?? null}
        upToDate={upToDate}
      />
    </main>
  );
}
