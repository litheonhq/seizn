import { VoyageEmbeddingProvider } from './voyage';
import { BGEM3EmbeddingProvider } from './bge-m3';
import type { EmbeddingProvider } from '../types';

export function getEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.SUMMER_EMBEDDING_PROVIDER ?? 'voyage';

  switch (provider) {
    case 'bge-m3':
      return new BGEM3EmbeddingProvider();
    case 'voyage':
    default:
      return new VoyageEmbeddingProvider();
  }
}
