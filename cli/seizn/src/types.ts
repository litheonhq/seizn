export interface GlobalOptions {
  baseUrl?: string;
  token?: string;
  json?: boolean;
}

export interface CanonLock {
  id?: string;
  npcId: string | null;
  scope: "never_say" | "always_say" | "must_not_know" | "must_know";
  statement: string;
  regexFastpath: string | null;
  severity: "hard" | "soft";
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CanonFile {
  locks: CanonLock[];
}

export interface MemoryResult {
  id?: string;
  content?: string;
  memory?: string;
  memory_type?: string;
  memory_class?: string;
  agent_id?: string | null;
  entity_id?: string | null;
  created_at?: string;
  tags?: string[];
  [key: string]: unknown;
}
