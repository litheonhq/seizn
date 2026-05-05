import { describe, expect, it } from 'vitest';
import en from '@/i18n/dictionaries/en.json';
import ko from '@/i18n/dictionaries/ko.json';
import ja from '@/i18n/dictionaries/ja.json';
import zhHans from '@/i18n/dictionaries/zh-hans.json';
import zhHant from '@/i18n/dictionaries/zh-hant.json';

const REDESIGN_PATHS = [
  'dashboard.nav.inbox',
  'dashboard.nav.review',
  'dashboard.nav.characters',
  'dashboard.nav.graph',
  'dashboard.nav.timeline',
  'dashboard.nav.conflicts',
  'dashboard.nav.simulate',
  'dashboard.nav.audit',
  'dashboard.nav.byok',
  'dashboard.nav.groups.workspace',
  'dashboard.nav.groups.memory',
  'dashboard.nav.groups.account',
  'dashboard.workspace.switcher.studio',
  'dashboard.workspace.switcher.entries',
  'dashboard.memoryHealth.synced',
  'dashboard.memoryHealth.syncing',
  'dashboard.memoryHealth.error',
  'dashboard.memoryHealth.factsCount',
  'dashboard.topBar.workspace',
  'dashboard.topBar.search',
  'dashboard.topBar.command',
  'dashboard.topBar.write',
  'dashboard.topBar.notifications',
  'dashboard.topBar.toggleSidebar',
  'dashboard.inbox.title',
  'dashboard.inbox.newCount',
  'dashboard.inbox.filter.all',
  'dashboard.inbox.filter.conflicts',
  'dashboard.inbox.filter.reviews',
  'dashboard.inbox.filter.characters',
  'dashboard.inbox.empty',
  'dashboard.inbox.detail.evidence',
  'dashboard.inbox.detail.suggestion',
  'dashboard.inbox.detail.memorySuggests',
  'dashboard.inbox.detail.applySuggestion',
  'dashboard.inbox.detail.openIn',
  'dashboard.inbox.detail.notConflict',
  'dashboard.inbox.priority',
  'dashboard.characters.title',
  'dashboard.characters.add',
  'dashboard.characters.filter',
  'dashboard.characters.col.name',
  'dashboard.characters.col.role',
  'dashboard.characters.col.episodes',
  'dashboard.characters.col.relations',
  'dashboard.characters.col.conflicts',
  'dashboard.characters.role.lead',
  'dashboard.characters.role.supporting',
  'dashboard.characters.role.minor',
  'dashboard.characters.detail.canonFacts',
  'dashboard.characters.detail.relationships',
  'dashboard.graph.title',
  'dashboard.graph.summary',
  'dashboard.graph.mode.force',
  'dashboard.graph.mode.radial',
  'dashboard.graph.mode.hierarchy',
  'dashboard.graph.legend.lead',
  'dashboard.graph.legend.supporting',
  'dashboard.graph.legend.minor',
  'dashboard.graph.legend.tie',
  'dashboard.graph.legend.conflict',
  'dashboard.graph.detail.directTies',
  'dashboard.graph.detail.tieStrength',
  'dashboard.graph.detail.avgStrength',
  'dashboard.conflicts.title',
  'dashboard.conflicts.criticalCount',
  'dashboard.conflicts.warningCount',
  'dashboard.conflicts.severity.p1',
  'dashboard.conflicts.severity.p2',
  'dashboard.conflicts.severity.p3',
  'dashboard.conflicts.action.resolve',
  'dashboard.conflicts.action.openEvidence',
  'dashboard.conflicts.action.dismiss',
  'dashboard.simulate.empty.title',
  'dashboard.simulate.empty.body',
  'dashboard.simulate.empty.cta',
  'dashboard.simulate.hint.new',
  'dashboard.simulate.hint.help',
  'dashboard.fallback.body',
  'dashboard.account.apiKeys.title',
  'dashboard.account.apiKeys.description',
  'dashboard.account.apiKeys.capHint',
  'dashboard.account.apiKeys.newKey',
  'dashboard.account.apiKeys.create',
  'dashboard.account.apiKeys.cancel',
  'dashboard.account.apiKeys.done',
  'dashboard.account.apiKeys.name',
  'dashboard.account.apiKeys.scopes',
  'dashboard.account.apiKeys.scopesDefault',
  'dashboard.account.apiKeys.copyKey',
  'dashboard.account.apiKeys.saveItNow',
  'dashboard.account.apiKeys.created',
  'dashboard.account.apiKeys.rotated',
  'dashboard.account.apiKeys.rotate',
  'dashboard.account.apiKeys.revoke',
  'dashboard.account.apiKeys.revokeTitle',
  'dashboard.account.apiKeys.revokeBody',
  'dashboard.account.apiKeys.rotateTitle',
  'dashboard.account.apiKeys.rotateBody',
  'dashboard.account.apiKeys.usage',
  'dashboard.account.apiKeys.rateLimit',
  'dashboard.account.apiKeys.lastUsed',
  'dashboard.account.apiKeys.createdAt',
  'dashboard.account.apiKeys.empty',
  'dashboard.account.apiKeys.errors.capReached',
  'dashboard.account.apiKeys.errors.invalidName',
  'dashboard.account.apiKeys.errors.internal',
  'dashboard.account.apiKeys.errors.revokeFailed',
  'dashboard.account.apiKeys.errors.rotateFailed',
  'dashboard.account.apiKeys.errors.copyFailed',
  'dashboard.account.apiKeys.toasts.copied',
  'dashboard.account.apiKeys.toasts.revoked',
  'dashboard.account.apiKeys.audit.link',
  'dashboard.account.apiKeys.audit.title',
  'dashboard.account.apiKeys.audit.description',
  'dashboard.account.apiKeys.audit.filterAction',
  'dashboard.account.apiKeys.audit.from',
  'dashboard.account.apiKeys.audit.to',
  'dashboard.account.apiKeys.audit.reset',
  'dashboard.account.apiKeys.audit.exportCsv',
  'dashboard.account.apiKeys.audit.empty',
  'dashboard.account.apiKeys.audit.action.all',
  'dashboard.account.apiKeys.audit.action.created',
  'dashboard.account.apiKeys.audit.action.revoked',
  'dashboard.account.apiKeys.audit.action.rotated',
  'dashboard.account.apiKeys.audit.action.rate_limited',
  'dashboard.account.apiKeys.audit.action.quota_exceeded',
  'dashboard.account.apiKeys.audit.action.scope_denied',
] as const;

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const LOCALES = {
  en,
  ko,
  ja,
  'zh-hans': zhHans,
  'zh-hant': zhHant,
} as const;

describe('Dashboard redesign i18n integrity', () => {
  it.each(REDESIGN_PATHS)(
    'en master has %s',
    (path) => {
      const value = getNestedValue(en, path);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  );

  it.each(['ko', 'ja', 'zh-hans', 'zh-hant'] as const)(
    '%s has all redesign keys present',
    (locale) => {
      const dict = LOCALES[locale];
      const missing: string[] = [];
      for (const path of REDESIGN_PATHS) {
        if (typeof getNestedValue(dict, path) !== 'string') {
          missing.push(path);
        }
      }
      expect(missing, `Missing in ${locale}: ${missing.join(', ')}`).toEqual([]);
    }
  );
});
