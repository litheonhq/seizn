---
doc_type: ui-component-inventory
version: v1
generated_at: 2026-05-02
applies_to: Seizn Author surface 컴포넌트 목록
---

# Author UI Component Inventory

> 7 화면에서 재사용되는 *컴포넌트 카탈로그*. 디자인 시스템 baseline.

## 1. 기본 컴포넌트 (Atomic)

| 컴포넌트 | 용도 | Props |
|---|---|---|
| `Button` | 액션 트리거 | variant (primary·secondary·ghost·danger), size, icon, loading, disabled |
| `IconButton` | 컴팩트 액션 | icon, tooltip, variant, size |
| `Badge` | status·tag 표시 | variant (status·tier·scope·confidence), label |
| `Tag` | scope·tier·category 라벨 | text, removable, color |
| `Chip` | 다중 선택 필터 | text, selected, removable |
| `Avatar` | 캐릭·작가 아이콘 | src, fallback, size |
| `Tooltip` | 호버 정보 | content, position |
| `Spinner` | 로딩 | size |
| `ProgressBar` | 파싱·추출 진행 | value, max, label |
| `Toast` | 알림 (success·error·warning·info) | message, type, duration |
| `Modal` | 결정·confirmation | title, body, actions |
| `Drawer` | 사이드 패널 | side (left·right), open |
| `Tabs` | 탭 navigation | tabs, activeTab |
| `Divider` | 시각 구분 | orientation |

## 2. 입력 컴포넌트

| 컴포넌트 | 용도 |
|---|---|
| `TextInput` | 텍스트 입력 |
| `Textarea` | 다중 줄 |
| `Select` | 단일 선택 (status·scope·tier 등) |
| `MultiSelect` | 다중 (캐릭 등장·tag 부여) |
| `DatePicker` | valid_at·invalid_at 입력 |
| `RangeSlider` | confidence·timeline 시점 |
| `Switch` | 토글 (sync 방향·다크 모드) |
| `Checkbox` | 다중 선택 |
| `RadioGroup` | 단일 선택 (옵션) |
| `FilePicker` | 업로드 |
| `DropZone` | drag&drop |
| `KeyboardShortcutDisplay` | 단축키 가이드 모달 |

## 3. Status / 메타 컴포넌트

| 컴포넌트 | 용도 |
|---|---|
| `StatusBadge` | candidate·canon·rejected·retired 등 (10 status enum) |
| `ConfidenceMeter` | 0.0~1.0 시각화 (3 단계 색) |
| `TierIndicator` | tier:1·2 표시 + 🔒 author_only 시 |
| `ScopeBadge` | global·short1·short2·short3·main |
| `SourceLink` | 클릭 시 source 미리보기·md line range |
| `ExcerptHighlight` | 근거 문장 highlight |
| `DiffView` | 기존 vs 새 fact 비교 |

## 4. 카드·아이템 컴포넌트

| 컴포넌트 | 용도 |
|---|---|
| `CandidateCard` | Review Queue의 단일 후보 |
| `CharacterCard` | 캐릭 요약 카드 (목록·관계 그래프 hover) |
| `EventCard` | 사건 카드 (Timeline) |
| `ConflictCard` | 충돌 카드 (Conflict Inbox) |
| `DocumentCard` | 업로드된 문서 (Inbox) |
| `MemoryCard` | 메모리 항목 (Character Card 내부) |
| `RelationshipBadge` | 관계 type 표시 (graph edge label) |
| `SimulationCandidateCard` | 시뮬레이션 출력 카드 (thought·dialogue·action·canon_risk·근거) |
| `ProjectCard` | 대시보드 프로젝트 그리드 |

## 5. 시각화 컴포넌트

| 컴포넌트 | 용도 | 의존 라이브러리 |
|---|---|---|
| `RelationshipGraph` | 관계망 시각화 | Cosmos.gl |
| `MiniGraph` | 캐릭 카드 내부 ego-network | Sigma.js (가벼움) |
| `Timeline` | D1~D35 가로 스크롤 | 자체 또는 vis-timeline |
| `MemoryHeatmap` | 캐릭별 fact 분포 시각화 | D3 |
| `EventInfluencePanel` | 사건 → 영향 받은 caracters/relationships 시각화 | 자체 |

## 6. 패널·레이아웃

| 컴포넌트 | 용도 |
|---|---|
| `MainLayout` | 전역 레이아웃 (top nav + sidebar + main) |
| `ProjectLayout` | 프로젝트 진입 후 (project nav + main) |
| `SplitPanel` | 좌·우 분할 (조정 가능) |
| `ResizableDrawer` | 우측 source preview 등 |
| `EmptyState` | 데이터 없는 상태 (CTA 포함) |
| `ErrorState` | 오류 표시 + 복구 액션 |
| `LoadingState` | 로딩 (스피너·skeleton) |
| `OnboardingTutorial` | 첫 사용 가이드 overlay |

## 7. 액션·네비게이션

| 컴포넌트 | 용도 |
|---|---|
| `TopNav` | 전역 navigation·logo·프로젝트·계정 |
| `SidebarNav` | 프로젝트 진입 후 화면 navigation·뱃지 |
| `Breadcrumb` | 위치 표시 (Dashboard > KNOT > Review) |
| `CommandPalette` | ⌘K·키보드 빠른 navigation·검색 |
| `KeyboardShortcutBar` | 화면 하단 단축키 안내 (Review Queue) |

## 8. 검수 액션 컴포넌트 (Review Queue 핵심)

| 컴포넌트 | 단축키 | 효과 |
|---|---|---|
| `ApproveButton` | A | candidate → canon |
| `RejectButton` | R | candidate → rejected |
| `RetireButton` | T | retired |
| `PastOnlyButton` | P | past_only + invalid_at modal |
| `MergeButton` | M | 병합 modal |
| `SplitButton` | S | 분할 modal |
| `AssignKnowledgeButton` | K | character_known + 캐릭 multi-select modal |
| `AuthorOnlyButton` | O | author_only |
| `ScopeChangeButton` | C | scope/tier 변경 modal |
| `EscalateConflictButton` | X | Conflict Inbox로 |

## 9. 시뮬레이션 입력·출력

| 컴포넌트 | 용도 |
|---|---|
| `SceneInputForm` | 씬 입력 (텍스트·setting·캐릭·시점·압력·perspective) |
| `SimulationRunButton` | 실행·진행률·토큰 사용량 표시 |
| `SimulationCandidateGrid` | 5~10 candidate 출력 grid |
| `EvidencePanel` | 선택 candidate의 근거 메모리·graph edge·페르소나 |
| `CanonRiskIndicator` | low·medium·high·leak warning |

## 10. 결제·계정

| 컴포넌트 | 용도 |
|---|---|
| `PricingTable` | 4 tier (Author·Pro·Studio·Enterprise) |
| `UsageMeter` | 토큰 cap·overage·BYOK 상태 |
| `BYOKKeyManager` | Anthropic API key 등록·테스트·제거 |
| `BillingHistory` | 결제 이력 |
| `PlanSwitcher` | 업그레이드·다운그레이드 |

## 11. Sync·내보내기

| 컴포넌트 | 용도 |
|---|---|
| `SyncStatusIndicator` | 옵시디언·노션 sync 상태 (top nav) |
| `SyncSettingsPanel` | sync 방향·주기·충돌 해결 설정 |
| `ExportDialog` | Markdown·JSON·옵시디언 vault 내보내기 |
| `ConflictResolutionModal` | sync 충돌 시 작가 결정 |

## 12. 디자인 토큰

```text
색상:
- ivory (배경 베이스·라이트)
- ink (텍스트·다크)
- dawn (악센트·CTA·Seizn 자체 톤·Usan과 차별)
- status colors: green (canon)·gray (candidate)·red (rejected/conflict)·purple (author_only)·yellow (warning)
- tier colors: blue (tier 1)·orange (tier 2 author_only)
- scope colors: gold (global)·indigo (short1)·crimson (main)

폰트:
- Headers: Pretendard Variable (한국어 1순위)
- Body: Pretendard Variable / Inter (영문 fallback)
- Mono: JetBrains Mono (source excerpt·debug)

간격:
- xs (4) · sm (8) · md (16) · lg (24) · xl (32) · 2xl (48)

라운드:
- sm (4) · md (8) · lg (16) · full (∞)

그림자:
- subtle (카드)·elevated (modal)·overlay (drawer)
```

## 13. 컴포넌트 우선순위 (Phase 1 MVP)

**Must have**:
- Button·Badge·Tag·StatusBadge·SourceLink·ExcerptHighlight
- CandidateCard·CharacterCard·ConflictCard·DocumentCard
- MainLayout·ProjectLayout·SplitPanel·EmptyState
- TopNav·SidebarNav
- 검수 액션 10 버튼 + 단축키
- TextInput·Textarea·Select·DropZone·FilePicker

**Should have (Phase 2)**:
- RelationshipGraph (Cosmos.gl)·MiniGraph·Timeline
- SimulationCandidateGrid·EvidencePanel
- BYOKKeyManager·UsageMeter
- SyncStatusIndicator·ConflictResolutionModal

**Nice to have (Phase 3)**:
- MemoryHeatmap·EventInfluencePanel
- CommandPalette·OnboardingTutorial 풀
- 다국어 외 주요 4개 (en·ja·zh)

## 14. 기존 Seizn 컴포넌트 재사용

Seizn (NPC 메모리)에 이미 있는 컴포넌트:
- TopNav·SidebarNav·Modal·Drawer·Toast (재사용 OK)
- PaddleInit·CheckoutButton (결제 인프라)
- 22언어 dictionary (i18n 인프라)
- LanguageSwitcher (재사용)

Author 신규 surface 빌드 시 *Seizn 디자인 시스템 fork* 후 *Author 톤 (ivory·ink·dawn)*으로 token 재정의.
