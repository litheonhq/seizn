'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { useAnalyzeCoach } from '@/hooks/useAuthorMemoryV3';
import {
  STORY_LAYERS,
  auditText,
  type AntiClicheCategory,
  type AntiClicheFinding,
} from '@/lib/author/frameworks';
import { FeatherIcon, SparkIcon } from '../icons';

interface CoachAnalysisResponse {
  hash: string;
  storyLayers: Array<{ layer: string; present: boolean; evidence: string }>;
  characterArcs: Array<{
    characterName: string;
    inferredSacredFlaw: string;
    inferredInternalNeed: string;
    inferredExternalWant: string;
    arcPhaseFit: string;
    arcDirection?: 'positive' | 'negative' | 'flat' | null;
  }>;
  criticNotes: Array<{
    critic: string;
    rating: number;
    suggestions: string[];
  }>;
  antiCliche: AntiClicheFinding[];
  latencyMs: number;
  cached: boolean;
}

export interface CoachViewProps {
  projectId?: string;
}

const CATEGORY_LABEL: Record<AntiClicheCategory, string> = {
  opening: 'Opening',
  emotional: 'Emotional',
  description: 'Description',
  action: 'Action',
  dialogue: 'Dialogue',
  ai_specific: 'AI patterns',
};

function useDebouncedAntiCliche(text: string, delayMs = 300): AntiClicheFinding[] {
  const [findings, setFindings] = useState<AntiClicheFinding[]>([]);
  useEffect(() => {
    const handle = setTimeout(() => {
      setFindings(text ? auditText(text) : []);
    }, delayMs);
    return () => clearTimeout(handle);
  }, [text, delayMs]);
  return findings;
}

export function CoachView({ projectId }: CoachViewProps) {
  const { t } = useDashboardTranslation();
  const [text, setText] = useState('');
  const [serverResult, setServerResult] = useState<CoachAnalysisResponse | null>(null);
  const localFindings = useDebouncedAntiCliche(text);
  const analyze = useAnalyzeCoach(projectId);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const wordCount = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const isReady = projectId && text.trim().length > 0;

  const handleAnalyze = useCallback(async () => {
    if (!isReady) return;
    try {
      const result = (await analyze.trigger({ text })) as unknown as CoachAnalysisResponse;
      setServerResult(result);
    } catch {
      // analyze.error is surfaced by SWR Mutation hook
    }
  }, [analyze, isReady, text]);

  useEffect(() => {
    // Clear stale server result whenever the input text changes
    if (serverResult && serverResult.hash) {
      setServerResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const cliches = serverResult?.antiCliche ?? localFindings;
  const layers = serverResult?.storyLayers ?? [];
  const arcs = serverResult?.characterArcs ?? [];
  const critics = serverResult?.criticNotes ?? [];

  return (
    <div
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
        <textarea
          ref={textAreaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('dashboard.coach.placeholder')}
          spellCheck
          style={{
            flex: 1,
            minHeight: 320,
            padding: '20px 22px',
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-primary)',
            fontFamily: 'inherit',
            fontSize: 14.5,
            lineHeight: 1.65,
            color: 'var(--text-primary)',
            resize: 'vertical',
            outline: 'none',
          }}
        />
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
            }}
          >
            {analyze.isMutating
              ? t('dashboard.coach.analyzing')
              : t('dashboard.coach.analyze')}
          </button>
        </footer>
        {analyze.error ? (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid rgba(201, 100, 66, 0.4)',
              background: 'rgba(201, 100, 66, 0.08)',
              fontSize: 12.5,
              color: 'var(--terracotta-500)',
            }}
          >
            {analyze.error.message}
          </div>
        ) : null}
      </section>
      <aside
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
        <CoachClicheSection findings={cliches} t={t} />
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
    </div>
  );
}

interface SectionProps {
  t: (key: string) => string;
}

function CoachClicheSection({ findings, t }: SectionProps & { findings: AntiClicheFinding[] }) {
  return (
    <SectionShell title={t('dashboard.coach.section.cliche')} count={findings.length}>
      {findings.length === 0 ? (
        <EmptyHint text={t('dashboard.coach.cliche.empty')} />
      ) : (
        <ul style={listReset}>
          {findings.slice(0, 12).map((finding, index) => (
            <li key={`${finding.index}-${index}`} style={listItem}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  &ldquo;{finding.match}&rdquo;
                </span>
                <span style={categoryBadge(finding.category)}>{CATEGORY_LABEL[finding.category]}</span>
              </div>
              <p style={listItemBody}>{finding.reason}</p>
              <p style={listItemHint}>{finding.freshAlternative}</p>
            </li>
          ))}
          {findings.length > 12 ? (
            <li style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>
              + {findings.length - 12} {t('dashboard.coach.cliche.more')}
            </li>
          ) : null}
        </ul>
      )}
    </SectionShell>
  );
}

function CoachLayerSection({
  layers,
  hasServerResult,
  t,
}: SectionProps & {
  layers: CoachAnalysisResponse['storyLayers'];
  hasServerResult: boolean;
}) {
  if (!hasServerResult) {
    return (
      <SectionShell title={t('dashboard.coach.section.layers')}>
        <EmptyHint text={t('dashboard.coach.layers.pending')} />
      </SectionShell>
    );
  }

  return (
    <SectionShell title={t('dashboard.coach.section.layers')}>
      <ul style={listReset}>
        {STORY_LAYERS.map((definition) => {
          const item = layers.find((entry) => entry.layer === definition.id);
          const present = item?.present === true;
          return (
            <li key={definition.id} style={listItem}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: present ? 'var(--green-500, #4f7d3a)' : 'rgba(122, 92, 58, 0.3)',
                  }}
                />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{definition.name}</span>
              </div>
              {item?.evidence ? <p style={listItemBody}>{item.evidence}</p> : null}
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

function CoachArcSection({ arcs, t }: SectionProps & { arcs: CoachAnalysisResponse['characterArcs'] }) {
  return (
    <SectionShell title={t('dashboard.coach.section.arcs')} count={arcs.length}>
      {arcs.length === 0 ? (
        <EmptyHint text={t('dashboard.coach.arcs.empty')} />
      ) : (
        <ul style={listReset}>
          {arcs.map((arc, index) => (
            <li key={`${arc.characterName}-${index}`} style={listItem}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {arc.characterName}
              </div>
              <p style={listItemBody}>
                <strong>{t('dashboard.coach.arc.sacredFlaw')}:</strong> {arc.inferredSacredFlaw}
              </p>
              <p style={listItemBody}>
                <strong>{t('dashboard.coach.arc.want')}:</strong> {arc.inferredExternalWant}
              </p>
              <p style={listItemBody}>
                <strong>{t('dashboard.coach.arc.need')}:</strong> {arc.inferredInternalNeed}
              </p>
              <p style={listItemHint}>{arc.arcPhaseFit}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

function CoachCriticSection({ critics, t }: SectionProps & { critics: CoachAnalysisResponse['criticNotes'] }) {
  return (
    <SectionShell title={t('dashboard.coach.section.critics')} count={critics.length}>
      {critics.length === 0 ? (
        <EmptyHint text={t('dashboard.coach.critics.empty')} />
      ) : (
        <ul style={listReset}>
          {critics.map((critic, index) => (
            <li key={`${critic.critic}-${index}`} style={listItem}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {critic.critic.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{critic.rating} / 5</span>
              </div>
              <ul style={{ ...listReset, paddingLeft: 14, margin: '6px 0 0' }}>
                {critic.suggestions.map((suggestion, suggestionIndex) => (
                  <li key={suggestionIndex} style={{ listStyle: 'disc', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

function SectionShell({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            margin: 0,
          }}
        >
          {title}
        </h3>
        {typeof count === 'number' ? (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{count}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '6px 0' }}>{text}</div>
  );
}

const listReset: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const listItem: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
};

const listItemBody: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12.5,
  lineHeight: 1.55,
  color: 'var(--text-secondary)',
};

const listItemHint: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-tertiary)',
  fontStyle: 'italic',
};

function categoryBadge(category: AntiClicheCategory): React.CSSProperties {
  const palette: Record<AntiClicheCategory, string> = {
    opening: 'rgba(122, 92, 58, 0.18)',
    emotional: 'rgba(201, 100, 66, 0.18)',
    description: 'rgba(216, 168, 109, 0.22)',
    action: 'rgba(122, 92, 58, 0.18)',
    dialogue: 'rgba(112, 130, 152, 0.20)',
    ai_specific: 'rgba(201, 100, 66, 0.26)',
  };
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: 999,
    background: palette[category],
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  };
}
