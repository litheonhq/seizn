import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { enterpriseInquiryConfirmationEmail } from '@/lib/email/templates';
import { logServerError } from '@/lib/server/logger';

interface EnterpriseInquiryRequest {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  job_title?: string;
  company_size?: string;
  industry?: string;
  website?: string;
  use_case: string;
  expected_volume?: string;
  requirements?: string;
  timeline?: string;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeEmailSubjectPart(str: string): string {
  return str.replace(/[\r\n]+/g, ' ').trim().slice(0, 180);
}

// POST /api/enterprise - Submit enterprise inquiry
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { checkIpRateLimitAsync, getRateLimitHeaders } = await import('@/lib/rate-limit');
    const rateLimitResult = await checkIpRateLimitAsync(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const parsedBody = await request.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const body = parsedBody as EnterpriseInquiryRequest;

    // Validate required fields
    if (!body.company_name || body.company_name.trim().length < 2) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    if (!body.contact_name || body.contact_name.trim().length < 2) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }

    const normalizedEmail = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!body.use_case || body.use_case.trim().length < 10) {
      return NextResponse.json({ error: 'Please describe your use case (at least 10 characters)' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Check for duplicate submissions (same email in last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data: existing } = await supabase
      .from('enterprise_inquiries')
      .select('id')
      .eq('email', normalizedEmail)
      .gte('created_at', oneDayAgo.toISOString())
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'You have already submitted an inquiry recently. We will get back to you soon!',
      }, { status: 400 });
    }

    // Get referrer from headers
    const referrer = request.headers.get('referer') || null;

    // Insert inquiry
    const { data: inquiry, error } = await supabase
      .from('enterprise_inquiries')
      .insert({
        company_name: body.company_name.trim(),
        contact_name: body.contact_name.trim(),
        email: normalizedEmail,
        phone: body.phone?.trim() || null,
        job_title: body.job_title?.trim() || null,
        company_size: body.company_size || null,
        industry: body.industry?.trim() || null,
        website: body.website?.trim() || null,
        use_case: body.use_case.trim(),
        expected_volume: body.expected_volume || null,
        requirements: body.requirements?.trim() || null,
        timeline: body.timeline || null,
        source: body.source || 'website',
        referrer,
        utm_source: body.utm_source || null,
        utm_medium: body.utm_medium || null,
        utm_campaign: body.utm_campaign || null,
        status: 'new',
        priority: determineInquiryPriority(body),
      })
      .select('id')
      .single();

    if (error) {
      logServerError('Enterprise inquiry insert failed', error);
      return NextResponse.json({ error: 'Failed to submit inquiry' }, { status: 500 });
    }

    // Send confirmation email to user (non-blocking)
    const safeCompanySubject = sanitizeEmailSubjectPart(body.company_name);
    sendEmail({
      to: normalizedEmail,
      subject: `We received your enterprise inquiry - ${safeCompanySubject}`,
      html: enterpriseInquiryConfirmationEmail(body.company_name, body.contact_name),
    }).catch((err) => logServerError('Enterprise confirmation email failed', err));

    // Send notification to sales team (non-blocking)
    sendEmail({
      to: 'contact@seizn.com',
      subject: `[Enterprise Inquiry] ${safeCompanySubject} - ${determineInquiryPriority(body).toUpperCase()}`,
      html: `
        <h2>New Enterprise Inquiry</h2>
        <p><strong>Company:</strong> ${escapeHtml(body.company_name)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(body.contact_name)} (${escapeHtml(normalizedEmail)})</p>
        <p><strong>Phone:</strong> ${escapeHtml(body.phone || 'N/A')}</p>
        <p><strong>Job Title:</strong> ${escapeHtml(body.job_title || 'N/A')}</p>
        <p><strong>Company Size:</strong> ${escapeHtml(body.company_size || 'N/A')}</p>
        <p><strong>Industry:</strong> ${escapeHtml(body.industry || 'N/A')}</p>
        <p><strong>Website:</strong> ${escapeHtml(body.website || 'N/A')}</p>
        <h3>Use Case</h3>
        <p>${escapeHtml(body.use_case)}</p>
        <p><strong>Expected Volume:</strong> ${escapeHtml(body.expected_volume || 'N/A')}</p>
        <p><strong>Timeline:</strong> ${escapeHtml(body.timeline || 'N/A')}</p>
        <p><strong>Requirements:</strong> ${escapeHtml(body.requirements || 'N/A')}</p>
        <hr/>
        <p><strong>Priority:</strong> ${determineInquiryPriority(body)}</p>
        <p><strong>Inquiry ID:</strong> ${inquiry.id}</p>
      `,
    }).catch((err) => logServerError('Enterprise sales notification failed', err));

    return NextResponse.json({
      success: true,
      message: 'Thank you for your inquiry! Our team will contact you within 1-2 business days.',
      inquiry_id: inquiry.id,
    });
  } catch (error) {
    logServerError('Enterprise inquiry request failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Determine priority based on company size and timeline
function determineInquiryPriority(inquiry: EnterpriseInquiryRequest): string {
  const isLargeCompany = ['201-500', '500+'].includes(inquiry.company_size || '');
  const isUrgent = inquiry.timeline === 'immediate';

  if (isLargeCompany && isUrgent) return 'urgent';
  if (isLargeCompany || isUrgent) return 'high';
  return 'normal';
}
