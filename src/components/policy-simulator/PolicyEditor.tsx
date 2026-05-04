'use client';

/**
 * PolicyEditor Component
 *
 * YAML editor with syntax highlighting for policy definitions.
 * Includes real-time validation and preview.
 */

import React, { useState, useCallback, useEffect } from 'react';

// ============================================
// Types
// ============================================

interface PolicyEditorProps {
  /** Initial YAML content */
  initialValue?: string;
  /** Callback when content changes */
  onChange?: (value: string) => void;
  /** Callback when validation completes */
  onValidate?: (result: ValidationResult) => void;
  /** Whether editor is read-only */
  readOnly?: boolean;
  /** Height of the editor */
  height?: string | number;
  /** Placeholder text */
  placeholder?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string; code: string }>;
  warnings: Array<{ path: string; message: string; code: string }>;
}

// ============================================
// Default Template
// ============================================

const DEFAULT_POLICY_TEMPLATE = `# Policy Definition
# Supported types: pii_masking, access_control, ttl, scope, content_filter

version: "1.0"
rules:
  - name: mask_emails
    type: pii_masking
    action: mask
    priority: 10
    conditions:
      - field: content
        operator: matches
        value: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}"
    mask_config:
      mask_type: partial
      show_start: 2
      show_end: 4

  - name: block_confidential
    type: content_filter
    action: block
    priority: 20
    conditions:
      - field: metadata.classification
        operator: equals
        value: confidential
`;

// ============================================
// Component
// ============================================

export function PolicyEditor({
  initialValue = '',
  onChange,
  onValidate,
  readOnly = false,
  height = 400,
  placeholder = 'Enter policy YAML...',
}: PolicyEditorProps) {
  const [value, setValue] = useState(initialValue || '');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [lineCount, setLineCount] = useState(1);

  // Update line count
  useEffect(() => {
    setLineCount(value.split('\n').length);
  }, [value]);

  // Debounced validation
  useEffect(() => {
    if (!value.trim()) {
      setValidation(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsValidating(true);
      try {
        const response = await fetch('/api/policies/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy_yaml: value }),
        });

        const result = await response.json();
        const validationResult: ValidationResult = {
          valid: result.valid ?? false,
          errors: result.errors ?? [],
          warnings: result.warnings ?? [],
        };

        setValidation(validationResult);
        onValidate?.(validationResult);
      } catch (err) {
        console.error('Validation error:', err);
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [value, onValidate]);

  // Handle text change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      onChange?.(newValue);
    },
    [onChange]
  );

  // Handle tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const target = e.target as HTMLTextAreaElement;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        setValue(newValue);
        onChange?.(newValue);

        // Restore cursor position
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 2;
        }, 0);
      }
    },
    [value, onChange]
  );

  // Insert template
  const insertTemplate = useCallback(() => {
    setValue(DEFAULT_POLICY_TEMPLATE);
    onChange?.(DEFAULT_POLICY_TEMPLATE);
  }, [onChange]);

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-[var(--ink-900)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--ink-800)] border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400">YAML</span>
          {isValidating && (
            <span className="text-xs text-gray-500">Validating...</span>
          )}
          {validation && !isValidating && (
            <span
              className={`text-xs ${
                validation.valid ? 'text-[var(--signal-canon-ink)]' : 'text-[var(--signal-conflict-ink)]'
              }`}
            >
              {validation.valid ? 'Valid' : `${validation.errors.length} error(s)`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={insertTemplate}
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              Insert Template
            </button>
          )}
          <span className="text-xs text-gray-500">{lineCount} lines</span>
        </div>
      </div>

      {/* Editor */}
      <div className="relative flex" style={{ height }}>
        {/* Line numbers */}
        <div className="flex-shrink-0 w-12 bg-[var(--ink-800)] text-gray-500 text-xs font-mono py-2 text-right pr-2 select-none overflow-hidden">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text area */}
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          className={`
            flex-1 p-2 font-mono text-sm leading-5
            bg-[var(--ink-900)] text-gray-100
            resize-none outline-none
            placeholder:text-gray-600
            ${readOnly ? 'cursor-default' : ''}
          `}
          style={{
            tabSize: 2,
            whiteSpace: 'pre',
            overflowWrap: 'normal',
            overflowX: 'auto',
          }}
        />
      </div>

      {/* Validation Messages */}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="border-t border-gray-700 max-h-32 overflow-y-auto">
          {validation.errors.map((error, i) => (
            <div
              key={`error-${i}`}
              className="flex items-start gap-2 px-3 py-1 text-xs bg-[var(--signal-conflict)]/20 text-[var(--signal-conflict-soft)]"
            >
              <span className="font-mono text-[var(--signal-conflict-ink)]">ERROR</span>
              <span className="text-gray-500">{error.path}:</span>
              <span>{error.message}</span>
            </div>
          ))}
          {validation.warnings.map((warning, i) => (
            <div
              key={`warning-${i}`}
              className="flex items-start gap-2 px-3 py-1 text-xs bg-yellow-900/20 text-yellow-400"
            >
              <span className="font-mono text-[var(--signal-pending-ink)]">WARN</span>
              <span className="text-gray-500">{warning.path}:</span>
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PolicyEditor;
