# NPC Pivot → Main Integration — Merge Handoff

Status: ready for Codex execution
Owner: handoff written 2026-05-04
Source dogfood report: `~/.codex/private/seizn-dogfood-report-2026-05-04.md` (repo 외부)

## How to use this document

자동 순차 진행 모드. 단일 Codex run 으로 Phase 0~6 (코드 작업 전체) 를
연달아 실행. Phase 7~8 은 수동 (PR 생성·승인·머지).

각 phase:

1. Phase 섹션 read.
2. 명시된 conflict resolution 전략 적용.
3. Verify gate 평가.
4. **Gate pass → 즉시 다음 phase 진입.** 보고 없이 진행.
5. **Gate fail → 즉시 stop, 실패 phase·gate·로그 보고, Phase 6 완료까지 자동 진행 중단.**
6. Phase 6 완료 → 자동 stop (Phase 7~8 은 인간 작업).

병렬 금지 — 항상 sequential. cross-task 오염 방지
(`feedback_codex_sequential_execution` 정합).

verify gate 가 안전망. 실패하지 않은 phase 는 묻지 않고 진행.

### Dispatch header (단 1회)

```
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: C:/Users/admin/Projects/seizn/docs/architecture/seizn-npc-pivot-to-main-merge-handoff.md §Phase 0 → §Phase 6 순차 자동
지침: Phase 0부터 시작. 각 phase verify gate 통과 시 다음 phase 즉시 진입.
      verify gate 실패 시 즉시 stop, 실패 phase·gate·로그·잔여 conflict 파일 목록 보고.
      Phase 6 완료 후 자동 stop (Phase 7~8 PR·머지는 인간 작업).
      병렬 실행 금지·순차만 (feedback_codex_sequential_execution 정합).
      Phase 1~5 는 commit 안 함 (git 이 unmerged path 동안 중간 commit 거부).
      해결한 파일은 git add 만, 모든 conflict 해결 후 Phase 6 에서 단일 merge commit.
      JSON·코드 충돌 해결 시 큰따옴표 신규 도입 금지 (작은따옴표만).
      KNOT 식별자 신규 도입 금지.
      자율 결정 모드: §Autonomous decision framework 의 6 원칙 적용해서 직접 결정.
      모든 자율 결정은 /tmp/merge-decisions.log 에 기록. 사용자는 PR review 시 일괄 검증.
      §Autonomous decision framework 의 5가지 stop 케이스만 즉시 stop and report.
      Phase 6 의 merge commit body 와 Phase 7 의 PR description 에 decision log 첨부.
```

The agent must not invent extra phases or skip the verify gate.

## Background

dogfood 보고서 2026-05-03 §8 P0#1 (영속화) + §8 P1 1~8 (UX rebrand) 가 Author Memory v3 cycle 로
`feat/npc-memory-pivot` 에 머지됨. 본 cycle 의 목표는 `feat/npc-memory-pivot` 의 119 commits
(Author Memory v3 + UX rebrand + 기존 NPC SDK pivot 작업) 를 production
`main` 에 통합.

### 현재 상태

- `feat/npc-memory-pivot`: 119 commits ahead of `main`
- `main`: 148 commits ahead of `feat/npc-memory-pivot` (SLOT-BA~BD theme unification ·
  PIPA consent · DSR job queue · replay runner · brand mark · auth/i18n cleanup 등)
- 두 브랜치 한참 갈라진 상태, 양방향 진화

### Dual surface 정합

- `seizn.com` 단일 production deployment (현재)
- `engine.seizn.com` DNS 미등록·W7+ 활성 예정
- NPC SDK 코드가 main 에 들어가도 라우팅 surface 없어 사용자 노출 0
- Author Memory v3 + UX rebrand 는 `seizn.com` Author flagship 의 핵심 P0/P1
- pre-launch 사용자 0 → blast radius 0

### Conflict 규모

총 97개 conflict (`git diff --name-only --diff-filter=U` 기준):

| 분류 | 파일 수 | 해결 전략 |
|---|---|---|
| i18n dictionaries | 22 | jq deep merge (Phase 1A) |
| dashboard pages | 18 | 케이스별 careful merge (Phase 2) |
| locale routes | 15 | main base + feat Author landing 변경 보존 (Phase 3) |
| extreme-homepage | 8 | feat 우선 (NPC SDK landing) (Phase 4) |
| api routes | 8 | 케이스별 (Phase 4) |
| public assets | 6 | main 우선 (BA-07 brand mark) (Phase 1B) |
| dashboard components | 4 | careful merge (Phase 2) |
| lib | 3 | 1대1 manual merge (Phase 5) |
| github config | 3 | main 우선 (PR #200 ci) (Phase 1B) |
| auth routes | 3 | main 우선 (PR #199 unification) (Phase 5) |
| package.json + package-lock.json | 2 | jq deps 병합 + npm install (Phase 1D — npm 검증 가능하게 일찍) |
| other (CHANGELOG·ISSUES·globals.css·layout.tsx·language-switcher) | 5 | 케이스별 (Phase 5) |

## Autonomous decision framework

자율 결정 모드. 애매한 conflict 만나도 stop 하지 말고 다음 6개 원칙을 적용해서 직접 결정 + decision log 에 기록. 사용자는 PR review 시점 (Phase 8 머지 직전) 에 일괄 검증.

### 6 결정 원칙 (우선순위 순)

1. **컴파일/런타임 안전 우선**: 한쪽이 제거된 API·import·undefined symbol 사용하면 다른 쪽 우선. 양쪽 다 동작 가능하면 다음 원칙으로.
2. **결합 가능 시 결합**: 양쪽이 서로 다른 함수·export·import·키를 추가했으면 둘 다 보존. 같은 함수 시그니처면 main 우선.
3. **main 우선 (newer)**: 두 가지가 비슷하면 main 우선 (148 commits 가 최근 stage 작업·PR #197~200 통합·PIPA·DSR 등 production 의도 반영).
4. **프로덕션 안전 > feature parity**: 결제·인증·RLS·사용자 데이터 관련은 더 보수적인 (검증 많은) 쪽 우선. feat 가 새 권한 체크 추가했으면 보존.
5. **Dual surface dormancy**: NPC SDK 코드는 dormant 상태 유지가 목표. main 의 새 기능을 깨뜨리면서까지 NPC 측 리팩터 가져오지 X. 빈 import 등 dead code 는 그대로 둬도 OK (W7+ 활성화 시 정리).
6. **결정 로그 필수**: 모든 자율 결정을 `/tmp/merge-decisions.log` 에 줄별로 기록. 형식: `<file>: <choice — main|feat|combined|custom> — <one-line 이유>`

### Stop 해야 할 경우 (자율 결정 불가)

다음 5가지만 stop and report:

- **함수 시그니처 양쪽 완전 다름** + 호출 사이트가 양쪽 시그니처 모두 사용 → 양쪽 보존 불가
- **DB 스키마 conflict** (이번엔 마이그레이션 없으니 해당 X 이지만 만에 하나)
- **package.json dep 버전 충돌** (`npm install` peer dep error 등)
- **양쪽이 같은 환경변수를 다른 의미로 사용** (예: 같은 키 이름인데 한쪽은 boolean·다른 쪽은 string)
- **decision log 작성 불가** (`/tmp/merge-decisions.log` write fail)

위 5개 외엔 모두 자율 결정. 의심스러우면 main 우선 + log 에 `MAYBE_REVIEW` 태그 추가.

### Decision log 형식

```text
# /tmp/merge-decisions.log
<phase>:<file>:<choice>:<reason>
P3:src/app/[locale]/page.tsx:main:newer hero polish PR #197 brand mark
P3:src/app/[locale]/pricing/pricing-client.tsx:combined:main base + feat Author tier added
P5A:src/lib/plan-limits.ts:combined:main 515L base + feat Author tier deps
P5A:src/lib/stripe-config.ts:combined:feat 226L base + main BC-3 product IDs added
P5A:src/lib/graph/external-id.ts:combined:both helpers exported, fn 분리
P5C:src/app/globals.css:main:newer theme tokens
MAYBE_REVIEW P3:src/app/[locale]/service-selector-client.tsx:main:PR #199 removed pre-pivot, feat 가 기능 의존하는지 PR review 시 확인
```

`MAYBE_REVIEW` 태그가 있는 줄은 PR description 에 highlight 으로 옮김 (Phase 7).

## Pre-flight checklist (before Phase 0)

- [ ] Working directory is `C:/Users/admin/Projects/seizn`.
- [ ] On a clean working tree (`git status` clean).
- [ ] `git fetch origin` 최신 상태.
- [ ] `npm install` 이미 실행 (no missing deps).
- [ ] `jq` 설치 확인 (`jq --version` 동작).
- [ ] `psql` 설치 확인 (Phase 6 db migration 검증용).

### Commit convention

- Phase 1~5: commit 안 함. git 은 unmerged path 가 남아 있는 동안 중간
  commit 을 거부하므로, 해결한 파일은 `git add` 만. 모든 conflict 해결 후
  Phase 6 에서 단일 merge commit.
- Phase 6 단일 commit format: `<type>(<scope>): <imperative summary>`
- Type: `chore`, scope: `merge`
- Example: `chore(merge): integrate feat/npc-memory-pivot into main`
- Phase 6 의 Steps §8 에 본문 양식 있음.

No emoji, no Co-Authored-By footer unless requested.

---

## Phase 0 — Branch + merge initiation

**Goal:** main 에서 새 통합 브랜치 cut, merge 시작 (commit 보류 상태로 충돌만
표면화).

### Steps

1. `git fetch origin` (최신 상태 확보)
2. `git checkout origin/main -B chore/integrate-npc-memory-pivot-to-main`
3. `git merge --no-commit --no-ff origin/feat/npc-memory-pivot`
   - 자동 머지 진행, 97개 conflict 발생 예상
   - Automatic merge failed 메시지로 종료 — 정상
4. `git diff --name-only --diff-filter=U > /tmp/conflict-files.txt` (또는
   임시 위치에 conflict 파일 목록 저장)
5. conflict 파일 수 확인: 97 ± 5 범위 안인지 검증

### Verify gate

- [ ] `chore/integrate-npc-memory-pivot-to-main` 브랜치 생성됨
- [ ] merge 진행 중 상태 (`git status` 가 unmerged paths 표시)
- [ ] conflict 파일 수 95~105 범위
- [ ] No commit yet — 작업 시작 전 상태

**Verify gate pass → Phase 1 자동 진행. Fail → stop and report.**

---

## Phase 1 — Bulk auto-resolve (low-risk categories)

**Goal:** 명확한 전략이 있는 4개 카테고리 (i18n + assets + github + extreme-homepage) 일괄 해결.

### Phase 1A — i18n dictionaries (22 files)

**전략:** jq deep merge — 양쪽 키 모두 보존, 충돌 시 main 우선 (newer
translations + feat 의 author.* tree 추가).

```bash
for f in src/i18n/dictionaries/*.json; do
  if git diff --name-only --diff-filter=U | grep -qF "$f"; then
    git show ':1:'"$f" > /tmp/base.json 2>/dev/null || echo '{}' > /tmp/base.json
    git show ':2:'"$f" > /tmp/main.json
    git show ':3:'"$f" > /tmp/feat.json
    # feat * main = main 이 충돌 시 우선 (newer 가정). 양쪽 unique key 모두 보존.
    jq -s '.[0] * .[1]' /tmp/feat.json /tmp/main.json > /tmp/merged.json
    # JSON parse 검증
    if jq empty /tmp/merged.json 2>/dev/null; then
      mv /tmp/merged.json "$f"
      git add "$f"
    else
      echo "[FAIL] $f — JSON parse failed after merge"
      exit 1
    fi
  fi
done
```

**중요:** `author.*` 키 트리 (~130 keys, ko·en 위주) 는 feat 에서 들어옴.
다른 20 locales 는 fallback 으로 en 사용. 머지 후 ko.json·en.json 의 author
트리 존재 확인:

```bash
jq '.author | keys | length' src/i18n/dictionaries/ko.json   # 약 14 (top-level keys)
jq '.author | keys | length' src/i18n/dictionaries/en.json   # 약 14
```

### Phase 1B — Public assets + GitHub config (9 files)

**전략:** main 우선 (BA-07 brand mark 가 newer · PR #200 npm-publish ci
업데이트가 newer).

```bash
for f in public/apple-touch-icon.png public/favicon-16.png public/favicon-32.png \
         public/favicon.ico public/og-image.png public/og-image.svg \
         .github/TECH_STACK.md .github/workflows/publish-sdk.yml \
         .github/workflows/sdk-codegen.yml; do
  if git diff --name-only --diff-filter=U | grep -qF "$f"; then
    git checkout --theirs -- "$f"  # --theirs = origin/main (merge target side from --no-commit context)
    # NOTE: in `git merge X` context, `--ours` = current branch (main here), `--theirs` = X (feat)
    # 우리는 main 을 보존하려는 거니 --ours 사용:
    git checkout --ours -- "$f"
    git add "$f"
  fi
done
```

**중요:** `git merge` 의 --ours/--theirs 의미 헷갈리기 쉬움. Phase 0 에서
`git checkout origin/main -B chore/...` + `git merge origin/feat/npc-memory-pivot`
했으므로:
- `--ours` = main (현재 브랜치 베이스)
- `--theirs` = feat/npc-memory-pivot (머지 대상)

main 을 보존하려면 `--ours`.

### Phase 1C — Extreme-homepage (8 files)

**전략:** feat 우선 (NPC SDK landing 의 핵심 컴포넌트, main 은 거의 안 건드림).

```bash
for f in src/components/extreme-homepage/cost-panel.tsx \
         src/components/extreme-homepage/error-display.tsx \
         src/components/extreme-homepage/index.tsx \
         src/components/extreme-homepage/memory-flow-animation.tsx \
         src/components/extreme-homepage/request-builder.tsx \
         src/components/extreme-homepage/results-panel.tsx \
         src/components/extreme-homepage/server.tsx \
         src/components/extreme-homepage/trace-panel.tsx; do
  if git diff --name-only --diff-filter=U | grep -qF "$f"; then
    git checkout --theirs -- "$f"   # feat 우선
    git add "$f"
  fi
done
```

### Phase 1D — package.json + package-lock.json (CRITICAL — npm 실행 가능하게)

**전략:** main base + feat unique deps 병합 + lock 파일 재생성. 이 phase 가 Phase 1 의 마지막인 이유: Phase 2 부터의 verify gate (`npm run typecheck`) 가 `package.json` 을 읽으므로 conflict marker 가 남아 있으면 npm EJSONPARSE 로 즉시 실패.

```bash
# 1. main 의 package.json 가져오기
git show ':2:package.json' > /tmp/main_pkg.json

# 2. feat 의 unique dependencies 추출
git show ':2:package.json' | jq '.dependencies // {}' > /tmp/main_deps.json
git show ':3:package.json' | jq '.dependencies // {}' > /tmp/feat_deps.json
git show ':2:package.json' | jq '.devDependencies // {}' > /tmp/main_devdeps.json
git show ':3:package.json' | jq '.devDependencies // {}' > /tmp/feat_devdeps.json

# 3. feat 만 가진 deps + devdeps 병합 (main 우선, feat 의 unique 만 추가)
jq -s '.[1] * .[0]' /tmp/feat_deps.json /tmp/main_deps.json > /tmp/merged_deps.json
jq -s '.[1] * .[0]' /tmp/feat_devdeps.json /tmp/main_devdeps.json > /tmp/merged_devdeps.json

# 4. main 의 package.json 에 병합된 deps 적용
jq --slurpfile deps /tmp/merged_deps.json --slurpfile devdeps /tmp/merged_devdeps.json \
   '.dependencies = $deps[0] | .devDependencies = $devdeps[0]' \
   /tmp/main_pkg.json > package.json

# 5. JSON parse 검증
jq empty package.json || { echo '[FAIL] merged package.json invalid'; exit 1; }

# 6. reactflow (UX rebrand Phase 7 추가) 보존 확인 — 누락 시 Phase 6 build 깨짐
jq -e '.dependencies.reactflow' package.json > /dev/null \
  || { echo '[FAIL] reactflow missing from merged package.json'; exit 1; }

# 7. lock 파일 재생성
rm -f package-lock.json
npm install 2>&1 | tail -5

# 8. stage
git add package.json package-lock.json
```

**Stop and report rule:** `npm install` 이 dependency conflict (peer dep 등) 로 실패하면 즉시 stop. 어느 쪽 dep 버전이 우선되어야 할지 사용자 결정 필요.

### Verify gate

> **NOTE on intermediate verify gates (Phase 1~4)**: `npm run typecheck`·`lint`·`build` 는 **전체 프로젝트 스캔**이라 다른 phase 의 미해결 conflict marker 가 있는 한 실패. 따라서 Phase 1~4 는 **구조 검증만** (file count·marker grep). npm 기반 검증은 Phase 5 verify gate 와 Phase 6 에서 수행.

- [ ] Phase 1A: 22 i18n 파일 모두 git add, JSON parse 통과
- [ ] Phase 1B: 9 assets/config 파일 main 버전으로 add
- [ ] Phase 1C: 8 extreme-homepage 파일 feat 버전으로 add
- [ ] Phase 1D: package.json·package-lock.json 병합 + `reactflow` 존재 + `npm install` 성공
- [ ] `git diff --name-only --diff-filter=U | wc -l` 결과: 약 56 (97 - 41)
- [ ] 해결된 41 파일에 conflict marker 잔재 X:
      `git diff --cached --name-only | xargs grep -l '^<<<<<<< HEAD' 2>/dev/null | wc -l` → 0
- [ ] No commit yet

**Verify gate pass → Phase 2 자동 진행. Fail → stop and report.**

---

## Phase 2 — Dashboard pages + components (22 files)

**Goal:** main 의 SLOT-BD-* theme unification 과 feat 의 UX rebrand
(`buildAuthorNavigationGroups`, `<EmptyState>`, conflict card list 등) 둘 다
보존하는 careful merge.

### 핵심 파일별 전략

#### `src/components/dashboard/navigation.ts` (CRITICAL)

- main: 기존 `buildNavigationGroups` (theme unified)
- feat: `buildAuthorNavigationGroups` 추가 (UX rebrand Phase 3)
- 결합: main 의 `buildNavigationGroups` 그대로 + feat 의
  `buildAuthorNavigationGroups` 함수와 관련 import (lucide icons) 추가.
- conflict marker 안의 양쪽 코드 모두 살리는 방향.

#### `src/components/dashboard/DashboardShell.tsx`

- feat: route prefix 기반 dispatch 추가 (`isAuthorSurface` 분기)
- main: 가능하면 unchanged 또는 layout polish
- 결합: main 의 layout + feat 의 dispatch 로직 추가.

#### `src/components/dashboard/MobileSidebar.tsx`, `TopBar.tsx`

- 양쪽 모두 cosmetic/layout 변경 가능
- 케이스별: 양쪽 의도 모두 살리되 충돌 시 main 우선 (newer theme).

#### `src/app/(dashboard)/dashboard/*-client.tsx` (18 dashboard pages)

대부분 main 의 SLOT-BD-* theme unification. feat 의 변경은 거의 없음 추정.

```bash
# 우선 main 우선 적용, 그 후 feat 의 unique 변경 review
for f in $(git diff --name-only --diff-filter=U | grep '^src/app/(dashboard)/dashboard/'); do
  # 양쪽 diff 표시해서 manual decision
  git show ':2:'"$f" > /tmp/main_version.tsx
  git show ':3:'"$f" > /tmp/feat_version.tsx
  # 비교 후 결정. 대부분 main 우선이면 충분.
  diff /tmp/main_version.tsx /tmp/feat_version.tsx | head -40
done
```

**자율 결정**: dashboard 페이지 중 feat 가 제거하고 main 이 유지하는 코드는
원칙 5 (Dual surface dormancy) 적용 — main 우선 (NPC pivot 의 의도적 제거 X).
decision log 에 `MAYBE_REVIEW` 태그.

### Verify gate

> 구조 검증만. npm typecheck 는 다른 phase 미해결 conflict 때문에 실패 — Phase 5 에서 실행.

- [ ] 22 dashboard 파일 모두 git add
- [ ] 해결된 22 파일에 conflict marker 잔재 X:
      해당 파일들에 `grep -l '^<<<<<<< HEAD'` → 0 매치
- [ ] `src/components/dashboard/navigation.ts` 에 `buildAuthorNavigationGroups` 문자열 존재 (`grep -c 'buildAuthorNavigationGroups'` ≥ 1)
- [ ] `src/components/dashboard/DashboardShell.tsx` 에 `isAuthorSurface` 문자열 존재
- [ ] 잔여 conflict 약 34개 (56 - 22)

**Verify gate pass → Phase 3 자동 진행. Fail → stop and report.**

---

## Phase 3 — Locale routes (15 files)

**Goal:** main 의 theme unification + brand mark swap + landing polish 와
feat 의 NPC SDK landing 변경 + Author landing 결합.

### 전략

대부분 main 우선 (newer · PR #197 brand mark · PR #198 auth chrome ·
PR #199 device-form tokenize · SLOT-BD theme unification).

```bash
# 1차: 모두 main 우선 시도
for f in $(git diff --name-only --diff-filter=U | grep '^src/app/\[locale\]/'); do
  git checkout --ours -- "$f"
  git add "$f"
done
```

이후 manual review:

#### `src/app/[locale]/page.tsx`, `home-client.tsx`

- main 의 hero·trust 섹션 polish 가 이미 dual_surface_positioning 정합
- feat 의 NPC SDK 관련 추가는 W7+ 까지 보류 — main 우선이면 OK

#### `src/app/[locale]/pricing/`, `enterprise/`, `comparison/`, `service-selector-client.tsx`

- main 이 전반적으로 dominant
- feat 의 Author 관련 pricing 변경이 있으면 보존 — `seizn-author-pricing-2026-05.md`
  메모리 참조해서 Author $39 / Pro $129 / Studio $399 가격이 main 에 이미
  반영되어 있는지 확인.
- 안 되어 있으면 feat 의 가격 변경을 main 에 응용.

#### `src/app/[locale]/summer/`

- main 의 summer 페이지가 PR #199 에서 제거됨 (`remove pre-pivot
  service-selector + summer pages`)
- feat 가 summer 를 유지하면 `git rm` 으로 삭제 (main 의 의도 따름)

### Verify gate

> 구조 검증만. npm typecheck / knot-sep 는 Phase 5 verify gate 에서 수행 (다른 phase 미해결 conflict 때문에 여기서는 실패).

- [ ] 15 locale 파일 모두 git add 또는 git rm
- [ ] 해결된 15 파일에 conflict marker 잔재 X
- [ ] `src/app/[locale]/summer/` 디렉토리 삭제 또는 main 버전 (PR #199 정합)
- [ ] 잔여 conflict 약 19개 (34 - 15)

**Verify gate pass → Phase 4 자동 진행. Fail → stop and report.**

---

## Phase 4 — API routes (8 files)

**Goal:** API routes 8개 careful merge. extreme-homepage 8개는 Phase 1C 에서 처리됨.

### API routes 8개

#### `src/app/api/billing/checkout/route.ts`, `webhooks/stripe/route.ts`

- main: BC-3 seeding API · BB-4 consent age gate · BB-5 tier demotion 관련 변경
  포함 가능
- feat: Author Memory v3 BYOK billing 통합
- 결합: 양쪽 모두 살리는 방향, 함수 단위로 manual review

#### `src/app/api/demo/session/route.ts`

- main 의 demo session 변경 vs feat 의 Author demo
- main 우선 + feat 의 Author session 분기 보존 (있다면)

#### `src/app/api/v1/graph/[graphId]/...` (5 files)

- main: SLOT-BC-2 Persona to graph entity transformer · SLOT-BC-3 Seeding API
- feat: NPC SDK graph endpoints
- 결합: main 의 graph schema 변경이 우선, feat 의 graph 관련 endpoint 추가만
  보존

### Verify gate

> 구조 검증만. npm typecheck / lint 는 Phase 5 verify gate 에서 수행.

- [ ] 8 api 파일 모두 git add (extreme-homepage 8개는 Phase 1C 에서 이미 처리됨, 회귀 검증 불필요)
- [ ] 해결된 8 파일에 conflict marker 잔재 X
- [ ] 잔여 conflict 약 11개 (19 - 8)

**Verify gate pass → Phase 5 자동 진행. Fail → stop and report.**

---

## Phase 5 — Lib + auth + other (11 files)

**Goal:** 마지막 11 파일 (lib 3 + auth 3 + other 5) 1대1 manual merge.

> Note: package.json + package-lock.json 은 Phase 1D 에서 처리됨.

### Phase 5A — Lib (3 files)

#### `src/lib/plan-limits.ts` (main: 515 lines, feat: 430 lines)

- main 이 더 큼 (newer tier configs · PIPA consent · DSR limits 추가됨)
- 결합: main 우선 + feat 의 Author tier 정의가 main 에 없으면 추가
- `seizn-author-pricing-2026-05.md` 메모리 참조: Author $39 / Pro $129 / Studio $399 /
  Enterprise / 30일 trial only / Opus 4.7 단일 / 글로벌 USD flat / BYOK option
- main 에 이 가격 트리 있으면 main 그대로, 없으면 feat 의 정의 추가

#### `src/lib/stripe-config.ts` (main: 166 lines, feat: 226 lines)

- feat 가 더 큼 (Author price IDs + BYOK metering 정의)
- 결합: feat 우선 + main 의 신규 Stripe product 추가
- 양쪽의 price ID 모두 보존 — 결제 깨짐 방지

#### `src/lib/graph/external-id.ts` (add/add: main 51 lines, feat 59 lines)

- 양쪽이 같은 이름 다른 내용으로 추가
- 두 파일 모두 read 해서 의도 파악 후 결합 (or 한쪽 선택)
- 추정: main 은 BC-2 graph entity transformer 의 helper, feat 는 Author Memory v3
  의 entity ID handling
- 둘 다 필요하면 함수 분리해서 한 파일에 통합

```bash
git show ':2:src/lib/graph/external-id.ts' > /tmp/main_eid.ts
git show ':3:src/lib/graph/external-id.ts' > /tmp/feat_eid.ts
# 양쪽 함수 시그니처 비교 후 결정
```

**자율 결정**: 두 external-id.ts 가
- 같은 함수명·다른 시그니처 + 양쪽 호출 사이트 모두 존재 → **stop** (framework §Stop 케이스 1)
- 다른 함수명 → 둘 다 export (원칙 2: 결합)
- 같은 함수명·같은 시그니처·다른 구현 → main 우선 (원칙 3) + log `MAYBE_REVIEW`

### Phase 5B — Auth routes (3 files)

main 우선 (PR #199 가 device-form·login-form·signup-form 토큰화 + editorial tone 통합).

```bash
for f in src/app/'(auth)'/device/device-form.tsx \
         src/app/'(auth)'/login/login-form.tsx \
         src/app/'(auth)'/signup/signup-form.tsx; do
  git checkout --ours -- "$f"
  git add "$f"
done
```

### Phase 5C — Other (5 files)

> Note: `package.json` + `package-lock.json` 은 Phase 1D 에서 이미 처리됨 (npm 검증 가능하게 하기 위해 일찍).

#### `CHANGELOG.md`

- 양쪽 모두 신규 entry. 시간 순으로 결합.

```bash
git show ':2:CHANGELOG.md' > /tmp/main_cl.md
git show ':3:CHANGELOG.md' > /tmp/feat_cl.md
# main 의 신규 entries (상단) + feat 의 author memory v3 / ux rebrand entries
# 결합 후 git add
```

#### `ISSUES.md`

- 양쪽 결합 (해결된 이슈는 closed 표시 + 새 이슈 추가)

#### 기타 (3 files — Phase 0 출력 참조)

- 케이스별 manual

### Verify gate

- [ ] 11 파일 모두 git add (또는 plan-limits/stripe-config 는 결합 결과)
- [ ] `git diff --name-only --diff-filter=U` 결과: **0** (모든 conflict 해결)
- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과

**Verify gate pass → Phase 6 자동 진행. Fail → stop and report.**

---

## Phase 6 — Full verify gate + commit

**Goal:** 모든 conflict 해결 후 전체 verify gate 통과 + 단일 merge commit.

### Steps

1. `git diff --name-only --diff-filter=U` 가 빈 결과인지 최종 확인
2. `npm run typecheck` 통과
3. `npm run lint` 통과 (warnings OK, errors X)
4. `npm run test:run` 통과 (1193+ tests 모두 green)
5. `npm run build` 통과 (Next.js production build)
6. `npm run verify:knot-separation` 통과 (KNOT 식별자 0)
7. Supabase migration 확인 — Phase 0 의 db state 그대로 유지 (Author Memory v3
   의 5 tables 가 이미 적용됨, 추가 마이그레이션 없음):

```bash
# .env.example 의 AUTHOR_UI_STORE 명시 확인
grep AUTHOR_UI_STORE .env.example
```

8. Merge commit 생성 — body 에 decision log 첨부:

```bash
DECISION_LOG=$(cat /tmp/merge-decisions.log 2>/dev/null | sed 's/^/  /')
MAYBE_REVIEW=$(grep '^MAYBE_REVIEW' /tmp/merge-decisions.log 2>/dev/null | sed 's/^/  /')

git commit -m "chore(merge): integrate feat/npc-memory-pivot into main

Merges 119 commits from feat/npc-memory-pivot — Author Memory v3 영속화 (5 Supabase tables + RLS) + UX rebrand (Korean writer-friendly surface) + 기존 NPC SDK pivot 작업.

97 conflicts resolved across i18n dictionaries (jq deep merge), dashboard pages (theme unification + persona dispatch), locale routes (main brand polish), api routes, extreme-homepage (NPC SDK landing), lib (plan-limits + stripe-config careful merge), auth (main unification), and other meta.

Autonomous decision framework applied — 6 원칙 (compile safety > combine > main 우선 > production safety > NPC dormancy > log 필수).

== Decision log ==
${DECISION_LOG}

== MAYBE_REVIEW (PR review 시 우선 검토) ==
${MAYBE_REVIEW}

Verify gate: typecheck + lint + test (1193+) + build + knot-separation 모두 통과."
```

### Verify gate

- [ ] `git status` 가 clean (commit 후)
- [ ] `git log -1` 이 위 commit 표시
- [ ] HEAD 가 119 + 148 commits 모두 ancestor 로 가짐:

```bash
git merge-base --is-ancestor origin/main HEAD && echo 'main is ancestor: OK'
git merge-base --is-ancestor origin/feat/npc-memory-pivot HEAD && echo 'feat is ancestor: OK'
```

- [ ] 모든 자동 검증 (typecheck/lint/test/build/knot-sep) 통과

**Verify gate pass → 자동 stop (Phase 7 PR 생성은 인간 작업).
Fail → stop and report.**

---

## Phase 7 — Push + PR 생성 (manual)

**Goal:** Codex 가 만든 merge branch 를 origin 에 push, main 으로 향하는
PR 생성. Vercel preview 빌드 확인.

### Steps

1. `git push -u origin chore/integrate-npc-memory-pivot-to-main`
2. Vercel preview 자동 빌드 시작 모니터링 (`vercel ls --scope=litheon`)
3. preview 빌드 통과 → preview URL 캡처
4. `gh pr create --base main --head chore/integrate-npc-memory-pivot-to-main`
   - Title: `chore(merge): integrate Author Memory v3 + UX rebrand into production`
   - Body 필수 섹션:
     - 본 핸드오프 doc 링크
     - Phase 5C 의 CHANGELOG 결합 결과
     - smoke checklist
     - **Decision log 전문** (`/tmp/merge-decisions.log` 내용 그대로 첨부 — Phase 6 commit body 와 동일)
     - **MAYBE_REVIEW 항목 highlight** (PR review 시 우선 검토 대상)

### Verify gate (인간)

- [ ] Vercel preview 빌드 Ready
- [ ] preview URL 에서 dashboard·landing·author 화면 모두 렌더
- [ ] PR open against `main`

**Stop and hand off.** Phase 8 인간 결정.

---

## Phase 8 — Production 머지 + 모니터링 (manual)

**Goal:** PR 머지 → main → Vercel production 자동 배포 → 사후 모니터링.

### Steps

1. PR 머지 (`gh pr merge --merge --delete-branch`)
2. main 이 새 commit 받음 → Vercel production 자동 배포 시작
3. production 배포 완료 모니터링 (5~10분):

```bash
vercel ls --scope=litheon | head -3
# 가장 최근 deployment 의 status = Ready 확인
```

4. production URL (`seizn.com`) 에서 quick smoke:
   - Landing 페이지 렌더링
   - `/dashboard/author` 로그인 후 진입 가능 (BYOK·자료 업로드 등은 별도
     세션의 founding member dogfood)
5. 깨졌으면 `git revert` + redeploy 즉시:

```bash
gh pr revert <PR_NUMBER>
# 또는 직접
git checkout main
git revert -m 1 <merge_commit_sha>
git push origin main
```

### 사후 dogfood (별도 세션)

`~/.codex/private/seizn-dogfood-report-2026-05-05.md` 또는 main 진입 일자 기준.

---

## Failure-mode notes

- **Phase 1A i18n merge 후 JSON parse 실패:** jq deep merge 가 nested array
  중복 등으로 invalid JSON 만들 수 있음. 실패 파일 한정해서 manual diff
  resolve. 모든 22 파일에 대해 한 번에 fail 안 하도록 file-level isolation.
- **Phase 2 dashboard navigation 충돌이 너무 큼:** main 의 SLOT-BD theme work
  과 feat 의 UX rebrand persona dispatch 가 같은 함수에서 충돌하면, 양쪽 의도
  모두 살리는 새 함수 구조 시도 (원칙 2: 결합). 시도 실패 시 main base + feat
  의 `buildAuthorNavigationGroups` 별도 export (원칙 3) + log `MAYBE_REVIEW`.
- **Phase 4 Stripe webhook 충돌이 결제 로직 깨뜨림:** Stripe 결제는 첫 사용자
  진입 시 명확한 실패 원인. 양쪽 webhook handler 의 event handler 모두 보존,
  순서는 main 우선.
- **Phase 5C package.json conflict 후 reactflow 누락:** UX rebrand Phase 7 에서
  추가한 `reactflow@^11.11.4` 가 main 으로 넘어와야 함. 누락 시 typecheck 통과
  하지만 build 에서 module not found.
- **Phase 6 verify gate 통과했지만 Vercel preview 깨짐:** Vercel 의 build env
  에서만 발견되는 module resolution 또는 Edge runtime 호환성 이슈. preview
  빌드 로그 확인 후 case-by-case fix.
- **`git merge --abort` 가 필요한 상황:** Phase 1~5 중 어디서든 의심스러운
  resolve 후 typecheck 가 50개 넘게 깨지면 abort 후 재시작 권장. 부분
  resolve 누적은 디버깅 어려움.

## Anti-goals (do NOT do these)

- Do not modify `docs/knot-input/**`.
- Do not modify `scripts/verify-knot-separation.ts`.
- Do not introduce KNOT identifiers (`char.sori`, `knot.short1`, `청학여`,
  etc.) — Author Memory v3 cycle 이미 sample IP (`saebyeok-*`) 만 사용.
- Do not introduce double quotes (`"`) in user-facing Korean text. Single
  quotes (`'`) only.
- Do not change Supabase migrations (5 신규 테이블 이미 production DB 에
  apply 됨, schema_migrations 도 repaired).
- Do not skip `git merge --no-commit` — 통째 commit 하면 사후 분석 어려움.
- Do not force-push origin/main 또는 origin/feat/npc-memory-pivot — 통합
  branch (`chore/integrate-npc-memory-pivot-to-main`) 만 push.
- Do not skip a verify gate to keep moving.
- Do not do interactive rebase 또는 history rewrite — merge commit 으로 통합
  history 보존 (이후 git blame 에서 양쪽 cycle 모두 추적 가능해야 함).
- Do not run multiple phases in parallel. Sequential only.
