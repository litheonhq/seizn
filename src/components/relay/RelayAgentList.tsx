'use client';

/**
 * RelayAgentList - Display and manage relay agents
 */

import { useState, useEffect, useCallback } from 'react';
import { type RelayAgent, type RelayAgentStatus } from '@/lib/relay/types';
import { formatRelativeTime } from "@/lib/format-date";


interface RelayAgentListProps {
  apiKey: string;
  onSelectAgent?: (agent: RelayAgent) => void;
}

export function RelayAgentList({ apiKey, onSelectAgent }: RelayAgentListProps) {
  const [agents, setAgents] = useState<RelayAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/relay/agents', {
        headers: {
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch relay agents');
      }

      const data = await response.json();
      setAgents(data.agents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);



  const handleDelete = async (agentId: string, agentName: string) => {
    if (!confirm(`Are you sure you want to delete relay agent "${agentName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/relay/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete relay agent');
      }

      // Refresh list
      fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-[var(--ink-50)] rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/20 border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] rounded-lg">
        <p className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">{error}</p>
        <button
          onClick={fetchAgents}
          className="mt-2 text-sm text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-[var(--ink-200)] rounded-lg">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-[var(--ink-900)]">
          No relay agents
        </h3>
        <p className="mt-2 text-sm text-[var(--ink-600)]">
          Create a relay agent to enable edge federated search.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="p-4 bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-lg hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
          onClick={() => onSelectAgent?.(agent)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-medium text-[var(--ink-900)]">
                  {agent.name}
                </h3>
                <StatusBadge status={agent.status} />
              </div>

              {agent.description && (
                <p className="mt-1 text-sm text-[var(--ink-600)]">
                  {agent.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--ink-600)]">
                <span className="flex items-center gap-1">
                  <CollectionIcon />
                  {agent.collections.length} collection{agent.collections.length !== 1 ? 's' : ''}
                </span>

                <span className="flex items-center gap-1">
                  <RequestIcon />
                  {agent.totalRequests} requests
                </span>

                {agent.avgLatencyMs > 0 && (
                  <span className="flex items-center gap-1">
                    <ClockIcon />
                    {Math.round(agent.avgLatencyMs)}ms avg
                  </span>
                )}

                <span className="flex items-center gap-1">
                  <ModeIcon />
                  {agent.connectionMode}
                </span>
              </div>

              {agent.lastHeartbeat && (
                <p className="mt-2 text-xs text-[var(--ink-500)]">
                  Last heartbeat: {formatRelativeTime(agent.lastHeartbeat)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(agent.id, agent.name);
                }}
                className="p-2 text-gray-400 hover:text-[var(--signal-conflict-ink)] transition-colors"
                title="Delete agent"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function StatusBadge({ status }: { status: RelayAgentStatus }) {
  const styles: Record<RelayAgentStatus, string> = {
    active: 'bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] dark:bg-[var(--signal-canon-ink)]/30 dark:text-[var(--signal-canon-soft)]',
    inactive: 'bg-gray-100 text-gray-800 dark:bg-[var(--ink-900)]/30 dark:text-gray-400',
    error: 'bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] dark:bg-[var(--signal-conflict)]/30 dark:text-[var(--signal-conflict-soft)]',
    maintenance: 'bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] dark:bg-[var(--signal-pending-ink)]/30 dark:text-[var(--signal-pending-soft)]',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
}

// formatRelativeTime imported from @/lib/format-date

// Icons
function CollectionIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function RequestIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ModeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default RelayAgentList;
