/**
 * Seizn CrewAI Adapter
 *
 * Provides CrewAI-compatible memory integration for Seizn.
 * CrewAI uses Mem0 by default for user memory — this adapter
 * replaces Mem0 with Seizn as the memory backend.
 *
 * @example
 * ```python
 * # CrewAI configuration (Python — shows the API contract)
 * from crewai import Crew
 *
 * crew = Crew(
 *   agents=[...],
 *   memory=True,
 *   memory_config={
 *     "provider": "seizn",
 *     "config": {
 *       "api_key": "szn_...",
 *       "user_id": "user-123",
 *       "base_url": "https://www.seizn.com/api"
 *     }
 *   }
 * )
 * ```
 *
 * This TypeScript module provides the REST API contract that
 * the Python CrewAI SDK would call.
 */

// ============================================
// Types
// ============================================

export interface CrewAIMemoryConfig {
  apiKey: string;
  baseUrl?: string;
  userId: string;
  agentId?: string;
  crewId?: string;
}

/**
 * CrewAI memory interface — matches Mem0's API contract
 * so CrewAI can use Seizn as a drop-in replacement.
 */
export interface CrewAIMemoryResult {
  id: string;
  memory: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  score?: number;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// CrewAI Memory Provider
// ============================================

export class SeizNCrewAIProvider {
  private config: CrewAIMemoryConfig;
  private baseUrl: string;

  constructor(config: CrewAIMemoryConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://www.seizn.com/api';
  }

  /**
   * Add a memory (CrewAI's mem0.add() equivalent).
   */
  async add(
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<CrewAIMemoryResult> {
    const response = await fetch(`${this.baseUrl}/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        content,
        memory_type: 'fact',
        tags: [
          ...(this.config.agentId ? [`agent:${this.config.agentId}`] : []),
          ...(this.config.crewId ? [`crew:${this.config.crewId}`] : []),
        ],
        source: 'crewai',
        agent_id: this.config.agentId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Seizn API error: ${response.status}`);
    }

    const data = await response.json();
    const memory = data.data?.memory;

    return {
      id: memory?.id || '',
      memory: content,
      metadata,
      created_at: memory?.created_at,
    };
  }

  /**
   * Search memories (CrewAI's mem0.search() equivalent).
   */
  async search(
    query: string,
    limit: number = 5
  ): Promise<CrewAIMemoryResult[]> {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      mode: 'hybrid',
    });

    if (this.config.agentId) {
      params.set('agent_id', this.config.agentId);
    }

    const response = await fetch(`${this.baseUrl}/v1/memories?${params}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const results = data.data?.results || [];

    return results.map(
      (r: {
        id: string;
        content: string;
        similarity: number;
        created_at: string;
        updated_at: string;
      }) => ({
        id: r.id,
        memory: r.content,
        score: r.similarity,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })
    );
  }

  /**
   * Get all memories for the user/agent.
   */
  async getAll(limit: number = 100): Promise<CrewAIMemoryResult[]> {
    return this.search('', limit);
  }

  /**
   * Delete a memory by ID.
   */
  async delete(memoryId: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/v1/memories?ids=${memoryId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      }
    );

    return response.ok;
  }

  /**
   * Get memory history (CrewAI uses this for entity tracking).
   */
  async history(memoryId: string): Promise<CrewAIMemoryResult[]> {
    const response = await fetch(
      `${this.baseUrl}/v1/memories/history?memory_id=${memoryId}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return (data.data?.versions || []).map(
      (v: { id: string; content: string; created_at: string }) => ({
        id: v.id,
        memory: v.content,
        created_at: v.created_at,
      })
    );
  }
}

/**
 * Factory function for CrewAI memory provider.
 */
export function createCrewAIProvider(
  config: CrewAIMemoryConfig
): SeizNCrewAIProvider {
  return new SeizNCrewAIProvider(config);
}
