/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FederatedSource, FederatedSearchParams, FederatedBinding } from '../types';
import type { VectorSearchResult } from '../../types';

/**
 * Federated retrieval via Seizn-compatible HTTP agent.
 *
 * Config (encrypted in DB):
 *  {
 *    "endpoint": "https://.../api/summer/retrieve",
 *    "apiKey": "...",
 *    "timeoutMs"?: 2500
 *  }
 *
 * NOTE: This is the easiest path for BYO-store:
 * - The remote side can be any stack (Pinecone/Weaviate/Vespa/etc),
 *   as long as it exposes a Seizn-compatible endpoint.
 */
export class HttpAgentSource implements FederatedSource {
  id: string;
  provider: any;
  capabilities: any;

  constructor(params: { id: string; provider: string; capabilities: any }) {
    this.id = params.id;
    this.provider = params.provider;
    this.capabilities = params.capabilities;
  }

  async search(params: FederatedSearchParams & { binding: FederatedBinding }): Promise<VectorSearchResult[]> {
    const endpoint = String(params.binding.source.config?.endpoint ?? '');
    const apiKey = String(params.binding.source.config?.apiKey ?? '');
    const timeoutMs = Number(params.binding.source.config?.timeoutMs ?? 2500);

    if (!endpoint || !apiKey) {
      throw new Error('Federated HttpAgentSource missing endpoint/apiKey');
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          collection_id: params.binding.remoteCollection,
          query: params.queryText,
          autopilot: false,
          override: {
            mode: params.mode,
            topK: params.topK,
          },
          include_trace: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Federated agent request failed: ${res.status}`);
      }

      const json = (await res.json()) as any;
      const results = (json?.results ?? []) as VectorSearchResult[];

      // Tag source
      return results.map((r) => ({
        ...r,
        source: `federated:${params.binding.sourceId}`,
      }));
    } finally {
      clearTimeout(t);
    }
  }
}
