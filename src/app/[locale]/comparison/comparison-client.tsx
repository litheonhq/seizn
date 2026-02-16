"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

interface ComparisonClientProps {
  dict: Dictionary;
  locale: Locale;
}

type Capability = "native" | "integrated" | "partial" | "custom";

type Row = {
  category: string;
  seizn: Capability;
  memoryApis: Capability;
  vectorStack: Capability;
  observabilityTools: Capability;
};

const TABLE_ROWS_EN: Row[] = [
  {
    category: "Persistent memory + profile graph",
    seizn: "native",
    memoryApis: "integrated",
    vectorStack: "custom",
    observabilityTools: "custom",
  },
  {
    category: "Policy engine + tenant governance",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
  {
    category: "Trace + eval + replay in one flow",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "integrated",
  },
  {
    category: "Autopilot webhook + regression actions",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
  {
    category: "E2E encrypted confidential memories",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "custom",
  },
  {
    category: "Enterprise SSO (SAML/OIDC)",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
  {
    category: "On-prem / controlled deployment options",
    seizn: "integrated",
    memoryApis: "partial",
    vectorStack: "integrated",
    observabilityTools: "partial",
  },
  {
    category: "Audit evidence + SLA alignment",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
];

const TABLE_ROWS_KO: Row[] = [
  {
    category: "지속 메모리 + 프로필 그래프",
    seizn: "native",
    memoryApis: "integrated",
    vectorStack: "custom",
    observabilityTools: "custom",
  },
  {
    category: "정책 엔진 + 테넌트 거버넌스",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
  {
    category: "Trace + Eval + Replay 통합",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "integrated",
  },
  {
    category: "Autopilot webhook + 회귀 대응",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
  {
    category: "E2E 기밀 메모리 암호화",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "custom",
  },
  {
    category: "엔터프라이즈 SSO (SAML/OIDC)",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
  {
    category: "온프레미스/통제 배포 옵션",
    seizn: "integrated",
    memoryApis: "partial",
    vectorStack: "integrated",
    observabilityTools: "partial",
  },
  {
    category: "감사 증적 + SLA 정렬",
    seizn: "native",
    memoryApis: "partial",
    vectorStack: "custom",
    observabilityTools: "partial",
  },
];

type Copy = {
  title: string;
  subtitle: string;
  description: string;
  snapshotLabel: string;
  refreshLabel: string;
  sourceLabel: string;
  disclaimer: string;
  legend: Record<Capability, string>;
  columns: {
    category: string;
    seizn: string;
    memoryApis: string;
    vectorStack: string;
    observabilityTools: string;
  };
  cta: {
    pricing: string;
    enterprise: string;
  };
};

const COPY_EN: Copy = {
  title: "Competitive Positioning",
  subtitle: "Category-first comparison for AI memory infrastructure",
  description:
    "This page is intentionally category-based. It compares capability packaging and operating model, not list prices.",
  snapshotLabel: "Positioning Snapshot",
  refreshLabel: "Last refreshed: February 16, 2026",
  sourceLabel: "Reference scope: public product docs, pricing pages, and security pages.",
  disclaimer:
    "Use this as a qualification matrix for technical evaluation. Validate final fit with your own workload and compliance requirements.",
  legend: {
    native: "Native",
    integrated: "Integrated",
    partial: "Partial",
    custom: "Custom Build",
  },
  columns: {
    category: "Capability Category",
    seizn: "Seizn",
    memoryApis: "Memory APIs",
    vectorStack: "Vector DB + Custom Stack",
    observabilityTools: "Observability Tools",
  },
  cta: {
    pricing: "View Pricing",
    enterprise: "Talk to Enterprise",
  },
};

const COPY_KO: Copy = {
  title: "경쟁 포지셔닝 비교",
  subtitle: "AI 메모리 인프라를 범주 중심으로 비교",
  description:
    "이 페이지는 의도적으로 범주형 비교를 사용합니다. 가격 숫자보다 기능 패키징과 운영 모델을 비교합니다.",
  snapshotLabel: "포지셔닝 스냅샷",
  refreshLabel: "최근 갱신: 2026년 2월 16일",
  sourceLabel: "참고 범위: 공개 제품 문서, 가격 페이지, 보안 페이지",
  disclaimer:
    "기술 검토용 매트릭스로 활용하고, 최종 도입 판단은 실제 워크로드/컴플라이언스 기준으로 검증하세요.",
  legend: {
    native: "기본 내장",
    integrated: "연동 제공",
    partial: "부분 제공",
    custom: "직접 구현",
  },
  columns: {
    category: "기능 범주",
    seizn: "Seizn",
    memoryApis: "Memory API 계열",
    vectorStack: "Vector DB + 커스텀 스택",
    observabilityTools: "관측 도구 계열",
  },
  cta: {
    pricing: "가격 보기",
    enterprise: "엔터프라이즈 문의",
  },
};

function capabilityStyle(value: Capability): string {
  if (value === "native") return "bg-emerald-100 text-emerald-700";
  if (value === "integrated") return "bg-blue-100 text-blue-700";
  if (value === "partial") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function getCopy(locale: Locale): { copy: Copy; rows: Row[] } {
  if (locale === "ko") {
    return { copy: COPY_KO, rows: TABLE_ROWS_KO };
  }
  return { copy: COPY_EN, rows: TABLE_ROWS_EN };
}

export function ComparisonClient({ dict, locale }: ComparisonClientProps) {
  const { copy, rows } = getCopy(locale);

  return (
    <div className="min-h-screen gradient-hero relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-pink-200/30 rounded-full blur-3xl animate-float" />
        <div
          className="absolute top-40 right-20 w-96 h-96 bg-cyan-200/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Seizn
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href={`/${locale}/pricing`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors hidden md:block">
              {dict.nav.pricing}
            </Link>
            <Link href={`/${locale}/enterprise`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors hidden md:block">
              {dict.extremeHome?.nav?.enterprise || "Enterprise"}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-10 px-6 relative z-10">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 glass-card-premium rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-600 font-medium">{copy.snapshotLabel}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-gray-900 mb-4">{copy.title}</h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto mb-3">{copy.subtitle}</p>
          <p className="text-sm text-gray-500 max-w-3xl mx-auto">{copy.description}</p>
          <p className="text-xs text-gray-500 mt-5">{copy.refreshLabel}</p>
          <p className="text-xs text-gray-500 mt-1">{copy.sourceLabel}</p>
        </div>
      </section>

      <section className="pb-10 px-6 relative z-10">
        <div className="max-w-6xl mx-auto glass-card-premium rounded-3xl p-6 md:p-8">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 pr-4 text-sm font-semibold text-gray-900">{copy.columns.category}</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-900">{copy.columns.seizn}</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-900">{copy.columns.memoryApis}</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-900">{copy.columns.vectorStack}</th>
                  <th className="text-left py-3 pl-2 text-sm font-semibold text-gray-900">{copy.columns.observabilityTools}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.category} className="border-b border-gray-100">
                    <td className="py-3 pr-4 text-sm text-gray-800">{row.category}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${capabilityStyle(row.seizn)}`}>
                        {copy.legend[row.seizn]}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${capabilityStyle(row.memoryApis)}`}>
                        {copy.legend[row.memoryApis]}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${capabilityStyle(row.vectorStack)}`}>
                        {copy.legend[row.vectorStack]}
                      </span>
                    </td>
                    <td className="py-3 pl-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${capabilityStyle(row.observabilityTools)}`}>
                        {copy.legend[row.observabilityTools]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="pb-16 px-6 relative z-10">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-gray-600 mb-6">{copy.disclaimer}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={`/${locale}/pricing`}
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white text-sm font-medium hover:opacity-95 transition-opacity"
            >
              {copy.cta.pricing}
            </Link>
            <Link
              href={`/${locale}/enterprise`}
              className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-gray-300 bg-white/60 text-gray-900 text-sm font-medium hover:bg-white transition-colors"
            >
              {copy.cta.enterprise}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ComparisonClient;
