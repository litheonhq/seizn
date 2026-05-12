'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useAnalyzeCoach } from '@/hooks/useAuthorMemoryV3';
import type { AntiClicheFinding } from '@/lib/author/frameworks';
import { COACH_MAX_INPUT_CHARS } from '@/lib/author/coach/config';
import { FeatherIcon, SparkIcon } from '../icons';
import { buildHighlightedMarkup, escapeHtml } from './coach/markup';
import { classifyAnalyzeError } from './coach/error-classifier';
import { editorBaseStyle, kbdHintStyle } from './coach/styles';
import {
  CoachArcSection,
  CoachClicheSection,
  CoachCriticSection,
  CoachLayerSection,
} from './coach/sections';
import type { CoachAnalysisResponse } from './coach/types';
import {
  findingKey,
  useDebouncedAntiCliche,
} from './coach/use-debounced-anti-cliche';

// Re-exports preserved so the existing unit tests at
// src/__tests__/dashboard/redesign/coach-view.test.tsx keep their import path.
export { buildHighlightedMarkup, escapeHtml };

export interface CoachViewProps {
  projectId?: string;
}

export function CoachView({ projectId }: CoachViewProps) {
  const { t } = useDashboardTranslation();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [serverResult, setServerResult] = useState<CoachAnalysisResponse | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set());
  const localFindings = useDebouncedAntiCliche(text);
  const analyze = useAnalyzeCoach(projectId);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const wordCount = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const isReady = projectId && text.trim().length > 0;

  const handleAnalyze = useCallback(async () => {
    if (!isReady || analyze.isMutating) return;
    try {
      const result = (await analyze.trigger({ text })) as unknown as CoachAnalysisResponse;
      setServerResult(result);
      setDismissedKeys(new Set());
    } catch (error) {
      const message = classifyAnalyzeError(error, t);
      toast('error', message);
    }
  }, [analyze, isReady, text, toast, t]);

  useEffect(() => {
    // Clear stale server result + dismissals whenever the input text changes.
    // Also reset the SWR mutation so a late-arriving response from a previous
    // text submission cannot clobber fresh state.
    if (serverResult && serverResult.hash) {
      setServerResult(null);
    }
    if (dismissedKeys.size > 0) {
      setDismissedKeys(new Set());
    }
    if (analyze.isMutating || analyze.error) {
      analyze.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const rawCliches = serverResult?.antiCliche ?? localFindings;
  const cliches = useMemo(
    () => rawCliches.filter((finding) => !dismissedKeys.has(findingKey(finding))),
    [rawCliches, dismissedKeys]
  );
  const layers = serverResult?.storyLayers ?? [];
  const arcs = serverResult?.characterArcs ?? [];
  const critics = serverResult?.criticNotes ?? [];

  const dismissCliche = useCallback((finding: AntiClicheFinding) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(findingKey(finding));
      return next;
    });
  }, []);

  const scrollToCliche = useCallback((finding: AntiClicheFinding) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    textarea.focus();
    const end = Math.min(text.length, finding.index + finding.match.length);
    textarea.setSelectionRange(finding.index, end);
    // Best-effort scroll: place the selection at ~30% from the top.
    const linesBefore = text.slice(0, finding.index).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight || '24') || 24;
    const desired = Math.max(0, linesBefore * lineHeight - textarea.clientHeight * 0.3);
    textarea.scrollTop = desired;
  }, [text]);

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleAnalyze();
      }
    },
    [handleAnalyze]
  );

  const handleOverlayScroll = useCallback(() => {
    const textarea = textAreaRef.current;
    const overlay = overlayRef.current;
    if (!textarea || !overlay) return;
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  }, []);

  return (
    <div
      className="coach-grid"
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 420px)',
        gap: 0,
        minHeight: 0,
        background: 'var(--bg-elevated)',
      }}
    >
      <section
        style={{
          padding: 32,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'auto',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              display: 'grid',
              placeItems: 'center',
              background:
                'linear-gradient(140deg, rgba(216, 168, 109, 0.22), rgba(201, 100, 66, 0.12))',
              color: 'var(--terracotta-500)',
            }}
          >
            <FeatherIcon size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              className="serif"
              style={{
                fontSize: 22,
                fontStyle: 'italic',
                color: 'var(--text-primary)',
                letterSpacing: '-0.015em',
              }}
            >
              {t('dashboard.coach.title')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('dashboard.coach.subtitle')}
            </div>
          </div>
        </header>
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 320,
            display: 'flex',
          }}
        >
          <div
            ref={overlayRef}
            aria-hidden="true"
            style={editorBaseStyle}
            dangerouslySetInnerHTML={{ __html: buildHighlightedMarkup(text, cliches) }}
          />
          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(event) => {
              const next = event.target.value;
              if (next.length > COACH_MAX_INPUT_CHARS) {
                setText(next.slice(0, COACH_MAX_INPUT_CHARS));
                toast('warning', t('dashboard.coach.error.tooLong'));
              } else {
                setText(next);
              }
            }}
            maxLength={COACH_MAX_INPUT_CHARS}
            onScroll={handleOverlayScroll}
            onKeyDown={handleTextareaKeyDown}
            placeholder={t('dashboard.coach.placeholder')}
            spellCheck
            style={{
              ...editorBaseStyle,
              position: 'relative',
              background: 'transparent',
              color: 'var(--text-primary)',
              resize: 'vertical',
              outline: 'none',
              caretColor: 'var(--terracotta-500)',
            }}
          />
        </div>
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {wordCount} {t('dashboard.coach.words')}
            {cliches.length > 0 ? ` · ${cliches.length} ${t('dashboard.coach.cliches')}` : ''}
            {serverResult?.cached ? ` · ${t('dashboard.coach.cached')}` : ''}
            {serverResult?.latencyMs ? ` · ${serverResult.latencyMs}ms` : ''}
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!isReady || analyze.isMutating}
            aria-label={`${t('dashboard.coach.analyze')} (${t('dashboard.coach.analyzeKbd')})`}
            aria-busy={analyze.isMutating ? true : undefined}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: '0.02em',
              border: 'none',
              cursor: isReady && !analyze.isMutating ? 'pointer' : 'not-allowed',
              background:
                isReady && !analyze.isMutating
                  ? 'var(--terracotta-500)'
                  : 'rgba(201, 100, 66, 0.4)',
              color: '#fff',
              transition: 'background 120ms ease, transform 120ms ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>
              {analyze.isMutating
                ? t('dashboard.coach.analyzing')
                : t('dashboard.coach.analyze')}
            </span>
            <span style={kbdHintStyle} aria-hidden="true">
              {t('dashboard.coach.analyzeKbd')}
            </span>
          </button>
        </footer>
      </section>
      <aside
        className="coach-findings"
        aria-live="polite"
        aria-busy={analyze.isMutating ? true : undefined}
        style={{
          borderLeft: '1px solid var(--border-subtle)',
          padding: 24,
          overflow: 'auto',
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          minHeight: 0,
        }}
      >
        <CoachClicheSection
          findings={cliches}
          onScrollTo={scrollToCliche}
          onDismiss={dismissCliche}
          t={t}
        />
        <CoachLayerSection layers={layers} t={t} hasServerResult={serverResult !== null} />
        <CoachArcSection arcs={arcs} t={t} />
        <CoachCriticSection critics={critics} t={t} />
        {!serverResult && !analyze.isMutating ? (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              border: '1px dashed var(--border-subtle)',
              background: 'rgba(216, 168, 109, 0.06)',
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <SparkIcon size={14} />
            <span>{t('dashboard.coach.runHint')}</span>
          </div>
        ) : null}
      </aside>
      <style>{`
        @media (max-width: 720px) {
          .coach-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: minmax(360px, 1fr) auto;
          }
          .coach-findings {
            border-left: 0 !important;
            border-top: 1px solid var(--border-subtle);
          }
        }
      `}</style>
    </div>
  );
}
