'use client';

/**
 * Test Case Editor Component
 *
 * Create and edit individual test cases
 */

import { useState } from 'react';


interface TestCase {
  id?: string;
  name?: string;
  query: string;
  test_type: 'positive' | 'negative' | 'edge_case';
  expected_doc_ids: string[];
  expected_keywords: string[];
  expected_not_keywords: string[];
  min_score: number;
  max_latency_ms: number;
  is_active: boolean;
}

interface TestCaseEditorProps {
  apiKey: string;
  suiteId: string;
  testCase?: TestCase;
  onSave?: (testCase: TestCase) => void;
  onCancel?: () => void;
}

export function TestCaseEditor({
  apiKey,
  suiteId,
  testCase,
  onSave,
  onCancel,
}: TestCaseEditorProps) {
  const [formData, setFormData] = useState<TestCase>({
    query: '',
    test_type: 'positive',
    expected_doc_ids: [],
    expected_keywords: [],
    expected_not_keywords: [],
    min_score: 0.7,
    max_latency_ms: 5000,
    is_active: true,
    ...testCase,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyword input states
  const [keywordInput, setKeywordInput] = useState('');
  const [notKeywordInput, setNotKeywordInput] = useState('');
  const [docIdInput, setDocIdInput] = useState('');

  const isEditing = !!testCase?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/testing/cases/${testCase.id}`
        : '/api/testing/cases';

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          ...formData,
          suite_id: suiteId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to save test case');
      }

      onSave?.(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const addKeyword = (type: 'expected' | 'not' | 'doc') => {
    const input = type === 'expected' ? keywordInput : type === 'not' ? notKeywordInput : docIdInput;
    const trimmed = input.trim();
    if (!trimmed) return;

    if (type === 'expected') {
      if (!formData.expected_keywords.includes(trimmed)) {
        setFormData({
          ...formData,
          expected_keywords: [...formData.expected_keywords, trimmed],
        });
      }
      setKeywordInput('');
    } else if (type === 'not') {
      if (!formData.expected_not_keywords.includes(trimmed)) {
        setFormData({
          ...formData,
          expected_not_keywords: [...formData.expected_not_keywords, trimmed],
        });
      }
      setNotKeywordInput('');
    } else {
      if (!formData.expected_doc_ids.includes(trimmed)) {
        setFormData({
          ...formData,
          expected_doc_ids: [...formData.expected_doc_ids, trimmed],
        });
      }
      setDocIdInput('');
    }
  };

  const removeKeyword = (type: 'expected' | 'not' | 'doc', keyword: string) => {
    if (type === 'expected') {
      setFormData({
        ...formData,
        expected_keywords: formData.expected_keywords.filter((k) => k !== keyword),
      });
    } else if (type === 'not') {
      setFormData({
        ...formData,
        expected_not_keywords: formData.expected_not_keywords.filter((k) => k !== keyword),
      });
    } else {
      setFormData({
        ...formData,
        expected_doc_ids: formData.expected_doc_ids.filter((k) => k !== keyword),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-lg p-4">
          <p className="text-[var(--signal-conflict-ink)]">{error}</p>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name (optional)
        </label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Test case name"
        />
      </div>

      {/* Query */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Query <span className="text-[var(--signal-conflict-ink)]">*</span>
        </label>
        <textarea
          value={formData.query}
          onChange={(e) => setFormData({ ...formData, query: e.target.value })}
          required
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter the test query..."
        />
      </div>

      {/* Test Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Test Type
        </label>
        <div className="flex gap-4">
          {(['positive', 'negative', 'edge_case'] as const).map((type) => (
            <label key={type} className="flex items-center gap-2">
              <input
                type="radio"
                name="test_type"
                value={type}
                checked={formData.test_type === type}
                onChange={() => setFormData({ ...formData, test_type: type })}
                className="text-blue-600"
              />
              <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {formData.test_type === 'positive' && 'Query should retrieve relevant documents'}
          {formData.test_type === 'negative' && 'Query should NOT find the answer in documents'}
          {formData.test_type === 'edge_case' && 'Tricky or ambiguous query for edge case testing'}
        </p>
      </div>

      {/* Expected Keywords */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Expected Keywords
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword('expected'))}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="Add keyword..."
          />
          <button
            type="button"
            onClick={() => addKeyword('expected')}
            className="px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.expected_keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] text-sm rounded"
            >
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword('expected', kw)}
                className="text-[var(--signal-canon-ink)] hover:text-[var(--signal-canon-ink)]"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Forbidden Keywords (for negative tests) */}
      {formData.test_type === 'negative' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Forbidden Keywords (should NOT appear)
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={notKeywordInput}
              onChange={(e) => setNotKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword('not'))}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Add forbidden keyword..."
            />
            <button
              type="button"
              onClick={() => addKeyword('not')}
              className="px-3 py-2 bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] rounded-md hover:bg-[var(--signal-conflict-soft)] text-sm"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.expected_not_keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] text-sm rounded"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => removeKeyword('not', kw)}
                  className="text-[var(--signal-conflict-ink)] hover:text-[var(--signal-conflict-ink)]"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Expected Document IDs */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Expected Document IDs
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={docIdInput}
            onChange={(e) => setDocIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword('doc'))}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="Add document ID..."
          />
          <button
            type="button"
            onClick={() => addKeyword('doc')}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.expected_doc_ids.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded font-mono"
            >
              {id.slice(0, 8)}...
              <button
                type="button"
                onClick={() => removeKeyword('doc', id)}
                className="text-gray-600 hover:text-gray-800"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Thresholds */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Score
          </label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={formData.min_score}
            onChange={(e) => setFormData({ ...formData, min_score: parseFloat(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Latency (ms)
          </label>
          <input
            type="number"
            min="100"
            max="30000"
            step="100"
            value={formData.max_latency_ms}
            onChange={(e) => setFormData({ ...formData, max_latency_ms: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !formData.query.trim()}
          className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-md"
        >
          {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default TestCaseEditor;
