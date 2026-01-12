/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { createServerClient } from '@/lib/supabase';
import { decryptJson } from '@/lib/winter/crypto';
import type { FederatedBinding, FederatedSourceConfig, FederatedCapabilities } from './types';

/**
 * Load federated bindings for a given Seizn collection.
 *
 * NOTE: This uses the service-role Supabase client on the server.
 */
export async function loadFederatedBindings(params: {
  userId: string;
  collectionId: string;
}): Promise<FederatedBinding[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('summer_federated_bindings')
    .select(
      `
      id,
      collection_id,
      source_id,
      remote_collection,
      policy,
      source:summer_federated_sources (
        id,
        provider,
        config_encrypted,
        capabilities,
        is_active
      )
    `
    )
    .eq('user_id', params.userId)
    .eq('collection_id', params.collectionId);

  if (error) throw error;

  const rows = (data ?? []) as any[];

  return rows
    .filter((r) => r.source?.is_active)
    .map((r) => {
      const decrypted = decryptJson<Record<string, unknown>>(String(r.source.config_encrypted));
      const capabilities = (r.source.capabilities ?? {}) as FederatedCapabilities;

      const source: FederatedSourceConfig = {
        provider: String(r.source.provider) as any,
        config: decrypted,
        capabilities,
      };

      return {
        id: String(r.id),
        collectionId: String(r.collection_id),
        sourceId: String(r.source_id),
        remoteCollection: String(r.remote_collection),
        policy: (r.policy ?? {}) as Record<string, unknown>,
        source,
      } satisfies FederatedBinding;
    });
}
