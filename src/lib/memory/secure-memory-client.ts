import {
  createVerificationBlock,
  decrypt,
  deriveKey,
  E2E_VERIFY_PLAINTEXT,
  encrypt,
  generateSaltBase64,
} from './encryption';

export type E2EProfileData = {
  hasSetup: boolean;
  e2e_salt: string | null;
  e2e_verification_block: string | null;
  e2e_setup_at: string | null;
};

type E2EProfileGetResponse =
  | { success: true; data: E2EProfileData }
  | { error: string };

type E2EProfilePutResponse =
  | { success: true; data: { rotated: boolean; e2e_setup_at: string } }
  | { error: string };

export type SecureMemoryUnlockResult =
  | { ok: true }
  | { ok: false; reason: 'not_setup' | 'wrong_pin' | 'cooldown' | 'unauthorized' | 'network' };

export type SecureMemorySetupResult =
  | { ok: true; data: E2EProfileData }
  | { ok: false; reason: 'invalid_pin' | 'unauthorized' | 'network' | 'conflict' };

function isDigitsOnly(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function isValidPin(pin: string): boolean {
  return isDigitsOnly(pin) && pin.length >= 4 && pin.length <= 6;
}

function getJsonErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  return typeof rec.error === 'string' ? rec.error : null;
}

export class SecureMemoryClient {
  private key: CryptoKey | null = null;
  private failedAttempts = 0;
  private cooldownUntil = 0;

  get isUnlocked(): boolean {
    return this.key !== null;
  }

  getSecurityState(): { failedAttempts: number; cooldownRemainingMs: number } {
    this.clearCooldownIfElapsed();
    return {
      failedAttempts: this.failedAttempts,
      cooldownRemainingMs: this.getCooldownRemainingMs(),
    };
  }

  lock(): void {
    this.key = null;
  }

  async getSetupMaterial(): Promise<E2EProfileData | null> {
    try {
      const response = await fetch('/api/profile/e2e', { credentials: 'include' });
      const payload = (await response.json()) as E2EProfileGetResponse;

      if (!response.ok) {
        return null;
      }
      if (!payload || (payload as { success?: unknown }).success !== true) {
        return null;
      }

      return (payload as { success: true; data: E2EProfileData }).data;
    } catch {
      return null;
    }
  }

  async hasSetup(): Promise<boolean> {
    const material = await this.getSetupMaterial();
    return Boolean(material?.hasSetup);
  }

  async setup(pin: string): Promise<SecureMemorySetupResult> {
    if (!isValidPin(pin)) {
      return { ok: false, reason: 'invalid_pin' };
    }

    const e2e_salt = generateSaltBase64();
    const key = await deriveKey(pin, e2e_salt);
    const e2e_verification_block = await createVerificationBlock(key);

    try {
      const response = await fetch('/api/profile/e2e', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ e2e_salt, e2e_verification_block }),
      });

      const payload = (await response.json()) as E2EProfilePutResponse;
      if (response.status === 401) {
        return { ok: false, reason: 'unauthorized' };
      }
      if (response.status === 409) {
        return { ok: false, reason: 'conflict' };
      }
      if (!response.ok || (payload as { success?: unknown }).success !== true) {
        return { ok: false, reason: 'network' };
      }

      this.key = key;
      this.failedAttempts = 0;
      this.cooldownUntil = 0;

      const setupAt = (payload as { success: true; data: { e2e_setup_at: string } }).data?.e2e_setup_at ?? null;

      return {
        ok: true,
        data: {
          hasSetup: true,
          e2e_salt,
          e2e_verification_block,
          e2e_setup_at: setupAt,
        },
      };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  async unlock(pin: string): Promise<SecureMemoryUnlockResult> {
    if (!isValidPin(pin)) {
      return { ok: false, reason: 'wrong_pin' };
    }

    this.clearCooldownIfElapsed();
    if (this.getCooldownRemainingMs() > 0) {
      return { ok: false, reason: 'cooldown' };
    }

    let material: E2EProfileData | null = null;
    try {
      const response = await fetch('/api/profile/e2e', { credentials: 'include' });
      const payload = (await response.json()) as unknown;

      if (response.status === 401) {
        return { ok: false, reason: 'unauthorized' };
      }
      if (!response.ok) {
        const message = getJsonErrorMessage(payload);
        return message === 'Unauthorized'
          ? { ok: false, reason: 'unauthorized' }
          : { ok: false, reason: 'network' };
      }

      if (!payload || typeof payload !== 'object' || (payload as Record<string, unknown>).success !== true) {
        return { ok: false, reason: 'network' };
      }

      material = (payload as { success: true; data: E2EProfileData }).data;
    } catch {
      return { ok: false, reason: 'network' };
    }

    if (!material?.hasSetup || !material.e2e_salt || !material.e2e_verification_block) {
      return { ok: false, reason: 'not_setup' };
    }

    const key = await deriveKey(pin, material.e2e_salt);

    let verified = false;
    try {
      const plaintext = await decrypt(material.e2e_verification_block, key);
      verified = plaintext === E2E_VERIFY_PLAINTEXT;
    } catch {
      verified = false;
    }

    if (!verified) {
      this.failedAttempts += 1;
      if (this.failedAttempts >= 3) {
        this.cooldownUntil = Date.now() + 30_000;
      }
      return { ok: false, reason: this.getCooldownRemainingMs() > 0 ? 'cooldown' : 'wrong_pin' };
    }

    this.key = key;
    this.failedAttempts = 0;
    this.cooldownUntil = 0;
    return { ok: true };
  }

  async encryptForStorage(plaintext: string): Promise<string> {
    if (!this.key) {
      throw new Error('E2E key is locked');
    }
    return encrypt(plaintext, this.key);
  }

  async decryptFromStorage(encryptedContentBase64: string): Promise<string> {
    if (!this.key) {
      throw new Error('E2E key is locked');
    }
    return decrypt(encryptedContentBase64, this.key);
  }

  private clearCooldownIfElapsed(): void {
    if (this.cooldownUntil > 0 && Date.now() >= this.cooldownUntil) {
      this.cooldownUntil = 0;
      this.failedAttempts = 0;
    }
  }

  private getCooldownRemainingMs(): number {
    return Math.max(0, this.cooldownUntil - Date.now());
  }
}

export const secureMemory = new SecureMemoryClient();

