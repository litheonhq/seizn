"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { SeiznLockup } from "@/components/landing/brand-marks";
import {
  AUTHOR_BILLING_TIERS,
  AUTHOR_PRICE_LOCK_VERSION,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import type { CheckoutLegalCopy } from "@/lib/checkout-copy";
import {
  AUTHOR_LANDING_COPY,
  type AuthorLandingCopy,
} from "@/components/landing/author-landing-copy";
import { formatTokenLabel, formatUsd } from "@/components/landing/section-pricing";

interface PricingClientProps {
  dict: Dictionary;
  locale: Locale;
}

type PricingLocale = "en" | "ko" | "ja" | "zh-hans";

interface PricingPageCopy {
  nav: {
    features: string;
    pricing: string;
    docs: string;
    start: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    monthly: string;
    yearly: string;
    yearlySuffix: string;
  };
  card: {
    monthly: string;
    yearly: string;
    popular: string;
    start: string;
    byokRequired: string;
  };
  launchNotes: Array<{ title: string; body: string }>;
  faq: {
    title: string;
    items: Array<{ q: string; a: string }>;
  };
  footer: {
    copyright: string;
    privacy: string;
    terms: string;
    beta: string;
    contact: string;
  };
  features: AuthorLandingCopy["pricing"]["features"];
  blurbs: AuthorLandingCopy["pricing"]["blurbs"];
  checkout: CheckoutLegalCopy;
}

const TIERS = ["indie", "pro", "studio", "enterprise"] as const satisfies readonly AuthorBillingTier[];

const PRICING_COPY: Record<PricingLocale, PricingPageCopy> = {
  en: {
    nav: {
      features: "Features",
      pricing: "Pricing",
      docs: "Docs",
      start: "Get started",
    },
    hero: {
      eyebrow: `${AUTHOR_PRICE_LOCK_VERSION} author launch pricing`,
      title: "Author memory plans for launch teams",
      subtitle:
        "Choose a managed token cap, connect Stripe Checkout, and reduce managed usage costs by adding your own Anthropic key.",
      monthly: "monthly",
      yearly: "yearly",
      yearlySuffix: " save 15%",
    },
    card: {
      monthly: "month",
      yearly: "year",
      popular: "most picked",
      start: "Start",
      byokRequired: "BYOK is required before production Enterprise use.",
    },
    launchNotes: [
      { title: "BYOK discount", body: "Active BYOK applies the 50% discount state and removes the managed token ceiling." },
      { title: "Metered overage", body: "Managed token overage is reported only for usage above the configured cap." },
      { title: "Trial archive", body: "The 30-day trial does not require a card; inactive projects archive read-only for 60 more days." },
    ],
    faq: {
      title: "Pricing FAQ",
      items: [
        { q: "Do I need a credit card for the trial?", a: "No. The Author launch trial is 30 days without a card requirement." },
        { q: "How does BYOK change pricing?", a: "When your own Anthropic key is active, the BYOK discount applies and tokens are billed directly to you." },
        { q: "What happens above my cap?", a: "Only exceeded managed usage is sent to the metered overage product." },
        { q: "Can an active subscriber start another checkout?", a: "No. Active, trialing, and past due subscribers are sent to the billing portal." },
      ],
    },
    footer: {
      copyright: "\u00a9 {year} Seizn by Litheon LLC \u00b7 Wyoming",
      privacy: "Privacy",
      terms: "Terms",
      beta: "Beta Disclosure",
      contact: "Contact",
    },
    features: AUTHOR_LANDING_COPY.pricing.features,
    blurbs: AUTHOR_LANDING_COPY.pricing.blurbs,
    checkout: AUTHOR_LANDING_COPY.checkout,
  },
  ko: {
    nav: {
      features: "기능",
      pricing: "가격",
      docs: "문서",
      start: "시작하기",
    },
    hero: {
      eyebrow: `${AUTHOR_PRICE_LOCK_VERSION} 작가 출시 가격`,
      title: "출시 팀을 위한 작가 메모리 플랜",
      subtitle:
        "관리형 토큰 한도를 고르고 Stripe Checkout을 연결합니다. Anthropic BYOK를 추가하면 관리형 사용 비용을 낮출 수 있습니다.",
      monthly: "월간",
      yearly: "연간",
      yearlySuffix: " 15% 절약",
    },
    card: {
      monthly: "월",
      yearly: "년",
      popular: "가장 많이 선택됨",
      start: "시작",
      byokRequired: "Enterprise 프로덕션 사용 전 BYOK가 필요합니다.",
    },
    launchNotes: [
      { title: "BYOK 할인", body: "BYOK가 활성화되면 50% 할인 상태가 적용되고 관리형 토큰 한도가 해제됩니다." },
      { title: "초과 사용량", body: "관리형 토큰 초과분은 설정된 한도를 넘은 사용량만 보고됩니다." },
      { title: "체험 보관", body: "30일 체험에는 카드가 필요 없습니다. 비활성 프로젝트는 60일 더 읽기 전용으로 보관됩니다." },
    ],
    faq: {
      title: "가격 FAQ",
      items: [
        { q: "체험에 카드가 필요한가요?", a: "아니요. Author 출시 체험은 카드 없이 30일입니다." },
        { q: "BYOK는 가격을 어떻게 바꾸나요?", a: "본인 Anthropic 키가 활성화되면 BYOK 할인 상태가 적용되고 토큰 비용은 직접 결제됩니다." },
        { q: "한도를 넘으면 어떻게 되나요?", a: "초과된 관리형 사용량만 미터형 초과 과금 상품으로 전송됩니다." },
        { q: "활성 구독자가 새 checkout을 시작할 수 있나요?", a: "아니요. active, trialing, past_due 상태는 결제 포털로 이동합니다." },
      ],
    },
    footer: {
      copyright: "\u00a9 {year} Seizn by Litheon LLC \u00b7 Wyoming",
      privacy: "개인정보",
      terms: "이용약관",
      beta: "베타 고지",
      contact: "문의",
    },
    blurbs: {
      indie: "개인 작가가 자기 캐논을 관리할 때.",
      pro: "여러 IP를 출간하는 프로 작가와 소규모 스튜디오용.",
      studio: "여러 IP와 여러 작가를 위한 운영 플랜. 감사 로그, 역할 권한, 전용 검수 큐 포함.",
      enterprise: "데이터 리전, SSO, 온프레미스 재현 아카이브, 프리미엄 SLA 맞춤 지원.",
    },
    features: {
      indie: ["1 IP project", "캐논 ledger and replay", "Unlimited reviews", "30일 체험, 카드 없음"],
      pro: ["5 IP projects", "Branch and diff canon", "Priority conflict review", "Team-of-3 collaboration", "BYOK 50% off"],
      studio: ["20M tokens / mo", "Studio review operations", "Usage review for larger launches"],
      enterprise: ["Unlimited scale", "BYOK required", "Custom security and procurement support"],
    },
    checkout: {
      prefix: "",
      terms: "이용약관",
      connector: "및",
      privacy: "개인정보 처리방침",
      suffix: "에 동의합니다.",
      loading: "Stripe를 여는 중...",
      error: "체크아웃을 시작할 수 없습니다.",
    },
  },
  ja: {
    nav: {
      features: "機能",
      pricing: "料金",
      docs: "ドキュメント",
      start: "始める",
    },
    hero: {
      eyebrow: `${AUTHOR_PRICE_LOCK_VERSION} 作家ローンチ料金`,
      title: "ローンチチーム向け作家メモリープラン",
      subtitle:
        "管理トークン上限を選び、Stripe Checkout に接続します。Anthropic BYOK を追加すると管理利用コストを下げられます。",
      monthly: "月額",
      yearly: "年額",
      yearlySuffix: " 15%お得",
    },
    card: {
      monthly: "月",
      yearly: "年",
      popular: "よく選ばれる",
      start: "開始",
      byokRequired: "Enterprise の本番利用前に BYOK が必要です。",
    },
    launchNotes: [
      { title: "BYOK 割引", body: "BYOK が有効な場合、50%割引の状態が適用され、管理トークン上限が外れます。" },
      { title: "メーター超過", body: "管理トークンの超過分は、設定済みの上限を超えた利用だけが報告されます。" },
      { title: "トライアル保管", body: "30日トライアルにカードは不要です。非アクティブなプロジェクトはさらに60日、読み取り専用で保管されます。" },
    ],
    faq: {
      title: "料金 FAQ",
      items: [
        { q: "トライアルにカードは必要ですか？", a: "不要です。Author ローンチトライアルはカードなしで30日です。" },
        { q: "BYOK は料金をどう変えますか？", a: "自分の Anthropic キーが有効な場合、BYOK 割引が適用され、トークン費用は直接請求されます。" },
        { q: "上限を超えたらどうなりますか？", a: "超過した管理利用分だけがメーター課金商品に送られます。" },
        { q: "有効な購読者が新しい checkout を開始できますか？", a: "いいえ。active、trialing、past_due は請求ポータルへ送られます。" },
      ],
    },
    footer: {
      copyright: "\u00a9 {year} Seizn by Litheon LLC \u00b7 Wyoming",
      privacy: "プライバシー",
      terms: "利用規約",
      beta: "ベータ開示",
      contact: "問い合わせ",
    },
    blurbs: {
      indie: "自分のカノンを管理する個人作家向け。",
      pro: "複数IPを出すプロ作家と小規模スタジオ向け。",
      studio: "複数IP、複数作家の運用向け。監査ログ、権限、専用レビューキューを含みます。",
      enterprise: "データ所在地、SSO、オンプレミスのリプレイアーカイブ、プレミアムSLAを個別対応。",
    },
    features: {
      indie: ["1 IP project", "Canon ledger and replay", "Unlimited reviews", "30日トライアル、カード不要"],
      pro: ["5 IP projects", "Branch and diff canon", "Priority conflict review", "Team-of-3 collaboration", "BYOK 50% off"],
      studio: ["20M tokens / mo", "Studio review operations", "Usage review for larger launches"],
      enterprise: ["Unlimited scale", "BYOK required", "Custom security and procurement support"],
    },
    checkout: {
      prefix: "",
      terms: "利用規約",
      connector: "および",
      privacy: "プライバシーポリシー",
      suffix: "に同意します。",
      loading: "Stripe を開いています...",
      error: "チェックアウトを開始できませんでした。",
    },
  },
  "zh-hans": {
    nav: {
      features: "功能",
      pricing: "价格",
      docs: "文档",
      start: "开始",
    },
    hero: {
      eyebrow: `${AUTHOR_PRICE_LOCK_VERSION} 作者发布价格`,
      title: "面向发布团队的作者记忆方案",
      subtitle:
        "选择托管 token 上限，连接 Stripe Checkout，并通过自己的 Anthropic key 降低托管使用成本。",
      monthly: "月付",
      yearly: "年付",
      yearlySuffix: " 省 15%",
    },
    card: {
      monthly: "月",
      yearly: "年",
      popular: "最常用",
      start: "开始",
      byokRequired: "Enterprise 生产使用前必须配置 BYOK。",
    },
    launchNotes: [
      { title: "BYOK 折扣", body: "启用 BYOK 后会应用 50% 折扣状态，并移除托管 token 上限。" },
      { title: "计量超额", body: "托管 token 超额只报告超过已配置上限的部分。" },
      { title: "试用归档", body: "30 天试用无需信用卡；未激活项目会再以只读模式保留 60 天。" },
    ],
    faq: {
      title: "价格 FAQ",
      items: [
        { q: "试用需要信用卡吗？", a: "不需要。Author 发布试用为 30 天，无需信用卡。" },
        { q: "BYOK 如何影响价格？", a: "当你的 Anthropic key 启用时，会应用 BYOK 折扣，token 费用由你直接支付。" },
        { q: "超过上限会怎样？", a: "只有超出的托管使用量会发送到计量超额产品。" },
        { q: "已有有效订阅还能新开 checkout 吗？", a: "不能。active、trialing、past_due 状态会进入账单门户。" },
      ],
    },
    footer: {
      copyright: "\u00a9 {year} Seizn by Litheon LLC \u00b7 Wyoming",
      privacy: "隐私",
      terms: "条款",
      beta: "Beta 披露",
      contact: "联系",
    },
    blurbs: {
      indie: "适合管理个人 canon 的独立作者。",
      pro: "适合发布多个 IP 的职业作者和小型工作室。",
      studio: "面向多 IP、多作者协作，包含审计日志、角色权限和专用审核队列。",
      enterprise: "定制数据驻留、SSO、本地 replay archive 和高级 SLA。",
    },
    features: {
      indie: ["1 IP project", "Canon ledger and replay", "Unlimited reviews", "30 天试用，无需信用卡"],
      pro: ["5 IP projects", "Branch and diff canon", "Priority conflict review", "Team-of-3 collaboration", "BYOK 50% off"],
      studio: ["20M tokens / mo", "Studio review operations", "Usage review for larger launches"],
      enterprise: ["Unlimited scale", "BYOK required", "Custom security and procurement support"],
    },
    checkout: {
      prefix: "我同意",
      terms: "服务条款",
      connector: "和",
      privacy: "隐私政策",
      suffix: "。",
      loading: "正在打开 Stripe...",
      error: "无法开始 checkout。",
    },
  },
};

const PRICING_LOCALES = new Set<Locale>(["en", "ko", "ja", "zh-hans"]);

export function getPricingPageCopy(locale: Locale): PricingPageCopy {
  if (PRICING_LOCALES.has(locale)) return PRICING_COPY[locale as PricingLocale];
  if (locale === "zh-hant") return PRICING_COPY["zh-hans"];
  return PRICING_COPY.en;
}

export function PricingClient({ locale }: PricingClientProps) {
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const copy = getPricingPageCopy(locale);
  const yearly = cadence === "yearly";
  const plans = useMemo(() => TIERS.map((tier) => AUTHOR_BILLING_TIERS[tier]), []);

  return (
    <div className="author-landing">
      <nav className="sticky top-0 z-50 border-b backdrop-blur" aria-label="Pricing navigation" style={{ borderColor: "var(--ink-100)", background: "oklch(0.99 0.003 250 / 0.92)" }}>
        <div className="author-shell flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-0">
          <Link href={`/${locale}`} className="inline-flex min-h-11 items-center">
            <SeiznLockup tone="dark" />
          </Link>
          <div className="flex items-center gap-5">
            <a href={`/${locale}#workflow`} className="hidden text-sm md:block" style={{ color: "var(--ink-600)" }}>
              {copy.nav.features}
            </a>
            <Link href={`/${locale}/pricing`} className="hidden text-sm font-medium md:block" style={{ color: "var(--ink-900)" }}>
              {copy.nav.pricing}
            </Link>
            <Link href={`/${locale}/docs`} className="hidden text-sm md:block" style={{ color: "var(--ink-600)" }}>
              {copy.nav.docs}
            </Link>
            <Link
              href="/signup"
              className="author-btn min-h-10 px-4 py-2 text-sm"
              style={{ background: "var(--ink-900)", color: "var(--ink-0)" }}
            >
              {copy.nav.start}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="author-section pb-10">
          <div className="author-shell flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="author-eyebrow">{copy.hero.eyebrow}</p>
              <h1 className="author-serif mt-3 text-[length:var(--t-h1)]" style={{ color: "var(--ink-900)" }}>
                {copy.hero.title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 md:text-lg" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                {copy.hero.subtitle}
              </p>
            </div>

            <div className="inline-grid w-full gap-1 rounded-[var(--radius-md)] border p-1 sm:w-fit sm:grid-cols-2" style={{ borderColor: "var(--ink-200)", background: "var(--ink-50)" }}>
              {(["monthly", "yearly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCadence(option)}
                  className="min-h-11 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium"
                  style={{
                    background: cadence === option ? "var(--ink-900)" : "transparent",
                    color: cadence === option ? "var(--ink-0)" : "var(--ink-600)",
                  }}
                >
                  {option === "monthly" ? copy.hero.monthly : `${copy.hero.yearly}${copy.hero.yearlySuffix}`}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="author-shell grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                tier={plan.id}
                cadence={cadence}
                name={plan.label}
                price={yearly ? plan.yearlyUsd : plan.monthlyUsd}
                tokenCap={plan.tokenCapMonth}
                features={copy.features[plan.id]}
                blurb={copy.blurbs[plan.id]}
                recommended={plan.recommended}
                byokRequired={plan.byokRequired}
                locale={locale}
                copy={copy}
              />
            ))}
          </div>
        </section>

        <section className="border-y px-4 py-10 sm:px-6 lg:px-8" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)" }}>
          <div className="author-shell grid gap-5 md:grid-cols-3">
            {copy.launchNotes.map((note) => (
              <LaunchNote key={note.title} title={note.title} body={note.body} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="author-serif text-3xl" style={{ color: "var(--ink-900)" }}>
            {copy.faq.title}
          </h2>
          <div className="mt-6 grid gap-3">
            {copy.faq.items.map((item) => (
              <details key={item.q} className="rounded-[var(--radius-md)] border p-4" style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}>
                <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--ink-900)" }}>
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--ink-600)" }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-10 sm:px-6 lg:px-8" style={{ borderColor: "var(--ink-100)" }}>
        <div className="author-shell flex flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between" style={{ color: "var(--ink-600)" }}>
          <Link href={`/${locale}`} className="font-medium" style={{ color: "var(--ink-900)" }}>
            Seizn
          </Link>
          <span>{copy.footer.copyright.replace("{year}", new Date().getFullYear().toString())}</span>
          <nav className="flex flex-wrap gap-5" aria-label="Pricing footer">
            <a href={`/${locale}/legal/privacy`} className="hover:underline">{copy.footer.privacy}</a>
            <a href={`/${locale}/legal/terms`} className="hover:underline">{copy.footer.terms}</a>
            <a href={`/${locale}/legal/beta-disclosure`} className="hover:underline">{copy.footer.beta}</a>
            <a href={`/${locale}/docs/faq`} className="hover:underline">{copy.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function PricingCard({
  tier,
  cadence,
  name,
  price,
  tokenCap,
  features,
  blurb,
  recommended,
  byokRequired,
  locale,
  copy,
}: {
  tier: AuthorBillingTier;
  cadence: BillingCadence;
  name: string;
  price: number;
  tokenCap: number | null;
  features: string[];
  blurb: string;
  recommended?: boolean;
  byokRequired?: boolean;
  locale: Locale;
  copy: PricingPageCopy;
}) {
  return (
    <article
      className="flex h-full flex-col rounded-[var(--radius-lg)] border p-5"
      style={{
        borderColor: recommended ? "var(--ink-900)" : "var(--ink-200)",
        background: recommended ? "var(--ink-900)" : "var(--ink-0)",
        color: recommended ? "var(--ink-0)" : "var(--ink-900)",
        boxShadow: recommended ? "var(--shadow-lg)" : "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{name}</h2>
        {recommended ? (
          <span className="author-badge" style={{ background: "var(--signal-canon)", color: "var(--ink-900)" }}>
            {copy.card.popular}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold">${formatUsd(price)}</span>
          <span className="text-sm" style={{ color: recommended ? "oklch(1 0 0 / 0.62)" : "var(--ink-500)" }}>
            / {cadence === "monthly" ? copy.card.monthly : copy.card.yearly}
          </span>
        </div>
        <p className="author-mono mt-2 text-[11px]" style={{ color: recommended ? "oklch(1 0 0 / 0.58)" : "var(--ink-500)" }}>
          {formatTokenLabel(tokenCap)}
        </p>
      </div>

      <p className="mt-4 text-sm leading-6" style={{ color: recommended ? "oklch(1 0 0 / 0.72)" : "var(--ink-600)" }}>
        {blurb}
      </p>

      <ul className="mt-6 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-6" style={{ color: recommended ? "oklch(1 0 0 / 0.86)" : "var(--ink-700)" }}>
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--signal-canon)" }} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {byokRequired ? (
        <p className="mt-5 rounded-[var(--radius-md)] px-3 py-2 text-xs" style={{ background: recommended ? "oklch(1 0 0 / 0.08)" : "var(--ink-50)", color: recommended ? "oklch(1 0 0 / 0.70)" : "var(--ink-600)" }}>
          {copy.card.byokRequired}
        </p>
      ) : null}

      <div
        style={
          recommended
            ? ({
                "--szn-text-2": "oklch(1 0 0 / 0.76)",
                "--checkout-link-color": "var(--signal-canon)",
              } as CSSProperties)
            : undefined
        }
      >
        <CheckoutButton
          tier={tier}
          cadence={cadence}
          successUrl="/dashboard/billing?success=true"
          cancelUrl={`/${locale}/pricing`}
          privacyHref={`/${locale}/legal/privacy`}
          termsHref={`/${locale}/legal/terms`}
          legalCopy={copy.checkout}
          className={`author-btn mt-6 w-full px-4 py-3 text-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            recommended
              ? "bg-[color:var(--ink-0)] text-[color:var(--ink-900)]"
              : "bg-[color:var(--ink-900)] text-[color:var(--ink-0)]"
          }`}
          disabled={false}
        >
          {copy.card.start} {name}
        </CheckoutButton>
      </div>
    </article>
  );
}

function LaunchNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold" style={{ color: "var(--ink-900)" }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-600)" }}>
        {body}
      </p>
    </div>
  );
}
