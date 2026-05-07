'use client';

/**
 * BYOK setup wizard client component.
 *
 * Locked 2026-05-07. 3 steps:
 *   1. Choose provider (Anthropic | OpenAI | both)
 *   2. Paste API key with link to provider console
 *   3. Verify (test call) → persist via /api/account/byok
 *
 * Validation is server-side via /api/onboarding/byok/test. Keys are never
 * logged client-side; the input field uses type="password".
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Provider = 'anthropic' | 'openai';
type Step = 'provider' | 'paste' | 'verify' | 'done';

interface VerifyResponse {
  valid: boolean;
  error?: string;
  hint?: string;
  message?: string;
  provider?: string;
  model?: string;
  cost_estimate_usd?: number;
}

const PROVIDER_INFO: Record<
  Provider,
  { label: string; consoleUrl: string; keyPrefix: string; pricing: string }
> = {
  anthropic: {
    label: 'Anthropic Claude',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-…',
    pricing: 'Opus 4.7: $5 / $25 per MTok (input / output)',
  },
  openai: {
    label: 'OpenAI GPT',
    consoleUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-…',
    pricing: 'GPT-5.5: $5 / $30 per MTok (input / output)',
  },
};

export default function ByokWizardClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('provider');
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const response = await fetch('/api/onboarding/byok/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      const data = (await response.json()) as VerifyResponse;
      setVerifyResult(data);
    } catch (err) {
      setVerifyResult({
        valid: false,
        error: err instanceof Error ? err.message : 'network_error',
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handlePersist() {
    setPersisting(true);
    setPersistError(null);
    try {
      const response = await fetch('/api/account/byok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to save key (${response.status})`);
      }
      setStep('done');
    } catch (err) {
      setPersistError(err instanceof Error ? err.message : 'persist_failed');
    } finally {
      setPersisting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold mb-2">Connect your API key</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Bring your own Anthropic or OpenAI key to use Author Memory v3. Free tier
        includes 50 calls/day, 5 Checks and 5 Dialogs per month.
      </p>

      <ol className="flex gap-3 text-xs text-muted-foreground mb-8">
        <li className={step === 'provider' ? 'font-semibold text-foreground' : ''}>1. Provider</li>
        <li>·</li>
        <li className={step === 'paste' ? 'font-semibold text-foreground' : ''}>2. Paste key</li>
        <li>·</li>
        <li className={step === 'verify' ? 'font-semibold text-foreground' : ''}>3. Verify</li>
      </ol>

      {step === 'provider' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Choose a provider</h2>
          {(Object.keys(PROVIDER_INFO) as Provider[]).map((p) => (
            <label
              key={p}
              className={`block border rounded-lg p-4 cursor-pointer hover:border-primary ${
                provider === p ? 'border-primary' : ''
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={p}
                checked={provider === p}
                onChange={() => setProvider(p)}
                className="mr-3"
              />
              <span className="font-medium">{PROVIDER_INFO[p].label}</span>
              <p className="text-xs text-muted-foreground ml-6 mt-1">
                {PROVIDER_INFO[p].pricing}
              </p>
            </label>
          ))}
          <button
            onClick={() => setStep('paste')}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium"
          >
            Continue
          </button>
        </div>
      )}

      {step === 'paste' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">
            Paste your {PROVIDER_INFO[provider].label} API key
          </h2>
          <p className="text-sm text-muted-foreground">
            Don&apos;t have one? Create a key at{' '}
            <a
              href={PROVIDER_INFO[provider].consoleUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline"
            >
              {PROVIDER_INFO[provider].consoleUrl.replace(/^https?:\/\//, '')}
            </a>
            .
          </p>
          <input
            type="password"
            placeholder={PROVIDER_INFO[provider].keyPrefix}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-4 py-3 border rounded-lg font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Your key is encrypted at rest, never logged, and only used to call the
            provider on your behalf. You can rotate or remove it anytime in Settings.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('provider')}
              className="flex-1 py-3 border rounded-lg"
            >
              Back
            </button>
            <button
              onClick={() => setStep('verify')}
              disabled={apiKey.length < 20}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Verify your key</h2>
          <p className="text-sm text-muted-foreground">
            We&apos;ll make a tiny test call (~$0.001 or free) to confirm the key works.
          </p>
          {!verifyResult && (
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
            >
              {verifying ? 'Testing…' : 'Test key'}
            </button>
          )}
          {verifyResult && verifyResult.valid && (
            <>
              <div className="p-4 border border-green-500 bg-green-50 rounded-lg">
                <p className="text-sm font-medium text-green-900">
                  ✓ Key verified for {verifyResult.provider} ({verifyResult.model})
                </p>
                {verifyResult.message && (
                  <p className="text-xs text-green-800 mt-1">{verifyResult.message}</p>
                )}
              </div>
              <button
                onClick={handlePersist}
                disabled={persisting}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
              >
                {persisting ? 'Saving…' : 'Save & continue'}
              </button>
              {persistError && (
                <p className="text-sm text-red-600">{persistError}</p>
              )}
            </>
          )}
          {verifyResult && !verifyResult.valid && (
            <>
              <div className="p-4 border border-red-500 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-900">✗ Verification failed</p>
                <p className="text-xs text-red-800 mt-1">{verifyResult.error}</p>
                {verifyResult.hint && (
                  <p className="text-xs text-red-800 mt-1">
                    Try regenerating at <span className="font-mono">{verifyResult.hint}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setVerifyResult(null);
                  setStep('paste');
                }}
                className="w-full py-3 border rounded-lg"
              >
                Edit key
              </button>
            </>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="p-6 border border-green-500 bg-green-50 rounded-lg text-center">
            <p className="text-2xl">🎉</p>
            <p className="text-lg font-medium text-green-900 mt-2">You&apos;re ready</p>
            <p className="text-sm text-green-800 mt-1">
              Free tier active: 50 calls/day, 5 Checks &amp; 5 Dialogs per month.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium"
          >
            Go to dashboard
          </button>
        </div>
      )}
    </div>
  );
}
