import { CohereRerankProvider } from './cohere';
import { NoopRerankProvider } from './noop';
import { LocalBM25RerankProvider } from './local-bm25';
import type { RerankProvider } from '../types';

export function getRerankProvider(): RerankProvider {
  const provider = process.env.SUMMER_RERANK_PROVIDER ?? 'noop';

  switch (provider) {
    case 'cohere':
      return new CohereRerankProvider();
    case 'local-bm25':
    case 'bm25':
      return new LocalBM25RerankProvider();
    case 'noop':
    default:
      return new NoopRerankProvider();
  }
}

export { CohereRerankProvider, NoopRerankProvider, LocalBM25RerankProvider };
