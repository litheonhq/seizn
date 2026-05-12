import { createHash } from 'crypto';

export const PROGRAM_WAITLIST_TOKEN_BYTES = 32;
export const PROGRAM_WAITLIST_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashProgramWaitlistToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
