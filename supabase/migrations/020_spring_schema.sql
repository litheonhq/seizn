-- Seizn Spring - Multi-AI Chat Schema
-- Migration: 020_spring_schema.sql

-- ===========================================
-- 1. Conversations (대화 목록)
-- ===========================================
CREATE TABLE spring_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Conversation Info
    title TEXT DEFAULT 'New Chat',
    summary TEXT,                          -- AI-generated summary

    -- Settings
    default_model TEXT DEFAULT 'gpt-4o-mini',
    system_prompt TEXT,                    -- Custom system prompt

    -- Memory Integration
    memory_enabled BOOLEAN DEFAULT true,   -- Auto-inject memories
    memory_namespace TEXT,                 -- Specific namespace to use

    -- Metadata
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,

    -- Sharing
    is_shared BOOLEAN DEFAULT false,
    share_id TEXT UNIQUE,                  -- Public share URL slug

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Soft delete
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMPTZ
);

CREATE INDEX idx_spring_conv_user ON spring_conversations(user_id) WHERE NOT is_archived;
CREATE INDEX idx_spring_conv_updated ON spring_conversations(user_id, updated_at DESC) WHERE NOT is_archived;
CREATE INDEX idx_spring_conv_share ON spring_conversations(share_id) WHERE is_shared;

-- ===========================================
-- 2. Messages (메시지)
-- ===========================================
CREATE TABLE spring_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES spring_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Message Content
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- AI Model Info
    model TEXT,                            -- Which model generated this

    -- Token Usage
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,

    -- Attachments
    attachments JSONB DEFAULT '[]'::JSONB, -- [{type, url, name, size}]

    -- Memory Integration
    injected_memories UUID[],              -- Memory IDs injected for this message
    extracted_memories UUID[],             -- Memory IDs extracted from this message

    -- Metadata
    latency_ms INTEGER,                    -- Response time
    finish_reason TEXT,                    -- stop, length, etc.

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Soft delete (for regeneration)
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_spring_msg_conv ON spring_messages(conversation_id, created_at) WHERE NOT is_deleted;
CREATE INDEX idx_spring_msg_user ON spring_messages(user_id) WHERE NOT is_deleted;

-- ===========================================
-- 3. Generated Media (이미지/비디오)
-- ===========================================
CREATE TABLE spring_generated_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES spring_conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES spring_messages(id) ON DELETE SET NULL,

    -- Media Info
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    provider TEXT NOT NULL,                -- stability, openai, sora, etc.
    model TEXT NOT NULL,                   -- sd-xl, dall-e-3, etc.

    -- Content
    prompt TEXT NOT NULL,
    negative_prompt TEXT,

    -- URLs
    url TEXT NOT NULL,                     -- R2 storage URL
    thumbnail_url TEXT,

    -- Metadata
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER,              -- For video
    file_size_bytes INTEGER,

    -- Generation Settings
    settings JSONB DEFAULT '{}'::JSONB,    -- style, steps, cfg_scale, etc.

    -- Cost tracking
    credits_used INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_spring_media_user ON spring_generated_media(user_id, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_spring_media_type ON spring_generated_media(user_id, media_type) WHERE NOT is_deleted;

-- ===========================================
-- 4. Spring Usage (사용량 추적)
-- ===========================================
CREATE TABLE spring_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Date (for daily aggregation)
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- AI Model Usage (counts)
    gpt4o_mini_count INTEGER DEFAULT 0,
    gpt4o_count INTEGER DEFAULT 0,
    gpt5_count INTEGER DEFAULT 0,
    claude_sonnet_count INTEGER DEFAULT 0,
    claude_opus_count INTEGER DEFAULT 0,
    gemini_count INTEGER DEFAULT 0,

    -- Token Usage (totals)
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,

    -- Image Generation
    sd_images_count INTEGER DEFAULT 0,
    dalle_images_count INTEGER DEFAULT 0,

    -- Video Generation (seconds)
    video_seconds_used INTEGER DEFAULT 0,

    -- File Analysis
    files_analyzed_count INTEGER DEFAULT 0,
    files_total_bytes BIGINT DEFAULT 0,

    -- Cost tracking (cents)
    total_cost_cents INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint for daily aggregation
    UNIQUE(user_id, usage_date)
);

CREATE INDEX idx_spring_usage_user_date ON spring_usage(user_id, usage_date DESC);

-- ===========================================
-- 5. Spring Quotas (플랜별 쿼터)
-- ===========================================
CREATE TABLE spring_plan_quotas (
    plan TEXT PRIMARY KEY,

    -- AI Model Limits (per day, -1 = unlimited)
    gpt4o_mini_daily INTEGER DEFAULT 30,
    gpt4o_daily INTEGER DEFAULT 0,
    gpt5_daily INTEGER DEFAULT 0,
    claude_sonnet_daily INTEGER DEFAULT 0,
    claude_opus_daily INTEGER DEFAULT 0,
    gemini_daily INTEGER DEFAULT 0,

    -- Image Limits (per day)
    sd_images_daily INTEGER DEFAULT 5,
    dalle_images_daily INTEGER DEFAULT 0,

    -- Video Limits (seconds per month)
    video_seconds_monthly INTEGER DEFAULT 0,

    -- File Limits
    files_daily INTEGER DEFAULT 3,
    max_file_size_mb INTEGER DEFAULT 5,

    -- Rate Limits
    requests_per_minute INTEGER DEFAULT 60
);

-- Insert default quotas
INSERT INTO spring_plan_quotas (plan, gpt4o_mini_daily, gpt4o_daily, gpt5_daily, claude_sonnet_daily, claude_opus_daily, gemini_daily, sd_images_daily, dalle_images_daily, video_seconds_monthly, files_daily, max_file_size_mb, requests_per_minute) VALUES
    ('free', 30, 0, 0, 0, 0, 0, 5, 0, 0, 3, 5, 60),
    ('starter', 100, 20, 20, 20, 0, 30, 30, 5, 0, 20, 25, 120),
    ('plus', 300, 100, 100, 100, 10, 100, 100, 20, 0, 50, 50, 300),
    ('pro', -1, 300, 300, 300, 50, -1, 300, 50, 50, -1, 100, 600),
    ('enterprise', -1, -1, -1, -1, 100, -1, -1, 100, 200, -1, 500, 1200);

-- ===========================================
-- 6. File Uploads (파일 분석용)
-- ===========================================
CREATE TABLE spring_file_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES spring_conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES spring_messages(id) ON DELETE SET NULL,

    -- File Info
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,

    -- Storage
    storage_url TEXT NOT NULL,             -- R2 URL

    -- Processing
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    extracted_text TEXT,                   -- OCR/parsed text
    analysis_result JSONB,                 -- AI analysis result

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    -- Auto-delete after 7 days
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX idx_spring_files_user ON spring_file_uploads(user_id, created_at DESC);
CREATE INDEX idx_spring_files_status ON spring_file_uploads(status) WHERE status != 'completed';

-- ===========================================
-- Row Level Security (RLS)
-- ===========================================
ALTER TABLE spring_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_generated_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE spring_file_uploads ENABLE ROW LEVEL SECURITY;

-- Conversations
CREATE POLICY "Users can view own conversations" ON spring_conversations
    FOR SELECT USING (auth.uid()::text = user_id OR (is_shared AND share_id IS NOT NULL));
CREATE POLICY "Users can insert own conversations" ON spring_conversations
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own conversations" ON spring_conversations
    FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can delete own conversations" ON spring_conversations
    FOR DELETE USING (auth.uid()::text = user_id);

-- Messages
CREATE POLICY "Users can view own messages" ON spring_messages
    FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own messages" ON spring_messages
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own messages" ON spring_messages
    FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can delete own messages" ON spring_messages
    FOR DELETE USING (auth.uid()::text = user_id);

-- Generated Media
CREATE POLICY "Users can view own media" ON spring_generated_media
    FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own media" ON spring_generated_media
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can delete own media" ON spring_generated_media
    FOR DELETE USING (auth.uid()::text = user_id);

-- Usage
CREATE POLICY "Users can view own usage" ON spring_usage
    FOR SELECT USING (auth.uid()::text = user_id);

-- File Uploads
CREATE POLICY "Users can view own files" ON spring_file_uploads
    FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own files" ON spring_file_uploads
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can delete own files" ON spring_file_uploads
    FOR DELETE USING (auth.uid()::text = user_id);

-- ===========================================
-- Helper Functions
-- ===========================================

-- Update conversation message count and last_message_at
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE spring_conversations
        SET message_count = message_count + 1,
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_deleted = true AND OLD.is_deleted = false) THEN
        UPDATE spring_conversations
        SET message_count = message_count - 1,
            updated_at = NOW()
        WHERE id = COALESCE(NEW.conversation_id, OLD.conversation_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_spring_message_change
    AFTER INSERT OR UPDATE OR DELETE ON spring_messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();

-- Generate share ID
CREATE OR REPLACE FUNCTION generate_share_id()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..12 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate title from first message
CREATE OR REPLACE FUNCTION auto_generate_conversation_title()
RETURNS TRIGGER AS $$
DECLARE
    conv_title TEXT;
    msg_count INTEGER;
BEGIN
    -- Only for user messages
    IF NEW.role != 'user' THEN
        RETURN NEW;
    END IF;

    -- Get current message count
    SELECT message_count INTO msg_count
    FROM spring_conversations WHERE id = NEW.conversation_id;

    -- Only set title on first user message
    IF msg_count = 0 THEN
        -- Use first 50 chars of message as title
        conv_title := LEFT(NEW.content, 50);
        IF LENGTH(NEW.content) > 50 THEN
            conv_title := conv_title || '...';
        END IF;

        UPDATE spring_conversations
        SET title = conv_title
        WHERE id = NEW.conversation_id AND title = 'New Chat';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_spring_message_insert_title
    BEFORE INSERT ON spring_messages
    FOR EACH ROW EXECUTE FUNCTION auto_generate_conversation_title();

-- Upsert daily usage
CREATE OR REPLACE FUNCTION upsert_spring_usage(
    p_user_id TEXT,
    p_model TEXT DEFAULT NULL,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_sd_images INTEGER DEFAULT 0,
    p_dalle_images INTEGER DEFAULT 0,
    p_video_seconds INTEGER DEFAULT 0,
    p_files INTEGER DEFAULT 0,
    p_file_bytes BIGINT DEFAULT 0,
    p_cost_cents INTEGER DEFAULT 0
)
RETURNS void AS $$
BEGIN
    INSERT INTO spring_usage (
        user_id, usage_date,
        gpt4o_mini_count, gpt4o_count, gpt5_count,
        claude_sonnet_count, claude_opus_count, gemini_count,
        total_input_tokens, total_output_tokens,
        sd_images_count, dalle_images_count,
        video_seconds_used, files_analyzed_count, files_total_bytes,
        total_cost_cents
    ) VALUES (
        p_user_id, CURRENT_DATE,
        CASE WHEN p_model = 'gpt-4o-mini' THEN 1 ELSE 0 END,
        CASE WHEN p_model = 'gpt-4o' THEN 1 ELSE 0 END,
        CASE WHEN p_model LIKE 'gpt-5%' THEN 1 ELSE 0 END,
        CASE WHEN p_model LIKE 'claude-3%sonnet%' OR p_model LIKE 'claude-sonnet%' THEN 1 ELSE 0 END,
        CASE WHEN p_model LIKE 'claude%opus%' THEN 1 ELSE 0 END,
        CASE WHEN p_model LIKE 'gemini%' THEN 1 ELSE 0 END,
        p_input_tokens, p_output_tokens,
        p_sd_images, p_dalle_images,
        p_video_seconds, p_files, p_file_bytes,
        p_cost_cents
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
        gpt4o_mini_count = spring_usage.gpt4o_mini_count + CASE WHEN p_model = 'gpt-4o-mini' THEN 1 ELSE 0 END,
        gpt4o_count = spring_usage.gpt4o_count + CASE WHEN p_model = 'gpt-4o' THEN 1 ELSE 0 END,
        gpt5_count = spring_usage.gpt5_count + CASE WHEN p_model LIKE 'gpt-5%' THEN 1 ELSE 0 END,
        claude_sonnet_count = spring_usage.claude_sonnet_count + CASE WHEN p_model LIKE 'claude-3%sonnet%' OR p_model LIKE 'claude-sonnet%' THEN 1 ELSE 0 END,
        claude_opus_count = spring_usage.claude_opus_count + CASE WHEN p_model LIKE 'claude%opus%' THEN 1 ELSE 0 END,
        gemini_count = spring_usage.gemini_count + CASE WHEN p_model LIKE 'gemini%' THEN 1 ELSE 0 END,
        total_input_tokens = spring_usage.total_input_tokens + p_input_tokens,
        total_output_tokens = spring_usage.total_output_tokens + p_output_tokens,
        sd_images_count = spring_usage.sd_images_count + p_sd_images,
        dalle_images_count = spring_usage.dalle_images_count + p_dalle_images,
        video_seconds_used = spring_usage.video_seconds_used + p_video_seconds,
        files_analyzed_count = spring_usage.files_analyzed_count + p_files,
        files_total_bytes = spring_usage.files_total_bytes + p_file_bytes,
        total_cost_cents = spring_usage.total_cost_cents + p_cost_cents,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check quota
CREATE OR REPLACE FUNCTION check_spring_quota(
    p_user_id TEXT,
    p_model TEXT DEFAULT NULL,
    p_media_type TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    user_plan TEXT;
    quota RECORD;
    usage RECORD;
    result JSONB;
    allowed BOOLEAN := true;
    remaining INTEGER;
BEGIN
    -- Get user plan
    SELECT plan INTO user_plan FROM profiles WHERE id = p_user_id;
    IF user_plan IS NULL THEN
        user_plan := 'free';
    END IF;

    -- Get quota
    SELECT * INTO quota FROM spring_plan_quotas WHERE plan = user_plan;

    -- Get today's usage
    SELECT * INTO usage FROM spring_usage
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

    IF usage IS NULL THEN
        -- No usage today, all quotas available
        result := jsonb_build_object(
            'allowed', true,
            'plan', user_plan,
            'message', 'OK'
        );
        RETURN result;
    END IF;

    -- Check specific model quota
    IF p_model IS NOT NULL THEN
        CASE
            WHEN p_model = 'gpt-4o-mini' THEN
                IF quota.gpt4o_mini_daily != -1 AND usage.gpt4o_mini_count >= quota.gpt4o_mini_daily THEN
                    allowed := false;
                    remaining := 0;
                ELSE
                    remaining := CASE WHEN quota.gpt4o_mini_daily = -1 THEN -1 ELSE quota.gpt4o_mini_daily - usage.gpt4o_mini_count END;
                END IF;
            WHEN p_model = 'gpt-4o' THEN
                IF quota.gpt4o_daily != -1 AND usage.gpt4o_count >= quota.gpt4o_daily THEN
                    allowed := false;
                    remaining := 0;
                ELSE
                    remaining := CASE WHEN quota.gpt4o_daily = -1 THEN -1 ELSE quota.gpt4o_daily - usage.gpt4o_count END;
                END IF;
            WHEN p_model LIKE 'claude%sonnet%' THEN
                IF quota.claude_sonnet_daily != -1 AND usage.claude_sonnet_count >= quota.claude_sonnet_daily THEN
                    allowed := false;
                    remaining := 0;
                ELSE
                    remaining := CASE WHEN quota.claude_sonnet_daily = -1 THEN -1 ELSE quota.claude_sonnet_daily - usage.claude_sonnet_count END;
                END IF;
            WHEN p_model LIKE 'claude%opus%' THEN
                IF quota.claude_opus_daily != -1 AND usage.claude_opus_count >= quota.claude_opus_daily THEN
                    allowed := false;
                    remaining := 0;
                ELSE
                    remaining := CASE WHEN quota.claude_opus_daily = -1 THEN -1 ELSE quota.claude_opus_daily - usage.claude_opus_count END;
                END IF;
            ELSE
                remaining := -1;
        END CASE;
    END IF;

    -- Check media quota
    IF p_media_type IS NOT NULL THEN
        CASE
            WHEN p_media_type = 'sd_image' THEN
                IF quota.sd_images_daily != -1 AND usage.sd_images_count >= quota.sd_images_daily THEN
                    allowed := false;
                    remaining := 0;
                ELSE
                    remaining := CASE WHEN quota.sd_images_daily = -1 THEN -1 ELSE quota.sd_images_daily - usage.sd_images_count END;
                END IF;
            WHEN p_media_type = 'dalle_image' THEN
                IF quota.dalle_images_daily != -1 AND usage.dalle_images_count >= quota.dalle_images_daily THEN
                    allowed := false;
                    remaining := 0;
                ELSE
                    remaining := CASE WHEN quota.dalle_images_daily = -1 THEN -1 ELSE quota.dalle_images_daily - usage.dalle_images_count END;
                END IF;
            ELSE
                remaining := -1;
        END CASE;
    END IF;

    result := jsonb_build_object(
        'allowed', allowed,
        'plan', user_plan,
        'remaining', remaining,
        'message', CASE WHEN allowed THEN 'OK' ELSE 'Quota exceeded for today. Upgrade your plan for more.' END
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
