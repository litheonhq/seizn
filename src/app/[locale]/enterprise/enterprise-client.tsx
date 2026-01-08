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

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">{t.includes}</h2>
          <ul className="grid grid-cols-2 gap-3 text-sm text-gray-300">
            {t.includesList.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-green-400">✓</span> {item}
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.companyName} *</label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
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
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.workEmail} *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.phone}</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.jobTitle}</label>
              <input
                type="text"
                name="job_title"
                value={formData.job_title}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.companySize}</label>
              <select
                name="company_size"
                value={formData.company_size}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
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
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t.form.expectedVolume}</label>
              <select
                name="expected_volume"
                value={formData.expected_volume}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
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
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
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
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
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
            <Link href={`/${locale}/privacy`} className="text-blue-400 hover:underline">{dict.footer.privacy}</Link>.
          </p>
        </form>
      </div>
    </div>
  );
}
