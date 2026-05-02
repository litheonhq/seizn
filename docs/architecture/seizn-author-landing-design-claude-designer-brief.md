---
doc_type: design-brief
target: web Claude Designer (claude.ai Designer)
version: v1
generated_at: 2026-05-03
status: ready-for-handoff
applies_to: Seizn Author flagship landing — P2 visual polish (Phase D 후 별 cycle)
audience: Claude Designer·Anthropic 디자인 surface
pair_with:
  - seizn_author_landing_brief.md (마케팅 brief v3 lock·copy·구조)
  - dual_surface_positioning.md (Author flagship + engine.seizn.com 분리)
  - phaseD-landing-en.png·ko.png·ja.png·zh-hans.png (현 빌드 4 lang 스크린샷·`reports/`)
---

# Seizn Author Landing — Claude Designer 디자인 브리프

## 1. 프로젝트 컨텍스트

**제품**: Seizn Author — 작가/IP 빌더용 AI 메모리 오서링 도구. 작가가 세계관·캐릭터·장면을 한 곳에 모으면 시스템이 캐논 충돌을 자동 검출·작가 검수가 곧 작품의 기준이 됨.

**법인**: Litheon LLC (Wyoming·anonymous·SFW only·Seizn 법적 owner)

**포지셔닝 (dual-surface)**:
- `seizn.com` = Author flagship (본 디자인 대상)
- `engine.seizn.com` = NPC SDK surface (W7+ 활성화·별 디자인 cycle)

**가격 v7 (Opus 4.7 cost-aligned·2026-05-02 lock)**:
- Indie $39/mo·Pro $149/mo·Studio $499/mo·Enterprise $2,500/mo
- yearly ~15% off·BYOK 50% off + 토큰 무제한·30일 trial 카드 등록 X

**런칭 흐름**: 베타 ~2026-08-31·founding member 매출 → Mercury deposit → W6 풀 launch.

**카테고리 정합**: AI 도구 + creator 도구 — Sudowrite·NovelCrafter·Claude·Linear·Notion AI 톤.

## 2. 현 상태 (Phase D 빌드 완료)

- **Live preview**: `seizn-git-feat-npc-memory-pivot-litheon.vercel.app` (Vercel SSO gated·접근 시 bypass token 필요·문의)
- **스크린샷 4 lang** (1440px desktop): `reports/phaseD-landing-{en,ko,ja,zh-hans}.png`
- **Lighthouse accessibility**: 100 (WCAG AA 통과)
- **4 lang i18n**: en master + ko·ja·zh-hans (zh-hant fallback)
- **세부 코드**: `src/components/landing/author-flagship-landing.tsx` (1095 lines·11 sections)

**현 디자인 토큰** (Tailwind 디폴트 stack·V1 launch 전 업그레이드 필요):
- Hero: `bg-slate-950` (검정 가까운 dark) + `text-white`
- Light sections: `bg-white` + `bg-[#f3f8fb]` + `bg-[#f8fbff]` + `bg-[#fbfdff]`
- Accent: `cyan-300` (hero CTA·primary)·`cyan-500/600/700/900` (다양한 weight·일관성 X)
- Text: `slate-950/900/600/500/400/300/200`
- Typography: 시스템 sans·serif feel·Pretendard 미사용
- Logo: `S` 1-letter monogram in `slate-950` square·플레이스홀더

## 3. 디자인 목표 (P2 polish 8 items)

### N. Hero subtitle 트림
- 현: 3 문장 과밀 ("Bring your worldbuilding... Seizn catches... Your review becomes...")
- 목표: 1~2 문장 punch line·핵심 wedge 강조 (replay·canon authority·author control)
- 4 lang 모두 톤 정합

### O. Canon graph mock에 edge 부여
- 현: 6개 캐릭 노드 floating·연결선 0
- 목표: 노드 간 옅은 SVG line·관계 그래프 affordance·"canon graph"라는 약속과 시각 일치
- relationships 데이터 활용 (`saebyeok_relationships_v1.json` 10 관계)

### P. Demo 섹션 좌우 redundancy 해소
- 현: 좌측 'Sample IP - Synthetic Demo Data' label + stats·우측 widget도 동일 label + 캐릭/케이스 카드
- 목표: 좌우 시각 차별화 — 좌측은 brief copy + CTA·우측은 interactive preview (실 작동 mock 또는 작은 애니)

### Q. Engine cross-link tease 강화
- 현: trust 섹션·footer에만 `engine.seizn.com` 언급 (소심)
- 목표: dual-surface 명시·"For game NPC AI? Visit engine.seizn.com" 1줄 hero 또는 별 띠 (gated·env on 시만)·dev 또는 game studio 향 visibility

### R. Mobile/tablet hero 빈약
- 현: HeroGraphBackdrop이 `lg:block` (1024px+)만 렌더·작은 화면은 그라디언트만
- 목표: 모바일/태블릿에서도 hero가 빈 느낌 X — 작은 character chip strip·간단 CSS animation·또는 풀 graph 모바일 simplified version

### S. CTA flow friction 해소
- 현: hero primary CTA `Start 30-day free trial` → `/pricing` → tier 선택 → checkout (3 step)
- 목표: 1~2 step — Indie 직진 또는 빠른 plan picker 모달 (hero에서 바로 Indie/Pro/Studio 선택)·friction 감소

### T. Workflow 섹션 시각 차별화
- 현: 3 cards 동일 디자인·아이콘/diagram 0
- 목표: 단계별 아이콘·시각 흐름 표현 (화살표·번호 강조·서로 다른 톤)·작가 흐름 (import → review → write) visualization

### U. 'S' monogram → distinct brand mark
- 현: `S` 1-letter slate-950 square·플레이스홀더
- 목표: Seizn 고유 wordmark 또는 distinct mark
- **분리 제약**: Celovin·Notrivo·TheLabForge·Usan과 visual cue 공유 X·예: 한글 모티브·S+C 모노그램 회피
- 추천 방향: 책·페이지·기억의 layer 같은 작가/메모리 모티브·또는 modular grid·또는 abstract — Sudowrite·NovelCrafter와도 차별
- 컬러 옵션: 현 cyan accent 유지하거나 새 brand color 제안 (단·dawn/ivory/serif 톤은 TheLabForge가 사용 중·회피)

## 4. 디자인 시스템 업그레이드 권장

현 Tailwind 디폴트 stack·V1 launch 전 디자인 시스템 lock 권장:

### Typography
- 본문 sans: Pretendard (한글 가독성·다국어 일관)·또는 Inter
- 헤딩: 약간의 serif 또는 strong sans (현 시스템 sans 부족함)
- 모노스페이스 (코드·기술 surface): JetBrains Mono 또는 IBM Plex Mono

### Color tokens
- Primary brand color: cyan 계열 유지 또는 신규 (제안 환영)
- 다크 hero·라이트 섹션 컨트라스트 유지 (Lighthouse 100 회귀 X)
- Accent 변형 통일 (현 cyan-300/500/600/700/900 혼용 → 2~3 weight로 정리)

### Component tokens
- Button: primary·secondary·ghost (현 ad-hoc Tailwind class 분산)
- Card: 통일된 padding·radius·shadow
- Form (Settings UI 정합): input·select·toggle·radio
- Status badge (BYOK Active·Pending·Error·Inactive 4 상태·B″-1 정합)

### Iconography
- 24px line icon set·workflow·conflicts·simulation·trust·BYOK·sync 표현
- Lucide 또는 Phosphor 추천·custom 옵션도 OK

## 5. 카피·구조 (변경 X)

마케팅 brief v3 (`seizn_author_landing_brief.md`) lock 그대로:
- en master·ko·ja·zh-hans 4 lang
- 11 sections: nav → hero → demo → workflow → inputs → conflicts → simulation → trust → pricing → faq → footer
- v7 가격 4 tier × 2 cadence = 8 checkout flows
- BYOK 50% off·token 무제한·trial 30일 카드 X

**카피 변경 가능 항목**: hero subtitle (N item)·workflow 카드 마이크로 카피 (T item)·brand wordmark (U item).

## 6. 분리 룰 (절대 강제)

1. **KNOT 자료 0 노출** — `feedback_seizn_knot_separation.md`
   - 캐릭 이름·세계관 단어·고유명사 0 (Saebyeok 합성 sample IP만 사용)
   - landing build output·CDN 캐싱·이미지·SVG·아이콘 metadata 모두 검증
   - CI gate: `npm run verify:knot-separation` (32 패턴 grep·match 시 fail)

2. **Brand 분리** — `feedback_brand_separation_seizn.md`
   - Celovin (한글 모티브·S+C 모노그램·웜 톤)·Notrivo·TheLabForge (테라코타·웜크림·세리프)·Usan (ivory/ink/dawn) 시각 cue 공유 X
   - Seizn 고유 visual identity 확보

3. **공개 카피 큰따옴표 X** — `feedback_no_double_quotes.md`
   - 작은따옴표 또는 따옴표 없이

4. **AI 시뮬레이션 라벨링** — `feedback_synthetic_persona_labeling.md`
   - sample IP 'Sample IP - Synthetic Demo Data' 라벨 유지

## 7. 레퍼런스·영감

**톤·구조**:
- Linear (linear.app) — clean·focused·subtle motion
- Vercel (vercel.com) — dark hero·gradient accent
- Anthropic (anthropic.com) — editorial·confident·serif touches
- Notion AI — soft warmth·creator-friendly
- Sudowrite·NovelCrafter — author-tool 카테고리 직접 비교

**피해야 할 것**:
- 일반 SaaS 템플릿 룩 (현 상태가 이쪽 가까움)
- 과한 일러스트레이션 (편집툴 톤·미니멀 권장)
- 한글·아시아 모티브 (Celovin과 충돌)
- 웜 크림·테라코타 (TheLabForge와 충돌)

## 8. 납품물

1. **Figma 디자인** (또는 동등) — 11 sections × 4 lang × 3 viewport (1440·768·360)
2. **디자인 토큰 spec** — Tailwind config 또는 CSS variables·color·typography·spacing·radius·shadow
3. **컴포넌트 inventory** — Button·Card·Form·Badge·Icon·Hero·Pricing card·Demo widget·Footer
4. **Brand mark 자료** — wordmark·monogram (옵션)·favicon·OG image 16개 (4 lang × 4 surface)
5. **모션·인터랙션 가이드** — hover·scroll·page transition·hero animation
6. **다크 모드 토큰** (옵션·향후 dashboard에 활용)
7. **Code export** (옵션) — Tailwind 또는 React component·Codex 통합 빌드 입력

## 9. 범위 외

- **결제 흐름** — Stripe Checkout/Customer Portal·Stripe 표준 사용
- **Legal 페이지 디자인** — Phase A 빌드 완료·marked 렌더·간단 톤 유지
- **Sample IP 콘텐츠** — Phase C 합성 데이터·디자인 변경 X·시각화만
- **대시보드 UI** — Phase H Settings UI 빌드 완료·landing과 다른 surface
- **`engine.seizn.com` NPC SDK landing** — 별 cycle (W7+)
- **이메일 템플릿·뉴스레터·소셜미디어** — 별 cycle
- **Mobile app·iOS·Android** — 본 cycle 범위 외 (web only)

## 10. 일정·우선순위

**최소 필요 (V1 launch 전 — 권장 ~1~2주)**:
- N (subtitle trim)·U (brand mark)·T (workflow 시각 차별화)·R (mobile hero)·S (CTA flow)
- 디자인 시스템 토큰 lock

**확장 가능 (founding member 후 — 권장 W4~W6)**:
- O (graph edges)·P (demo redundancy)·Q (engine tease)
- 다크 모드·고급 인터랙션
- 추가 sample IP visualization

## 11. 핸드오프 양식

1. **Claude Designer 브리프 share**: 본 문서 + `seizn_author_landing_brief.md` v3 + 4 lang 스크린샷 + 분리 룰 메모리 (KNOT·Brand·큰따옴표·라벨링)
2. **디자인 결과 review**: Claude (이 세션) + 사용자 + Codex 빌드 가능성 검토
3. **Codex 빌드 dispatch** (Phase D″ 또는 신규 phase): 디자인 결과를 코드로 옮김·기존 acceptance criteria 정합

## 12. 연락 + 컨텍스트

- 사용자: iruhana25@gmail.com (Litheon LLC owner)
- 현 dev branch: `feat/npc-memory-pivot`
- 모 task pack: `docs/architecture/seizn-author-launch-codex-tasks.md`
- 모 runbook: `docs/architecture/seizn-author-launch-runbook.md`
- 마케팅 brief: `docs/marketing/seizn_author_landing_brief.md`

본 브리프 + 페어 문서 풀 read 후·디자인 콘셉트 2~3개 옵션 제안 → 사용자 선택 → 풀 디자인 진행 권장.
