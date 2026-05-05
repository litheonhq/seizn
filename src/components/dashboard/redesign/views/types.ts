import type { CharacterRole, MemoryHealthState, Severity } from '../types';

export type InboxKind = 'Character' | 'Conflict' | 'Canon' | 'Timeline' | 'Review' | 'Note';

export interface InboxRow {
  id: string;
  kind: InboxKind;
  title: string;
  episode: string;
  author: string;
  time: string;
  priority: Severity;
  unread: boolean;
}

export interface InboxFilter {
  id: 'all' | 'conflicts' | 'reviews' | 'characters';
  count: number;
  active?: boolean;
}

export interface CharacterSummary {
  id: string;
  name: string;
  aka: string;
  role: CharacterRole;
  episodes: number;
  relations: number;
  conflicts: number;
  color: string;
}

export interface CharacterCanonFact {
  ep: string;
  text: string;
  warn?: boolean;
}

export interface CharacterRelationship {
  toId: string;
  name: string;
  kind: string;
  conflict: boolean;
  color: string;
}

export interface CharacterDetail extends CharacterSummary {
  canonFacts: CharacterCanonFact[];
  relationships: CharacterRelationship[];
}

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  role: CharacterRole;
}

export interface GraphEdge {
  a: string;
  b: string;
  kind: string;
  strength: number;
  conflict: boolean;
}

export interface ConflictItem {
  id: string;
  severity: Severity;
  kind: string;
  title: string;
  episode: string;
  why?: string;
  refs: string[];
}

export interface AuthorWorkspaceData {
  workspaceName: string;
  planLabel: string;
  episodeCount: number;
  initial?: string;
  hasMore?: boolean;
}

export type AuthorUiHealth = MemoryHealthState;

export interface InboxEvidence {
  reference: string;
  kind: 'recorded' | 'conflicting';
  body: string;
  emphasisStart?: number;
  emphasisEnd?: number;
  emphasisText?: string;
}

export interface InboxSuggestion {
  rationale: string;
  applyAction: string;
  openAction: string;
  notConflictAction: string;
}

export interface InboxRowDetail extends InboxRow {
  evidence: InboxEvidence[];
  suggestion?: InboxSuggestion;
}
