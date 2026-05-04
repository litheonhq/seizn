-- Seizn Author Memory v3 - align BYOK provider keys with profile IDs.
-- NextAuth compatibility moved application user identity to profiles.id TEXT.
-- Provider keys must follow that identity model so Author BYOK works for
-- Supabase credentials and OAuth-backed profile IDs.

DROP POLICY IF EXISTS "Users can view own provider keys" ON provider_keys;
DROP POLICY IF EXISTS "Users can insert own provider keys" ON provider_keys;
DROP POLICY IF EXISTS "Users can update own provider keys" ON provider_keys;
DROP POLICY IF EXISTS "Users can delete own provider keys" ON provider_keys;
DROP POLICY IF EXISTS "Users can view own key audit logs" ON provider_keys_audit;

ALTER TABLE provider_keys
  DROP CONSTRAINT IF EXISTS provider_keys_user_id_fkey;

ALTER TABLE provider_keys
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE provider_keys_audit
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'provider_keys_user_id_fkey'
      AND conrelid = 'provider_keys'::regclass
  ) THEN
    ALTER TABLE provider_keys
      ADD CONSTRAINT provider_keys_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

CREATE POLICY "Users can view own provider keys"
  ON provider_keys FOR SELECT
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can insert own provider keys"
  ON provider_keys FOR INSERT
  WITH CHECK (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can update own provider keys"
  ON provider_keys FOR UPDATE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can delete own provider keys"
  ON provider_keys FOR DELETE
  USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Users can view own key audit logs"
  ON provider_keys_audit FOR SELECT
  USING (auth.uid()::TEXT = user_id);

COMMENT ON COLUMN provider_keys.user_id IS
  'Application user ID aligned to profiles.id TEXT for NextAuth compatibility';
COMMENT ON COLUMN provider_keys_audit.user_id IS
  'Application user ID aligned to profiles.id TEXT for NextAuth compatibility';
