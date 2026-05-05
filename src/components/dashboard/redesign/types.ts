export type Severity = 'P1' | 'P2' | 'P3';

export type TagTone = 'ink' | 'terracotta' | 'dawn' | 'cream' | 'solid';

export type TagSize = 'xs' | 'sm';

export type EmptyKind = 'characters' | 'inbox' | 'graph';

export type Density = 'compact' | 'comfortable' | 'spacious';

export type CharacterRole = 'Lead' | 'Supporting' | 'Minor';

export interface ConflictRef {
  label: string;
}

export interface ConflictCardData {
  severity: Severity;
  kind: string;
  title: string;
  episode: string;
  why?: string;
  refs?: string[];
  compact?: boolean;
}

export interface MemoryHealthState {
  status: 'synced' | 'syncing' | 'error';
  lastSyncedAt: Date;
  factsCount: number;
}
