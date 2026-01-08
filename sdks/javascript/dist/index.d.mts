/**
 * Seizn SDK Type Definitions
 */
type MemoryType = 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
type MemoryScope = 'user' | 'session' | 'agent';
type SearchMode = 'vector' | 'keyword' | 'hybrid';
type WebhookEvent = 'memory.created' | 'memory.updated' | 'memory.deleted';
interface Memory {
    id: string;
    content: string;
    memory_type: MemoryType;
    tags: string[];
    namespace: string;
    scope?: MemoryScope;
    importance: number;
    confidence: number;
    created_at: string;
    updated_at?: string;
}
interface SearchResult {
    id: string;
    content: string;
    memory_type: MemoryType;
    tags: string[];
    similarity: number;
    keyword_rank?: number;
    combined_score?: number;
}
interface ExtractedMemory {
    content: string;
    memory_type: MemoryType;
    tags: string[];
    confidence: number;
    importance: number;
}
interface QueryResponse {
    response: string;
    memories_used?: Array<{
        id: string;
        content: string;
        similarity: number;
    }>;
    model_used: string;
}
interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
}
interface ConversationSummary {
    text: string;
    topic: string;
    key_points: string[];
    message_count: number;
    time_range?: {
        start: string;
        end: string;
    };
}
interface Webhook {
    id: string;
    name: string;
    url: string;
    events: WebhookEvent[];
    namespace?: string | null;
    is_active: boolean;
    secret?: string;
    created_at: string;
}
interface WebhookDelivery {
    id: string;
    webhook_id: string;
    webhook_name?: string;
    event_type: string;
    status: 'pending' | 'success' | 'failed';
    status_code?: number;
    error_message?: string;
    attempt_count: number;
    created_at: string;
    delivered_at?: string;
}
interface AddMemoryOptions {
    memory_type?: MemoryType;
    tags?: string[];
    namespace?: string;
    scope?: MemoryScope;
    session_id?: string;
    agent_id?: string;
    source?: string;
}
interface SearchOptions {
    mode?: SearchMode;
    limit?: number;
    threshold?: number;
    namespace?: string;
}
interface ExtractOptions {
    model?: 'haiku' | 'sonnet';
    auto_store?: boolean;
    namespace?: string;
}
interface QueryOptions {
    model?: 'haiku' | 'sonnet';
    top_k?: number;
    namespace?: string;
    include_memories?: boolean;
}
interface SummarizeOptions {
    model?: 'haiku' | 'sonnet';
    save_memories?: boolean;
    namespace?: string;
}
interface CreateWebhookOptions {
    events?: WebhookEvent[];
    namespace?: string;
}
interface SeiznConfig {
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
}

/**
 * Seizn SDK Client
 *
 * AI Memory Infrastructure for Developers.
 *
 * @example
 * ```typescript
 * import { Seizn } from 'seizn';
 *
 * const client = new Seizn({ apiKey: 'sk_...' });
 *
 * // Add a memory
 * await client.add('User prefers dark mode');
 *
 * // Search memories
 * const results = await client.search('user preferences');
 * ```
 */

declare class SeiznError extends Error {
    status?: number;
    constructor(message: string, status?: number);
}
declare class Seizn {
    private apiKey;
    private baseUrl;
    private timeout;
    static DEFAULT_BASE_URL: string;
    constructor(config: SeiznConfig);
    private request;
    /**
     * Add a new memory.
     */
    add(content: string, options?: AddMemoryOptions): Promise<Memory>;
    /**
     * Get a specific memory by ID.
     */
    get(memoryId: string): Promise<Memory>;
    /**
     * Update a memory.
     */
    update(memoryId: string, updates: {
        memory_type?: MemoryType;
        tags?: string[];
        importance?: number;
    }): Promise<Memory>;
    /**
     * Delete a memory.
     */
    delete(memoryId: string): Promise<boolean>;
    /**
     * Delete multiple memories.
     */
    deleteMany(memoryIds: string[]): Promise<number>;
    /**
     * Search memories.
     */
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Extract memories from a conversation.
     */
    extract(conversation: string, options?: ExtractOptions): Promise<ExtractedMemory[]>;
    /**
     * Query with memory-augmented context (RAG).
     */
    query(query: string, options?: QueryOptions): Promise<QueryResponse>;
    /**
     * Summarize a conversation.
     */
    summarize(messages: ConversationMessage[], options?: SummarizeOptions): Promise<ConversationSummary>;
    /**
     * List all webhooks.
     */
    listWebhooks(): Promise<Webhook[]>;
    /**
     * Create a webhook.
     */
    createWebhook(name: string, url: string, options?: CreateWebhookOptions): Promise<Webhook>;
    /**
     * Update a webhook.
     */
    updateWebhook(webhookId: string, updates: {
        name?: string;
        url?: string;
        events?: string[];
        is_active?: boolean;
    }): Promise<Webhook>;
    /**
     * Delete a webhook.
     */
    deleteWebhook(webhookId: string): Promise<boolean>;
}

export { type AddMemoryOptions, type ConversationMessage, type ConversationSummary, type CreateWebhookOptions, type ExtractOptions, type ExtractedMemory, type Memory, type MemoryScope, type MemoryType, type QueryOptions, type QueryResponse, type SearchMode, type SearchOptions, type SearchResult, Seizn, type SeiznConfig, SeiznError, type SummarizeOptions, type Webhook, type WebhookDelivery, type WebhookEvent };
