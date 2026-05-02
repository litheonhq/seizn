---
doc_type: marketing-positioning
version: v2
generated_at: 2026-05-02
status: locked-by-founder
applies_to: seizn.com (Author flagship) + engine.seizn.com (NPC SDK surface)
decision_basis: 5-persona evaluation 2026-05-02 (cost no object scenario)
revision: v2 — Seizn↔KNOT 분리 룰 적용 (2026-05-02 사용자 지시)
---

# Dual Surface Positioning — Seizn Author + Seizn Engine

> 2026-05-02 결정. 단일 메시지 commitment + 양면 시장 브릿지 + multi-product narrative 동시 충족.

## 0. 결정 lock

**Sequential dual launch**:
- W0~W6 → `seizn.com` Author flagship 풀 launch (단일 hero·합성 sample IP demo)
- W6 동안 NPC surface = footer/제품 페이지 보존, SDK·docs는 그대로 운영
- W7~W12 → Author traction 신호 보고 NPC surface 부활 또는 재포지션

**기각된 대안**:
- A (NPC 메시지 유지) — 5 인격 합산 ✗·시장 좁음·Inworld·NVIDIA 정면 충돌
- C (단일 도메인 듀얼 hero) — Stripe·Linear·Vercel·Notion 모두 안 씀·분기 hero = commitment 약함·항상 실패 패턴
- B lean (현 도메인 + Author 카피만) — cost no object 시나리오에서 매몰비용 비대칭

**채택**:
- D = sequential dual surface (별도 도메인·각자 단일 hero·합성 sample IP demo flagship)

## ⚠️ Seizn ↔ KNOT 분리 룰 (2026-05-02 lock)

**금지**:
- Seizn 마케팅·landing·docs·case study에 KNOT 자료·캐릭명·세계관·캐논 노출 X
- KNOT을 Seizn 1차 dogfood 또는 flagship case로 표기 X
- Seizn live demo 데이터 source = KNOT 자료 사용 X
- 두 IP 간 cross-promotion·co-branding X

**허용 (내부 only)**:
- KNOT을 Seizn Author 내부 검증/QA dogfood로 사용 (외부 공개 X)
- Seizn 기술 평가용 eval set 내부 활용 (배포 산출물 X)

**이유**:
- Celovin (KNOT 지주) ↔ Litheon (Seizn 지주) 엔티티 분리·IP·브랜드·세일즈 흐름 분리 ([feedback_entity_separation_ip.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_entity_separation_ip.md) 정합)
- KNOT IP 가치 보호·Seizn 마케팅 노출로 IP 사전 소비 방지
- Seizn 1차 case는 *비-KNOT 외부 작가* 또는 *합성/샘플 IP*로 확보

## 1. Surface 분리 룰

```text
seizn.com                    Author flagship (메인 카테고리 정의자)
├── /                        랜딩
├── /pricing                 $39 / $129 / $399 / Enterprise
├── /demo                    합성 sample IP live demo (KNOT X)
├── /docs                    작가용 docs
├── /case-studies            외부 작가 사례 (W5+ 외부 베타 모집 후)
├── /blog                    creator tooling 콘텐츠
├── /signin                  로그인
└── /app                     Seizn Author 본 surface

engine.seizn.com             NPC SDK surface (보완재 포지션)
├── /                        Inworld·Convai·NVIDIA 보완재 hero
├── /pricing                 엔티티 단위 종량제
├── /docs                    SDK·HTTP API·플러그인 가이드
├── /playground              Archivist Vale demo (현 자산)
├── /case-studies            게임 스튜디오 사례
└── /enterprise              스튜디오 세일즈
```

도메인이 분리되므로 *각자 단일 hero·단일 청자·단일 conversion goal*. duo hero (C)의 commitment 약함 문제 해결.

## 2. 청자 분리

| 항목 | seizn.com (Author) | engine.seizn.com (Engine) |
|---|---|---|
| **1차 청자** | 작가·라노벨/웹소설 작가·게임 시나리오 작가·만화 작가·IP 빌더 | 게임 스튜디오 PM·시니어 게임 엔지니어·Inworld/Convai 도입 팀 |
| **시장 크기** | 한국 작가 ~5만·일본 ~30만·중국 ~100만·글로벌 IP 빌더 | 게임 스튜디오 ~수천·진지하게 NPC 메모리 도입 ~수백 |
| **세일즈 사이클** | 셀프 서브 (PLG)·30일 trial → $39~$399 | 6~12 개월·엔터프라이즈 PoC·SOC 2 요구 |
| **conversion goal** | trial signup → trial → paid | demo 예약 → PoC → 연 계약 |
| **카테고리 메시지** | AI 메모리로 작품 IP 검수 (카테고리 정의자) | NPC 위에 얹는 영속 메모리 레이어 (보완재) |
| **차별화 핵심** | 세계관·캐릭·씬 시뮬레이션·캐논 충돌 자동 검출·작가 워크플로우 | Inworld·Convai·NVIDIA ACE 위에 얹음·엔티티 단위 과금·세대 넘는 기억 |
| **결제** | USD flat ($39/$129/$399)·BYOK 50% | 엔티티·이벤트 종량제 |

## 3. Brand 분리 룰

엄격히 *visual·tone 분리*. [feedback_brand_separation_seizn.md](C:/Users/admin/.claude/projects/c--Users-admin--codex/memory/feedback_brand_separation_seizn.md) 정합.

| 항목 | seizn.com (Author) | engine.seizn.com (Engine) |
|---|---|---|
| **컬러 토큰** | ivory·ink·dawn (warm·creator-tooling 톤) | 현 dark·indigo·violet (cosmic·developer 톤 유지) |
| **타이포** | Pretendard Variable·세리프 악센트 (editorial) | Pretendard Variable·JetBrains Mono (developer) |
| **logo lockup** | `Seizn` 워드마크 + `Author` 라벨 | `Seizn` 워드마크 + `Engine` 라벨 |
| **톤** | 친절·작가 친화·간결·존댓말 | 기술적·정확·developer 톤·짧은 문장 |
| **모션** | 부드러움·종이 펼침·캐논 그래프 살아남 | 글리치·data flow·NPC 응답 burst |
| **이미지** | 한지 질감·캐릭 일러스트·카드 stack | 우주/궤도·NPC silhouette·메모리 노드 graph |

cross-link은 footer + about page만:
- `seizn.com` footer: `Seizn Engine for game studios →` (engine.seizn.com)
- `engine.seizn.com` footer: `Seizn Author for writers →` (seizn.com)

## 4. Sequential launch 로드맵

### W0~W2 (foundation)
- 본 brief lock·`docs/marketing/` 산출물 풀 작성
- Author surface 카피 풀 작성 ([seizn_author_landing_brief.md](seizn_author_landing_brief.md))
- **합성 sample IP 데이터 셋 설계·제작** — KNOT 사용 X. 예: 가상 학원물 IP 또는 공개 도메인 인용 (홍루몽·삼국지 캐릭 분석 등) + 데모 라벨
- Claude Designer 핸드오프 brief 작성
- 도메인 DNS·SSL·subdomain routing 준비

### W3~W4 (design + dev)
- Claude Designer가 Author surface 풀 디자인 (4 언어 대응)
- 합성 sample IP demo 인터랙티브 컴포넌트 빌드 (Cosmos.gl·실시간 검수 흐름·시뮬레이션 라이브)
- engine.seizn.com 도메인 분기 — 현 콘텐츠를 그대로 마이그레이션
- seizn.com 새 Author landing 빌드
- **외부 베타 작가 모집 시작** (5~10명) — 각자 동의 후 W5+ case study source

### W5~W6 (Author launch)
- seizn.com Author surface 풀 launch
- Author 30일 trial 가입 흐름 활성
- 한국 작가 커뮤니티·일본 라노벨·중국 웹소설 콘텐츠 마케팅 시작
- 외부 베타 작가 case study 1차 발행 (KNOT X)

### W7~W12 (NPC surface 부활 신호 평가)

**부활 트리거 (모두 충족 시)**:
- Author trial 가입 ≥ 200건/월
- 외부 작가 베타 → 후속 작가 5+ 도입
- NPC surface footer 링크 → engine.seizn.com 트래픽 ≥ 500/월

**부활 시 작업**:
- engine.seizn.com 풀 리디자인 (Author와 동등 품질)
- Inworld·Convai·NVIDIA 통합 튜토리얼 풀 발행
- 게임 스튜디오 5+ PoC 시작
- *Vercel + v0* 모델로 multi-product narrative 정렬

**부활 X 시 (Author single product 결정)**:
- engine.seizn.com → 폐기 또는 OSS only
- NPC SDK = OSS only·세일즈 트랙 종결
- 단일 narrative로 펀딩

## 5. Live demo 데이터 전략 (KNOT X)

Author landing live demo의 데이터 source:

| 옵션 | 설명 | 적합도 |
|---|---|---|
| A. 합성 fictional IP | 가상 학원물·SF·판타지 IP를 0부터 설계·anonymous brand·`Sample IP` 라벨 | ◎ 1순위 — 통제 가능·IP 분쟁 X |
| B. 공개 도메인 인용 | 홍루몽·삼국지·셰익스피어 캐릭·세계관 분석 | ○ 2순위 — 신뢰 ↑·문화권별 친숙 |
| C. 외부 베타 작가 자료 (동의) | W3~W4 모집·W5+ case study | △ 3순위 — 동의·공개 범위 결정 필요 |
| D. KNOT | — | ✗ **금지** (Seizn↔KNOT 분리 룰) |

W0~W2 동안 A 옵션 합성 IP 1종 풀 설계 (캐릭 7~10·세계관 룰 20+·사건 30+·캐논 검수 케이스 50+) 권장. KNOT을 안 쓰는 대신 sample 품질이 demo wow 모먼트의 핵심.

## 6. NPC surface 마이그레이션 룰

W3~W4 동안 현 seizn.com/ko 콘텐츠를 engine.seizn.com 으로 이전:

- 현 hero `AI NPC의 기억.` → engine 그대로
- stats bar (1.28M entities·142ms p95 등) → *Demo data* 라벨링 후 engine 보존
- Archivist Vale playground → engine 그대로
- 코드 샘플 4 탭 → engine 그대로
- 비교 섹션 (Inworld·Convai) → engine 보완재 톤으로 재작성
- 신뢰 섹션 (SOC 2 등) → 단계 표기 (`In progress` `Roadmap Q3 2026`)
- 가격 (엔티티 단위) → engine.seizn.com/pricing 풀 카드

seizn.com 은 *Author 100%* — NPC 메시지 흔적 0.

## 7. Multi-product narrative

펀딩·프레스·세일즈에 들고 갈 narrative:

> Seizn은 AI 메모리 인프라를 두 청자에 공급한다. 작가에게는 IP 캐논·캐릭·씬을 검수하는 Seizn Author, 게임 스튜디오에는 NPC가 세대를 넘어 기억하는 Seizn Engine. 두 surface는 동일한 Spring·Summer·Fall·Winter 메모리 인프라 위에서 작동하며, 작가가 만든 IP가 게임 스튜디오로 흐르는 양면 시장을 형성한다.

이 narrative는 W7~W12 NPC surface 부활 시점에 펀딩 deck에 lock.

## 8. 검증 체크리스트

W6 Author launch 시점 점검:

- [ ] seizn.com Author hero — 단일 메시지·합성 sample IP demo·CTA 1개 ($39 trial)
- [ ] engine.seizn.com — 별도 도메인·visual 분리·NPC SDK 콘텐츠 100%
- [ ] 두 surface 간 cross-link은 footer만
- [ ] Author surface 4 언어 (ko·en·ja·zh) 풀 launch
- [ ] 합성 sample IP demo 작동·작가가 30초 안에 wow 모먼트
- [ ] $39/$129/$399 가격 카드 노출·BYOK 옵션 표시
- [ ] Audit log·Replay 데모 작동
- [ ] engine.seizn.com 마이그레이션 완료·dead link 0
- [ ] **KNOT 자료·캐릭·세계관·canon 노출 0건** (Seizn↔KNOT 분리 룰)
- [ ] 외부 베타 작가 1+ case study 발행 (또는 W7~W8 fast follow)

## 9. 본 brief 작업 범위 외

- Author UI 본 surface 구현 (`/app`) — Codex 작업·`docs/author-ui/` 산출물 활용
- engine.seizn.com 부활 풀 리디자인 — W7~W12 신호 후 별 cycle
- 콘텐츠 마케팅 풀 트랙 (블로그·webinar·conference talk) — W5+ 별 cycle
- 펀딩 deck multi-product narrative — W7+ 별 cycle
- 합성 sample IP 풀 설계 — 별 brief (W0~W2)
- 외부 베타 작가 모집·온보딩 SOP — 별 brief (W3~W4)
