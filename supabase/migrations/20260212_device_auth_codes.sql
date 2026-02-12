-- Device Authorization Grant (RFC 8628) for MCP OAuth flow
-- Allows CLI tools to authenticate via browser without manual API key copy

CREATE TABLE IF NOT EXISTS device_auth_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  api_key_id UUID REFERENCES api_keys(id),
  access_token TEXT, -- temporary storage for the generated key (cleared after first poll)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ
);

-- Indexes for polling
CREATE INDEX idx_device_auth_codes_device_code ON device_auth_codes (device_code);
CREATE INDEX idx_device_auth_codes_user_code ON device_auth_codes (user_code) WHERE status = 'pending';
CREATE INDEX idx_device_auth_codes_expires_at ON device_auth_codes (expires_at) WHERE status = 'pending';

-- RLS
ALTER TABLE device_auth_codes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own approved codes
CREATE POLICY "Users can view own device auth codes"
  ON device_auth_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role manages device auth codes"
  ON device_auth_codes FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-expire old pending codes (optional cron cleanup)
CREATE OR REPLACE FUNCTION cleanup_expired_device_codes()
RETURNS void AS $$
BEGIN
  UPDATE device_auth_codes
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now();

  DELETE FROM device_auth_codes
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
