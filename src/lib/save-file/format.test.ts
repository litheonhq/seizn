import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeSaveFile,
  encodeSaveFile,
  rawEd25519PublicKeyFromDer,
  type SaveFilePayload,
} from './format';

function makeSigner() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyRaw = rawEd25519PublicKeyFromDer(
    publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  );
  return { privateKey, publicKeyRaw };
}

function makePayload(): SaveFilePayload {
  const now = '2026-04-21T00:00:00.000Z';
  return {
    version: 'SZN1',
    exportedAt: now,
    studioId: '00000000-0000-4000-8000-000000000001',
    npcId: 'kaelan',
    schemaVersion: 1,
    memories: [
      {
        id: '00000000-0000-4000-8000-000000000101',
        content: 'Kaelan remembers the player returned the silver compass.',
        memoryType: 'fact',
        tags: ['quest', 'compass'],
        namespace: 'default',
        companionMeta: { act: 2 },
        scope: 'agent',
        source: 'test',
        confidence: 0.98,
        importance: 7,
        agentId: 'kaelan',
        entityId: 'kaelan',
        tier: 'hot',
        pinned: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    beliefs: [
      {
        id: '00000000-0000-4000-8000-000000000201',
        holderEntityId: 'kaelan',
        aboutFactId: '00000000-0000-4000-8000-000000000101',
        observedAt: now,
        witnessEventId: null,
        confidence: 0.9,
        revokedAt: null,
        sourceType: 'direct',
      },
    ],
    canonLocks: [
      {
        id: '00000000-0000-4000-8000-000000000301',
        npcId: 'kaelan',
        scope: 'never_say',
        statement: 'Kaelan never mentions Gretel by name.',
        regexFastpath: 'Gretel',
        severity: 'hard',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    meta: {
      memoryCount: 1,
      beliefCount: 1,
      canonLockCount: 1,
    },
  };
}

describe('SZN1 save-file codec', () => {
  it('round-trips a signed payload', () => {
    const signer = makeSigner();
    const file = encodeSaveFile(makePayload(), signer);
    const decoded = decodeSaveFile(file);

    expect(file.subarray(0, 4).toString('ascii')).toBe('SZN1');
    expect(decoded.publicKeyRaw.equals(signer.publicKeyRaw)).toBe(true);
    expect(decoded.payload.npcId).toBe('kaelan');
    expect(decoded.payload.memories[0]?.content).toContain('silver compass');
    expect(decoded.payload.beliefs).toHaveLength(1);
    expect(decoded.payload.canonLocks).toHaveLength(1);
  });

  it('rejects tampered body bytes with a signature error', () => {
    const file = encodeSaveFile(makePayload(), makeSigner());
    const tampered = Buffer.from(file);
    tampered[12] = tampered[12] ^ 0xff;

    expect(() => decodeSaveFile(tampered)).toThrow('invalid_save_file_signature');
  });

  it('rejects tampered signature bytes', () => {
    const file = encodeSaveFile(makePayload(), makeSigner());
    const tampered = Buffer.from(file);
    tampered[tampered.length - 33] = tampered[tampered.length - 33] ^ 0xff;

    expect(() => decodeSaveFile(tampered)).toThrow('invalid_save_file_signature');
  });
});
