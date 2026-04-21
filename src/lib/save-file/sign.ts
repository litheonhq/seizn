import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import {
  rawEd25519PublicKeyFromDer,
  type SaveFileSigner,
} from './format';

type SupabaseLike = ReturnType<typeof createServerClient>;

interface SigningKeyRow {
  public_key_base64: string;
  private_key_ciphertext_base64: string;
  private_key_iv_base64: string;
  private_key_tag_base64: string;
}

function masterKey() {
  const raw = process.env.SEIZN_SIGNING_MASTER_KEY;
  if (!raw || raw.trim().length < 24) {
    throw new Error('SEIZN_SIGNING_MASTER_KEY is required for save-file signing');
  }
  const trimmed = raw.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex');
  try {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to hash derivation.
  }
  return createHash('sha256').update(trimmed).digest();
}

function encryptPrivateKey(privateKeyDer: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyDer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

function decryptPrivateKey(row: SigningKeyRow) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    masterKey(),
    Buffer.from(row.private_key_iv_base64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(row.private_key_tag_base64, 'base64'));
  const privateKeyDer = Buffer.concat([
    decipher.update(Buffer.from(row.private_key_ciphertext_base64, 'base64')),
    decipher.final(),
  ]);
  return createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
}

function makeSigningKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyRaw = rawEd25519PublicKeyFromDer(
    publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  );
  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  return { publicKeyRaw, encrypted: encryptPrivateKey(privateKeyDer) };
}

async function loadRow(studioId: string, supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from('studio_signing_keys')
    .select('public_key_base64, private_key_ciphertext_base64, private_key_iv_base64, private_key_tag_base64')
    .eq('studio_id', studioId)
    .eq('active', true)
    .maybeSingle();

  if (error) throw new Error(`save_file_signing_key_load_failed: ${error.message}`);
  return data as SigningKeyRow | null;
}

export async function getOrCreateSaveFileSigner(
  studioId: string,
  createdBy: string | null,
  supabase: SupabaseLike = createServerClient()
): Promise<SaveFileSigner> {
  let row = await loadRow(studioId, supabase);

  if (!row) {
    const key = makeSigningKey();
    const { error } = await supabase
      .from('studio_signing_keys')
      .insert({
        studio_id: studioId,
        public_key_base64: key.publicKeyRaw.toString('base64'),
        private_key_ciphertext_base64: key.encrypted.ciphertext.toString('base64'),
        private_key_iv_base64: key.encrypted.iv.toString('base64'),
        private_key_tag_base64: key.encrypted.tag.toString('base64'),
        created_by: createdBy,
      });

    if (error && error.code !== '23505') {
      throw new Error(`save_file_signing_key_create_failed: ${error.message}`);
    }
    row = await loadRow(studioId, supabase);
  }

  if (!row) throw new Error('save_file_signing_key_unavailable');
  return {
    privateKey: decryptPrivateKey(row),
    publicKeyRaw: Buffer.from(row.public_key_base64, 'base64'),
  };
}
