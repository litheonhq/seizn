import { useRef } from 'react';
import { STORY_LAYERS, type AntiClicheFinding } from '@/lib/author/frameworks';
import { COACH_CLICHE_PANEL_LIMIT } from '@/lib/author/coach/config';
import { XIcon } from '../../icons';
import {
  categoryBadge,
  clicheButtonStyle,
  clicheDismissStyle,
  listItem,
  listItemBody,
  listItemHint,
  listItemKbd,
  listReset,
} from './styles';
import { CATEGORY_LABEL, type CoachAnalysisResponse, type DashboardTranslate } from './types';

interface SectionProps {
  t: DashboardTranslate;
}

export function CoachClicheSection({
  findings,
  onScrollTo,
  onDismiss,
  t,
}: SectionProps & {
  findings: AntiClicheFinding[];
  onScrollTo: (finding: AntiClicheFinding) => void;
  onDismiss: (finding: AntiClicheFinding) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    finding: AntiClicheFinding,
    index: number,
  ) => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-cliche-item]'));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[Math.min(index + 1, items.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[Math.max(index - 1, 0)]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Delete') {
      event.preventDefault();
      onDismiss(finding);
    }
    // Native <button> handles Enter / Space → onClick automatically.
  };

  return (
    <SectionShell title={t('dashboard.coach.section.cliche')} count={findings.length}>
      {findings.length === 0 ? (
        <EmptyHint text={t('dashboard.coach.cliche.empty')} />
      ) : (
        <ul ref={listRef} style={listReset}>
          {findings.slice(0, COACH_CLICHE_PANEL_LIMIT).map((finding, index) => (
            <li key={`${finding.index}-${index}`} style={{ ...listItem, padding: 0, position: 'relative' }}>
              <button
                type="button"
                data-cliche-item="true"
                onClick={() => onScrollTo(finding)}
                onKeyDown={(event) => handleKeyDown(event, finding, index)}
                aria-label={`${t('dashboard.coach.section.cliche')}: ${finding.match}. ${finding.reason}`}
                style={clicheButtonStyle}
                onFocus={(event) => {
                  event.currentTarget.style.boxShadow = '0 0 0 2px rgba(201, 100, 66, 0.32)';
                }}
                onBlur={(event) => {
                  event.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    &ldquo;{finding.match}&rdquo;
                  </span>
                  <span style={categoryBadge(finding.category)}>{CATEGORY_LABEL[finding.category]}</span>
                </div>
                <p style={listItemBody}>{finding.reason}</p>
                <p style={listItemHint}>{finding.freshAlternative}</p>
                <div style={listItemKbd}>{t('dashboard.coach.cliche.kbdHint')}</div>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss(finding);
                }}
                aria-label={t('dashboard.coach.cliche.dismiss')}
                style={clicheDismissStyle}
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
          {findings.length > COACH_CLICHE_PANEL_LIMIT ? (
            <li style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>
              + {findings.length - COACH_CLICHE_PANEL_LIMIT} {t('dashboard.coach.cliche.more')}
            </li>
          ) : null}
        </ul>
      )}
    </SectionShell>
  );
}

export function CoachLayerSection({
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

export function CoachArcSection({
  arcs,
  t,
}: SectionProps & { arcs: CoachAnalysisResponse['characterArcs'] }) {
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

export function CoachCriticSection({
  critics,
  t,
}: SectionProps & { critics: CoachAnalysisResponse['criticNotes'] }) {
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
                  {t(`dashboard.coach.critic.${critic.critic}`)}
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

export function SectionShell({
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

export function EmptyHint({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '6px 0' }}>{text}</div>
  );
}
