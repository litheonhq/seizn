// src/client.ts
var SeiznError = class extends Error {
  constructor(message, status) {
    super(message);
    this.name = "SeiznError";
    this.status = status;
  }
};
var _Seizn = class _Seizn {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || _Seizn.DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = config.timeout || 3e4;
  }
  async request(method, path, options) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== void 0 && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        body: options?.body ? JSON.stringify(options.body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (!response.ok) {
        throw new SeiznError(data.error || "Request failed", response.status);
      }
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SeiznError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SeiznError("Request timeout", 408);
      }
      throw new SeiznError(error instanceof Error ? error.message : "Unknown error");
    }
  }
  // ==================== Memory Operations ====================
  /**
   * Add a new memory.
   */
  async add(content, options) {
    const result = await this.request("POST", "/api/memories", {
      body: {
        content,
        memory_type: options?.memory_type || "fact",
        tags: options?.tags || [],
        namespace: options?.namespace || "default",
        scope: options?.scope,
        session_id: options?.session_id,
        agent_id: options?.agent_id,
        source: options?.source
      }
    });
    return result.memory;
  }
  /**
   * Get a specific memory by ID.
   */
  async get(memoryId) {
    const result = await this.request(
      "GET",
      `/api/memories/${memoryId}`
    );
    return result.memory;
  }
  /**
   * Update a memory.
   */
  async update(memoryId, updates) {
    const result = await this.request(
      "PATCH",
      `/api/memories/${memoryId}`,
      { body: updates }
    );
    return result.memory;
  }
  /**
   * Delete a memory.
   */
  async delete(memoryId) {
    await this.request("DELETE", `/api/memories/${memoryId}`);
    return true;
  }
  /**
   * Delete multiple memories.
   */
  async deleteMany(memoryIds) {
    const result = await this.request(
      "DELETE",
      "/api/memories",
      { params: { ids: memoryIds.join(",") } }
    );
    return result.deleted;
  }
  /**
   * Search memories.
   */
  async search(query, options) {
    const result = await this.request("GET", "/api/memories", {
      params: {
        query,
        mode: options?.mode || "vector",
        limit: options?.limit || 10,
        threshold: options?.threshold || 0.7,
        ...options?.namespace && { namespace: options.namespace }
      }
    });
    return result.results;
  }
  // ==================== AI Operations ====================
  /**
   * Extract memories from a conversation.
   */
  async extract(conversation, options) {
    const result = await this.request("POST", "/api/extract", {
      body: {
        conversation,
        model: options?.model || "haiku",
        auto_store: options?.auto_store ?? true,
        namespace: options?.namespace || "default"
      }
    });
    return result.extracted;
  }
  /**
   * Query with memory-augmented context (RAG).
   */
  async query(query, options) {
    const result = await this.request("POST", "/api/query", {
      body: {
        query,
        model: options?.model || "haiku",
        top_k: options?.top_k || 5,
        namespace: options?.namespace,
        include_memories: options?.include_memories ?? true
      }
    });
    return result;
  }
  /**
   * Summarize a conversation.
   */
  async summarize(messages, options) {
    const result = await this.request("POST", "/api/summarize", {
      body: {
        messages,
        model: options?.model || "haiku",
        save_memories: options?.save_memories || false,
        namespace: options?.namespace || "default"
      }
    });
    return result.summary;
  }
  // ==================== Webhook Operations ====================
  /**
   * List all webhooks.
   */
  async listWebhooks() {
    const result = await this.request(
      "GET",
      "/api/webhooks"
    );
    return result.webhooks;
  }
  /**
   * Create a webhook.
   */
  async createWebhook(name, url, options) {
    const result = await this.request(
      "POST",
      "/api/webhooks",
      {
        body: {
          name,
          url,
          events: options?.events || ["memory.created"],
          namespace: options?.namespace
        }
      }
    );
    return result.webhook;
  }
  /**
   * Update a webhook.
   */
  async updateWebhook(webhookId, updates) {
    const result = await this.request(
      "PATCH",
      "/api/webhooks",
      { body: { id: webhookId, ...updates } }
    );
    return result.webhook;
  }
  /**
   * Delete a webhook.
   */
  async deleteWebhook(webhookId) {
    await this.request("DELETE", "/api/webhooks", { params: { id: webhookId } });
    return true;
  }
};
_Seizn.DEFAULT_BASE_URL = "https://api.seizn.dev";
var Seizn = _Seizn;
export {
  Seizn,
  SeiznError
};
