---
phase: Auth token migration (Phase D″ scope 확장 — auth 3 페이지)
status: pending-codex-dispatch
last_updated: 2026-05-03
parent_phase: Phase D″ landing token migration (commit 1d3a3c49 + audit-fix 4557c7b0)
discovered_by: 사용자 dogfood 진입 시 sign-in 페이지 첫 인상 결함 (스크린샷)
---

# Auth 페이지 V1 token migration handoff

## Context

Phase D″에서 landing 9 sections를 monochrome ink + 3 signals 토큰으로 마이그레이션 완료. 그러나 auth 페이지(login·signup·device)는 Phase D″ scope 밖이어서 옛 brand stack (violet/purple/cyan 그라데이션 + `szn-*` 토큰 + Geist 폰트) 그대로 유지. dogfood 진입 사용자가 sign-in 페이지 첫 인상 brand inconsistency 발견.

**대상 영역**:
- `src/app/(auth)/layout.tsx` (Geist 폰트 → Pretendard + Source Serif 4 + JetBrains Mono)
- `src/app/(auth)/login/login-form.tsx`
- `src/app/(auth)/signup/signup-form.tsx`
- `src/app/(auth)/device/device-form.tsx`

**별 이슈** (본 handoff 외 — 사용자 action):
- Cloudflare Turnstile 위젯 로드 실패 (preview env). 사용자가 Vercel preview env에서 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 제거 → 위젯 미렌더·sign-in 통과 가능. Codex scope 밖.
- 앱 전체 token migration (152 files dashboard/docs/legal) = founding member outreach 직전 별 cycle.

## V1 token 참조

`src/styles/tokens.css` (Phase D″에서 lock):

```css
:root {
  /* monochrome slate */
  --ink-0: oklch(0.99 0.003 250);   /* 거의 흰 */
  --ink-50: oklch(0.975 0.005 250);
  --ink-100: oklch(0.95 0.006 250);
  --ink-200: oklch(0.90 0.008 250);
  --ink-300: oklch(0.80 0.010 250);
  --ink-400: oklch(0.65 0.012 250);
  --ink-500: oklch(0.50 0.014 250);
  --ink-600: oklch(0.38 0.016 250);
  --ink-700: oklch(0.28 0.016 250);
  --ink-800: oklch(0.20 0.014 250);
  --ink-900: oklch(0.14 0.012 250); /* 거의 검정 */
  --ink-950: oklch(0.09 0.010 250);

  /* 3 semantic signals */
  --signal-canon: oklch(0.62 0.16 148);     /* green */
  --signal-canon-soft: oklch(0.94 0.05 148);
  --signal-canon-ink: oklch(0.32 0.10 148);
  --signal-conflict: oklch(0.60 0.21 27);   /* red */
  --signal-conflict-soft: oklch(0.96 0.04 27);
  --signal-conflict-ink: oklch(0.36 0.16 27);
  --signal-pending: oklch(0.72 0.13 85);    /* yellow */
  --signal-pending-soft: oklch(0.96 0.05 85);
  --signal-pending-ink: oklch(0.40 0.12 85);

  --font-sans: "Pretendard", ...;
  --font-serif: "Source Serif 4", ...;
  --font-mono: "JetBrains Mono", ...;

  --radius-md: 8px;
  --shadow-md: 0 4px 12px oklch(0.14 0.012 250 / 0.06), 0 1px 3px oklch(0.14 0.012 250 / 0.04);
  --shadow-lg: 0 18px 40px oklch(0.14 0.012 250 / 0.10), 0 2px 6px oklch(0.14 0.012 250 / 0.04);
}
```

`src/components/landing/brand-marks.tsx` (Mark A·재사용):

```tsx
export function SeiznMark({ size = 32, color = "currentColor", title }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <line x1="8" y1="9" x2="22" y2="11" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="8" y1="9" x2="11" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="22" y1="11" x2="24" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <line x1="11" y1="23" x2="24" y2="23" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <circle cx="8" cy="9" r="3" fill={color} />
      <circle cx="22" cy="11" r="2.4" fill={color} />
      <circle cx="11" cy="23" r="2.2" fill={color} />
      <circle cx="24" cy="23" r="3.2" fill={color} />
    </svg>
  );
}

export function SeiznLockup({ variant = "graph", tone = "dark", size = "md" });
// tone="dark" → ink-900 / tone="light" → ink-0
```

Auth 페이지에서는 `<SeiznLockup variant="graph" tone="dark" size="md" />` 직접 import해서 로고 자리에 사용.

## 토큰 매핑 표 (옛 → V1)

| 옛 토큰 | V1 매핑 |
|---|---|
| `szn-text-1` (가장 진한 텍스트) | `var(--ink-900)` |
| `szn-text-2` (중간 톤) | `var(--ink-600)` 또는 `var(--ink-700)` |
| `szn-text-3` (가장 옅은 톤) | `var(--ink-500)` |
| `szn-card` (카드 배경) | `var(--ink-0)` |
| `szn-surface-1` (표면 배경) | `var(--ink-50)` |
| `szn-border` (테두리) | `var(--ink-200)` |
| `gradient-hero` (배경) | `var(--ink-50)` solid (또는 `var(--ink-0)` 단색) |
| `from-violet-500 via-purple-500 to-cyan-500` (Sign In btn) | `var(--ink-900)` 단색·hover `var(--ink-700)`·text `var(--ink-0)` |
| `bg-violet-200/30·bg-cyan-200/20·bg-purple-200/20` (decorative blob 3개) | **제거 (DOM 통째 삭제)** — V1 디자인은 절제·blob X |
| `text-purple-600 / hover:text-purple-500` (Sign up 링크) | `var(--ink-900)` 텍스트 + `text-decoration: underline` 또는 `var(--signal-canon-ink)` |
| `bg-red-50·border-red-200·text-red-600` (auth error) | `var(--signal-conflict-soft)`·`var(--signal-conflict)`·`var(--signal-conflict-ink)` |
| `bg-gray-900·hover:bg-gray-800` (GitHub OAuth btn) | `var(--ink-900)`·hover `var(--ink-800)`·text `var(--ink-0)` (그대로 정합 — 단지 hex 대신 token 사용 권장) |
| `input-elegant` (커스텀 input 클래스) | 유지 (별 cycle에서 정합 검증). 본 cycle에선 그대로 |
| `bg-szn-card / hover:bg-szn-surface-1 / border-szn-border` (Google OAuth btn) | `var(--ink-0)` / hover `var(--ink-50)` / border `var(--ink-200)` |

## Phase A — 폰트 마이그레이션 (`auth/layout.tsx`)

### 변경

`src/app/(auth)/layout.tsx`:

1. **삭제** — Geist import + variable:
```tsx
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
```

2. **대체** — landing과 동일한 폰트 시스템. `src/styles/tokens.css`가 globals.css에 import되는지 확인 후, layout body className을 단순화:
```tsx
<body className="antialiased" style={{ fontFamily: "var(--font-sans)" }}>
  {children}
</body>
```

3. **viewport themeColor 갱신**: `"#0A0A0A"` → `"oklch(0.14 0.012 250)"` 또는 그대로 유지 (브라우저 호환). 후자 권장.

### 검증

- typecheck pass·lint pass
- `next/font` warning 0 (Phase D″의 `@next/next/no-page-custom-font` warning과 별개)
- 시각: auth body 폰트가 Pretendard + Source Serif 4로 보임

## Phase B — Login form (`login-form.tsx`)

### 변경

#### B-1 로고 영역 (line 100-111)

**제거**:
```tsx
<div className="text-center mb-8">
  <Link href="/" className="inline-flex items-center gap-2 group">
    <div className="w-10 h-10 bg-gradient-to-br from-violet-500 via-purple-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
      <span className="text-white font-bold text-lg">S</span>
    </div>
    <span className="text-3xl font-bold bg-gradient-to-r from-szn-text-1 to-szn-text-3 bg-clip-text text-transparent">
      Seizn
    </span>
  </Link>
  <p className="text-szn-text-2 mt-3">Sign in to your account</p>
</div>
```

**대체**:
```tsx
import { SeiznLockup } from "@/components/landing/brand-marks";
// ...
<div className="text-center mb-8">
  <Link href="/" className="inline-flex items-center group">
    <SeiznLockup variant="graph" tone="dark" size="md" />
  </Link>
  <p className="mt-3" style={{ color: "var(--ink-600)", fontSize: "14px" }}>Sign in to your account</p>
</div>
```

#### B-2 배경 + decorative blob (line 85-97)

**제거** (DOM 통째 삭제):
```tsx
<div className="min-h-screen gradient-hero relative overflow-hidden flex items-center justify-center p-4">
  {/* Decorative Floating Elements */}
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    <div className="absolute top-20 left-10 w-72 h-72 bg-violet-200/30 rounded-full blur-3xl animate-float" />
    <div className="absolute top-40 right-20 w-96 h-96 bg-cyan-200/20 rounded-full blur-3xl animate-float" style={{ animationDelay: "2s" }} />
    <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-purple-200/20 rounded-full blur-3xl animate-float" style={{ animationDelay: "4s" }} />
  </div>
```

**대체**:
```tsx
<div
  className="min-h-screen flex items-center justify-center p-4"
  style={{ background: "var(--ink-50)", fontFamily: "var(--font-sans)" }}
>
```

#### B-3 카드 (line 114)

**변경**:
```tsx
<div className="szn-card rounded-3xl p-8 shadow-xl">
```
→
```tsx
<div
  className="rounded-2xl p-8"
  style={{
    background: "var(--ink-0)",
    border: "1px solid var(--ink-200)",
    boxShadow: "var(--shadow-md)",
    color: "var(--ink-900)",
  }}
>
```

(`rounded-3xl` → `rounded-2xl` — landing 톤 정합. radius 16px 정도)

#### B-4 에러 박스 (line 116-123)

**변경**:
```tsx
<div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-3">
```
→
```tsx
<div
  className="mb-6 p-4 rounded-md text-sm flex items-center gap-3"
  style={{
    background: "var(--signal-conflict-soft)",
    border: "1px solid var(--signal-conflict)",
    color: "var(--signal-conflict-ink)",
  }}
>
```

#### B-5 GitHub OAuth 버튼 (line 127-136)

**변경**:
```tsx
className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-gray-900 hover:bg-gray-800 rounded-xl text-white font-medium transition-all duration-300 disabled:opacity-50 shadow-md hover:shadow-lg"
```
→
```tsx
className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md font-medium transition-colors duration-160 disabled:opacity-50"
style={{
  background: "var(--ink-900)",
  color: "var(--ink-0)",
  border: "1px solid var(--ink-900)",
}}
onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-800)")}
onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ink-900)")}
```

또는 hover는 CSS class로 (전역 `:hover { background: var(--ink-800) }` 추가).

(권장: utility class 신설 — `globals.css`에 `.auth-btn-primary {...}`·`.auth-btn-primary:hover {...}` 등록 후 className 만 부여. 인라인 onMouseEnter/Leave 회피.)

#### B-6 Google OAuth 버튼 (line 138-162)

**변경**:
```tsx
className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-szn-card hover:bg-szn-surface-1 border border-szn-border rounded-xl text-szn-text-1 font-medium transition-all duration-300 disabled:opacity-50 shadow-sm hover:shadow-md"
```
→
```tsx
className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md font-medium transition-colors duration-160 disabled:opacity-50 auth-btn-secondary"
style={{
  background: "var(--ink-0)",
  color: "var(--ink-900)",
  border: "1px solid var(--ink-200)",
}}
```

(`auth-btn-secondary:hover { background: var(--ink-50); }` globals.css에 등록)

#### B-7 Divider (line 166-170)

**변경**:
```tsx
<div className="flex items-center my-6">
  <div className="flex-1 border-t border-szn-border"></div>
  <span className="px-4 text-szn-text-3 text-sm">or</span>
  <div className="flex-1 border-t border-szn-border"></div>
</div>
```
→
```tsx
<div className="flex items-center my-6">
  <div className="flex-1" style={{ borderTop: "1px solid var(--ink-200)" }}></div>
  <span className="px-4 text-sm" style={{ color: "var(--ink-500)" }}>or</span>
  <div className="flex-1" style={{ borderTop: "1px solid var(--ink-200)" }}></div>
</div>
```

#### B-8 Form labels (line 175, 190)

**변경**:
```tsx
<label htmlFor="login-email" className="block text-sm font-medium text-szn-text-1 mb-2">
```
→
```tsx
<label htmlFor="login-email" className="block text-sm font-medium mb-2" style={{ color: "var(--ink-900)" }}>
```

(password label도 동일)

#### B-9 Sign In 버튼 (line 216-232)

**변경**:
```tsx
className="w-full py-3.5 btn-premium bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-500 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl"
```
→
```tsx
className="w-full py-3.5 rounded-md font-semibold transition-colors duration-160 disabled:opacity-50 auth-btn-primary"
style={{
  background: "var(--ink-900)",
  color: "var(--ink-0)",
  border: "1px solid var(--ink-900)",
  fontSize: "15px",
}}
```

(`auth-btn-primary:hover { background: var(--ink-700); }` globals.css에 등록)

`btn-premium` 클래스 잔존 시 globals.css에서 정의 확인·필요시 제거 (옛 그라데이션 효과).

#### B-10 Sign up 링크 (line 236-241)

**변경**:
```tsx
<p className="mt-6 text-center text-szn-text-2 text-sm">
  Don&apos;t have an account?{" "}
  <Link href={signupHref} className="text-purple-600 hover:text-purple-500 font-medium transition-colors">
    Sign up
  </Link>
</p>
```
→
```tsx
<p className="mt-6 text-center text-sm" style={{ color: "var(--ink-600)" }}>
  Don&apos;t have an account?{" "}
  <Link href={signupHref} className="font-medium" style={{ color: "var(--ink-900)", textDecoration: "underline" }}>
    Sign up
  </Link>
</p>
```

#### B-11 Back to home 링크 (line 245-252)

**변경**:
```tsx
<Link href="/" className="text-szn-text-3 hover:text-szn-text-2 text-sm flex items-center justify-center gap-1 transition-colors">
```
→
```tsx
<Link href="/" className="text-sm flex items-center justify-center gap-1 transition-colors" style={{ color: "var(--ink-500)" }}>
```

(hover:text-ink-700 — utility class로 등록 권장)

## Phase C — Signup form (`signup-form.tsx`)

login-form.tsx와 **동일 패턴 적용**. signup-form.tsx 안에서 동일 옛 토큰 grep:
- `bg-gradient-to-br from-violet-500 via-purple-500 to-cyan-500` (로고)
- `bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-500` (Sign Up 버튼)
- `bg-violet-200·bg-cyan-200·bg-purple-200` (decorative blob)
- `gradient-hero`
- `szn-*` 토큰 (`szn-text-1·2·3·szn-card·szn-border·szn-surface-1`)
- `text-purple-600` / `text-purple-500`
- `bg-red-50·border-red-200·text-red-600` (error)
- `bg-gray-900·hover:bg-gray-800` (OAuth btn)

→ 모두 위 매핑 표대로 마이그레이션.

추가로 signup-form.tsx에는 success state·API key 표시 영역이 있음. 그쪽도 정합 확인:
- 성공 박스 = `var(--signal-canon-soft)` + border `var(--signal-canon)` + text `var(--signal-canon-ink)`
- API key 코드 블록 = `var(--ink-50)` 배경 + JetBrains Mono 폰트
- "Copy" 버튼 = `var(--ink-900)` solid

## Phase D — Device form (`device-form.tsx`)

login·signup과 동일. 동일 옛 토큰 grep + 매핑 적용.

추가로 device-form 특이 영역 (state별 박스 — `confirming·approved·denied·error·expired`) 색상 매핑:
- `confirming` (대기) = `var(--signal-pending-soft)` + border `var(--signal-pending)` + text `var(--signal-pending-ink)`
- `approved` (성공) = `var(--signal-canon-soft)` + `var(--signal-canon)` + `var(--signal-canon-ink)`
- `denied` / `error` / `expired` = `var(--signal-conflict-soft)` + `var(--signal-conflict)` + `var(--signal-conflict-ink)`

## Phase E — `globals.css` 정합

옛 토큰 정의 정리:

1. **잔존 사용처 grep** — `szn-text-1·szn-card·szn-border·gradient-hero·btn-premium·input-elegant` 등이 globals.css에 정의돼 있을 가능성. **본 cycle에선 정의 자체 삭제 X** (152 files 다른 영역에서 아직 참조 중). 이후 별 cycle에서 일괄 정리.
2. **신규 utility class 등록** (auth 3 페이지 공유):

```css
/* auth-* utility (V1 token 정합) */
.auth-btn-primary {
  background: var(--ink-900);
  color: var(--ink-0);
  border: 1px solid var(--ink-900);
  transition: background 160ms ease;
}
.auth-btn-primary:hover {
  background: var(--ink-700);
}
.auth-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-btn-secondary {
  background: var(--ink-0);
  color: var(--ink-900);
  border: 1px solid var(--ink-200);
  transition: background 160ms ease;
}
.auth-btn-secondary:hover {
  background: var(--ink-50);
}
.auth-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-btn-oauth-github {
  background: var(--ink-900);
  color: var(--ink-0);
  border: 1px solid var(--ink-900);
  transition: background 160ms ease;
}
.auth-btn-oauth-github:hover {
  background: var(--ink-800);
}
```

→ login·signup·device form에서 위 class 사용.

## 검증 (Codex 자체 실행)

각 단계 후 다음 명령:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run verify:knot-separation
```

**합격 기준**:
- typecheck pass
- lint pass (기존 1 warning `@next/next/no-page-custom-font`만 허용)
- test 1171 pass·skip 16 (Phase D″ baseline 유지)
- build pass
- knot-separation 0 matches

**Auth 페이지 grep 검증** (수동):

```bash
# 옛 그라데이션 stack 0 hits
grep -rn "from-violet-\|from-purple-\|via-purple-\|to-cyan-\|bg-cyan-\|bg-violet-\|bg-purple-" src/app/\(auth\)/

# 옛 szn-* 토큰 0 hits (auth scope 한정)
grep -rn "szn-text-\|szn-card\|szn-border\|szn-surface\|gradient-hero\|btn-premium" src/app/\(auth\)/

# 옛 hex 색 직접 사용 0 hits
grep -rn "text-purple-\|text-red-\|bg-red-\|border-red-\|bg-gray-900" src/app/\(auth\)/
```

각 grep = 0 hits 도달까지 fix 반복.

**Mark A 사용 검증**:

```bash
grep -rn "SeiznLockup\|SeiznMark" src/app/\(auth\)/
# 3 페이지 모두에서 1+ hits
```

## 비-scope (본 cycle 제외)

- 152 files 앱 전체 token migration (dashboard·docs·legal·settings 등) → 별 cycle (founding member outreach 직전)
- Cloudflare Turnstile 위젯 에러 진단·해소 → 사용자 Vercel preview env 조작 (Codex scope 밖)
- `globals.css` 옛 token 정의 일괄 삭제 → 별 cycle (의존 152 files migration 후)
- `input-elegant` 클래스 정합 검증 → 별 cycle
- Auth 페이지 i18n (login/signup 카피 ko/ja/zh-hans) → Designer Round 3 cycle에 흡수 가능

## 커밋 메시지

```
fix(auth): migrate login/signup/device pages to V1 monochrome ink + Mark A

- Replace gradient logo with SeiznLockup (Mark A canon-graph node)
- Replace violet/purple/cyan gradient buttons with ink-900 solid (auth-btn-primary)
- Remove decorative violet/cyan/purple blob backgrounds
- Migrate szn-* tokens to ink-* (text/card/border/surface)
- Migrate Geist font to Pretendard + Source Serif 4 + JetBrains Mono
- Migrate red error box to signal-conflict tokens
- Add auth-btn-primary/secondary/oauth utility classes in globals.css

Phase D'' scope expanded to cover auth pages (originally landing-only).
Discovered via dogfood entry — sign-in page brand inconsistency with new V1 tokens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## 본 cycle 후 처리 (Claude session)

1. runbook §9 entry 추가:
   - 2026-05-03 — **Auth token migration (Phase D″ scope 확장)** commit `<sha>` — login·signup·device 3 페이지 + auth/layout 폰트·Mark A 로고·monochrome ink·`auth-btn-*` utility 신설. dogfood 진입 시 발견된 P1 brand 잔재 해소
2. todo list 진행:
   - Auth migration 완료 후 dogfood 재개 (Turnstile 별도 user action)
3. 152 files 앱 전체 migration scope 평가는 founding member outreach 직전 별 cycle
