'use client';

/**
 * PolicyList Component
 *
 * Displays a list of policies with actions for edit, delete, and activate.
 */

import React, { useState, useEffect, useCallback } from 'react';

// ============================================
// Types
// ============================================

interface Policy {
  id: string;
  name: string;
  description?: string;
  policyType: string;
  version: number;
  isActive: boolean;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PolicyListProps {
  /** API key for authentication */
  apiKey: string;
  /** Filter by policy type */
  filterType?: string;
  /** Callback when a policy is selected */
  onSelect?: (policy: Policy) => void;
  /** Callback when policies are loaded */
  onLoad?: (policies: Policy[]) => void;
  /** Whether to show action buttons */
  showActions?: boolean;
}

// ============================================
// Component
// ============================================

export function PolicyList({
  apiKey,
  filterType,
  onSelect,
  onLoad,
  showActions = true,
}: PolicyListProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch policies
  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);

      const response = await fetch(`/api/policies?${params.toString()}`, {
        headers: { 'x-api-key': apiKey },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch policies');
      }

      const data = await response.json();
      setPolicies(data.policies || []);
      onLoad?.(data.policies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiKey, filterType, onLoad]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  // Handle policy selection
  const handleSelect = useCallback(
    (policy: Policy) => {
      setSelectedId(policy.id);
      onSelect?.(policy);
    },
    [onSelect]
  );

  // Activate policy
  const handleActivate = useCallback(
    async (policyId: string) => {
      setActionLoading(policyId);
      try {
        const response = await fetch(`/api/policies/${policyId}`, {
          method: 'PATCH',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_active: true }),
        });

        if (!response.ok) {
          throw new Error('Failed to activate policy');
        }

        await fetchPolicies();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to activate');
      } finally {
        setActionLoading(null);
      }
    },
    [apiKey, fetchPolicies]
  );

  // Delete policy
  const handleDelete = useCallback(
    async (policyId: string) => {
      if (!confirm('Are you sure you want to delete this policy?')) {
        return;
      }

      setActionLoading(policyId);
      try {
        const response = await fetch(`/api/policies/${policyId}`, {
          method: 'DELETE',
          headers: { 'x-api-key': apiKey },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete policy');
        }

        await fetchPolicies();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete');
      } finally {
        setActionLoading(null);
      }
    },
    [apiKey, fetchPolicies]
  );

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get policy type badge color
  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      pii_masking: 'bg-purple-100 text-purple-800',
      access_control: 'bg-blue-100 text-blue-800',
      ttl: 'bg-green-100 text-green-800',
      scope: 'bg-yellow-100 text-yellow-800',
      content_filter: 'bg-red-100 text-red-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-lg">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchPolicies}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No policies found</p>
        <p className="text-sm text-gray-400 mt-1">
          Create a new policy to get started
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {policies.map((policy) => (
        <div
          key={policy.id}
          className={`
            p-4 hover:bg-gray-50 cursor-pointer transition-colors
            ${selectedId === policy.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}
          `}
          onClick={() => handleSelect(policy)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {policy.name}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeColor(
                    policy.policyType
                  )}`}
                >
                  {policy.policyType.replace('_', ' ')}
                </span>
                {policy.isActive && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                )}
                {policy.isDraft && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                    Draft
                  </span>
                )}
              </div>
              {policy.description && (
                <p className="mt-1 text-sm text-gray-500 truncate">
                  {policy.description}
                </p>
              )}
              <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
                <span>v{policy.version}</span>
                <span>Updated {formatDate(policy.updatedAt)}</span>
              </div>
            </div>

            {showActions && (
              <div className="flex items-center gap-2 ml-4">
                {!policy.isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActivate(policy.id);
                    }}
                    disabled={actionLoading === policy.id}
                    className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                  >
                    {actionLoading === policy.id ? '...' : 'Activate'}
                  </button>
                )}
                {!policy.isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(policy.id);
                    }}
                    disabled={actionLoading === policy.id}
                    className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    {actionLoading === policy.id ? '...' : 'Delete'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PolicyList;
