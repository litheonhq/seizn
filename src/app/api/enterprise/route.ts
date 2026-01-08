import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

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

// POST /api/enterprise - Submit enterprise inquiry
export async function POST(request: NextRequest) {
  try {
    const body: EnterpriseInquiryRequest = await request.json();

    // Validate required fields
    if (!body.company_name || body.company_name.trim().length < 2) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    if (!body.contact_name || body.contact_name.trim().length < 2) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }

    if (!body.email || !body.email.includes('@')) {
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
      .eq('email', body.email.toLowerCase())
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
        email: body.email.toLowerCase().trim(),
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
      console.error('Enterprise inquiry error:', error);
      return NextResponse.json({ error: 'Failed to submit inquiry' }, { status: 500 });
    }

    // TODO: Send notification email to sales team
    // TODO: Send confirmation email to user
    // await sendSlackNotification(inquiry);
    // await sendConfirmationEmail(body.email);

    return NextResponse.json({
      success: true,
      message: 'Thank you for your inquiry! Our team will contact you within 1-2 business days.',
      inquiry_id: inquiry.id,
    });
  } catch (error) {
    console.error('Enterprise POST error:', error);
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
