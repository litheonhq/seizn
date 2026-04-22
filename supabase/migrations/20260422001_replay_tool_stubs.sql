ALTER TABLE public.replay_snapshots
  ADD COLUMN IF NOT EXISTS stub_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_replay_snapshots_stub_hash
  ON public.replay_snapshots(stub_hash)
  WHERE stub_hash IS NOT NULL;

NOTIFY pgrst, 'reload schema';
