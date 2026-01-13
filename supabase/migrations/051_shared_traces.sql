-- Share Trace Enhancement Migration
-- Extends the existing shared_traces table with redaction profiles and secure tokens

-- Add redaction_profile column if not exists
ALTER TABLE shared_traces
ADD COLUMN IF NOT EXISTS redaction_profile JSONB DEFAULT '{"pii": true, "secrets": true, "raw_content": false}'::JSONB;

-- Add share_token column (longer, more secure than share_id)
ALTER TABLE shared_traces
ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);

-- Create index for share_token lookups
CREATE INDEX IF NOT EXISTS idx_shared_traces_share_token ON shared_traces(share_token);

-- Update existing rows without share_token
UPDATE shared_traces
SET share_token = encode(gen_random_bytes(32), 'hex')
WHERE share_token IS NULL;

-- Make share_token NOT NULL and UNIQUE after populating
ALTER TABLE shared_traces
ALTER COLUMN share_token SET NOT NULL;

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shared_traces_share_token_key'
  ) THEN
    ALTER TABLE shared_traces ADD CONSTRAINT shared_traces_share_token_key UNIQUE (share_token);
  END IF;
END $$;

-- Add foreign key to fall_retrieval_traces if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shared_traces_trace_id_fkey'
  ) THEN
    -- Add foreign key constraint (soft reference - trace_id may reference fall_retrieval_traces)
    ALTER TABLE shared_traces
    ADD CONSTRAINT shared_traces_trace_id_fkey
    FOREIGN KEY (trace_id)
    REFERENCES fall_retrieval_traces(id)
    ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    -- If fall_retrieval_traces doesn't exist yet, skip FK constraint
    RAISE NOTICE 'Could not add FK constraint: %', SQLERRM;
END $$;

-- Policy for anonymous access to shared traces (via API routes with service_role)
-- Already exists in 032, but let's ensure public read policy exists
CREATE POLICY IF NOT EXISTS "Anon can read shared traces by token"
  ON shared_traces FOR SELECT
  TO anon
  USING (true);

-- Add comment for the new column
COMMENT ON COLUMN shared_traces.redaction_profile IS 'JSON config for what to redact: pii (emails/phones), secrets (API keys), raw_content (chunk text)';
COMMENT ON COLUMN shared_traces.share_token IS 'Secure 64-char hex token for sharing (replaces short share_id)';
