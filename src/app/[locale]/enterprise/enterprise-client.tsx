'use client';

import { useState } from 'react';
import Link from 'next/link';
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

export function EnterpriseClient({ dict, locale }: EnterpriseClientProps) {
  const [formData, setFormData] = useState<FormData>({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    job_title: '',
    company_size: '',
    industry: '',
    website: '',
    use_case: '',
    expected_volume: '',
    requirements: '',
    timeline: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const t = dict.enterprisePage;
  const enterpriseSnapshotTitle =
    locale === 'ko' ? '엔터프라이즈 세일즈 1페이지 요약' : 'Enterprise One-Page Snapshot';
  const enterpriseSnapshotSubtitle =
    locale === 'ko'
      ? 'SSO/SAML, On-prem, Audit, SLA 기준으로 핵심 기능을 정리했습니다.'
      : 'Standardized around SSO/SAML, On-prem, Audit, and SLA for procurement and security review.';
  const enterpriseStandards =
    locale === 'ko'
      ? [
          {
            title: 'SSO / SAML',
            points: [
              'SAML 2.0 + OIDC 연결 지원',
              '도메인 검증 및 조직 단위 정책 적용',
              '기존 IdP(Okta, Entra ID, Google Workspace)와 연동 가능',
            ],
          },
          {
            title: 'On-prem / Controlled Deployment',
            points: [
              '규제/망분리 환경용 배포 옵션 제공',
              '데이터 거버넌스 정책과 결합 가능',
              '리전 및 보안 요구사항 기반 커스텀 설계',
            ],
          },
          {
            title: 'Audit & Evidence',
            points: [
              '정책/변경/접근 이력 추적',
              '감사 대응용 증적 패키지 생성',
              '컴플라이언스 보고 프로세스에 연계 가능',
            ],
          },
          {
            title: 'SLA',
            points: [
              '가용성/지원 응답 시간 기준 협의',
              '장애 대응 및 커뮤니케이션 절차 명시',
              '엔터프라이즈 운영 모델 기준 맞춤 계약',
            ],
          },
        ]
      : [
          {
            title: 'SSO / SAML',
            points: [
              'SAML 2.0 and OIDC organization connections',
              'Domain verification and org-scoped access policy',
              'Interoperable with Okta, Entra ID, and Google Workspace',
            ],
          },
          {
            title: 'On-prem / Controlled Deployment',
            points: [
              'Deployment options for regulated or isolated environments',
              'Integrates with tenant policy and governance controls',
              'Custom architecture by region and security requirements',
            ],
          },
          {
            title: 'Audit & Evidence',
            points: [
              'Traceable policy, access, and configuration events',
              'Evidence-pack workflows for security and legal review',
              'Audit-friendly export model for compliance programs',
            ],
          },
          {
            title: 'SLA',
            points: [
              'Availability and response-time commitments by agreement',
              'Clear incident response and communication process',
              'Support model aligned to enterprise operations',
            ],
          },
        ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-4">{t.success.title}</h1>
          <p className="text-gray-400 mb-6">
            {t.success.message}
          </p>
          <Link href={`/${locale}`} className="text-blue-400 hover:underline">
            {t.success.backHome}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">{t.title}</h1>
        <p className="text-gray-400 mb-8">
          {t.subtitle}
        </p>

        <div className="bg-[var(--ink-900)] border border-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">{t.includes}</h2>
          <ul className="grid grid-cols-2 gap-3 text-sm text-gray-300">
            {t.includesList.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-green-400">✓</span> {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-[var(--ink-900)] border border-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-2">{enterpriseSnapshotTitle}</h2>
          <p className="text-sm text-gray-400 mb-5">{enterpriseSnapshotSubtitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enterpriseStandards.map((item) => (
              <div key={item.title} className="rounded-lg border border-gray-700 bg-gray-950/50 p-4">
                <h3 className="text-sm font-semibold text-white mb-3">{item.title}</h3>
                <ul className="space-y-2">
                  {item.points.map((point) => (
                    <li key={point} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">-</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-[var(--signal-conflict)]/10 border border-[var(--signal-conflict)]/50 text-[var(--signal-conflict-soft)] p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.companyName} *</label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.yourName} *</label>
              <input
                type="text"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.workEmail} *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.phone}</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.jobTitle}</label>
              <input
                type="text"
                name="job_title"
                value={formData.job_title}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.companySize}</label>
              <select
                name="company_size"
                value={formData.company_size}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">{t.companySizes.select}</option>
                <option value="1-10">{t.companySizes['1-10']}</option>
                <option value="11-50">{t.companySizes['11-50']}</option>
                <option value="51-200">{t.companySizes['51-200']}</option>
                <option value="201-500">{t.companySizes['201-500']}</option>
                <option value="500+">{t.companySizes['500+']}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t.form.useCase} *</label>
            <textarea
              name="use_case"
              value={formData.use_case}
              onChange={handleChange}
              required
              rows={4}
              placeholder={t.form.useCasePlaceholder}
              className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.expectedVolume}</label>
              <select
                name="expected_volume"
                value={formData.expected_volume}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">{t.volumes.select}</option>
                <option value="< 100K">{t.volumes.lt100k}</option>
                <option value="100K - 500K">{t.volumes['100k-500k']}</option>
                <option value="500K - 1M">{t.volumes['500k-1m']}</option>
                <option value="1M - 5M">{t.volumes['1m-5m']}</option>
                <option value="5M+">{t.volumes['5m+']}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.timeline}</label>
              <select
                name="timeline"
                value={formData.timeline}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">{t.timelines.select}</option>
                <option value="immediate">{t.timelines.immediate}</option>
                <option value="1-3 months">{t.timelines['1-3months']}</option>
                <option value="3-6 months">{t.timelines['3-6months']}</option>
                <option value="6+ months">{t.timelines['6+months']}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t.form.requirements}</label>
            <textarea
              name="requirements"
              value={formData.requirements}
              onChange={handleChange}
              rows={3}
              placeholder={t.form.requirementsPlaceholder}
              className="w-full px-4 py-2 bg-[var(--ink-800)] border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? t.form.submitting : t.form.submit}
          </button>

          <p className="text-center text-sm text-gray-500">
            {t.form.privacyNote}{' '}
            <Link href={`/${locale}/legal/privacy`} className="text-blue-400 hover:underline">{dict.footer.privacy}</Link>.
          </p>
        </form>
      </div>
    </div>
  );
}
