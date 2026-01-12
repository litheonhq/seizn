import { VoyageEmbeddingProvider } from './voyage';
import type { EmbeddingProvider } from '../types';

export function getEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.SUMMER_EMBEDDING_PROVIDER ?? 'voyage';

  switch (provider) {
    case 'voyage':
    default:
      return new VoyageEmbeddingProvider();
  }
}
