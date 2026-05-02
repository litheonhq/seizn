# Canon-Conflict Detector

_Started 2026-05-02 22:17 UTC_

---

## User



## Assistant

I'll design the Seizn Author landing page from scratch — this is your own product (Litheon LLC), so we're creating original brand work, not recreating anyone else's UI. The brief is rich, but I have several real choices to make before building. Let me ask focused questions first.

_[tool: questions_v2]_

## User

Questions answered:
- scope_first_pass: 2–3 hero + brand-mark concepts on a canvas (compare directions, pick one, then expand)
- brand_mark_direction: Show me 3–4 options on a canvas
- color_direction: Monochrome + one signal color (red or green) for canon-conflict semantics
- type_pairing: Pretendard (body) + GT Sectra or similar editorial serif (headings) — author-tool feel
- hero_aesthetic: Split hero — dark left (copy + CTA) / light right (live demo widget)
- demo_widget: Live canon-conflict detector — type a fact, watch it reconcile against existing canon
- cta_flow: Hero shows inline plan picker (Indie / Pro / Studio chips) → straight to checkout
- engine_tease: Hidden behind env flag (W7+) — design but don't show until enabled
- tweaks_wanted: All of the above
- lang_priority: English only (master) — others later
- quotes_reminder: Confirmed — single quotes or none
- reference_screenshots: uploads/reference_screenshots-1777760881798.png
- anything_else: Brand 분리 룰 (절대):
- NO 한글·아시아 모티브 (Celovin)
- NO S+C 모노그램 (Celovin)
- NO warm cream / terracotta / serif (TheLabForge·NovelCrafter·Anthropic)
- NO ivory / ink / dawn (Usan)
- NO purple / violet (Sudowrite)
- NO book / page imagery 직접 사용 (NovelCrafter)
- NO pure black + lime (Linear)

Reference (피해야 할 곳):
- Sudowrite, NovelCrafter — 직접 경쟁군·시각 회피

Reference (영감):
- Linear, Vercel, Anthropic, Notion AI — 톤·discipline·editorial 정합
- Stripe, GitHub — engineer-friendly + reliable feel

Copy lock:
- v7 가격: Indie $39 / Pro $149 / Studio $499 / Enterprise $2,500 (USD/mo)
- yearly ~15% off, BYOK 50% off + unlimited tokens
- 30-day trial, no credit card
- Sample IP 'Saebyeok' = 합성 데모 (8 chars, 22 rules, 30 day timeline, 50 review cases)
- Hero subtitle: 1~2 문장 punch line, replay/canon authority/author control 강조

Constraints:
- KNOT 자료 0 (CI grep 가드 강제)
- Lighthouse 100 accessibility 회귀 X
- WCAG AA 강제
- Mobile (360px), tablet (768px), desktop (1440px) parity 필수
- 4 lang (en master + ko/ja/zh-hans) 동등 weight, KO line break 균형 검증

Brand mark 후보 (Q2 expand 시):
- Modular grid / canon-graph node mark — tech-forward, hero 약속 정합
- Layered pages / book-spine stack — author·memory motif (단, NovelCrafter book 회피)
- Custom wordmark only (Linear/Vercel style) — minimalist
- Bracketed/coded mark (e.g. [seizn]) — engineer-tool feel, dual-surface 정합

Color signal mapping (Q3 monochrome + signal 채택 시):
- canon-conflict critical = red signal
- canon-validated = green signal
- 일반 UI = monochrome (slate 또는 indigo 계열)

## Assistant

Excellent answers. Let me look at the reference screenshot and start building.

_[tool: view_image]_

Got it — I can see the current Phase D state. Now let me plan and build.

**Design system I'm committing to:**
- **Type:** Pretendard (body) + Source Serif 4 as the GT Sectra stand-in (free, similar editorial tone) for headings. Mono: JetBrains Mono for canon/conflict surfaces.
- **Color:** Monochrome slate base + dual signal — `oklch(0.62 0.19 145)` validated-green and `oklch(0.62 0.22 25)` conflict-red. No cyan, no purple, no warm cream. Single neutral accent: a near-black ink for primary CTAs, with the green signal reserved for validation/CTAs only when semantic.
- **Hero:** Split — dark left (copy + inline plan picker) / light right (live conflict detector demo).
- **Brand mark:** 4 candidates on the canvas — node-graph, layered strata (abstracted, NOT a book), bracketed `[seizn]`, pure wordmark.

I'll deliver a **design canvas** with: 4 brand marks side-by-side, then 2 hero concepts as full artboards. You pick, I expand.

_[tool: update_todos]_

_[tool: copy_starter_component]_

_[tool: copy_starter_component]_

Now let me build the design tokens, brand marks, and hero concepts. I'll split into a few files to keep things manageable.

_[tool: write_file]_

Now the brand marks, hero variants, demo widget, and a Saebyeok data file:

_[tool: write_file]_

## Assistant

_[tool: write_file]_

Now the live conflict-detector demo widget:

_[tool: write_file]_

_[tool: snip]_

Now the canon-graph component for hero concept A and the hero artboards:

_[tool: write_file]_

Now the hero artboards and the main canvas:

_[tool: write_file]_

_[tool: snip]_

Now the main HTML file that ties it all together as a design canvas:

_[tool: read_file]_

_[tool: snip]_

Now the main HTML canvas:

_[tool: write_file]_

_[tool: snip]_

_[tool: show_html]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

**Round 1 delivered.** Open the canvas — you'll see five sections stacked top to bottom:

1. **Brand mark — 4 candidates** (A graph-node · B strata · C bracketed · D wordmark+dot), each rendered light + dark.
2. **Hero — 2 split-layout directions** (A graph-led · B detector-led).
3. **Live demo** — full conflict detector + canon graph (light & dark).
4. **Design system** — color, type, components.
5. **My reading + next round** — recommendation + what I'd do after you pick.

**My pick:** Hero B + Mark A. Hero B puts the canon-authority wedge in front of the visitor (type a fact → see verdict). Mark A carries the same idea into the brand and survives at favicon size. Mark D is the strong fallback if you want more editorial restraint.

**Covered this round:** N (subtitle trim), O (graph edges), P (demo redundancy), S (inline plan picker), U (4 marks). T/R/Q wait for round 2 once you've locked direction.

Pick a mark + hero (or tell me to mix — e.g. Mark D with Hero B) and I'll expand to the full 11-section landing with mobile/tablet artboards.

## User

Verifier agent check completed

## Assistant

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: done]_

Bumped Hero A to 780 and Hero B to 820 — the headline/copy/picker stack now fits without clipping.

## User

Locks (Round 1 → Round 2):

Mark + Hero pair:
- Mark A · canon-graph node — designer 추천 채택. Mark D는 editorial fallback으로 보존 (시장 반응이 너무 tech-skewed라고 느껴지면 swap 가능)
- Hero B · detector-led — 채택. wedge가 약속 X·증명 O로 작동
- 토큰 system 그대로 lock (monochrome slate + 3 signals + Pretendard + Source Serif 4 + JetBrains Mono)

Round 2 open questions 답:

Workflow (T): numbered horizontal flow — Step 1/2/3 equal weight·mobile에서 vertical stack. asymmetric은 sub-section variety에만 한정.

Pricing: Indie/Pro emphasized + Studio/Enterprise slimmer side. founding member skew = solo + heavy-author·Studio는 stretch tier·Enterprise는 contact-sales motion. 4 tier 모두 equal weight 회피.

Footer: discreet Litheon LLC mention — '© 2026 Seizn by Litheon LLC · Wyoming' 작은 mono. 추가 legal block X·entity anchor만 (KYC·Stripe disclosure 정합).

Round 2 추가 요청:

- Engine tease (Q): designed-but-env-gated 그대로·Tweak에 preview toggle 노출해서 사용자가 'W7+ 활성화 후 모습'을 review 가능하게
- Mobile (R): 360 + 768 viewport artboard 필수 — KO hero '작품의 기억을, 흩어지지 않게.' 360에서 balanced wrap 검증 ('흩어지지 / 않게' 단독 줄 X)
- i18n: en master만 round 2 (다른 lang은 copy lock 후 round 3)

확장 priorities (round 2 expand 시 시각 차별화):

- Workflow (T): step icon 또는 number-on-line indicator·시각 위계 ↑
- Inputs section: 4 mode (Native·DOCX·Plain text·Google Docs) 시각 변화·아이콘
- Conflicts section: dark에서 그래프 mock + 신호 dot·card별 severity 시각 구별 (red·orange·yellow)
- Simulation section: safe/risk candidate split layout·token-level 시각 visual
- Trust section: 4 item을 grid·icon 또는 abstract glyph
- Pricing: tier별 token budget visual (1M/5M/20M/∞)·BYOK 50% off badge 명시
- FAQ: details/summary·hover 변화

Open:
- Indie/Pro 강조 시 Studio·Enterprise 어떤 layout? (slimmer card·또는 'compare plans' link만)
- Mark A favicon 16px scale 검증된 SVG export 가능?
- canon-conflict detector demo의 'fact' input — Saebyeok sample IP에서 어떤 conflict scenario를 default로? (예: '한이슬 = 2반' 입력 → '이미 1반에 등록' conflict)

## Assistant

_[tool: snip]_

Excellent — direction is locked. Round 2 brief absorbed. Quick answers to your three open items, then I build:

**Indie/Pro vs Studio/Enterprise layout:** two emphasized cards (Indie/Pro) at full width with feature lists, then a slimmer compare-strip below holding Studio + Enterprise as one-line rows with "contact sales" CTA on Enterprise. Keeps the founding-member skew without burying the stretch tiers.

**Mark A favicon:** yes — the SVG is built on a 32×32 viewBox already, 4 nodes + 4 edges, all stroke-width ≥1.4. Reads at 16px. I'll export a dedicated favicon variant with thicker strokes (1.8) and only 3 nodes for legibility at that scale.

**Default conflict scenario:** I'll seed the input with `Han Iseul transfers to Class 2 on day 9.` → flagged against `character.han_iseul.class = 1` plus `rule.r03 (rooftop access from day 14)` if it overlaps. Two-rule conflict makes a stronger demo than the eye-color one (which I'll keep as a "try" chip).

Plan for Round 2: I'll add the remaining 9 sections as full-width artboards stacked vertically below the existing canvas, plus 360 + 768 mobile artboards for hero. Tweaks panel gets the engine-tease preview toggle.

Let me build. I'll split into focused files to keep each manageable.

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

## Assistant

Now I need to update the conflict-detector default and rebuild the main HTML to assemble the full landing page. Let me first update the default seed in the detector:

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

Now let me rebuild the main HTML to assemble the full landing.

_[tool: write_file]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

_[tool: get_webview_logs]_

_[tool: snip]_

_[tool: read_file]_

The hook signature is `[t, setTweak]` array, not `{tweaks, setTweak}` object. Let me fix:

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

**Round 2 delivered.** Full landing on the canvas, plus 360 + 768 mobile artboards, favicon scale check, and locked tokens.

**What's in this round:**
- **Full desktop landing** (1440 × 5400) — Hero B (detector) + 8 sections: Workflow → Inputs → Conflicts → Simulation → Trust → Pricing → FAQ → Footer
- **Pricing structure as agreed** — Indie + Pro as primary cards (Pro highlighted dark, "most picked" badge); Studio + Enterprise as slim rows below
- **Workflow (T)** — numbered horizontal flow, disc indicators on a connecting line
- **Inputs** — 4 modes with distinct glyphs, click to swap preview
- **Conflicts** — severity-graded cards (critical/major/minor) anchored beside the canon graph
- **Simulation** — Safe vs Risk split with continuity gauge + token-level diff
- **Footer** — discreet `© 2026 Seizn by Litheon LLC · Wyoming` mono, no extra legal block
- **Mobile/tablet (R)** — 360 hero with character chip strip + vertical plan picker; 768 with scaled detector
- **Favicon scale** — Mark A at 32/24/16, light + dark; 16px gets a simplified 3-node variant

**Tweaks panel:**
- Mark variant (A graph / D dot / B strata / C bracket)
- **Engine SDK tease toggle** — flip on to preview the W7+ env-gated strip above the hero

**Detector default seed** is now `Han Iseul transfers to Class 2 on day 9.` — flagged against `character.han_iseul.class = 1`. Eye-color demoted to a try-chip.

**Not in this round, parked for round 3:** lang sweep (ko/ja/zh-hans), animation pass, empty states. My recommend is on the canvas: ship V1 to founding members, gather 4 weeks of feedback, then round 3.

## User

Round 2 great. Three small fixes before implement:

1. KNOT leak — critical (CI grep trip + 외부 surface paradox)

[section-rest.jsx]
- line 8 (Trust): 'KNOT-isolated' → 'Workspace-isolated' or 'Project-isolated'
- line 266 (FAQ #4): drop the sentence 'KNOT separation is enforced by CI grep on every build.'
  Keep only: 'Your work is isolated from sample IPs and from any public model training.'

Reason: 'KNOT' is an internal codename, conveys nothing to viewers, and our separation rule literally says 'no KNOT references in public surfaces' — using the word in marketing copy is a paradox + breaks the verify-knot-separation CI gate.

2. Pricing cadence consistency

[section-rest.jsx · TIERS_SECONDARY]
- Studio: price '$499' · tokens '20M tokens'
  → '$499 / month' · '20M tokens / mo' (match Indie/Pro format)
- Enterprise: 'From $2,500'
  → 'From $2,500 / month'

Indie/Pro use 'X / month' + 'XM tokens / mo'; secondary tier should match for read-at-a-glance parity.

3. FAQ #5 trial-archive policy — confirm scope

[section-rest.jsx:267]
'After day 30, pick a tier or your project archives in read-only mode for another 60 days.'

This 60-day read-only archive isn't in the v7 pricing lock or product memory — it reads like a designer addition. Two options:

a. Keep, and we lock the policy in product memory + Stripe/billing flow during implement.
b. Strip to 'After day 30, pick a tier to keep working.' until product owner commits.

I'm leaning (a) — it's a generous, founder-friendly default that lowers churn anxiety. Confirm before we lock copy.

That's it — once these three land, we implement. Round 3 (i18n ko/ja/zh-hans) stays as planned after copy lock.

## Assistant

My take on (3): keep it. The 60-day read-only archive matches your KYC-aware, founding-member-friendly stance and gives a soft floor that reduces churn anxiety without committing to refunds. I'll lock the copy here and flag for product memory + Stripe scope during implement.

Applying all three fixes now.

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

All three copy fixes are in:

1. **KNOT leak** — `KNOT-isolated` → `Workspace-isolated` (Trust card); the CI-grep sentence dropped from FAQ #4.
2. **Pricing cadence** — Studio now `$499 / month` + `20M tokens / mo`; Enterprise `From $2,500 / month`. Reads consistent with Indie/Pro.
3. **FAQ #5 trial-archive** — kept as you leaned. Flagging for product memory + Stripe scope at implement time.

Copy is locked. Ready to hand off for Codex build, or proceed to round 3 (lang sweep ko/ja/zh-hans + animation pass + empty states) on your call.

