'use client';

/**
 * RelaySetupWizard - Guide users through setting up a new relay agent
 */

import { useState } from 'react';
import { type CreateRelayAgentInput, type RelayConnectionMode } from '@/lib/relay/types';

interface RelaySetupWizardProps {
  apiKey: string;
  onComplete?: (agentKey: string) => void;
  onCancel?: () => void;
}

type Step = 'basics' | 'collections' | 'mode' | 'deploy';

export function RelaySetupWizard({ apiKey, onComplete, onCancel }: RelaySetupWizardProps) {
  const [step, setStep] = useState<Step>('basics');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [collections, setCollections] = useState<string[]>(['']);
  const [connectionMode, setConnectionMode] = useState<RelayConnectionMode>('callback');
  const [endpointUrl, setEndpointUrl] = useState('');

  const handleNext = () => {
    const steps: Step[] = ['basics', 'collections', 'mode', 'deploy'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const steps: Step[] = ['basics', 'collections', 'mode', 'deploy'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleCreate = async () => {
    try {
      setLoading(true);
      setError(null);

      const input: CreateRelayAgentInput = {
        name,
        description: description || undefined,
        collections: collections.filter(Boolean),
        connectionMode,
        endpointUrl: connectionMode === 'direct' || connectionMode === 'hybrid' ? endpointUrl : undefined,
      };

      const response = await fetch('/api/relay/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to create relay agent');
      }

      const data = await response.json();
      setAgentKey(data.agent.agentKey);
      setStep('deploy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (agentKey) {
      navigator.clipboard.writeText(agentKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const addCollection = () => {
    setCollections([...collections, '']);
  };

  const removeCollection = (index: number) => {
    setCollections(collections.filter((_, i) => i !== index));
  };

  const updateCollection = (index: number, value: string) => {
    const updated = [...collections];
    updated[index] = value;
    setCollections(updated);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex justify-between">
          {['basics', 'collections', 'mode', 'deploy'].map((s, index) => (
            <div
              key={s}
              className={`flex items-center ${index < 3 ? 'flex-1' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? 'bg-blue-600 text-white'
                    : ['basics', 'collections', 'mode', 'deploy'].indexOf(step) > index
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {['basics', 'collections', 'mode', 'deploy'].indexOf(step) > index ? (
                  <CheckIcon />
                ) : (
                  index + 1
                )}
              </div>
              {index < 3 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    ['basics', 'collections', 'mode', 'deploy'].indexOf(step) > index
                      ? 'bg-green-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Basics</span>
          <span>Collections</span>
          <span>Mode</span>
          <span>Deploy</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Step content */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        {step === 'basics' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Basic Information
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Give your relay agent a name and description.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., production-vpc-relay"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Handles vector search for internal documents"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {step === 'collections' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Collections
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Specify which collection IDs this relay will serve. These should match
              the collections in your local vector database.
            </p>

            {collections.map((collection, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={collection}
                  onChange={(e) => updateCollection(index, e.target.value)}
                  placeholder="collection-id"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {collections.length > 1 && (
                  <button
                    onClick={() => removeCollection(index)}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={addCollection}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              + Add another collection
            </button>
          </div>
        )}

        {step === 'mode' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Connection Mode
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Choose how your relay communicates with Seizn cloud.
            </p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-700">
                <input
                  type="radio"
                  name="mode"
                  value="callback"
                  checked={connectionMode === 'callback'}
                  onChange={() => setConnectionMode('callback')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    Callback Mode (Recommended)
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Relay polls for requests and pushes results. Best for relays behind NAT/firewall.
                    No inbound internet access required.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-700">
                <input
                  type="radio"
                  name="mode"
                  value="direct"
                  checked={connectionMode === 'direct'}
                  onChange={() => setConnectionMode('direct')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    Direct Mode
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Seizn calls your relay directly. Lowest latency but requires public endpoint.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-700">
                <input
                  type="radio"
                  name="mode"
                  value="hybrid"
                  checked={connectionMode === 'hybrid'}
                  onChange={() => setConnectionMode('hybrid')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    Hybrid Mode
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Supports both modes. Uses direct when available, falls back to callback.
                  </div>
                </div>
              </label>
            </div>

            {(connectionMode === 'direct' || connectionMode === 'hybrid') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Relay Endpoint URL
                </label>
                <input
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://relay.your-domain.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>
        )}

        {step === 'deploy' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Deploy Your Relay
            </h2>

            {agentKey ? (
              <>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                    <CheckIcon />
                    <span className="font-medium">Agent created successfully!</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Save your agent key below. It will not be shown again.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Agent Key
                  </label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono break-all">
                      {agentKey}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Quick Start with Docker
                  </h3>
                  <pre className="p-4 bg-gray-900 text-green-400 rounded-lg text-sm overflow-x-auto">
{`docker run -d \\
  --name seizn-relay \\
  -e SEIZN_RELAY_AGENT_KEY=${agentKey} \\
  -e SEIZN_RELAY_COLLECTIONS=${collections.filter(Boolean).join(',')} \\
  -e VECTOR_DB_TYPE=pgvector \\
  -e VECTOR_DB_CONNECTION_STRING=your_connection_string \\
  ghcr.io/seizn/relay-agent:latest`}
                  </pre>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  Ready to create your relay agent with the following settings:
                </p>
                <dl className="text-left max-w-md mx-auto space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-gray-600 dark:text-gray-400">Name:</dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">{name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600 dark:text-gray-400">Collections:</dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">
                      {collections.filter(Boolean).length}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600 dark:text-gray-400">Mode:</dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">{connectionMode}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={step === 'basics' ? onCancel : handleBack}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          {step === 'basics' ? 'Cancel' : 'Back'}
        </button>

        {step !== 'deploy' ? (
          <button
            onClick={step === 'mode' ? handleCreate : handleNext}
            disabled={
              (step === 'basics' && !name) ||
              (step === 'collections' && collections.filter(Boolean).length === 0) ||
              loading
            }
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md"
          >
            {loading ? 'Creating...' : step === 'mode' ? 'Create Agent' : 'Next'}
          </button>
        ) : (
          <button
            onClick={() => onComplete?.(agentKey || '')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default RelaySetupWizard;
