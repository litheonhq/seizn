// Seizn Spring - Database Helpers
import { createServerClient } from '../supabase';
import type {
  Conversation,
  Message,
  AIModel,
  DailyUsage,
  QuotaCheck,
  GeneratedImage,
  FileUpload,
} from './types';

const supabase = createServerClient();

// ===========================================
// Conversations
// ===========================================
export async function createConversation(
  userId: string,
  options?: {
    title?: string;
    defaultModel?: AIModel;
    systemPrompt?: string;
    memoryEnabled?: boolean;
    memoryNamespace?: string;
  }
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('spring_conversations')
    .insert({
      user_id: userId,
      title: options?.title || 'New Chat',
      default_model: options?.defaultModel || 'gpt-4o-mini',
      system_prompt: options?.systemPrompt,
      memory_enabled: options?.memoryEnabled ?? true,
      memory_namespace: options?.memoryNamespace,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getConversation(
  conversationId: string,
  userId: string
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('spring_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

export async function listConversations(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('spring_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1);

  if (error) throw error;
  return data || [];
}

export async function updateConversation(
  conversationId: string,
  userId: string,
  updates: Partial<Pick<Conversation, 'title' | 'default_model' | 'system_prompt' | 'memory_enabled' | 'memory_namespace'>>
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('spring_conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function archiveConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('spring_conversations')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function shareConversation(
  conversationId: string,
  userId: string
): Promise<string> {
  // Generate share ID
  const { data: shareIdData } = await supabase.rpc('generate_share_id');
  const shareId = shareIdData || crypto.randomUUID().slice(0, 12);

  const { error } = await supabase
    .from('spring_conversations')
    .update({
      is_shared: true,
      share_id: shareId,
    })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) throw error;
  return shareId;
}

export async function getSharedConversation(
  shareId: string
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const { data: conversation, error: convError } = await supabase
    .from('spring_conversations')
    .select('*')
    .eq('share_id', shareId)
    .eq('is_shared', true)
    .single();

  if (convError || !conversation) return null;

  const { data: messages } = await supabase
    .from('spring_messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  return { conversation, messages: messages || [] };
}

// ===========================================
// Messages
// ===========================================
export async function createMessage(
  conversationId: string,
  userId: string,
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: AIModel;
    inputTokens?: number;
    outputTokens?: number;
    attachments?: Message['attachments'];
    injectedMemories?: string[];
    extractedMemories?: string[];
    latencyMs?: number;
    finishReason?: string;
  }
): Promise<Message> {
  const { data, error } = await supabase
    .from('spring_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: message.role,
      content: message.content,
      model: message.model,
      input_tokens: message.inputTokens,
      output_tokens: message.outputTokens,
      attachments: message.attachments || [],
      injected_memories: message.injectedMemories,
      extracted_memories: message.extractedMemories,
      latency_ms: message.latencyMs,
      finish_reason: message.finishReason,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMessages(
  conversationId: string,
  userId: string,
  options?: {
    limit?: number;
    before?: string; // message ID for pagination
  }
): Promise<Message[]> {
  let query = supabase
    .from('spring_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (options?.before) {
    const { data: beforeMsg } = await supabase
      .from('spring_messages')
      .select('created_at')
      .eq('id', options.before)
      .single();

    if (beforeMsg) {
      query = query.lt('created_at', beforeMsg.created_at);
    }
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function deleteMessage(
  messageId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('spring_messages')
    .update({ is_deleted: true })
    .eq('id', messageId)
    .eq('user_id', userId);

  if (error) throw error;
}

// ===========================================
// Usage & Quotas
// ===========================================
export async function recordUsage(
  userId: string,
  usage: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    sdImages?: number;
    dalleImages?: number;
    videoSeconds?: number;
    files?: number;
    fileBytes?: number;
    costCents?: number;
  }
): Promise<void> {
  const { error } = await supabase.rpc('upsert_spring_usage', {
    p_user_id: userId,
    p_model: usage.model || null,
    p_input_tokens: usage.inputTokens || 0,
    p_output_tokens: usage.outputTokens || 0,
    p_sd_images: usage.sdImages || 0,
    p_dalle_images: usage.dalleImages || 0,
    p_video_seconds: usage.videoSeconds || 0,
    p_files: usage.files || 0,
    p_file_bytes: usage.fileBytes || 0,
    p_cost_cents: usage.costCents || 0,
  });

  if (error) throw error;
}

export async function checkQuota(
  userId: string,
  options?: {
    model?: string;
    mediaType?: 'sd_image' | 'dalle_image' | 'video';
  }
): Promise<QuotaCheck> {
  const { data, error } = await supabase.rpc('check_spring_quota', {
    p_user_id: userId,
    p_model: options?.model || null,
    p_media_type: options?.mediaType || null,
  });

  if (error) throw error;
  return data as QuotaCheck;
}

export async function getDailyUsage(
  userId: string,
  date?: string
): Promise<DailyUsage | null> {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('spring_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('usage_date', targetDate)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function getUsageHistory(
  userId: string,
  days: number = 30
): Promise<DailyUsage[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('spring_usage')
    .select('*')
    .eq('user_id', userId)
    .gte('usage_date', startDate.toISOString().split('T')[0])
    .order('usage_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ===========================================
// Generated Media
// ===========================================
export async function saveGeneratedImage(
  userId: string,
  image: {
    conversationId?: string;
    messageId?: string;
    provider: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    url: string;
    thumbnailUrl?: string;
    width: number;
    height: number;
    settings?: Record<string, unknown>;
    creditsUsed?: number;
  }
): Promise<GeneratedImage> {
  const { data, error } = await supabase
    .from('spring_generated_media')
    .insert({
      user_id: userId,
      conversation_id: image.conversationId,
      message_id: image.messageId,
      media_type: 'image',
      provider: image.provider,
      model: image.model,
      prompt: image.prompt,
      negative_prompt: image.negativePrompt,
      url: image.url,
      thumbnail_url: image.thumbnailUrl,
      width: image.width,
      height: image.height,
      settings: image.settings || {},
      credits_used: image.creditsUsed || 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listGeneratedMedia(
  userId: string,
  options?: {
    type?: 'image' | 'video';
    limit?: number;
    offset?: number;
  }
): Promise<GeneratedImage[]> {
  let query = supabase
    .from('spring_generated_media')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (options?.type) {
    query = query.eq('media_type', options.type);
  }

  query = query.range(
    options?.offset || 0,
    (options?.offset || 0) + (options?.limit || 50) - 1
  );

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ===========================================
// File Uploads
// ===========================================
export async function createFileUpload(
  userId: string,
  file: {
    conversationId?: string;
    messageId?: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
    storageUrl: string;
  }
): Promise<FileUpload> {
  const { data, error } = await supabase
    .from('spring_file_uploads')
    .insert({
      user_id: userId,
      conversation_id: file.conversationId,
      message_id: file.messageId,
      filename: file.filename,
      mime_type: file.mimeType,
      file_size_bytes: file.fileSizeBytes,
      storage_url: file.storageUrl,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateFileUpload(
  fileId: string,
  userId: string,
  updates: {
    status?: FileUpload['status'];
    extractedText?: string;
    analysisResult?: Record<string, unknown>;
  }
): Promise<FileUpload> {
  const { data, error } = await supabase
    .from('spring_file_uploads')
    .update({
      ...updates,
      processed_at: updates.status === 'completed' ? new Date().toISOString() : undefined,
    })
    .eq('id', fileId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ===========================================
// User Plan
// ===========================================
export async function getUserPlan(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user plan:', error);
    return 'free';
  }
  return data?.plan || 'free';
}
