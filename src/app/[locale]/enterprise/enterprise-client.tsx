'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/language-switcher';
import type { Dictionary } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/config';

interface FormData {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  job_title: string;
  company_size: string;
  industry: string;
  website: string;
  use_case: string;
  expected_volume: string;
  requirements: string;
  timeline: string;
}

interface EnterpriseClientProps {
  dict: Dictionary;
  locale: Locale;
}

type Package = {
  title: string;
  body: string;
};

type Step = {
  title: string;
  body: string;
};

type TrustItem = {
  label: string;
  detail: string;
};

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  helper: string;
  primaryCta: string;
  secondaryCta: string;
  proofChips: string[];
  packagesTitle: string;
  packagesSubtitle: string;
  packages: Package[];
  processTitle: string;
  processSubtitle: string;
  steps: Step[];
  trustTitle: string;
  trustSubtitle: string;
  trustItems: TrustItem[];
  formTitle: string;
  formSubtitle: string;
  labels: {
    companyName: string;
    yourName: string;
    workEmail: string;
    phone: string;
    jobTitle: string;
    companySize: string;
    useCase: string;
    useCasePlaceholder: string;
    expectedVolume: string;
    timeline: string;
    requirements: string;
    requirementsPlaceholder: string;
    submit: string;
    submitting: string;
    privacyNote: string;
  };
  finalCtaTitle: string;
  finalCtaSubtitle: string;
  finalPrimary: string;
  finalSecondary: string;
  successTitle: string;
  successBody: string;
  successBack: string;
};

const COPY_EN: Copy = {
  eyebrow: 'For studios',
  title: 'Bring Seizn in when NPC memory becomes production infrastructure.',
  subtitle:
    'Enterprise is for game teams that already know the dialogue layer they want. Seizn becomes the persistent memory graph behind factions, witness chains, and world-state recall.',
  helper:
    'This is where we scope self-hosting, studio-wide identity, launch coverage, and case-study partnership for memory-heavy titles.',
  primaryCta: 'Book architecture review',
  secondaryCta: 'See integrations',
  proofChips: [
    'Keep Inworld, Convai, ACE, or your own runtime.',
    'Scope one title first, then expand to multiple projects.',
    'Move to private networking or self-hosting when procurement appears.',
  ],
  packagesTitle: 'What an enterprise deal usually includes',
  packagesSubtitle: 'The page is built for game studios first. Compliance comes later as a support strip, not the hero.',
  packages: [
    {
      title: 'Self-hosted or controlled deployment',
      body: 'Run Seizn in a private network, isolated VPC, or controlled environment when platform or publishing requirements demand it.',
    },
    {
      title: 'Studio-wide identity and access',
      body: 'Bring SSO / SAML, org-scoped access, and permissions into the same operating model as the game team.',
    },
    {
      title: 'Priority support around launch',
      body: 'Use direct response channels, rollout planning, and capacity reviews before content spikes or live events.',
    },
    {
      title: 'Case-study partnership',
      body: 'For lighthouse titles, we can package the rollout into a co-branded technical case study after launch.',
    },
  ],
  processTitle: 'How the engagement runs',
  processSubtitle: 'We start from world design and integration constraints, then back into the operating shape.',
  steps: [
    {
      title: '1. Bring the world model',
      body: 'Show NPC count, relation depth, event rate, and which dialogue stack is already in production.',
    },
    {
      title: '2. We size the graph',
      body: 'We map entity graph size, event throughput, and retrieval paths to the right deployment and support model.',
    },
    {
      title: '3. Ship a pilot',
      body: 'The first milestone is one memory-heavy scenario in a real title, not a generic sandbox.',
    },
  ],
  trustTitle: 'Trust strip',
  trustSubtitle: 'Security and procurement support live here, after the product story is already clear.',
  trustItems: [
    {
      label: 'Security review support',
      detail: 'Evidence packs, architecture answers, and security questionnaires.',
    },
    {
      label: 'Deployment planning',
      detail: 'Residency, private networking, and rollout shape by studio or title.',
    },
    {
      label: 'Operational alignment',
      detail: 'SLA, support process, and escalation design matched to live ops.',
    },
  ],
  formTitle: 'Tell us about the game you are shipping',
  formSubtitle:
    'We use this to scope entity graph size, event throughput, and the integration path for your dialogue stack.',
  labels: {
    companyName: 'Studio name',
    yourName: 'Your name',
    workEmail: 'Work email',
    phone: 'Phone',
    jobTitle: 'Role',
    companySize: 'Studio size',
    useCase: 'Tell us about the game',
    useCasePlaceholder:
      'Genre, NPC count, dialogue stack, what must persist across turns, and where you are blocked today.',
    expectedVolume: 'Expected NPC footprint',
    timeline: 'Launch window',
    requirements: 'Hosting / support requirements',
    requirementsPlaceholder:
      'Self-hosting, SSO, private networking, residency, launch support, or procurement requirements.',
    submit: 'Request enterprise review',
    submitting: 'Submitting...',
    privacyNote: 'By submitting this form, you agree to our',
  },
  finalCtaTitle: 'Need a faster path?',
  finalCtaSubtitle:
    'Use pricing for Studio sizing, or compare Seizn beside your existing dialogue stack before the call.',
  finalPrimary: 'View pricing',
  finalSecondary: 'See integrations',
  successTitle: 'Request received',
  successBody: 'We will review the game scope and get back to you shortly.',
  successBack: 'Back to home',
};

const COPY_KO: Copy = {
  eyebrow: '게임 스튜디오용',
  title: 'NPC 메모리가 프로덕션 인프라가 되는 시점에 Seizn을 붙입니다.',
  subtitle:
    'Enterprise는 이미 대화 레이어를 정한 게임 팀을 위한 구간입니다. Seizn이 팩션, witness chain, 월드 상태 회수를 담당하는 지속 메모리 그래프가 됩니다.',
  helper:
    '여기서 셀프호스트, 스튜디오 단위 인증, 런칭 대응, 케이스 스터디 파트너십까지 함께 설계합니다.',
  primaryCta: '아키텍처 리뷰 예약',
  secondaryCta: '통합 보기',
  proofChips: [
    'Inworld, Convai, ACE, 자체 런타임을 그대로 유지합니다.',
    '타이틀 1개에서 시작해 여러 프로젝트로 넓힐 수 있습니다.',
    '조달과 보안 심사가 생기면 프라이빗 네트워킹이나 셀프호스트로 이동합니다.',
  ],
  packagesTitle: 'Enterprise 계약에서 실제로 다루는 것',
  packagesSubtitle: '페이지의 중심은 게임 스튜디오입니다. 보안과 조달은 아래 trust strip에서 정리합니다.',
  packages: [
    {
      title: '셀프호스트 또는 통제 배포',
      body: '플랫폼이나 퍼블리셔 요구가 있는 경우 프라이빗 네트워크, 격리 VPC, 통제 환경에서 Seizn을 운영할 수 있습니다.',
    },
    {
      title: '스튜디오 단위 인증과 접근 제어',
      body: 'SSO / SAML, 조직 단위 접근 정책, 권한 모델을 게임 팀 운영 방식에 맞춰 붙입니다.',
    },
    {
      title: '런칭 전후 우선 지원',
      body: '콘텐츠 스파이크나 라이브 이벤트 전에 직접 대응 채널, 롤아웃 계획, 용량 검토를 함께 잡습니다.',
    },
    {
      title: '케이스 스터디 파트너십',
      body: '등대 타이틀은 런칭 이후 공동 기술 사례로 묶어 외부 레퍼런스로 만드는 것도 가능합니다.',
    },
  ],
  processTitle: '도입 방식',
  processSubtitle: '월드 설계와 연동 제약을 먼저 보고, 그다음 운영 구조를 맞춥니다.',
  steps: [
    {
      title: '1. 월드 모델 공유',
      body: 'NPC 수, 관계 깊이, 이벤트 발생률, 현재 프로덕션에 쓰는 대화 스택을 알려주세요.',
    },
    {
      title: '2. 그래프 규모 산정',
      body: '엔티티 그래프 크기, 이벤트 처리량, 회수 경로를 기준으로 배포와 지원 형태를 정합니다.',
    },
    {
      title: '3. 파일럿 출하',
      body: '첫 마일스톤은 generic sandbox가 아니라 실제 타이틀 안의 메모리 비중 높은 시나리오입니다.',
    },
  ],
  trustTitle: 'Trust strip',
  trustSubtitle: '보안과 조달 대응은 제품 포지셔닝이 선명해진 다음 이 구간에서 다룹니다.',
  trustItems: [
    {
      label: '보안 검토 지원',
      detail: 'Evidence pack, 아키텍처 답변, 보안 설문 대응.',
    },
    {
      label: '배포 계획',
      detail: '레지던시, 프라이빗 네트워킹, 스튜디오/타이틀 기준 롤아웃 구조.',
    },
    {
      label: '운영 정렬',
      detail: 'SLA, 지원 절차, 라이브옵스에 맞춘 에스컬레이션 설계.',
    },
  ],
  formTitle: '출시하려는 게임을 알려주세요',
  formSubtitle:
    '이 정보로 엔티티 그래프 규모, 이벤트 처리량, 대화 스택 연동 경로를 산정합니다.',
  labels: {
    companyName: '스튜디오 이름',
    yourName: '담당자 이름',
    workEmail: '업무용 이메일',
    phone: '전화번호',
    jobTitle: '역할',
    companySize: '스튜디오 규모',
    useCase: '게임 설명',
    useCasePlaceholder:
      '장르, NPC 수, 대화 스택, 턴을 넘어 유지해야 하는 정보, 현재 막히는 지점을 적어주세요.',
    expectedVolume: '예상 NPC 규모',
    timeline: '출시 일정',
    requirements: '호스팅 / 지원 요구사항',
    requirementsPlaceholder:
      '셀프호스트, SSO, 프라이빗 네트워킹, 레지던시, 런칭 지원, 조달 요구사항 등을 적어주세요.',
    submit: '엔터프라이즈 검토 요청',
    submitting: '제출 중...',
    privacyNote: '이 양식을 제출하면 다음에 동의하는 것으로 봅니다:',
  },
  finalCtaTitle: '더 빠른 경로가 필요하신가요?',
  finalCtaSubtitle: 'Studio 기준 가격을 먼저 보거나, 현재 쓰는 대화 스택과 Seizn의 역할을 비교해볼 수 있습니다.',
  finalPrimary: '가격 보기',
  finalSecondary: '통합 보기',
  successTitle: '요청을 접수했습니다',
  successBody: '게임 범위를 검토한 뒤 빠르게 회신드리겠습니다.',
  successBack: '홈으로 돌아가기',
};

function getCopy(locale: Locale): Copy {
  if (locale === 'ko') return COPY_KO;
  return COPY_EN;
}

export function EnterpriseClient({ dict, locale }: EnterpriseClientProps) {
  const [formData, setFormData] = useState<FormData>({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    job_title: '',
    company_size: '',
    industry: 'games',
    website: '',
    use_case: '',
    expected_volume: '',
    requirements: '',
    timeline: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const copy = getCopy(locale);
  const compareLabel = dict.extremeHome?.nav?.compare || 'Integrations';
  const enterpriseLabel = dict.extremeHome?.nav?.enterprise || 'For Studios';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          source: 'game-studio-landing',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08111f] px-6 text-white">
        <div className="max-w-xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-cyan-400 text-lg font-semibold text-[#08111f]">
            S
          </div>
          <h1 className="mt-6 text-3xl font-semibold">{copy.successTitle}</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">{copy.successBody}</p>
          <Link
            href={`/${locale}`}
            className="mt-8 inline-flex rounded-md border border-white/15 px-4 py-3 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/5"
          >
            {copy.successBack}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#08111f]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href={`/${locale}`} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-400 text-sm font-semibold text-[#08111f]">
              S
            </div>
            <span className="text-lg font-semibold text-white">Seizn</span>
          </Link>

          <div className="flex items-center gap-5">
            <Link href={`/${locale}/pricing`} className="hidden text-sm text-slate-300 transition-colors hover:text-white md:block">
              {dict.nav.pricing}
            </Link>
            <Link href={`/${locale}/comparison`} className="hidden text-sm text-slate-300 transition-colors hover:text-white md:block">
              {compareLabel}
            </Link>
            <Link href={`/${locale}/enterprise`} className="hidden text-sm font-medium text-white md:block">
              {enterpriseLabel}
            </Link>
            <Link href={`/${locale}/docs`} className="hidden text-sm text-slate-300 transition-colors hover:text-white md:block">
              {dict.nav.docs}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <a
              href="#contact-form"
              className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
            >
              {dict.nav.getStarted}
            </a>
          </div>
        </div>
      </nav>

      <main>
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
            <div className="max-w-4xl">
              <p className="text-sm font-medium uppercase tracking-[0.08em] text-cyan-300">{copy.eyebrow}</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-6xl">{copy.title}</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{copy.subtitle}</p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{copy.helper}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#contact-form"
                  className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
                >
                  {copy.primaryCta}
                </a>
                <Link
                  href={`/${locale}/comparison`}
                  className="rounded-md border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/5"
                >
                  {copy.secondaryCta}
                </Link>
              </div>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {copy.proofChips.map((chip) => (
                <div key={chip} className="border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-200">
                  {chip}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.packagesTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.packagesSubtitle}</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {copy.packages.map((item) => (
                <div key={item.title} className="border border-white/10 bg-white/5 px-5 py-5">
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.processTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.processSubtitle}</p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {copy.steps.map((step) => (
                <div key={step.title} className="border border-white/10 bg-white/5 px-5 py-5">
                  <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.trustTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.trustSubtitle}</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {copy.trustItems.map((item) => (
                <div key={item.label} className="border border-white/10 bg-white/5 px-5 py-5">
                  <p className="text-sm font-medium uppercase tracking-[0.08em] text-cyan-300">{item.label}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact-form" className="border-b border-white/10 scroll-mt-24">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-10 lg:grid-cols-[1.2fr,1fr]">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.formTitle}</h2>
                <p className="mt-4 text-lg leading-8 text-slate-300">{copy.formSubtitle}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 border border-white/10 bg-white/5 px-5 py-5">
                {error ? (
                  <div className="border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.companyName} *</span>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleChange}
                      required
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    />
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.yourName} *</span>
                    <input
                      type="text"
                      name="contact_name"
                      value={formData.contact_name}
                      onChange={handleChange}
                      required
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.workEmail} *</span>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    />
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.phone}</span>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.jobTitle}</span>
                    <input
                      type="text"
                      name="job_title"
                      value={formData.job_title}
                      onChange={handleChange}
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    />
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.companySize}</span>
                    <select
                      name="company_size"
                      value={formData.company_size}
                      onChange={handleChange}
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    >
                      <option value="">{dict.enterprisePage.companySizes.select}</option>
                      <option value="1-10">{dict.enterprisePage.companySizes['1-10']}</option>
                      <option value="11-50">{dict.enterprisePage.companySizes['11-50']}</option>
                      <option value="51-200">{dict.enterprisePage.companySizes['51-200']}</option>
                      <option value="201-500">{dict.enterprisePage.companySizes['201-500']}</option>
                      <option value="500+">{dict.enterprisePage.companySizes['500+']}</option>
                    </select>
                  </label>
                </div>

                <label className="block text-sm text-slate-200">
                  <span className="mb-2 block font-medium">{copy.labels.useCase} *</span>
                  <textarea
                    name="use_case"
                    value={formData.use_case}
                    onChange={handleChange}
                    required
                    rows={5}
                    placeholder={copy.labels.useCasePlaceholder}
                    className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.expectedVolume}</span>
                    <select
                      name="expected_volume"
                      value={formData.expected_volume}
                      onChange={handleChange}
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    >
                      <option value="">{dict.enterprisePage.volumes.select}</option>
                      <option value="< 100K">{dict.enterprisePage.volumes.lt100k}</option>
                      <option value="100K - 500K">{dict.enterprisePage.volumes['100k-500k']}</option>
                      <option value="500K - 1M">{dict.enterprisePage.volumes['500k-1m']}</option>
                      <option value="1M - 5M">{dict.enterprisePage.volumes['1m-5m']}</option>
                      <option value="5M+">{dict.enterprisePage.volumes['5m+']}</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-200">
                    <span className="mb-2 block font-medium">{copy.labels.timeline}</span>
                    <select
                      name="timeline"
                      value={formData.timeline}
                      onChange={handleChange}
                      className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                    >
                      <option value="">{dict.enterprisePage.timelines.select}</option>
                      <option value="immediate">{dict.enterprisePage.timelines.immediate}</option>
                      <option value="1-3 months">{dict.enterprisePage.timelines['1-3months']}</option>
                      <option value="3-6 months">{dict.enterprisePage.timelines['3-6months']}</option>
                      <option value="6+ months">{dict.enterprisePage.timelines['6+months']}</option>
                    </select>
                  </label>
                </div>

                <label className="block text-sm text-slate-200">
                  <span className="mb-2 block font-medium">{copy.labels.requirements}</span>
                  <textarea
                    name="requirements"
                    value={formData.requirements}
                    onChange={handleChange}
                    rows={4}
                    placeholder={copy.labels.requirementsPlaceholder}
                    className="w-full rounded-md border border-white/10 bg-[#08111f] px-4 py-3 text-white outline-none transition-colors focus:border-cyan-400"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-md bg-cyan-400 px-4 py-3 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
                >
                  {isSubmitting ? copy.labels.submitting : copy.labels.submit}
                </button>

                <p className="text-sm leading-6 text-slate-400">
                  {copy.labels.privacyNote}{' '}
                  <Link href={`/${locale}/privacy`} className="text-cyan-300 transition-colors hover:text-cyan-200">
                    {dict.footer.privacy}
                  </Link>
                  .
                </p>
              </form>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.finalCtaTitle}</h2>
                <p className="mt-4 text-lg leading-8 text-slate-300">{copy.finalCtaSubtitle}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/pricing`}
                  className="rounded-md border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/5"
                >
                  {copy.finalPrimary}
                </Link>
                <Link
                  href={`/${locale}/comparison`}
                  className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
                >
                  {copy.finalSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-400 text-sm font-semibold text-[#08111f]">
              S
            </div>
            <span className="text-sm font-medium text-white">Seizn</span>
          </Link>

          <div className="text-sm text-slate-400">
            {dict.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
          </div>

          <nav className="flex flex-wrap items-center gap-5">
            <Link href={`/${locale}/privacy`} className="text-sm text-slate-400 transition-colors hover:text-white">
              {dict.footer.privacy}
            </Link>
            <Link href={`/${locale}/terms`} className="text-sm text-slate-400 transition-colors hover:text-white">
              {dict.footer.terms}
            </Link>
            <a href="#contact-form" className="text-sm text-slate-400 transition-colors hover:text-white">
              {dict.footer.contact}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
