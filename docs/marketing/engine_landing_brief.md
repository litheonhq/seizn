---
doc_type: design-brief
target: external web design partner (claude.ai Designer / Vercel v0 / Cursor / 외주 스튜디오)
version: v1
generated_at: 2026-05-05
status: ready-for-handoff
applies_to: engine.seizn.com — Seizn Engine NPC SDK landing
pair_with:
  - dual_surface_positioning.md (전체 surface 분리 결정)
  - seizn_author_landing_brief.md (자매 surface — 톤 분리 참고)
---

# Seizn Engine Landing — 디자인 브리프

## 1. 한 줄 요약

게임 NPC 가 세대를 넘겨 기억하게 하는 **AI memory infrastructure**. Inworld·Convai·NVIDIA ACE 위에 얹는 보완재 layer. `engine.seizn.com` 한 페이지로 게임 스튜디오 PM·시니어 엔지니어가 'demo 예약' 또는 'docs 진입' 까지 가도록.

## 2. 프로젝트 컨텍스트

### 2.1 제품

**Seizn Engine** — game NPC 용 AI memory middleware.

- 핵심 가치 = **NPC 가 시간·세션·세대를 넘어 기억** (단순한 conversation history X·world state·관계·이벤트 모두)
- LLM 자체 제공 X — 기존 LLM 위에 memory layer 추가 (Claude·GPT·Gemini·local model 모두)
- SDK 3종: `seizn-sdk-js`·`seizn-sdk-python`·`seizn-guard` (정책/안전 layer)
- HTTP API 직접 사용도 가능

### 2.2 자매 surface

`seizn.com` (Author flagship) 와 별도 surface. dual surface 분리 정책 (`dual_surface_positioning.md`):
- `seizn.com` = AI memory for **writers** (워밍·creator tooling 톤)
- `engine.seizn.com` = AI memory for **game NPCs** (cosmic·developer 톤)

같은 백엔드 (Spring·Summer·Fall·Winter 4계절 memory layer)·다른 surface·다른 청자.

cross-link 은 footer 1줄만 (양방향).

### 2.3 법인

Litheon LLC (Wyoming·anonymous LLC·Seizn 법적 owner).

### 2.4 현 상태

`engine.seizn.com` DNS 활성화 (2026-05-05). 현재는 `seizn.com` 의 NPC SDK 카피·컴포넌트가 그대로 재사용 가능 (이전 NPC pivot 시기 산출물). 본 cycle 에서 *NPC SDK 전용 풀 리디자인* 진행.

## 3. 타깃 청중

### 3.1 1차 페르소나 — 게임 스튜디오 시니어 엔지니어 (영어권)

- **컨텍스트**: 출시 임박 게임에 NPC AI 도입 검토 중. Inworld·Convai PoC 진행 또는 검토 직후
- **구매 동기**: 보스가 'NPC 가 진짜 살아있게 만들어' 라고 함·세대 넘는 기억·플레이어 행동에 대한 NPC 반응 누적
- **결정 기준**:
  1. SDK 통합 30분 안에 끝나는가
  2. 비용 예측 가능한가 (per-entity·per-event 종량제·budget caps)
  3. 디버깅 쉬운가 (replay·trace·audit log)
  4. 컴플라이언스 (SOC 2·GDPR·DSR) 준비됨
- **결재 사이클**: 6~12개월·PoC 1~3개월·연간 라이선스
- **트래픽 source**: GDC·HN·게임 dev Discord·SDK 검색·Inworld 비교 검색

### 3.2 2차 페르소나 — 게임 스튜디오 PM/Producer

- **컨텍스트**: 엔지니어가 Seizn 가져오면 비용·일정·법무 검토
- **구매 동기**: 단가 명확함·integration risk 낮음·ENT 영업 응답
- **결정 기준**:
  1. 가격이 게임 매출과 매칭 (per-DAU·per-event)
  2. SOC 2 또는 SLA
  3. 데이터 거주성 (region selection)
  4. 타 스튜디오 case study
- **결재 사이클**: PM 영향력으로 연간 PO 승인

## 4. 경쟁 포지션

| 경쟁사 | 우리 위치 |
|---|---|
| **Inworld AI** | 보완재 — Inworld 의 character agent 위에 memory layer 추가 가능 (대체 X) |
| **Convai** | 보완재 — Convai 의 voice/character runtime 에 우리 memory 주입 |
| **NVIDIA ACE** | 보완재 — NVIDIA 의 GPU runtime + 우리 memory persistence |
| **Custom LLM + DB 직접 구축** | 대안 — 직접 만들면 6+ 개월·우리는 SDK 30분 |
| **Pinecone/Weaviate/벡터 DB** | 다른 카테고리 — 벡터 DB 는 storage·우리는 game-specific memory layer (4계절·decay·gossip·ToM) |

**메시지**: "당신의 game runtime 을 바꾸지 마세요. 위에 우리만 얹으세요."

## 5. Wedge — 메시징 핵심 3개

다른 memory 서비스 대비 차별점:

### 5.1 Replay (재현 가능한 메모리)

- 모든 NPC 결정·기억 변화·trace 가 deterministic replay 가능
- 게임 출시 후 player 가 'NPC 가 갑자기 이상해졌어' 신고 → 우리가 그 NPC 의 정확한 시점 메모리 상태로 복원·디버깅
- 경쟁사 (Inworld·Convai) 가 black box 인 것 대비 핵심 차별

### 5.2 Compliance (게임 출시 가능한 컴플라이언스)

- SOC 2 Type II 준비 중 (Roadmap Q3 2026)
- GDPR/DSR (Data Subject Request) 자동 처리 — player 가 '내 데이터 다 지워줘' → 1 API call
- 감사 로그 (audit trail) — tamper-evident hash chain
- PIPA 한국·일본·중국 데이터 보호법 매핑

### 5.3 Budget (비용 예측 가능)

- per-entity·per-event 종량제 (per-token X — game 은 token 산정 어려움)
- budget caps — NPC AI 폭주 방지 (한 player 가 1만 메시지 보내도 cap)
- 실시간 비용 dashboard
- 무료 tier·monthly cap·overage 명시적 동의

(2차 wedge — 미래) ToM (theory of mind)·gossip propagation·memory decay — 본 landing 에는 'Roadmap' 으로만 노출.

## 6. 정보 아키텍처

`engine.seizn.com` single-page landing 구조 (스크롤 down):

### 6.1 Hero (above fold)

```
[Seizn Engine] [Docs] [Pricing] [Sign in]                          [Book demo]
                                                                    [Try playground]

NPCs that remember
across generations.

Memory infrastructure for game NPCs. Drop-in SDK on top of
Inworld, Convai, or your own runtime. Replay every memory,
audit every decision, cap every budget.

[ Book a 30-min demo ]   [ Try the playground → ]

* Built on Spring · Summer · Fall · Winter — Seizn 의 4-tier memory layer.
```

비주얼: 우주 / 궤도 / NPC 노드 graph 가 hero 우측 또는 배경. 정적 SVG 또는 가벼운 canvas animation.

### 6.2 Live playground (interactive demo)

기존 `Archivist Vale` playground 재활용 가능 (현 자산):
- NPC 1명 (Vale 라이브러리언) 과 텍스트 채팅
- 메시지마다 우측 panel 에 memory write·read·trace 표시
- '14일 후' 버튼 → 시간 점프 → NPC 가 어떻게 기억하는지
- 30초 안에 wow 모먼트

위치: hero 직후 또는 hero 통합. 모바일에서는 'Try on desktop' 안내.

### 6.3 카테고리 메시지 — 보완재 포지션

```
[ Inworld logo ] [ Convai logo ] [ NVIDIA ACE logo ] [ Your custom runtime ]
                            ↓
                    [ Seizn Engine ]
                  Memory layer for all
```

다이어그램: 위 4개 runtime 위에 우리 layer 가 얹히는 구조. "We don't replace your runtime. We give it persistent memory."

### 6.4 Wedge 3 카드

§5 의 Replay·Compliance·Budget 각각 카드 1개. 카드별:
- 아이콘 (line icon·developer 톤)
- 한 줄 헤드 ("Deterministic replay")
- 3 줄 설명
- 작은 코드 스니펫 또는 데모 GIF
- 'Learn more →' (docs deep link)

### 6.5 30-second integration

```
npm install @seizn/sdk
```

```typescript
import { SeiznClient } from '@seizn/sdk';

const seizn = new SeiznClient({ apiKey: process.env.SEIZN_API_KEY });

// Give Vale a memory of meeting the player
await seizn.remember({
  entity: 'npc:vale',
  event: 'met_player',
  context: { player_id: 'p1', mood: 'curious' },
});

// 14 days later, Vale recalls the player
const memory = await seizn.recall({
  entity: 'npc:vale',
  about: 'p1',
});
// → { last_met: '14d ago', mood: 'curious', salience: 0.8 }
```

언어 탭: TypeScript / Python / cURL. 코드는 syntax-highlighted (JetBrains Mono).

### 6.6 Replay·Audit demo

작은 인터랙티브 위젯:
- timeline scrubber — 14일 NPC 메모리 변화
- 각 시점 NPC 가 player 에 대해 무엇을 알았는지
- replay 버튼 → 같은 시점에서 1000번 실행해도 동일 결정

### 6.7 가격

```
[ Hobby — $0 / mo ]    [ Studio — $499 / mo ]    [ Enterprise — Custom ]
1k entities             50k entities               unlimited
10k events / mo        500k events / mo            BYOC·SOC 2·SLA·dedicated
SDK + docs             + Replay·Audit·Budget       + custom region·GDPR·DSR API
                       + Slack support             + onboarding engineer

                      [ Start free ]    [ Book demo ]
```

(가격 숫자는 placeholder. 실제 cycle 에서 lock — 디자이너는 카드 구조만 잡으면 됨.)

### 6.8 Trust strip

- SOC 2 Type II — In progress (Q3 2026)
- GDPR / DSR — Live
- PIPA / 한국 — Live
- Encryption at rest — AES-256
- Region — US-East·AP-Northeast (Seoul)·EU (Roadmap)

각 항목에 명시적 status (Live·In progress·Roadmap)·과대광고 X.

### 6.9 사용 사례 (Case studies — 미래용 placeholder)

W7+ 부활 시 채움. 현재는 sample 1개 (synthetic) 또는 빈 섹션 + "Coming soon — featured studios" 띠.

### 6.10 Footer

- Cross-link: `Seizn Author for writers →` (`seizn.com`)
- Docs · Pricing · Status · Blog · GitHub
- Privacy · Terms · Security
- © 2026 Seizn by Litheon LLC · Wyoming
- Sample data label (any demo data) — 'Synthetic — not a real game'

## 7. 브랜드 가이드

### 7.1 컬러 (cosmic / developer 톤)

기존 dark + indigo + violet 유지. 권장 팔레트:

| 토큰 | hex | 용도 |
|---|---|---|
| `engine-bg-base` | `#08080F` (거의 검정) | 페이지 배경 |
| `engine-bg-raised` | `#12121F` | 카드·panel |
| `engine-accent-primary` | `#7C3AED` (violet-600) | CTA·hero highlight |
| `engine-accent-secondary` | `#22D3EE` (cyan-400) | data flow·trace highlights |
| `engine-text-base` | `#E5E7EB` (slate-200) | 본문 |
| `engine-text-muted` | `#94A3B8` (slate-400) | 보조 |
| `engine-line` | `#1F2937` (slate-800) | divider·border |

⚠️ 작가 surface (`seizn.com`) 의 ivory·dawn·terracotta 톤 절대 사용 X. visual 분리 룰.

### 7.2 타이포

- 본문: **Pretendard Variable** (한국어 fallback 자동·영문 가독 우수)
- 코드 / 숫자: **JetBrains Mono Variable**
- 제목 weight: 700 (Bold)
- 본문 weight: 400~500
- 줄간격: 1.5~1.6

### 7.3 모션

- 권장: glitch·data flow·orbit·burst·matrix-rain (developer / cosmic 톤)
- 회피: 종이 펼침·페이드인·부드러운 호버 (작가 surface 톤)
- 모션 prefer: framer-motion·CSS animations
- 60fps 보장·prefers-reduced-motion 존중

### 7.4 일러스트 / 이미지

- NPC silhouette·궤도·메모리 노드 graph·trace timeline
- 스크린샷이 있으면 dark theme·monospace 코드·terminal 톤
- 사진 사용 X (developer surface 는 추상 우선)

### 7.5 카피 톤

- **기술적·정확·짧은 문장**
- "Stop hallucinations." 같은 발레 톤 X — "Deterministic replay across NPCs and sessions." 같이 specific
- 영어 master·한국어 / 일본어 sub (Phase 2)
- 작가 surface 의 친절·존댓말 X
- 'NPC' 'memory' 'replay' 'audit' 'budget' 'compliance' 같은 dev 어휘 그대로 사용

### 7.6 로고

`Seizn` 워드마크 + `Engine` 라벨. **S wave colored Mark** (작가 surface 의 monochrome Mark A 와 다름).

자산: `docs/brand/assets/raster/` (S wave colored 버전) — pair_with 메모리 `seizn-dual-brand-identity` 참고.

## 8. 재사용 가능한 기존 자산

`feat/npc-memory-pivot` (이미 main merge 됨) 에 NPC SDK landing 컴포넌트 다수 존재. 디자이너가 0부터 만들 필요 X — 아래 컴포넌트를 *시각 리프레시* 만 하면 됨.

| 컴포넌트 | 위치 | 현 상태 | 디자인 액션 |
|---|---|---|---|
| 전체 layout | `src/components/extreme-homepage/index.tsx` | 11 섹션 hero·playground·trust·SDK·pricing 포함 | visual 토큰 / 타이포 / 모션만 교체 |
| Hero animation | `src/components/extreme-homepage/hero-graph-animation.tsx` | NPC 메모리 노드 graph·canvas 애니 | 색·노드 모양 refresh |
| Memory flow | `src/components/extreme-homepage/memory-flow-animation.tsx` | 메모리 read/write 시각화 | 색·timing refresh |
| Request builder | `src/components/extreme-homepage/request-builder.tsx` | 인터랙티브 API request 빌더 | UI 톤 |
| Results panel | `src/components/extreme-homepage/results-panel.tsx` | API response 표시 | UI 톤 |
| Trace panel | `src/components/extreme-homepage/trace-panel.tsx` | replay/trace 시각화 | UI 톤·모션 |
| Cost panel | `src/components/extreme-homepage/cost-panel.tsx` | 실시간 비용 위젯 | UI 톤 |
| Snippet tabs | `src/components/extreme-homepage/snippet-tabs.tsx` | 언어별 코드 탭 | syntax theme |
| Error display | `src/components/extreme-homepage/error-display.tsx` | API 에러 UI | UI 톤 |
| Loading skeleton | `src/components/extreme-homepage/loading-skeleton.tsx` | 4 종 skeleton | shimmer 모션 |

i18n (carry-over): `src/components/extreme-homepage/feature-translations.ts` — 4개 언어 + Trust 키 + Section 카피.

## 9. 참고 디자인 (벤치마크)

| 사이트 | 무엇을 차용 | 무엇을 회피 |
|---|---|---|
| **vercel.com** | dark·monospace·코드 중심·정확한 카피 | hero 의 marketing speak |
| **stripe.com/billing** | 카드 인터랙션·gradient·hover 깊이 | 컬러풀 톤 (우리는 darker) |
| **linear.app** | 타이포·spacing·dark mode 마감 | 너무 미니멀 |
| **anthropic.com** | 한국어 / 영어 정합·dev tone | warm 톤 |
| **inworld.ai** | 카테고리 컨텍스트 익숙화 | 그들의 hero 과대광고·SDK 통합 흐릿함 |
| **convai.com** | 게임 dev 친화 카피 | 그들의 demo 가 generic |

✗ 회피: Notion AI·Sudowrite·NovelCrafter (작가 surface 영역).

## 10. 기술 제약

- **Next.js 16 + Tailwind 4 + Pretendard**
- React Server Components 우선 (인터랙티브 컴포넌트만 `'use client'`)
- 빌드 시간 < 60s
- Lighthouse: Performance ≥ 85·Accessibility = 100·SEO ≥ 90
- `prefers-reduced-motion` 지원
- 모든 인터랙티브 요소 키보드 진입 가능
- i18n: en master + 한국어 + 일본어 + 중국어 (다국어 키는 기존 dictionary 재활용)
- Dark mode 기본 (light mode 토글 X — engine surface 는 dark only)
- Cross-domain link: `seizn.com` (footer 1개만)

## 11. 산출물 & 타임라인

### 11.1 디자이너 1차 산출물 (W1~W2)

- 디자인 시스템 v1: 컬러 토큰·타이포·spacing·motion principles (Figma 또는 코드)
- Hero·Playground·SDK·Trust·Pricing·Footer 6개 핵심 섹션 시안 (1440px desktop·1024px tablet·375px mobile)
- 모션 spec — replay timeline·memory flow·glitch·orbit (after-effects 또는 lottie 또는 CSS 명세)
- 인터랙티브 요소 prototypes (Figma prototype 또는 React 직접)
- 예비 design.md 스타일 문서

### 11.2 W3~W4 (개발 통합)

- 디자이너 코드 또는 우리 엔지니어가 시안 → React 컴포넌트
- 기존 `extreme-homepage/*` 재활용·visual 토큰만 교체
- 다국어 텍스트 적용
- 모션 fine-tune
- Lighthouse / a11y 검수

### 11.3 W5+ (런칭)

- engine.seizn.com 배포 — 본 cycle 산출물 라이브
- footer cross-link 양방향 활성
- GDC / HN / dev Discord 콘텐츠 마케팅 시작 (Author launch 와 별 트랙)

## 12. Out of scope (본 brief 에서 다루지 않음)

- 백엔드 API 구현 (별 cycle)
- SDK 코드 (`seizn-sdk-js`·`seizn-sdk-python`·`seizn-guard` — 별 OSS 작업)
- Docs 사이트 (`engine.seizn.com/docs` — 별 docs cycle)
- 가격 숫자 lock (W3 marketing decision)
- Case study 콘텐츠 (W7+ 외부 스튜디오 PoC 후)
- 펀딩 deck (별 cycle)
- 게임 dev 컨퍼런스 자산 (GDC slide·booth design — 별 cycle)

## 13. 합격 기준 (런칭 전 디자이너 / PM 공동 검수)

- [ ] hero 단일 메시지·게임 dev 30초 안에 `이게 무엇인지·왜 필요한지` 이해
- [ ] playground 인터랙티브·30초 안에 wow 모먼트
- [ ] Replay·Compliance·Budget 3 wedge 카드 시각·기술 정합
- [ ] 코드 스니펫 3 언어 (TypeScript / Python / cURL) syntax-highlighted·복붙 가능
- [ ] 가격 카드 3 tier·각각 명확한 한계·CTA
- [ ] Trust strip 의 status (Live·In progress·Roadmap) 모두 정직
- [ ] Footer cross-link `seizn.com` 1개·visual 분리 명확
- [ ] 작가 surface (`seizn.com`) 와 visual cue 0 공유 (ivory·dawn·terracotta·종이·세리프 X)
- [ ] 모바일 (375px) 빈 느낌 X·desktop wow → mobile usable
- [ ] Lighthouse Performance ≥ 85·Accessibility = 100
- [ ] 다국어 4 lang 톤 정합 (en master)
- [ ] Inworld·Convai·NVIDIA ACE 보완재 포지션 명시 (대체 X)
- [ ] 모션은 `prefers-reduced-motion` 존중
- [ ] CTA 단순 — `Book demo` (1차)·`Try playground` (2차)·`Read docs` (3차)

## 14. 디자이너 첫 미팅 질문 templates

- 본 brief 읽고 '게임 NPC 메모리' 가 무엇인지 한 줄 설명 가능?
- 디자인 시스템을 0부터 만들지 / 기존 자산 위에 리프레시 할지 권장?
- 다국어 4 lang 동시 디자인 / en master 후 sub-routes 권장?
- Figma → React 핸드오프 / 직접 React 코딩 권장?
- 타임라인 W1~W4 가능?

## 15. 자료 / 링크 / 자산

- Live preview (현 main 빌드): `https://www.seizn.com` (현재는 Author surface 가 hosted·engine.seizn.com 은 placeholder)
- 도메인 활성: `engine.seizn.com` (DNS Live·콘텐츠 placeholder)
- Repo: `litheonhq/seizn` (private GitHub)
- Author surface 참고 (visual 분리 비교용): `https://www.seizn.com`
- 기존 NPC SDK 컴포넌트 위치: `src/components/extreme-homepage/`
- 자매 brief: `docs/marketing/seizn_author_landing_brief.md`
- positioning brief: `docs/marketing/dual_surface_positioning.md`
- brand 자산:
  - Author monochrome Mark A: `public/icons/seizn-mark.svg` (engine 사용 X)
  - Engine S wave colored: `docs/brand/assets/raster/` (engine 전용)

---

## 부록 A — 본 brief 와 Author brief 의 차이 (디자이너 혼동 방지)

| 축 | seizn.com (Author) | engine.seizn.com (Engine — 본 brief) |
|---|---|---|
| 청자 | 영어권 작가·자가출판 | 영어권 게임 스튜디오 dev / PM |
| 톤 | 친절·존댓말·간결 | 기술적·정확·developer |
| 컬러 | ivory·dawn·terracotta·warm | dark·violet·cyan·cosmic |
| 타이포 | Pretendard + 세리프 악센트 | Pretendard + JetBrains Mono |
| 모션 | 종이 펼침·캐논 그래프·부드러움 | glitch·data flow·orbit·burst |
| 이미지 | 한지 질감·캐릭 일러스트·카드 stack | NPC silhouette·궤도·메모리 노드 |
| 로고 | Mark A monochrome | S wave colored |
| CTA | `Start 30-day free trial` | `Book demo` / `Try playground` |
| Cross-link | footer: `Seizn Engine for game studios →` | footer: `Seizn Author for writers →` |

두 surface 의 visual·tone 분리는 엄격. 디자이너가 '같은 회사니까 일관성' 있는 디자인 만들면 dual-surface 전략 위배. **두 다른 제품**으로 디자인.
