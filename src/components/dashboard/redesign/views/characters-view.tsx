'use client';

import { useState } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { Avatar, Tag } from '../atoms';
import { EmptyState } from '../empty-state';
import { ChevronRightIcon, MoreIcon, PlusIcon, SearchIcon } from '../icons';
import { ICON_BTN_TOPBAR } from '../top-bar';
import type { CharacterDetail, CharacterSummary } from './types';

const GRID_COLUMNS = '32px 1.4fr 0.9fr 60px 60px 80px 24px';

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: 8,
};

interface CharRowProps {
  character: CharacterSummary;
  selected: boolean;
  onClick: () => void;
  roleLabel: string;
}

function CharRow({ character, selected, onClick, roleLabel }: CharRowProps) {
  const [hover, setHover] = useState(false);
  const background = selected
    ? 'rgba(201, 100, 66, 0.06)'
    : hover
    ? 'var(--ink-25)'
    : 'transparent';
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-current={selected ? 'true' : undefined}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        width: '100%',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: GRID_COLUMNS,
        alignItems: 'center',
        gap: 14,
        padding: '10px 18px',
        background,
        borderLeft: `2px solid ${selected ? 'var(--terracotta-500)' : 'transparent'}`,
        fontSize: 13,
      }}
    >
      <Avatar name={character.name} color={character.color} size={28} />
      <div style={{ minWidth: 0 }}>
        <div
          className="serif"
          style={{
            fontSize: 14.5,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.012em',
          }}
        >
          {character.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          {character.aka}
        </div>
      </div>
      <div>
        <Tag
          tone={
            character.role === 'Lead'
              ? 'terracotta'
              : character.role === 'Supporting'
              ? 'cream'
              : 'ink'
          }
          size="xs"
        >
          {roleLabel}
        </Tag>
      </div>
      <div
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-secondary)',
          fontSize: 12.5,
        }}
      >
        {character.episodes}
      </div>
      <div
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-secondary)',
          fontSize: 12.5,
        }}
      >
        {character.relations}
      </div>
      <div>
        {character.conflicts > 0 ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: 'var(--terracotta-700)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: 'var(--terracotta-500)',
              }}
              aria-hidden="true"
            />
            {character.conflicts}
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
        )}
      </div>
      <span
        style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end' }}
        aria-hidden="true"
      >
        <ChevronRightIcon size={14} />
      </span>
    </button>
  );
}

interface CharDetailPanelProps {
  detail: CharacterDetail;
}

function CharDetailPanel({ detail }: CharDetailPanelProps) {
  const { t } = useDashboardTranslation();
  return (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--ink-25)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '20px 22px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          <Avatar name={detail.name} color={detail.color} size={48} ring />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="serif"
              style={{
                fontSize: 22,
                fontWeight: 500,
                fontStyle: 'italic',
                letterSpacing: '-0.018em',
                color: 'var(--text-primary)',
              }}
            >
              {detail.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {detail.aka}
            </div>
          </div>
          <button type="button" aria-label="More" style={ICON_BTN_TOPBAR}>
            <MoreIcon size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11.5 }}>
          {[
            { l: 'Episodes', v: detail.episodes, accent: false },
            { l: 'Relations', v: detail.relations, accent: false },
            { l: 'Conflicts', v: detail.conflicts, accent: detail.conflicts > 0 },
          ].map((stat) => (
            <div key={stat.l}>
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {stat.l}
              </div>
              <div
                className="serif"
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  color: stat.accent ? 'var(--terracotta-700)' : 'var(--text-primary)',
                  marginTop: 2,
                }}
              >
                {stat.v}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
        <div style={SECTION_LABEL}>
          {t('dashboard.characters.detail.canonFacts')}{' '}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
            · {detail.canonFacts.length}
          </span>
        </div>
        {detail.canonFacts.map((fact, i) => (
          <div
            key={`${fact.ep}-${i}`}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              marginBottom: 4,
              background: fact.warn ? 'var(--terracotta-50)' : 'transparent',
              border: fact.warn
                ? '1px solid rgba(201, 100, 66, 0.18)'
                : '1px solid transparent',
              display: 'flex',
              gap: 10,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: fact.warn ? 'var(--terracotta-700)' : 'var(--text-muted)',
                flexShrink: 0,
                paddingTop: 2,
                minWidth: 38,
              }}
            >
              {fact.ep}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {fact.text}
            </span>
          </div>
        ))}

        <div style={{ ...SECTION_LABEL, marginTop: 18 }}>
          {t('dashboard.characters.detail.relationships')}
        </div>
        {detail.relationships.map((rel, i) => (
          <div
            key={`${rel.toId}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom:
                i < detail.relationships.length - 1
                  ? '1px solid var(--border-subtle)'
                  : 'none',
            }}
          >
            <Avatar name={rel.name} color={rel.color} size={24} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{rel.name}</span>
            <Tag tone={rel.conflict ? 'terracotta' : 'ink'} size="xs">
              {rel.kind}
            </Tag>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface CharactersViewProps {
  characters: CharacterSummary[];
  detail: (id: string) => CharacterDetail | undefined;
}

export function CharactersView({ characters, detail }: CharactersViewProps) {
  const { t } = useDashboardTranslation();
  const [selectedId, setSelectedId] = useState(characters[0]?.id ?? '');

  if (characters.length === 0) {
    return (
      <div style={{ flex: 1, background: 'var(--bg-elevated)', display: 'flex' }}>
        <EmptyState
          kind="characters"
          title={t('dashboard.characters.empty')}
          body={t('dashboard.characters.emptyBody')}
          primary={t('dashboard.characters.emptyCta')}
        />
      </div>
    );
  }

  const selected = characters.find((c) => c.id === selectedId) ?? characters[0];
  const selectedDetail = selected
    ? detail(selected.id) ?? {
        ...selected,
        canonFacts: [],
        relationships: [],
      }
    : undefined;

  const roleLabel = (role: string) =>
    role === 'Lead'
      ? t('dashboard.characters.role.lead')
      : role === 'Supporting'
      ? t('dashboard.characters.role.supporting')
      : t('dashboard.characters.role.minor');

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
        }}
      >
        <div
          style={{
            padding: '14px 22px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            className="serif"
            style={{
              fontSize: 19,
              fontWeight: 500,
              fontStyle: 'italic',
              letterSpacing: '-0.018em',
            }}
          >
            {t('dashboard.characters.title')}
          </span>
          <Tag tone="cream" size="xs">
            {characters.length}
          </Tag>
          <span style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              background: 'var(--ink-25)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 7,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ display: 'flex' }}>
              <SearchIcon size={14} />
            </span>
            <span>{t('dashboard.characters.filter')}</span>
          </div>
          <button
            type="button"
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'var(--ink-900)',
              color: 'var(--ink-25)',
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 7,
            }}
          >
            <PlusIcon size={14} /> {t('dashboard.characters.add')}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID_COLUMNS,
            alignItems: 'center',
            gap: 14,
            padding: '8px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            background: 'var(--ink-25)',
          }}
        >
          <span />
          <span>{t('dashboard.characters.col.name')}</span>
          <span>{t('dashboard.characters.col.role')}</span>
          <span style={{ textAlign: 'left' }}>{t('dashboard.characters.col.episodes')}</span>
          <span style={{ textAlign: 'left' }}>{t('dashboard.characters.col.relations')}</span>
          <span>{t('dashboard.characters.col.conflicts')}</span>
          <span />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {characters.map((c) => (
            <CharRow
              key={c.id}
              character={c}
              selected={c.id === (selected?.id ?? '')}
              onClick={() => setSelectedId(c.id)}
              roleLabel={roleLabel(c.role)}
            />
          ))}
          <button
            type="button"
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '32px 1fr',
              gap: 14,
              padding: '14px 18px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 13,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '1.5px dashed var(--border-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlusIcon size={14} />
            </div>
            <span>{t('dashboard.characters.add')}</span>
          </button>
        </div>
      </div>
      {selectedDetail && <CharDetailPanel detail={selectedDetail} />}
    </div>
  );
}
