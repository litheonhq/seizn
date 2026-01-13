/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FederatedSource, FederatedSearchParams, FederatedBinding } from '../types';
import type { VectorSearchResult } from '../../types';

export class UnsupportedFederatedSource implements FederatedSource {
  id: string;
  provider: any;
  capabilities: any;

  constructor(params: { id: string; provider: string; capabilities: any }) {
    this.id = params.id;
    this.provider = params.provider;
    this.capabilities = params.capabilities;
  }

  async search(_params: FederatedSearchParams & { binding: FederatedBinding }): Promise<VectorSearchResult[]> {
    throw new Error(`Unsupported federated provider: ${this.provider}`);
  }
}
