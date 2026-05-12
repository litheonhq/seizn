# stash@{1} Classification Report (Codex, 2026-05-13)

## Summary

- Stash reviewed: `stash@{1}: On chore/dashboard-loading-minimal: chore-wip-restored-2026-05-12-for-codex`
- Base used: `origin/main` at `92855aa3`
- Branch: `chore/stash-1-salvage-2026-05-13`
- Files in stash: 187
- Category A: 186
- Category B: 0
- Category C: 1

No Category B code diff survived after applying the stash to current `origin/main`. The apply produced only three conflicts:

- `ISSUES.md`: current main already has the shipped incident notes; stash side did not add newer notes.
- `src/app/api/webhooks/stripe/route.ts`: automatic Category A per handoff; current main kept.
- `src/app/[locale]/home-client.tsx`: deleted on current main; stash attempted to revive an obsolete marketing client, so Category C.

## Validation Notes

- Ran `git stash apply 'stash@{1}'`, not `pop`.
- Resolved conflicts by keeping current main for Category A and keeping the deletion for Category C.
- `git status --short --untracked-files=no` was clean after resolving stash content and before adding this report.
- Spot-checked likely Category B paths with `git diff --name-status HEAD 'stash@{1}' -- ...`; no differences remained.
- Existing untracked `.codex-reports/**` files were pre-existing local artifacts and were not staged.
- `npm run typecheck` passed.
- `npm run test:run` passed: 211 files, 1744 passed, 16 skipped.
- `npm run lint` passed.

## Verdicts

| Verdict | File | Rationale |
| --- | --- | --- |
| A | `.vercelignore` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `ISSUES.md` | Current main already contains the shipped incident notes; stash side had no newer record to salvage. |
| A | `docs/security/api-auth-surface.json` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `e2e/dashboard-auth-smoke.spec.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `e2e/dashboard-smoke.spec.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `legal/en/privacy-policy.md` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `legal/en/terms-of-service.md` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `next.config.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `package.json` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `playwright.config.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `scripts/check-a11y-static.mjs` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `scripts/policy-consistency-check.mjs` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `scripts/production-smoke.mjs` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/author-ui/author-ui-route.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/author-ui/author-ui-service.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/author-ui/settings-ui.test.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/author/billing/token-budget.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/billing/billing-portal-route.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/billing/byok-route.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/billing/checkout-button-legal.test.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/billing/checkout-route.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/billing/stripe-config.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/billing/subscription-route.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/client-api-json.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/dashboard/dashboard-routes.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/dashboard/redesign/sidebar.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/dashboard/redesign/workspace-shell.test.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/i18n/dashboard-keys.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/landing/author-landing.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/legal/legal-docs.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/seo/sitemap-robots-contract.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/smoke/batch-c-smoke.test.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/__tests__/surface-routing.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(auth)/layout.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/account/api-keys/__tests__/actions.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/account/api-keys/actions.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/account/api-keys/api-keys-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/account/api-keys/audit/audit-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/account/api-keys/audit/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/account/api-keys/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/account/privacy/privacy-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/author/author-memory-v3-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/author/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/author/settings/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/author/usage/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/billing/billing-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/billing/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/import/import-wizard-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/keys/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/canon/canon-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/chaos/chaos-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/compliance/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/federated/federated-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/integrations/integrations-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/moderation/moderation-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/organizations/[id]/client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/organizations/client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/playground/client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/post-mortem/post-mortem-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/reranker/reranker-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/security/security-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/traces/compare/trace-diff-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/legacy/webhooks/webhooks-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/memories/candidates/CandidatesClient.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/memories/memories-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/memories/mindmap/MindMapFilters.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/memories/mindmap/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/memories/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/memory-editor/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/overview-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/replay/[traceId]/export-panel.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/replay/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/settings/settings-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/dashboard/usage/client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/(dashboard)/layout.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/api/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/changelog/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/checkout/checkout-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/consent/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/dashboard/control-tower/budget/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/dashboard/personas/personas-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/demo/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/design-partners/design-partners-form.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/docs/docs-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/docs/errors/errors-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/enterprise/enterprise-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| C | `src/app/[locale]/home-client.tsx` | Deleted on current main; stash only tried to revive an obsolete marketing client. |
| A | `src/app/[locale]/layout.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/onboarding/byok/wizard-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/pricing/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/pricing/pricing-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/pricing/pricing-track2-copy.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/[locale]/pricing/pricing-track2-section.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/api/account/billing-portal/route.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/api/account/subscription/route.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/api/billing/checkout/route.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/api/billing/portal/route.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/api/cron/mrr-snapshot/route.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/api/health/route.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/api/webhooks/stripe/route.ts` | Stripe webhook area was fully rewritten by merged PRs #355/#377; kept current main. |
| A | `src/app/engine/_components/atoms.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/footer.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/hero.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/nav-bar.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/playground-section.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/playground.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/runtime-row.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/sdk-block.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/snippet-tabs.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_components/wedge-cards.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/_styles/tokens.css` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/engine/layout.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/status/page.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/app/status/status-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/adaptive-planner/PlanEditor.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/answer-contract/PolicyEditor.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/autopilot/AutopilotToggle.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/budget-planner/BudgetSettings.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/checkout-button.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/compression/CompressionToggle.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/CommandPalette.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/DebugBundleExport.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/RiskConfirmationModal.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/ShareTraceModal.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/TraceReplay.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/redesign/sidebar/nav-config.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/redesign/sidebar/sidebar-item.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/redesign/sidebar/sidebar.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/redesign/top-bar.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/redesign/views/use-author-data.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/redesign/workspace-shell.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/dashboard/region-selector.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/devtools/ShareTraceModal.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/devtools/TraceExplorer.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/devtools/WhatIfLab.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/devtools/WhyNotPanel.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/docs/DocsSearch.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/domain-adapter/AdapterTrainingCard.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/domain-adapter/SignalFeedbackForm.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/extreme-homepage/request-builder.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/features/policy-marketplace/PolicyPackGrid.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/graph/GraphControls.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/hybrid-orchestrator/HybridConfigEditor.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/hybrid-orchestrator/StrategyComparison.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/knowledge-gap/FillActionModal.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/landing/hero-split-detector.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/landing/section-pricing.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/language-switcher.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/memories/pin-dialog.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/memory-editor/grid.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/policy-simulator/SimulationSetup.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/relay/RelaySetupWizard.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/settings/DeleteMemoriesModal.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/settings/RTBFModal.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/settings/author-settings-client.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/settings/author-settings-types.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/settings/subscription-section.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/shared/site-nav.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/testing/GenerateTestsModal.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/testing/TestCaseEditor.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/ui/ThemeToggle.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/components/viz/relationship-graph.tsx` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/i18n/dictionaries/en.json` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/i18n/dictionaries/ja.json` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/i18n/dictionaries/ko.json` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/i18n/dictionaries/zh-hans.json` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/i18n/dictionaries/zh-hant.json` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/__tests__/env-guard.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/__tests__/plan-limits-pro.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/__tests__/stripe-metered-v8.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/api-keys/__tests__/api-keys.test.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/api-keys/audit.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/api-keys/rotate.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/author/billing/token-budget.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/author/ui/service.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/billing/charter-schedule.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/dashboard-routes.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/email/templates.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/env-guard.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/plan-limits.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/stripe-checkout.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/stripe-metered.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/stripe.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/lib/surface.ts` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
| A | `src/styles/tokens.css` | Applying stash to origin/main produced no surviving diff for this file; current main already represents the change. |
