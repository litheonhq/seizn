import Link from "next/link";
import type { Metadata } from "next";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/i18n/config";
import { DESIGN_PARTNER_MAX_SLOTS, getDesignPartnerSlotStats } from "@/lib/design-partners";
import { createServerClient } from "@/lib/supabase";
import { DesignPartnersForm, type DesignPartnerFormCopy } from "./design-partners-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

type Benefit = {
  label: string;
  title: string;
  body: string;
};

type PageCopy = {
  metadataTitle: string;
  metadataDescription: string;
  navPricing: string;
  navDocs: string;
  navEnterprise: string;
  navCta: string;
  eyebrow: string;
  title: string;
  titleAccent: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  slotLabel: string;
  slotSuffix: string;
  manifestoEyebrow: string;
  manifestoTitle: string;
  manifestoBody: string[];
  benefitsEyebrow: string;
  benefitsTitle: string;
  benefitsBody: string;
  benefits: Benefit[];
  applicationEyebrow: string;
  applicationTitle: string;
  applicationBody: string;
  form: DesignPartnerFormCopy;
};

const COPY_EN: PageCopy = {
  metadataTitle: "Seizn Design Partner Program",
  metadataDescription:
    "Apply for Seizn Design Partner pricing: $99/month Studio for 12 months for the first 10 qualified game teams.",
  navPricing: "Pricing",
  navDocs: "Docs",
  navEnterprise: "For Studios",
  navCta: "Apply",
  eyebrow: "02 / DESIGN PARTNERS",
  title: "Twelve months of Studio for",
  titleAccent: "$99/month",
  subtitle:
    "The first ten qualified game teams get 66% off Seizn Studio while we build the public proof around persistent NPC memory, deterministic replay, and story operations.",
  primaryCta: "Apply for a slot",
  secondaryCta: "See Studio pricing",
  slotLabel: "slots remaining",
  slotSuffix: "of 10",
  manifestoEyebrow: "01 / MANIFESTO",
  manifestoTitle: "We want studios close enough to make the product sharper.",
  manifestoBody: [
    "Seizn is not another dialogue wrapper. It is the memory and operations layer behind living NPCs: what they remember, what they must never forget, and how a narrative team proves a shipped world stayed coherent.",
    "Design Partners get launch-scale Studio access at $99/month for one year. In return, we ask for quarterly feedback and permission to publish a case study once the integration is real.",
  ],
  benefitsEyebrow: "02 / TERMS",
  benefitsTitle: "A small program with concrete obligations.",
  benefitsBody:
    "The discount is intentionally narrow: ten teams, Studio monthly only, one year. We are optimizing for teams who can show real gameplay memory, not passive waitlist demand.",
  benefits: [
    {
      label: "66% off",
      title: "$99/month Studio",
      body: "The SEIZN_DP_2026 coupon applies 66% off the Studio monthly plan for 12 billing cycles.",
    },
    {
      label: "12 months",
      title: "Enough runway to ship",
      body: "Use the full Studio cap, replay exports, audit logs, and metered overage path while your title moves from prototype to production.",
    },
    {
      label: "Quarterly",
      title: "Feedback with receipts",
      body: "We schedule one quarterly review around actual usage: memory writes, retrieval failures, replay needs, and narrative tooling gaps.",
    },
    {
      label: "Public proof",
      title: "Case study required",
      body: "Approved partners agree to a public case study once the feature is in a playable build or shipped title.",
    },
  ],
  applicationEyebrow: "03 / APPLICATION",
  applicationTitle: "Apply for the 2026 cohort.",
  applicationBody:
    "Tell us what you are building, how memory changes the player experience, and whether the team can commit to feedback and a public story.",
  form: {
    title: "Application",
    subtitle:
      "Approval is manual. If accepted, your signed-in studio receives the SEIZN_DP_2026 coupon on Studio monthly checkout.",
    fields: {
      companyName: "Company",
      contactName: "Contact",
      email: "Email",
      role: "Role",
      website: "Website",
      gameTitle: "Game title",
      teamSize: "Team size",
      expectedMemoryVolume: "Expected memory volume",
      useCase: "Use case",
      liveTitle: "This title is live or entering production this year.",
      feedbackCommitment: "We can join one quarterly feedback review.",
      caseStudyCommitment: "We can participate in a public case study if approved.",
    },
    placeholders: {
      companyName: "Northstar Interactive",
      contactName: "Mira Cho",
      email: "mira@studio.com",
      role: "Narrative Director",
      website: "https://studio.com",
      gameTitle: "Echo Province",
      teamSize: "12 people",
      expectedMemoryVolume: "500K memories in production",
      useCase: "Describe the NPC memory, replay, canon, or live-ops problem you want Seizn to solve.",
    },
    submit: "Submit application",
    submitting: "Submitting",
    successTitle: "Application received.",
    successBody:
      "We will review the fit and follow up by email. Approved studios receive coupon access before checkout.",
    errorFallback: "Could not submit the application.",
  },
};

const COPY_KO: PageCopy = {
  metadataTitle: "Seizn 디자인 파트너 프로그램",
  metadataDescription:
    "Seizn 디자인 파트너에 지원하세요. 첫 10개 적격 게임 팀은 Studio를 12개월 동안 월 $99에 사용할 수 있습니다.",
  navPricing: "가격",
  navDocs: "문서",
  navEnterprise: "스튜디오",
  navCta: "지원",
  eyebrow: "02 / DESIGN PARTNERS",
  title: "Studio 12개월을",
  titleAccent: "월 $99",
  subtitle:
    "적격 게임 팀 10곳에 Seizn Studio 66% 할인을 제공합니다. 대신 지속형 NPC 메모리, deterministic replay, 스토리 운영에 대한 공개 증거를 함께 만듭니다.",
  primaryCta: "슬롯 지원",
  secondaryCta: "Studio 가격 보기",
  slotLabel: "남은 슬롯",
  slotSuffix: "총 10개",
  manifestoEyebrow: "01 / MANIFESTO",
  manifestoTitle: "제품을 더 날카롭게 만들 수 있는 가까운 스튜디오를 찾습니다.",
  manifestoBody: [
    "Seizn은 또 하나의 대화 래퍼가 아닙니다. 살아 있는 NPC 뒤에서 무엇을 기억하고, 무엇을 절대 잊지 않아야 하며, 출시된 세계가 일관성을 지켰는지 증명하는 메모리와 운영 레이어입니다.",
    "디자인 파트너는 1년 동안 Studio를 월 $99에 사용합니다. 대신 분기별 피드백과 실제 연동 후 공개 사례 연구에 동의해야 합니다.",
  ],
  benefitsEyebrow: "02 / TERMS",
  benefitsTitle: "작지만 의무가 분명한 프로그램입니다.",
  benefitsBody:
    "할인은 좁게 운영합니다. 10개 팀, Studio 월간 플랜, 1년. 단순 관심이 아니라 실제 플레이 가능한 메모리 사용 사례를 보여줄 팀을 우선합니다.",
  benefits: [
    {
      label: "66% 할인",
      title: "Studio 월 $99",
      body: "SEIZN_DP_2026 쿠폰은 Studio 월간 플랜에 12회 결제 주기 동안 66% 할인을 적용합니다.",
    },
    {
      label: "12개월",
      title: "출시까지 버틸 런웨이",
      body: "프로토타입에서 프로덕션으로 이동하는 동안 Studio 한도, replay export, audit log, metered overage 경로를 사용할 수 있습니다.",
    },
    {
      label: "분기별",
      title: "근거 있는 피드백",
      body: "메모리 쓰기, 검색 실패, replay 요구, 내러티브 툴링 공백을 기준으로 분기별 리뷰를 진행합니다.",
    },
    {
      label: "공개 사례",
      title: "케이스 스터디 필수",
      body: "승인된 파트너는 기능이 플레이 가능한 빌드나 출시 타이틀에 들어간 뒤 공개 사례 연구에 참여합니다.",
    },
  ],
  applicationEyebrow: "03 / APPLICATION",
  applicationTitle: "2026 코호트에 지원하세요.",
  applicationBody:
    "무엇을 만들고 있는지, 메모리가 플레이어 경험을 어떻게 바꾸는지, 피드백과 공개 사례 연구에 참여할 수 있는지 알려주세요.",
  form: {
    title: "지원서",
    subtitle:
      "승인은 수동으로 진행됩니다. 승인되면 로그인한 studio의 Studio 월간 checkout에 SEIZN_DP_2026 쿠폰이 적용됩니다.",
    fields: {
      companyName: "회사",
      contactName: "담당자",
      email: "이메일",
      role: "역할",
      website: "웹사이트",
      gameTitle: "게임 제목",
      teamSize: "팀 규모",
      expectedMemoryVolume: "예상 메모리 규모",
      useCase: "사용 사례",
      liveTitle: "이 타이틀은 올해 출시 또는 프로덕션 진입 예정입니다.",
      feedbackCommitment: "분기별 피드백 리뷰에 참여할 수 있습니다.",
      caseStudyCommitment: "승인 시 공개 사례 연구에 참여할 수 있습니다.",
    },
    placeholders: {
      companyName: "Northstar Interactive",
      contactName: "Mira Cho",
      email: "mira@studio.com",
      role: "Narrative Director",
      website: "https://studio.com",
      gameTitle: "Echo Province",
      teamSize: "12명",
      expectedMemoryVolume: "프로덕션 500K memories",
      useCase: "Seizn으로 해결하려는 NPC 메모리, replay, canon, live-ops 문제를 설명해주세요.",
    },
    submit: "지원서 제출",
    submitting: "제출 중",
    successTitle: "지원서가 접수되었습니다.",
    successBody: "적합성을 검토한 뒤 이메일로 연락드립니다. 승인된 studio는 checkout 전 쿠폰 접근 권한을 받습니다.",
    errorFallback: "지원서를 제출하지 못했습니다.",
  },
};

function getCopy(locale: Locale): PageCopy {
  return locale === "ko" ? COPY_KO : COPY_EN;
}

async function getSlotsRemaining(): Promise<number> {
  try {
    const supabase = createServerClient();
    const stats = await getDesignPartnerSlotStats(supabase);
    return stats.remainingSlots;
  } catch {
    return DESIGN_PARTNER_MAX_SLOTS;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const copy = getCopy(locale);
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
  };
}

export default async function DesignPartnersPage({ params }: PageProps) {
  const { locale } = await params;
  const copy = getCopy(locale);
  const slotsRemaining = await getSlotsRemaining();

  return (
    <div className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <nav className="sticky top-0 z-50 border-b border-szn-border-subtle bg-szn-bg/85 backdrop-blur-xl" aria-label="Design Partner navigation">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/seizn-mark.svg" alt="Seizn" className="h-7 w-7" />
            <span className="text-[15px] font-medium text-szn-text-1">Seizn</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href={`/${locale}/pricing`} className="hidden text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1 md:block">
              {copy.navPricing}
            </Link>
            <Link href={`/${locale}/enterprise`} className="hidden text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1 md:block">
              {copy.navEnterprise}
            </Link>
            <Link href={`/${locale}/docs`} className="hidden text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1 md:block">
              {copy.navDocs}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <a href="#apply" className="szn-btn-signal">
              {copy.navCta}
            </a>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden border-b border-szn-border-subtle">
          <div className="absolute inset-0 szn-glow-signal opacity-45" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[1fr_320px] lg:py-28">
            <div>
              <div className="szn-section-number mb-6">{copy.eyebrow}</div>
              <h1 className="szn-serif max-w-4xl text-[clamp(44px,7vw,92px)] leading-[1.01] tracking-[-0.03em] text-szn-text-1">
                {copy.title} <em className="font-normal italic text-szn-signal">{copy.titleAccent}</em>.
              </h1>
              <p className="mt-8 max-w-3xl text-[17px] leading-[1.6] text-szn-text-2">{copy.subtitle}</p>
              <div className="mt-10 flex flex-wrap gap-3">
                <a href="#apply" className="szn-btn-signal">
                  {copy.primaryCta}
                </a>
                <Link href={`/${locale}/pricing`} className="szn-btn-ghost">
                  {copy.secondaryCta}
                </Link>
              </div>
            </div>

            <div className="border-y border-szn-border-subtle bg-szn-signal-soft px-6 py-7 self-end">
              <div className="szn-section-number mb-5">COHORT CAP</div>
              <div className="font-mono text-[72px] leading-none tracking-[-0.05em] text-szn-text-1 tabular-nums">
                {slotsRemaining}
              </div>
              <p className="mt-3 text-[13px] uppercase tracking-[0.12em] text-szn-text-2">
                {copy.slotLabel} {copy.slotSuffix}
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 lg:grid-cols-[360px_1fr]">
            <div>
              <div className="szn-section-number mb-6">{copy.manifestoEyebrow}</div>
              <h2 className="szn-serif text-[clamp(32px,4vw,54px)] leading-[1.07] text-szn-text-1">
                {copy.manifestoTitle}
              </h2>
            </div>
            <div className="space-y-6 text-[16px] leading-[1.75] text-szn-text-2">
              {copy.manifestoBody.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="mb-12 max-w-2xl">
              <div className="szn-section-number mb-6">{copy.benefitsEyebrow}</div>
              <h2 className="szn-serif text-[clamp(32px,4vw,52px)] leading-[1.08] text-szn-text-1">
                {copy.benefitsTitle}
              </h2>
              <p className="mt-5 text-[15px] leading-[1.65] text-szn-text-2">{copy.benefitsBody}</p>
            </div>

            <div className="grid gap-px border-y border-szn-border-subtle bg-szn-border-subtle md:grid-cols-2 lg:grid-cols-4">
              {copy.benefits.map((benefit) => (
                <article key={benefit.title} className="min-h-[260px] bg-szn-bg p-6">
                  <div className="szn-eyebrow mb-8 text-szn-signal">{benefit.label}</div>
                  <h3 className="text-[20px] font-medium leading-tight text-szn-text-1">{benefit.title}</h3>
                  <p className="mt-4 text-[13px] leading-[1.65] text-szn-text-2">{benefit.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="apply" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 lg:grid-cols-[360px_1fr]">
            <div>
              <div className="szn-section-number mb-6">{copy.applicationEyebrow}</div>
              <h2 className="szn-serif text-[clamp(32px,4vw,52px)] leading-[1.08] text-szn-text-1">
                {copy.applicationTitle}
              </h2>
              <p className="mt-5 text-[15px] leading-[1.65] text-szn-text-2">{copy.applicationBody}</p>
            </div>
            <DesignPartnersForm copy={copy.form} locale={locale} />
          </div>
        </section>
      </main>
    </div>
  );
}
