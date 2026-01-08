-- Webhook System for Seizn
-- Allows users to receive real-time notifications for memory events

-- Webhook endpoints table
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Webhook configuration
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(255), -- For HMAC signature verification

  -- Event subscriptions (which events trigger this webhook)
  events TEXT[] NOT NULL DEFAULT ARRAY['memory.created'],

  -- Filtering
  namespace VARCHAR(50), -- Only trigger for specific namespace (null = all)

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook delivery logs
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,

  -- Delivery status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, success, failed
  status_code INT,
  response_body TEXT,
  error_message TEXT,

  -- Retry tracking
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'failed' AND attempt_count < max_attempts;

-- RLS Policies
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Users can only access their own webhooks
CREATE POLICY "Users can view own webhooks"
  ON webhooks FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own webhooks"
  ON webhooks FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own webhooks"
  ON webhooks FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own webhooks"
  ON webhooks FOR DELETE
  USING (auth.uid()::text = user_id);

-- Users can view their webhook deliveries
CREATE POLICY "Users can view own webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM webhooks w WHERE w.id = webhook_deliveries.webhook_id AND w.user_id = auth.uid()::text
  ));

-- Function to queue webhook delivery
CREATE OR REPLACE FUNCTION queue_webhook_delivery(
  p_user_id TEXT,
  p_event_type TEXT,
  p_payload JSONB,
  p_namespace TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  webhook_record RECORD;
  queued_count INT := 0;
BEGIN
  -- Find all matching webhooks for this user
  FOR webhook_record IN
    SELECT id, url, secret
    FROM webhooks
    WHERE user_id = p_user_id
      AND is_active = true
      AND p_event_type = ANY(events)
      AND (namespace IS NULL OR namespace = p_namespace)
  LOOP
    -- Create delivery record
    INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
    VALUES (webhook_record.id, p_event_type, p_payload);

    queued_count := queued_count + 1;
  END LOOP;

  RETURN queued_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to automatically queue webhooks on memory events
CREATE OR REPLACE FUNCTION trigger_memory_webhook()
RETURNS TRIGGER AS $$
DECLARE
  event_type TEXT;
  payload JSONB;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    event_type := 'memory.created';
    payload := jsonb_build_object(
      'event', event_type,
      'timestamp', NOW(),
      'memory', jsonb_build_object(
        'id', NEW.id,
        'content', NEW.content,
        'memory_type', NEW.memory_type,
        'tags', NEW.tags,
        'namespace', NEW.namespace,
        'created_at', NEW.created_at
      )
    );
    PERFORM queue_webhook_delivery(NEW.user_id::text, event_type, payload, NEW.namespace);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if it's a soft delete
    IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
      event_type := 'memory.deleted';
      payload := jsonb_build_object(
        'event', event_type,
        'timestamp', NOW(),
        'memory', jsonb_build_object(
          'id', NEW.id,
          'namespace', NEW.namespace,
          'deleted_at', NEW.deleted_at
        )
      );
      PERFORM queue_webhook_delivery(NEW.user_id::text, event_type, payload, NEW.namespace);
    ELSE
      event_type := 'memory.updated';
      payload := jsonb_build_object(
        'event', event_type,
        'timestamp', NOW(),
        'memory', jsonb_build_object(
          'id', NEW.id,
          'content', NEW.content,
          'memory_type', NEW.memory_type,
          'tags', NEW.tags,
          'namespace', NEW.namespace,
          'updated_at', NEW.updated_at
        )
      );
      PERFORM queue_webhook_delivery(NEW.user_id::text, event_type, payload, NEW.namespace);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on memories table
DROP TRIGGER IF EXISTS memory_webhook_trigger ON memories;
CREATE TRIGGER memory_webhook_trigger
  AFTER INSERT OR UPDATE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION trigger_memory_webhook();

-- Comments
COMMENT ON TABLE webhooks IS 'User-configured webhook endpoints for event notifications';
COMMENT ON TABLE webhook_deliveries IS 'Log of webhook delivery attempts';
COMMENT ON FUNCTION queue_webhook_delivery IS 'Queues a webhook delivery for all matching endpoints';
