-- Migration: Structured User Profiles (PR-021)
-- Adds versioned, structured profile storage for the User Profile API.

CREATE TABLE IF NOT EXISTS user_structured_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  about_me TEXT DEFAULT '',
  preferences JSONB DEFAULT '{}',
  constraints JSONB DEFAULT '[]',
  tools JSONB DEFAULT '[]',
  workstyle TEXT DEFAULT '',
  custom_fields JSONB DEFAULT '{}',
  derived_from TEXT DEFAULT 'manual' CHECK (derived_from IN ('memories', 'manual', 'mixed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, version)
);

CREATE INDEX idx_structured_profiles_user ON user_structured_profiles(user_id, version DESC);

ALTER TABLE user_structured_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profiles" ON user_structured_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profiles" ON user_structured_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
