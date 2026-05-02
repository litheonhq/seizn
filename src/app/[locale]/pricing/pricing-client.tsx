"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  AUTHOR_BILLING_TIERS,
  AUTHOR_PRICE_LOCK_VERSION,
  type AuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import type { CheckoutLegalCopy } from "@/lib/checkout-copy";

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
    tokenCap: string;
    unlimited: string;
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
  features: Record<AuthorBillingTier, string[]>;
  checkout: CheckoutLegalCopy;
}

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
      monthly: "mo",
      yearly: "yr",
      tokenCap: "managed tokens monthly",
      unlimited: "Unlimited managed tokens",
      popular: "Most common",
      start: "Start",
      byokRequired: "BYOK is required before production Enterprise use.",
    },
    launchNotes: [
      { title: "BYOK discount", body: "Active Anthropic BYOK applies the SEIZN_BYOK_50 coupon to the Stripe customer or subscription." },
      { title: "Metered overage", body: "Managed token overage is reported to the configured Stripe billing meter when a cap is exceeded." },
      { title: "Trial visibility", body: "Dashboard billing shows renewal, cancellation, and D-3 trial state from the synced subscription." },
    ],
    faq: {
      title: "Pricing FAQ",
      items: [
        { q: "Do I need a credit card for the trial?", a: "No. The Author launch trial is 30 days without a card requirement." },
        { q: "How does BYOK change pricing?", a: "When your own Anthropic key is active, the BYOK discount state applies a 50 percent coupon and tokens are billed directly to you." },
        { q: "What happens above my cap?", a: "Only exceeded managed usage is sent to the metered overage product." },
        { q: "Can an active subscriber start another checkout?", a: "No. Active, trialing, and past due subscribers are sent to the billing portal." },
      ],
    },
    footer: {
      copyright: "© {year} Seizn. All rights reserved.",
      privacy: "Privacy",
      terms: "Terms",
      beta: "Beta Disclosure",
      contact: "Contact",
    },
    features: {
      indie: [
        "1M managed author tokens each month",
        "Single author workspace",
        "BYOK discount when an Anthropic key is active",
      ],
      pro: [
        "5M managed author tokens each month",
        "Project imports, simulations, and audit replay",
        "Priority billing support",
      ],
      studio: [
        "20M managed author tokens each month",
        "Multi-project studio workflow",
        "Usage review for larger launches",
      ],
      enterprise: [
        "Unlimited monthly author tokens",
        "BYOK required for production workloads",
        "Custom security and procurement support",
      ],
    },
    checkout: {
      prefix: "I agree to the",
      terms: "Terms of Service",
      connector: "and",
      privacy: "Privacy Policy",
      suffix: ".",
      loading: "Opening Stripe...",
      error: "Checkout could not start.",
    },
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
      tokenCap: "월 관리형 토큰",
      unlimited: "관리형 토큰 무제한",
      popular: "가장 일반적",
      start: "시작",
      byokRequired: "Enterprise 프로덕션 사용 전 BYOK가 필요합니다.",
    },
    launchNotes: [
      { title: "BYOK 할인", body: "활성 Anthropic BYOK는 Stripe 고객 또는 구독에 SEIZN_BYOK_50 쿠폰을 적용합니다." },
      { title: "초과 사용량", body: "관리형 토큰 초과분은 한도를 넘은 뒤 설정된 Stripe 미터로 보고됩니다." },
      { title: "체험 상태", body: "대시보드 결제 화면은 동기화된 구독에서 갱신, 취소, 체험 종료 D-3 상태를 보여줍니다." },
    ],
    faq: {
      title: "가격 FAQ",
      items: [
        { q: "체험에 카드가 필요한가요?", a: "아니요. Author 출시 체험은 카드 없이 30일입니다." },
        { q: "BYOK는 가격을 어떻게 바꾸나요?", a: "본인 Anthropic 키가 활성화되면 50% 쿠폰 상태가 적용되고 토큰 비용은 직접 결제됩니다." },
        { q: "한도를 넘으면 어떻게 되나요?", a: "초과된 관리형 사용량만 미터형 초과 과금 상품으로 전송됩니다." },
        { q: "활성 구독자가 새 checkout을 시작할 수 있나요?", a: "아니요. active, trialing, past_due 상태는 결제 포털로 이동합니다." },
      ],
    },
    footer: {
      copyright: "© {year} Seizn. 모든 권리 보유.",
      privacy: "개인정보",
      terms: "이용약관",
      beta: "베타 고지",
      contact: "문의",
    },
    features: {
      indie: ["월 관리형 작가 토큰 100만", "개인 작가 작업 공간", "Anthropic 키 활성 시 BYOK 할인"],
      pro: ["월 관리형 작가 토큰 500만", "프로젝트 가져오기, 시뮬레이션, 검수 재현", "우선 결제 지원"],
      studio: ["월 관리형 작가 토큰 2천만", "다중 프로젝트 스튜디오 흐름", "대형 출시용 사용량 검토"],
      enterprise: ["월 관리형 작가 토큰 무제한", "프로덕션 워크로드 BYOK 필수", "맞춤 보안과 구매 지원"],
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
      tokenCap: "月間管理トークン",
      unlimited: "管理トークン無制限",
      popular: "よく選ばれる",
      start: "開始",
      byokRequired: "Enterprise の本番利用前に BYOK が必要です。",
    },
    launchNotes: [
      { title: "BYOK 割引", body: "有効な Anthropic BYOK は Stripe 顧客またはサブスクリプションに SEIZN_BYOK_50 クーポンを適用します。" },
      { title: "メーター超過", body: "上限超過後の管理トークン利用は設定済み Stripe メーターへ報告されます。" },
      { title: "トライアル表示", body: "ダッシュボード請求画面は同期済みサブスクリプションから更新、解約、D-3 状態を表示します。" },
    ],
    faq: {
      title: "料金 FAQ",
      items: [
        { q: "トライアルにカードは必要ですか？", a: "不要です。Author ローンチトライアルはカードなしで30日です。" },
        { q: "BYOK は料金をどう変えますか？", a: "自分の Anthropic キーが有効な場合、50%クーポン状態が適用され、トークン費用は直接請求されます。" },
        { q: "上限を超えたらどうなりますか？", a: "超過した管理利用分だけがメーター課金商品に送られます。" },
        { q: "有効な購読者が新しい checkout を開始できますか？", a: "いいえ。active、trialing、past_due は請求ポータルへ送られます。" },
      ],
    },
    footer: {
      copyright: "© {year} Seizn. All rights reserved.",
      privacy: "プライバシー",
      terms: "利用規約",
      beta: "ベータ開示",
      contact: "問い合わせ",
    },
    features: {
      indie: ["月間管理作家トークン100万", "単独作家ワークスペース", "Anthropic キー有効時の BYOK 割引"],
      pro: ["月間管理作家トークン500万", "プロジェクト取り込み、シミュレーション、監査リプレイ", "優先請求サポート"],
      studio: ["月間管理作家トークン2000万", "複数プロジェクトのスタジオ運用", "大型ローンチ向け利用レビュー"],
      enterprise: ["月間管理作家トークン無制限", "本番ワークロードは BYOK 必須", "カスタムセキュリティと調達支援"],
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
      tokenCap: "每月托管 token",
      unlimited: "无限托管 token",
      popular: "最常用",
      start: "开始",
      byokRequired: "Enterprise 生产使用前必须配置 BYOK。",
    },
    launchNotes: [
      { title: "BYOK 折扣", body: "启用 Anthropic BYOK 后，SEIZN_BYOK_50 coupon 会应用到 Stripe 客户或订阅。" },
      { title: "计量超额", body: "超过上限的托管 token 使用量会发送到已配置的 Stripe 计量器。" },
      { title: "试用可见性", body: "仪表盘账单页显示来自同步订阅的续费、取消和 D-3 试用状态。" },
    ],
    faq: {
      title: "价格 FAQ",
      items: [
        { q: "试用需要信用卡吗？", a: "不需要。Author 发布试用为 30 天，无需信用卡。" },
        { q: "BYOK 如何影响价格？", a: "当你的 Anthropic key 启用时，会应用 50% coupon 状态，token 费用由你直接支付。" },
        { q: "超过上限会怎样？", a: "只有超出的托管使用量会发送到计量超额产品。" },
        { q: "已有有效订阅还能新开 checkout 吗？", a: "不能。active、trialing、past_due 状态会进入账单门户。" },
      ],
    },
    footer: {
      copyright: "© {year} Seizn. All rights reserved.",
      privacy: "隐私",
      terms: "条款",
      beta: "Beta 披露",
      contact: "联系",
    },
    features: {
      indie: ["每月 100 万托管作者 token", "单作者工作区", "Anthropic key 启用时 BYOK 折扣"],
      pro: ["每月 500 万托管作者 token", "项目导入、模拟和审核回放", "优先账单支持"],
      studio: ["每月 2000 万托管作者 token", "多项目工作室流程", "大型发布使用审核"],
      enterprise: ["每月无限托管作者 token", "生产工作负载必须 BYOK", "自定义安全和采购支持"],
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
const TIERS = ["indie", "pro", "studio", "enterprise"] as const;

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
    <div className="min-h-screen bg-szn-bg text-szn-text-1">
      <nav className="sticky top-0 z-50 border-b border-szn-border bg-szn-bg/90 backdrop-blur" aria-label="Pricing navigation">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-szn-accent text-sm font-semibold text-white">
              S
            </span>
            <span className="text-xl font-semibold">Seizn</span>
          </Link>

          <div className="flex items-center gap-5">
            <a href={`/${locale}#workflow`} className="hidden text-sm text-szn-text-2 hover:text-szn-text-1 md:block">
              {copy.nav.features}
            </a>
            <Link href={`/${locale}/pricing`} className="hidden text-sm font-medium text-szn-text-1 md:block">
              {copy.nav.pricing}
            </Link>
            <Link href={`/${locale}/docs`} className="hidden text-sm text-szn-text-2 hover:text-szn-text-1 md:block">
              {copy.nav.docs}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/login"
              className="rounded-lg bg-szn-text-1 px-4 py-2 text-sm font-medium text-szn-bg hover:opacity-90"
            >
              {copy.nav.start}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-10 pt-16">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase text-szn-accent">{copy.hero.eyebrow}</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal text-szn-text-1 md:text-5xl">
                {copy.hero.title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-szn-text-2 md:text-lg">
                {copy.hero.subtitle}
              </p>
            </div>

            <div className="inline-flex w-fit rounded-lg border border-szn-border bg-szn-card p-1">
              {(["monthly", "yearly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCadence(option)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    cadence === option
                      ? "bg-szn-accent text-white"
                      : "text-szn-text-2 hover:text-szn-text-1"
                  }`}
                >
                  {option === "monthly" ? copy.hero.monthly : copy.hero.yearly}
                  {option === "yearly" ? copy.hero.yearlySuffix : ""}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                tier={plan.id}
                cadence={cadence}
                name={plan.label}
                price={yearly ? plan.yearlyUsd : plan.monthlyUsd}
                tokenCap={plan.tokenCapMonth}
                features={copy.features[plan.id]}
                recommended={plan.recommended}
                byokRequired={plan.byokRequired}
                locale={locale}
                copy={copy}
              />
            ))}
          </div>
        </section>

        <section className="border-y border-szn-border bg-szn-surface/40 px-6 py-10">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {copy.launchNotes.map((note) => (
              <LaunchNote key={note.title} title={note.title} body={note.body} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-3xl font-semibold text-szn-text-1">{copy.faq.title}</h2>
          <div className="mt-6 space-y-3">
            {copy.faq.items.map((item) => (
              <details key={item.q} className="rounded-lg border border-szn-border bg-szn-card p-4">
                <summary className="cursor-pointer text-sm font-medium text-szn-text-1">{item.q}</summary>
                <p className="mt-3 text-sm leading-6 text-szn-text-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-szn-border px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-szn-text-2 md:flex-row md:items-center md:justify-between">
          <Link href={`/${locale}`} className="font-medium text-szn-text-1">Seizn</Link>
          <span>{copy.footer.copyright.replace("{year}", new Date().getFullYear().toString())}</span>
          <nav className="flex gap-5" aria-label="Pricing footer">
            <a href={`/${locale}/legal/privacy`} className="hover:text-szn-text-1">{copy.footer.privacy}</a>
            <a href={`/${locale}/legal/terms`} className="hover:text-szn-text-1">{copy.footer.terms}</a>
            <a href={`/${locale}/legal/beta-disclosure`} className="hover:text-szn-text-1">{copy.footer.beta}</a>
            <a href={`/${locale}/docs/faq`} className="hover:text-szn-text-1">{copy.footer.contact}</a>
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
  recommended?: boolean;
  byokRequired?: boolean;
  locale: Locale;
  copy: PricingPageCopy;
}) {
  return (
    <article className={`flex h-full flex-col rounded-lg border bg-szn-card p-5 ${
      recommended ? "border-szn-accent shadow-sm" : "border-szn-border"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-szn-text-1">{name}</h2>
        {recommended ? (
          <span className="rounded-full bg-szn-accent/10 px-2.5 py-1 text-xs font-medium text-szn-accent">
            {copy.card.popular}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold text-szn-text-1">${formatUsd(price)}</span>
          <span className="text-sm text-szn-text-2">/{cadence === "monthly" ? copy.card.monthly : copy.card.yearly}</span>
        </div>
        <p className="mt-2 text-sm text-szn-text-2">
          {tokenCap ? `${formatTokenCap(tokenCap)} ${copy.card.tokenCap}` : copy.card.unlimited}
        </p>
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-6 text-szn-text-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-szn-accent" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {byokRequired ? (
        <p className="mt-5 rounded-lg bg-szn-surface px-3 py-2 text-xs text-szn-text-2">
          {copy.card.byokRequired}
        </p>
      ) : null}

      <CheckoutButton
        tier={tier}
        cadence={cadence}
        successUrl="/dashboard/billing?success=true"
        cancelUrl={`/${locale}/pricing`}
        privacyHref={`/${locale}/legal/privacy`}
        termsHref={`/${locale}/legal/terms`}
        legalCopy={copy.checkout}
        className={`mt-6 w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
          recommended
            ? "bg-szn-accent text-white hover:bg-szn-accent/90 disabled:bg-szn-accent/50"
            : "border border-szn-border text-szn-text-1 hover:bg-szn-surface disabled:opacity-50"
        }`}
      >
        {copy.card.start} {name}
      </CheckoutButton>
    </article>
  );
}

function LaunchNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-szn-text-1">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-szn-text-2">{body}</p>
    </div>
  );
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function formatTokenCap(value: number): string {
  return value >= 1_000_000 ? `${value / 1_000_000}M` : value.toLocaleString();
}
