import { SupabaseVectorStore } from './supabase';
import type { VectorStore } from '../types';

let defaultStore: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!defaultStore) {
    defaultStore = new SupabaseVectorStore();
  }
  return defaultStore;
}

export { SupabaseVectorStore };
