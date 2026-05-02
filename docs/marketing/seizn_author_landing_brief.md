---
doc_type: marketing-landing-brief
version: v2
generated_at: 2026-05-02
applies_to: seizn.com (Author flagship landing) — ko·en·ja·zh
depends_on:
  - dual_surface_positioning.md
  - ../author-ui/author_ui_information_architecture.md
  - ../author-ui/author_ui_screen_specs.md
status: design-handoff-ready
revision: v2 — Seizn↔KNOT 분리 룰 적용 (2026-05-02). 합성 sample IP `Saebyeok` 기반 재구성
---

# Seizn Author — Landing Brief

> Claude Designer 핸드오프용 풀 사양. 카피·섹션·합성 sample IP live demo·i18n·visual direction.

## ⚠️ Seizn ↔ KNOT 분리 룰

본 brief의 모든 demo 자료·case study·예시는 **합성 sample IP** 또는 **공개 도메인**·**외부 베타 작가 자료**로만 구성. KNOT 자료·캐릭·세계관·canon 노출 0건. 자세히 [dual_surface_positioning.md §0·§5](dual_surface_positioning.md).

## 0. 단일 메시지 lock

**H1 (ko)**: `작품의 기억을, 흩어지지 않게.`
**H1 (en)**: `Your story, remembered exactly as you wrote it.`
**H1 (ja)**: `物語の記憶を、ひとつの真実に。`
**H1 (zh-hans)**: `让你笔下的世界，记得每一个细节。`

**Sub (ko)**: `세계관·캐릭·씬을 한 곳에 모으고, AI가 캐논 충돌을 자동으로 잡아냅니다. 작가의 검수가 곧 작품의 정전이 됩니다.`

**카테고리**: AI Memory for Authors — 카테고리 정의자 톤. 경쟁 비교 hero에서 X.

**기각된 H1 후보**:
- `AI 메모리 작가 도구` — 도구 톤·카테고리 정의 약함
- `당신의 IP를 위한 AI 메모리` — IP는 비즈 용어·작가에 거리감
- `Seizn Author로 캐논을 검수하세요` — 명령형·자기 자랑

## 1. Hero 섹션 사양

```text
┌──────────────────────────────────────────────────┐
│  [Seizn Author]              [docs] [pricing] [signin]
│
│
│         01 / AUTHOR MEMORY
│
│         작품의 기억을, 흩어지지 않게.
│
│         세계관·캐릭·씬을 한 곳에 모으고, AI가
│         캐논 충돌을 자동으로 잡아냅니다.
│         작가의 검수가 곧 작품의 정전이 됩니다.
│
│         [30일 무료로 시작]   [데모 보기 →]
│
│         ─────────────────────────────────────
│         [합성 sample IP canon graph live preview]
│         ─────────────────────────────────────
└──────────────────────────────────────────────────┘
```

**가드레일**:
- nav 좌상단 로고 외 hero 본문 로고 X (현 페이지 #11 결함 회피)
- CTA 2개 max — primary `30일 무료로 시작` + secondary `데모 보기`
- stats bar X — landing fold 안에 sample IP live demo가 stats 자리 흡수
- 큰따옴표 0건 — [feedback_no_double_quotes.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_no_double_quotes.md) 정합

## 2. Sample IP live demo 위젯 사양 (hero 직하)

**핵심**: 30초 안에 wow 모먼트. 작가가 *자기도 이렇게 쓸 수 있겠다* 즉시 인지.

### 2.1 합성 sample IP 정의

데모 전용 합성 IP — 0부터 설계, anonymous, *Sample IP* 라벨 명시. 한국·일본·중국·영어권 어디에도 친숙한 톤. KNOT과 무관.

**Sample IP 가안**: 가상 학원 SF 단편 (가제 — `Saebyeok` 또는 추후 결정)
- 캐릭 7~10명 (가상 이름·KNOT 캐릭과 무관)
- 세계관 룰 20+ (학교·도시·기술 설정·사회 룰)
- 사건 ledger 30+ (Day 단위 주요 사건)
- 캐논 검수 케이스 50+ (작가 only / 캐릭 인지 / scope 분리 / 시점 모순 등)

**제작 책임**: W0~W2 동안 별 brief 산출물로 풀 설계·`docs/marketing/sample_ip/` 별 폴더에 보관.

### 2.2 widget 3 단계 (auto-rotate or scroll-trigger)

#### 단계 1 — Canon Graph (Cosmos.gl 라이브)

```text
[Cosmos.gl 캐논 그래프 — 합성 sample IP 캐릭·세계관·사건 노드]

[캐릭 A] ─── 룸메 ─── [캐릭 B]
   │                     │
[동아리] ────────── [캐릭 C·D·E·F·G]
   │                     │
[학교 시설] ─── 어른 캐릭 ─── [캐릭 H]
   │
[도시 권역] ─── [학교 위치] ─── [22km 권역]

[hover시] 노드 정보 카드: 'A — 1학년·기숙사·룸메 B'
```

**라벨**: `Sample IP canon graph — 캐릭 8명·세계관 룰 22·사건 30 (데모 전용 합성)`

#### 단계 2 — Review Queue 라이브 (실 후보 카드 흐름)

```text
┌──────────────────────────────────────┐
│ candidate · 0.94 confidence          │
│                                      │
│ '캐릭 A는 D14 사건 직후 도서관에서   │
│  4시 메모를 다시 확인했다'             │
│                                      │
│ source: sample_ip/scenes/d14.md      │
│ 라인 42~48                            │
│                                      │
│ [✓ 승인 A] [✗ 거부 R] [관계? K]      │
└──────────────────────────────────────┘
```

**라벨**: `실시간 후보 검수 — 단축키 한 손, 결정은 한 번`

#### 단계 3 — Conflict + Simulation 라이브

```text
[Conflict Inbox]
🔴 critical: 캐릭 H 직책 모순
  기존: 'H 선생 (담당 과목 수학)'  vs  새: 'H 선생 (담당 과목 과학)'
  [기존 유지] [새로 갱신] [둘 다 보존 + 시점 분리]

[Scene Simulation — 캐릭 C 시점]
입력: D14 친구 부재 알림 직후, 동아리실
출력 candidate 5개 — thought·dialogue·action·canon_risk
  candidate 1: 'thought: 거짓말이지...?' [low risk]
  candidate 2: '...그 능력이 발현됐어' [⚠️ leak risk]
```

**라벨**: `캐논 충돌·캐릭 leak·자동 검출`

### 2.3 widget 데이터 구성

- 100% 합성 sample IP (`docs/marketing/sample_ip/` source)
- *데모 전용 합성 IP* 라벨 명시 ([feedback_synthetic_persona_labeling.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_synthetic_persona_labeling.md) 정합)
- KNOT 자료 0건·[feedback_seizn_knot_separation.md] 정합
- 정적 JSON snapshot·CDN edge cache·실시간 API 호출 X (랜딩 성능)

## 3. 섹션 구조 (hero 아래)

순서 lock:

```text
01 / Hero (위 §1·§2)
02 / 작가의 워크플로우 (3 step: 자료 업로드 → AI 추출·작가 검수 → 캐논·시뮬레이션)
03 / Sample IP 데모 풀 (sample IP 8 캐릭·22 룰·30 Day 사건 검수 흐름·합성 라벨 명시)
04 / 4 가지 자료 입력 모드 (A: AI 자동 추출 / B: Native UI 입력 / C: Obsidian/Notion sync / D: 그대로 저장)
05 / Canon 충돌 자동 검출 (sample IP 예시 카드 3개·합성 라벨)
06 / Scene Simulation (sample IP 캐릭별 candidate 출력·leak 자동 검출)
07 / 신뢰 — 작가 only 정보 보호 + Audit Log + Replay
08 / 가격 ($39 / $129 / $399 / Enterprise — 30일 trial)
09 / FAQ (BYOK·sync·소유권·data residency)
10 / Footer (cross-link to engine.seizn.com)
```

각 섹션 길이 ~1 fold (1024px desktop). 풀 페이지 ~9~10 fold.

### 3.1 §02 워크플로우

```text
01.  당신의 자료를 가져옵니다
     md · docx · pdf · Notion · Obsidian — 다 좋습니다.
     [자료 업로드 미니 데모]

02.  AI가 추출하고, 당신이 검수합니다
     캐릭·세계관·사건·관계·voice 샘플로 분리.
     단축키 한 손으로 승인·거부·병합·분할.
     [Review Queue 데모 카드]

03.  캐논이 됩니다
     충돌은 자동 검출, 시뮬레이션은 작가 only 정보를 보호합니다.
     [Canon Graph + Simulation 데모]
```

### 3.2 §03 Sample IP 데모 풀

```text
데모 전용 합성 IP — Sample IP

·  8 명 캐릭터 (가상 인물·합성)
·  22 개 세계관 룰 (학교·도시·기술·사회)
·  30 Day 사건 ledger (학원물 단편)
·  50+ 캐논 검수 케이스 (작가 only / 캐릭 인지 / scope 분리 / 시점 모순)

[전체 흐름 시각화 — Day 별 사건 lane + 캐릭 lane]

→ 작가가 직접 보고 싶다면 [Sample IP 풀 데모 페이지]

* 본 데모는 Seizn 기능 시연용 합성 자료입니다. 실제 작가 작품과 무관합니다.
```

### 3.3 §04 4 가지 입력 모드

| 모드 | 설명 | 적합한 작가 |
|---|---|---|
| **A. AI 자동 추출** | md·docx·pdf 업로드 → LLM이 캐릭·룰·사건 자동 추출 | 기존 자료 많은 작가·이미 옵시디언/노션에 작성 중 |
| **B. Native UI 입력** | Seizn Author UI에서 캐릭·룰·사건 직접 입력 | 처음부터 시작·구조화된 입력 선호 |
| **C. Obsidian / Notion sync** | 기존 vault·workspace 양방향 sync | 옵시디언·노션에서 본문 작성 계속하고 싶은 작가 |
| **D. 그대로 저장** | 원본 파일 보존·분석 X | 캐논화 거부·아카이브만 |

### 3.4 §05 Canon 충돌 자동 검출

3 카드 예시 (Sample IP 합성 사례·라벨 명시):

```text
[card 1] critical · 캐릭 직책 모순 (sample IP)
  D7 본문: H 선생 (담당 수학)
  D29 본문: H 선생 (담당 과학)
  → Seizn이 자동 감지·작가 결정 요청

[card 2] high · 시간 모순 (sample IP)
  D11 = 3/2 월
  데모 28일 가정 → D28 = 3/19 (불일치)
  → Seizn이 D35 정합 제안

[card 3] medium · scope 위반 (sample IP)
  단편에서 본편 능력 노출
  → Seizn이 author_only / character_unknown 자동 분류 제안

* 모든 예시는 Sample IP 합성 자료
```

### 3.5 §06 Scene Simulation

```text
[입력 패널]
씬: D14 친구 부재 알림 직후, 동아리실
시점: 캐릭 C 시점
압력: 친구의 부재 + 비밀의 무게

[출력 5 candidate — 각 thought·dialogue·action·canon_risk]

candidate 1 — low risk
  thought: 거짓말이지... 거짓말이라고 말해줘.
  dialogue: ...언제 알았어?
  action: 손가락이 책상 가장자리를 꽉 쥐었다.

candidate 2 — ⚠️ leak risk
  thought: ...그 능력이 발현된 거야?
  → Tier 2 author_only fact 누설 의심·자동 경고
  [3개 안전 candidate만 보기] [경고 무시하고 5개 모두 보기]

[근거 패널]
캐릭 C 페르소나 (호기심·친근 침범)
관계: 부재 캐릭과 동아리 합동 자리 3회
최근 메모리: D6 동아리 정식 합류·D10 일상 친목

* Sample IP 합성 시뮬레이션
```

### 3.6 §07 신뢰

```text
🔒 작가 only 정보 보호
   author_only / character_known / character_unknown 4 단계 인지 분리.
   시뮬레이션 출력에서 leak 자동 검출.

📜 Audit Log
   모든 검수 결정·시간·결과 기록. Replay로 재현 가능.

🌏 Data Residency
   서울·도쿄 리전 선택. EU GDPR 정합.

🔑 BYOK (Bring Your Own Key)
   자기 Anthropic·Google·OpenAI 키 등록·50% 할인.
```

### 3.7 §08 가격 (lock — `seizn-author-pricing-2026-05.md` 정합)

```text
30일 무료 체험 — 신용카드 등록 X

┌─────────────┬─────────────┬─────────────┬──────────────┐
│  Author     │  Pro ★      │  Studio     │  Enterprise  │
│  $39 / mo   │  $129 / mo  │  $399 / mo  │  Custom      │
│             │             │             │              │
│  단편 IP·   │  중장편·    │  스튜디오·  │  스튜디오·   │
│  단일 IP·   │  다중 IP·   │  팀 협업·   │  법인 계약·  │
│  최신 모델  │  최신 모델  │  최신 모델  │  SOC 2·SLA   │
│             │             │             │              │
│  [무료 시작]│  [무료 시작]│  [무료 시작]│  [문의하기]  │
└─────────────┴─────────────┴─────────────┴──────────────┘

* 모든 플랜 Opus 4.7 단일·BYOK 50% 할인 옵션
```

### 3.8 §09 FAQ

- 내 자료 소유권은? → 100% 작가 소유. Seizn은 처리만.
- 옵시디언·노션 양방향 sync 되나요? → 네. 양방향·실시간·충돌 시 작가 결정.
- BYOK 어떻게 작동? → 자기 Anthropic 키 등록 시 가격 50% 할인·토큰 무제한.
- data residency? → 서울·도쿄 리전 선택. 기본 서울.
- 결제 취소? → 언제든. 30일 trial = 신용카드 등록 X.
- 게임 스튜디오인데? → [Seizn Engine →](https://engine.seizn.com)
- 데모 자료는 실제 작가 작품인가요? → 아닙니다. 모든 데모는 Seizn 시연용 합성 IP·외부 작가 자료는 본인 동의 시에만 case study에 인용.

### 3.9 §10 Footer

```text
[Seizn Author]
작가의 도구·작품의 기억.

제품              리소스           법적 고지
- 가격            - 가이드         - 이용약관
- 문서            - 블로그         - 개인정보처리방침
- 변경 이력       - 케이스 스터디  - 문의하기
- 상태            - GitHub

게임 스튜디오? Seizn Engine for game studios →
                                                        © 2026 Litheon LLC
```

## 4. Visual direction (Claude Designer 입력)

### 4.1 컬러 토큰

```text
Primary base:
- ivory       #FAF7F0    배경 베이스 (라이트 디폴트)
- ink         #1A1A1A    텍스트
- dawn        #C76B4A    악센트·CTA·테라코타 톤 (TheLabForge와 다른 hue로 차별 — 더 따뜻)

Secondary:
- canon-gold  #D4A24A    canon 상태 강조
- candidate   #888888    검수 대기
- conflict    #C44A4A    모순
- author-only #6B4A8C    작가 only 보라

다크 모드:
- ivory→#1A1A1A·ink→#FAF7F0·dawn 그대로
```

[feedback_brand_separation_seizn.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_brand_separation_seizn.md) 정합 — Celovin/Notrivo/TheLabForge/Usan과 visual cue 공유 X.

### 4.2 타이포그래피

```text
Headings (H1·H2·H3):  Pretendard Variable Display 700
Body:                  Pretendard Variable 400
Quote / Excerpt:       Noto Serif KR 400 italic
Code / data:           JetBrains Mono 400
```

위계:
- H1: 64px desktop / 40px mobile · line-height 1.1
- H2: 40px / 28px · 1.2
- H3: 24px / 20px · 1.3
- Body: 16px / 14px · 1.6

### 4.3 간격·라운드·그림자

- spacing scale: 4·8·16·24·32·48·64·96
- radius: 4 (sm)·8 (md)·16 (lg)·24 (xl)·9999 (full)
- shadow: subtle (cards)·elevated (hero demo widget)·overlay (modal)

### 4.4 모션

- 부드러운 ease-in-out (cubic-bezier(0.4, 0.0, 0.2, 1))
- Sample IP canon graph: 노드 자연스러운 부동·hover 시 ego-network ripple
- Review Queue 데모: 카드 stack 자동 흐름·~3s 간격
- 종이 펼침 (한지 질감) 트랜지션 — Author 톤 시그니처

### 4.5 일러스트

- 한지 질감 배경 텍스처 (warm·subtle)
- 캐릭 silhouette = 추상·non-specific·합성 IP 톤 (특정 작품·KNOT 모티브 X)
- 캐논 그래프 isometric 일러스트 (hero alt)
- 펜·노트·서류 모티브 — editorial 톤

## 5. i18n 4 언어 풀 사양

### 5.1 우선순위·번역 톤

| 언어 | 우선순위 | 톤 | 폰트 | 비고 |
|---|---|---|---|---|
| ko 한국어 | 1순위 | 친절·간결·존댓말·작가 친화 | Pretendard Variable | 카피 master |
| en 영어 | 2순위 | refined SaaS voice·no announcement | Inter (fallback) | sample IP 명·라벨 영문 정합 |
| ja 일본어 | 3순위 | 丁寧·書き手寄り·ですます | Hiragino Sans / Noto Sans JP | 라노벨 작가 시장 타깃 |
| zh-hans 중문 간체 | 4순위 | 简洁·亲切·写作者友好 | Noto Sans SC | 웹소설 시장 타깃 |
| zh-hant 중문 번체 | 4순위 | 同 | Noto Sans TC | 대만·홍콩 |

### 5.2 i18n 누수 0 룰

현 seizn.com/ko 의 영문 누수 (`Watch an NPC form memory in one turn` 등) 재발 방지:

- ko 페이지 = 영문 0 (브랜드명 `Seizn`·`Sample IP` 라벨 외)
- en 페이지 = sample IP 명·라벨 영문 그대로
- ja 페이지 = 한국어 단어 그대로 + 한자 음차 병기
- zh 페이지 = 한국어 음차 + 한자 의역 병기

## 6. Sample IP live demo 기술 사양

Codex 빌드 입력. Author UI `/app` surface 와 동일 query/binding 재사용.

### 6.1 hero 위젯 = 3 컴포넌트

| 컴포넌트 | 데이터 source | 라이브러리 | 재사용 |
|---|---|---|---|
| `<HeroCanonGraph />` | `['graph', 'sample-public', { time_state: 'D30' }]` (합성 sample IP) | Cosmos.gl | author-ui `<RelationshipGraph />` 의 read-only 변형 |
| `<HeroReviewCarousel />` | sample IP 검수 후보 큐레이션 5~10건 (합성 case set 발췌) | 자체 | author-ui `<CandidateCard />` 의 demo 변형 |
| `<HeroSimulationDemo />` | sample IP D14 캐릭 C 시점 시뮬 (합성 case set 발췌) | 자체 | author-ui `<SimulationCandidateGrid />` 의 read-only 변형 |

### 6.2 인터랙티브 룰

- 위젯은 *클릭 가능하지만 변경 X* — 하단 CTA `[전체 검수해보기 →]` 으로 trial signup 유도
- 30초 auto-rotate / 사용자 클릭 시 stop·explore 모드
- 모바일 — 3 컴포넌트가 vertical stack·각자 60% 화면 차지·swipe 전환

### 6.3 데이터 소스

- 정적 JSON snapshot (`docs/marketing/sample_ip/` 폴더에 보관·`docs/marketing/sample_ip_canon_v1.json` 등)
- CDN edge cache·실시간 API 호출 X
- KNOT 자료 import·reference 0건 (Seizn↔KNOT 분리 룰)

## 7. 분석·measurement

| 메트릭 | 측정 도구 | 목표 (W6 시점) |
|---|---|---|
| Hero CTA `30일 무료로 시작` 클릭율 | PostHog or Plausible | ≥ 8% |
| Sample IP live demo 인터랙션 (hover·click·scroll into view) | 자체 telemetry | ≥ 60% 방문자 |
| Trial signup → trial activation | 내부 analytics | ≥ 50% |
| Trial activation → paid conversion (30일 후) | 내부 analytics | ≥ 15% |
| ko / en / ja / zh 트래픽 분포 | 자체 | ko 60% / en 25% / ja 10% / zh 5% |

W4 동안 측정 인프라 lock·W5 launch에 반영.

## 8. SEO·메타

- title: `Seizn Author — 작가의 도구·작품의 기억`
- meta description: `세계관·캐릭·씬을 한 곳에·AI가 캐논 충돌 자동 검출·작가 검수가 곧 정전. 작가용 메모리 도구.`
- og:image: 합성 sample IP canon graph thumbnail (warm tones)
- og:type: website
- structured data: `SoftwareApplication` schema·`offerCount: 3`

## 9. 접근성

- WCAG AA 최소·AAA 권장
- 키보드 navigation 전 페이지·Tab 순서 명시
- Sample IP live demo — keyboard 조작 가능 (`Space` rotate stop·`Arrow` 이동)
- screen reader: 그래프 alt text·canon graph 텍스트 대체 (`8 명 캐릭·22 세계관 룰·30 Day 사건의 관계망 — 데모 전용 합성`)
- color + icon dual encoding (canon-gold + 🟢 / conflict + 🔴)

## 10. 본 brief 작업 범위 외

- **합성 sample IP 풀 설계** (캐릭 8명·룰 22·사건 30·검수 케이스 50) — 별 brief (W0~W2 산출물 `docs/marketing/sample_ip/`)
- Claude Designer 풀 디자인 핸드오프 작업 자체 — 별 cycle (Claude Designer 웹 서비스)
- Sample IP live demo 인터랙티브 컴포넌트 빌드 — Codex 작업 (W3~W4)
- 본 surface (`/app`) 빌드 — Codex 작업·`docs/author-ui/` 산출물 활용
- engine.seizn.com 마이그레이션 — 별 brief
- 외부 베타 작가 모집·온보딩·case study SOP — 별 brief (W3~W4)
- 콘텐츠 마케팅 풀 트랙 — W5+ 별 cycle
- 펀딩 deck — W7+ 별 cycle

## 11. 검증 체크리스트 (W5 launch readiness)

- [ ] H1 4 언어 풀 번역·tone 정합
- [ ] hero 본문 로고 X (#11 결함 회피)
- [ ] CTA 2개 max·primary `30일 무료로 시작`
- [ ] 합성 sample IP demo 작동·30초 안에 wow 모먼트
- [ ] 9 섹션 풀 카피·4 언어
- [ ] $39/$129/$399/Enterprise 카드 노출·BYOK 옵션
- [ ] 큰따옴표 0건 ([feedback_no_double_quotes.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_no_double_quotes.md))
- [ ] 영문 누수 0건 (ko 페이지)
- [ ] visual cue Celovin/Notrivo/TheLabForge/Usan과 공유 X
- [ ] **KNOT 자료·캐릭·세계관 노출 0건**·합성 sample IP 라벨 명시
- [ ] footer cross-link to engine.seizn.com
- [ ] 결제·trial 흐름 작동
- [ ] WCAG AA 통과
- [ ] PostHog telemetry 작동
