/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import type { FederatedSource } from './types';
import { HttpAgentSource } from './connectors/http-agent';
import { UnsupportedFederatedSource } from './connectors/unsupported';

export function createFederatedSource(params: {
  sourceId: string;
  provider: string;
  capabilities: any;
}): FederatedSource {
  const provider = String(params.provider);

  // MVP: Use HTTP agent wrapper for anything external.
  // You can add first-class connectors (Pinecone/Weaviate/Vespa) later.
  if (provider === 'custom') {
    return new HttpAgentSource({
      id: params.sourceId,
      provider,
      capabilities: params.capabilities,
    });
  }

  // If provider is pinecone/weaviate/... but you still want to go via HTTP,
  // set provider=custom and keep the remote adapter responsible for talking to that DB.
  return new UnsupportedFederatedSource({
    id: params.sourceId,
    provider,
    capabilities: params.capabilities,
  });
}
