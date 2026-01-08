'use client';

import { useState } from 'react';

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

export default function EnterprisePage() {
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
          <h1 className="text-2xl font-bold mb-4">Thank You!</h1>
          <p className="text-gray-400 mb-6">
            We&apos;ve received your inquiry. Our team will contact you within 1-2 business days.
          </p>
          <a href="/" className="text-blue-400 hover:underline">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Contact Sales</h1>
        <p className="text-gray-400 mb-8">
          Get a custom plan for your enterprise needs with dedicated support, SLA guarantees, and custom integrations.
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Enterprise includes:</h2>
          <ul className="grid grid-cols-2 gap-3 text-sm text-gray-300">
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> 99.9% Uptime SLA
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Priority Support (24h)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Dedicated Account Manager
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Custom Integrations
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> SSO / SAML Authentication
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Data Retention Policy
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Security Audit Reports
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Custom Contracts
            </li>
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
              <label className="block text-sm font-medium mb-2">Company Name *</label>
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
              <label className="block text-sm font-medium mb-2">Your Name *</label>
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
              <label className="block text-sm font-medium mb-2">Work Email *</label>
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
              <label className="block text-sm font-medium mb-2">Phone</label>
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
              <label className="block text-sm font-medium mb-2">Job Title</label>
              <input
                type="text"
                name="job_title"
                value={formData.job_title}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Company Size</label>
              <select
                name="company_size"
                value={formData.company_size}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-500">201-500 employees</option>
                <option value="500+">500+ employees</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tell us about your use case *</label>
            <textarea
              name="use_case"
              value={formData.use_case}
              onChange={handleChange}
              required
              rows={4}
              placeholder="What are you building? How will you use Seizn?"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Expected Monthly API Calls</label>
              <select
                name="expected_volume"
                value={formData.expected_volume}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="< 100K">&lt; 100K</option>
                <option value="100K - 500K">100K - 500K</option>
                <option value="500K - 1M">500K - 1M</option>
                <option value="1M - 5M">1M - 5M</option>
                <option value="5M+">5M+</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Timeline</label>
              <select
                name="timeline"
                value={formData.timeline}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="immediate">Ready to start now</option>
                <option value="1-3 months">1-3 months</option>
                <option value="3-6 months">3-6 months</option>
                <option value="6+ months">6+ months</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Specific Requirements</label>
            <textarea
              name="requirements"
              value={formData.requirements}
              onChange={handleChange}
              rows={3}
              placeholder="SSO, specific SLA, data residency, compliance requirements, etc."
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? 'Submitting...' : 'Contact Sales'}
          </button>

          <p className="text-center text-sm text-gray-500">
            By submitting this form, you agree to our{' '}
            <a href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</a>.
          </p>
        </form>
      </div>
    </div>
  );
}
