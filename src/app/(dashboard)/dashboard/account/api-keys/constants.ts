export const TRACK_2_KEY_CAP_PER_USER = 5;

export type CreateApiKeyResult =
  | { ok: true; id: string; key: string; prefix: string; name: string; scopes: string[]; createdAt: string }
  | { ok: false; code: "unauthorized" | "cap_reached" | "invalid_name" | "internal_error"; detail?: string };

export type RevokeApiKeyResult =
  | { ok: true; id: string }
  | { ok: false; code: "unauthorized" | "not_found" | "internal_error"; detail?: string };

export type RotateApiKeyResult =
  | { ok: true; id: string; key: string; prefix: string; rotatedFromId: string }
  | { ok: false; code: "unauthorized" | "not_found" | "internal_error"; detail?: string };
