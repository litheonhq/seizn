'use client';

/**
 * SimulationSetup Component
 *
 * Configure and run policy simulations.
 */

import React, { useState, useCallback } from 'react';
import { PolicyEditor } from './PolicyEditor';

// ============================================
// Types
// ============================================

interface Policy {
  id: string;
  name: string;
  policyType: string;
  isActive: boolean;
}

interface SimulationSetupProps {
  /** API key for authentication */
  apiKey: string;
  /** Available policies to select from */
  policies: Policy[];
  /** Callback when simulation starts */
  onSimulationStart?: (simulationId: string) => void;
  /** Callback when simulation completes */
  onSimulationComplete?: (result: SimulationResult) => void;
}

interface SimulationResult {
  simulationId: string;
  status: string;
  summary: {
    totalQueries: number;
    affectedQueries: number;
    blockedChunksCount: number;
    unblockedChunksCount: number;
    maskingChangedCount: number;
    overallImpactScore: number;
    impactLevel: string;
  };
  executionTimeMs: number;
}

type TestPolicyMode = 'existing' | 'yaml';

// ============================================
// Component
// ============================================

export function SimulationSetup({
  apiKey,
  policies,
  onSimulationStart,
  onSimulationComplete,
}: SimulationSetupProps) {
  // State
  const [basePolicyId, setBasePolicyId] = useState<string>('');
  const [testPolicyMode, setTestPolicyMode] = useState<TestPolicyMode>('existing');
  const [testPolicyId, setTestPolicyId] = useState<string>('');
  const [testPolicyYaml, setTestPolicyYaml] = useState<string>('');
  const [maxQueries, setMaxQueries] = useState<number>(50);
  const [inlineQueries, setInlineQueries] = useState<string>('');
  const [isValid, setIsValid] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);

  // Handle validation result
  const handleValidation = useCallback((validation: { valid: boolean }) => {
    setIsValid(validation.valid);
  }, []);

  // Run simulation
  const handleRunSimulation = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        max_queries: maxQueries,
      };

      // Add base policy if selected
      if (basePolicyId) {
        body.base_policy_id = basePolicyId;
      }

      // Add test policy
      if (testPolicyMode === 'existing' && testPolicyId) {
        body.test_policy_id = testPolicyId;
      } else if (testPolicyMode === 'yaml' && testPolicyYaml) {
        body.test_policy_yaml = testPolicyYaml;
      } else {
        throw new Error('Please select or enter a test policy');
      }

      // Add inline queries if provided
      if (inlineQueries.trim()) {
        body.inline_queries = inlineQueries
          .split('\n')
          .map((q) => q.trim())
          .filter((q) => q.length > 0);
      }

      const response = await fetch('/api/policies/simulate', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Simulation failed');
      }

      const simResult: SimulationResult = {
        simulationId: data.simulation_id,
        status: data.status,
        summary: {
          totalQueries: data.summary.total_queries,
          affectedQueries: data.summary.affected_queries,
          blockedChunksCount: data.summary.blocked_chunks_count,
          unblockedChunksCount: data.summary.unblocked_chunks_count,
          maskingChangedCount: data.summary.masking_changed_count,
          overallImpactScore: data.summary.overall_impact_score,
          impactLevel: data.summary.impact_level,
        },
        executionTimeMs: data.execution_time_ms,
      };

      setResult(simResult);
      onSimulationStart?.(simResult.simulationId);
      onSimulationComplete?.(simResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  }, [
    apiKey,
    basePolicyId,
    testPolicyMode,
    testPolicyId,
    testPolicyYaml,
    maxQueries,
    inlineQueries,
    onSimulationStart,
    onSimulationComplete,
  ]);

  // Get active policies
  const activePolicies = policies.filter((p) => p.isActive);
  const allPolicies = policies;

  // Can run simulation?
  const canRun =
    !isRunning &&
    (testPolicyMode === 'existing' ? testPolicyId : isValid && testPolicyYaml);

  return (
    <div className="space-y-6">
      {/* Base Policy Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Base Policy (Current)
        </label>
        <select
          value={basePolicyId}
          onChange={(e) => setBasePolicyId(e.target.value)}
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">No base policy (compare against no policy)</option>
          {activePolicies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.policyType}) - Active
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500">
          Select the current production policy to compare against
        </p>
      </div>

      {/* Test Policy Mode */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Test Policy (Proposed Changes)
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="testPolicyMode"
              value="existing"
              checked={testPolicyMode === 'existing'}
              onChange={() => setTestPolicyMode('existing')}
              className="text-blue-600"
            />
            <span className="text-sm">Select existing policy</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="testPolicyMode"
              value="yaml"
              checked={testPolicyMode === 'yaml'}
              onChange={() => setTestPolicyMode('yaml')}
              className="text-blue-600"
            />
            <span className="text-sm">Enter YAML</span>
          </label>
        </div>
      </div>

      {/* Test Policy Selection/Editor */}
      {testPolicyMode === 'existing' ? (
        <div className="space-y-2">
          <select
            value={testPolicyId}
            onChange={(e) => setTestPolicyId(e.target.value)}
            className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a policy...</option>
            {allPolicies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.policyType}) {p.isActive ? '- Active' : ''}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <PolicyEditor
          initialValue={testPolicyYaml}
          onChange={setTestPolicyYaml}
          onValidate={handleValidation}
          height={300}
        />
      )}

      {/* Query Configuration */}
      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700">Query Configuration</h4>

        <div className="space-y-2">
          <label className="block text-sm text-gray-600">
            Max Queries to Test
          </label>
          <input
            type="number"
            value={maxQueries}
            onChange={(e) => setMaxQueries(parseInt(e.target.value) || 50)}
            min={1}
            max={1000}
            className="w-32 px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-gray-600">
            Test Queries (optional, one per line)
          </label>
          <textarea
            value={inlineQueries}
            onChange={(e) => setInlineQueries(e.target.value)}
            placeholder="Enter specific queries to test, one per line..."
            rows={3}
            className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500">
            Leave empty to use recent queries from traces
          </p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-lg">
          <p className="text-[var(--signal-conflict-ink)]">{error}</p>
        </div>
      )}

      {/* Run Button */}
      <div className="flex justify-end">
        <button
          onClick={handleRunSimulation}
          disabled={!canRun}
          className={`
            px-6 py-2 rounded-md font-medium
            ${
              canRun
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Running Simulation...
            </span>
          ) : (
            'Run Simulation'
          )}
        </button>
      </div>

      {/* Quick Results */}
      {result && (
        <div className="p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">
              Simulation Complete
            </h4>
            <span className="text-xs text-gray-500">
              {result.executionTimeMs}ms
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Queries Tested</p>
              <p className="text-lg font-semibold">{result.summary.totalQueries}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Affected Queries</p>
              <p className="text-lg font-semibold">{result.summary.affectedQueries}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Impact Score</p>
              <p
                className={`text-lg font-semibold ${
                  result.summary.impactLevel === 'critical'
                    ? 'text-[var(--signal-conflict-ink)]'
                    : result.summary.impactLevel === 'high'
                    ? 'text-orange-600'
                    : result.summary.impactLevel === 'medium'
                    ? 'text-[var(--signal-pending-ink)]'
                    : 'text-[var(--signal-canon-ink)]'
                }`}
              >
                {(result.summary.overallImpactScore * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Impact Level</p>
              <p
                className={`text-lg font-semibold capitalize ${
                  result.summary.impactLevel === 'critical'
                    ? 'text-[var(--signal-conflict-ink)]'
                    : result.summary.impactLevel === 'high'
                    ? 'text-orange-600'
                    : result.summary.impactLevel === 'medium'
                    ? 'text-[var(--signal-pending-ink)]'
                    : 'text-[var(--signal-canon-ink)]'
                }`}
              >
                {result.summary.impactLevel}
              </p>
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <span className="text-[var(--signal-conflict-ink)]">
              +{result.summary.blockedChunksCount} blocked
            </span>
            <span className="text-[var(--signal-canon-ink)]">
              +{result.summary.unblockedChunksCount} unblocked
            </span>
            <span className="text-[var(--signal-pending-ink)]">
              {result.summary.maskingChangedCount} masking changed
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SimulationSetup;
