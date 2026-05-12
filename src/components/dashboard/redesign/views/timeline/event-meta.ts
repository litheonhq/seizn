// Display metadata for each AuthorAuditEventType in the Timeline view.
//
// Each entry pairs an i18n key with an icon. Icons are intentionally reused
// from the existing icon set rather than introducing per-event glyphs --
// the count chip and translated label carry the meaning.

import type { ComponentType } from 'react';
import {
  AuditIcon,
  BookIcon,
  BookmarkIcon,
  BrainIcon,
  ByokIcon,
  CharactersIcon,
  ConflictIcon,
  EditIcon,
  FeatherIcon,
  InboxIcon,
  ReviewIcon,
  SettingsIcon,
  SimulateIcon,
  SparkIcon,
  type IconProps,
} from '../../icons';
import type { AuthorAuditEventType } from '@/lib/author/audit';

export interface TimelineEventMeta {
  /** i18n key resolving to a short verb-phrase ("Analyzed scene with Coach"). */
  labelKey: string;
  /** i18n key resolving to a "Coach reviewed {count} scenes" plural template. */
  groupKey: string;
  icon: ComponentType<IconProps>;
}

const META: Record<AuthorAuditEventType, TimelineEventMeta> = {
  'project.created':         { labelKey: 'dashboard.timeline.event.projectCreated.label',   groupKey: 'dashboard.timeline.event.projectCreated.group',   icon: BookIcon },
  'import.upload':           { labelKey: 'dashboard.timeline.event.importUpload.label',     groupKey: 'dashboard.timeline.event.importUpload.group',     icon: InboxIcon },
  'import.parsed':           { labelKey: 'dashboard.timeline.event.importParsed.label',     groupKey: 'dashboard.timeline.event.importParsed.group',     icon: InboxIcon },
  'import.failed':           { labelKey: 'dashboard.timeline.event.importFailed.label',     groupKey: 'dashboard.timeline.event.importFailed.group',     icon: ConflictIcon },
  'import.retried':          { labelKey: 'dashboard.timeline.event.importRetried.label',    groupKey: 'dashboard.timeline.event.importRetried.group',    icon: InboxIcon },
  'import.deleted':          { labelKey: 'dashboard.timeline.event.importDeleted.label',    groupKey: 'dashboard.timeline.event.importDeleted.group',    icon: InboxIcon },
  'candidate.added':         { labelKey: 'dashboard.timeline.event.candidateAdded.label',   groupKey: 'dashboard.timeline.event.candidateAdded.group',   icon: BookmarkIcon },
  'candidate.decided':       { labelKey: 'dashboard.timeline.event.candidateDecided.label', groupKey: 'dashboard.timeline.event.candidateDecided.group', icon: ReviewIcon },
  'candidate.batch_decided': { labelKey: 'dashboard.timeline.event.candidateBatch.label',   groupKey: 'dashboard.timeline.event.candidateBatch.group',   icon: ReviewIcon },
  'character.updated':       { labelKey: 'dashboard.timeline.event.characterUpdated.label', groupKey: 'dashboard.timeline.event.characterUpdated.group', icon: CharactersIcon },
  'conflict.resolved':       { labelKey: 'dashboard.timeline.event.conflictResolved.label', groupKey: 'dashboard.timeline.event.conflictResolved.group', icon: ConflictIcon },
  'simulation.run':          { labelKey: 'dashboard.timeline.event.simulationRun.label',    groupKey: 'dashboard.timeline.event.simulationRun.group',    icon: SimulateIcon },
  'simulation.replay':       { labelKey: 'dashboard.timeline.event.simulationReplay.label', groupKey: 'dashboard.timeline.event.simulationReplay.group', icon: SimulateIcon },
  'backlog.generated':       { labelKey: 'dashboard.timeline.event.backlogGenerated.label', groupKey: 'dashboard.timeline.event.backlogGenerated.group', icon: SparkIcon },
  'settings.updated':        { labelKey: 'dashboard.timeline.event.settingsUpdated.label',  groupKey: 'dashboard.timeline.event.settingsUpdated.group',  icon: SettingsIcon },
  'byok.updated':            { labelKey: 'dashboard.timeline.event.byokUpdated.label',     groupKey: 'dashboard.timeline.event.byokUpdated.group',      icon: ByokIcon },
  'coach.analysis':          { labelKey: 'dashboard.timeline.event.coachAnalysis.label',    groupKey: 'dashboard.timeline.event.coachAnalysis.group',    icon: FeatherIcon },
};

const FALLBACK: TimelineEventMeta = {
  labelKey: 'dashboard.timeline.event.unknown.label',
  groupKey: 'dashboard.timeline.event.unknown.group',
  icon: AuditIcon,
};

// Touched to keep tree-shaking happy when an icon is unused above. These are
// imported in case future event types want a richer icon set without another edit.
void BrainIcon;
void EditIcon;

export function getTimelineEventMeta(eventType: AuthorAuditEventType | string): TimelineEventMeta {
  return META[eventType as AuthorAuditEventType] ?? FALLBACK;
}
