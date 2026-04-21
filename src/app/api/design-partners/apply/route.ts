import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { DESIGN_PARTNER_COUPON_CODE, getDesignPartnerSlotStats } from '@/lib/design-partners';
import { sendEmail } from '@/lib/email';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

interface DesignPartnerApplyRequest {
  companyName?: string;
  contactName?: string;
  email?: string;
  role?: string;
  website?: string;
  gameTitle?: string;
  teamSize?: string;
  liveTitle?: boolean;
  useCase?: string;
  expectedMemoryVolume?: string;
  feedbackCommitment?: boolean;
  caseStudyCommitment?: boolean;
  locale?: string;
}

function normalizeText(value: unknown, maxLength: number): string {
  return String(value || '').trim().slice(0, maxLength);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildNotificationEmail(input: Required<Omit<DesignPartnerApplyRequest, 'liveTitle' | 'feedbackCommitment' | 'caseStudyCommitment'>> & {
  liveTitle: boolean;
  feedbackCommitment: boolean;
  caseStudyCommitment: boolean;
  applicationId: string;
}) {
  const rows = [
    ['Company', input.companyName],
    ['Contact', `${input.contactName} <${input.email}>`],
    ['Role', input.role || 'N/A'],
    ['Website', input.website || 'N/A'],
    ['Game title', input.gameTitle || 'N/A'],
    ['Team size', input.teamSize || 'N/A'],
    ['Live title', input.liveTitle ? 'Yes' : 'No'],
    ['Expected memory volume', input.expectedMemoryVolume || 'N/A'],
    ['Quarterly feedback', input.feedbackCommitment ? 'Committed' : 'Missing'],
    ['Public case study', input.caseStudyCommitment ? 'Committed' : 'Missing'],
    ['Application ID', input.applicationId],
  ];

  return `
    <h2>New Seizn Design Partner application</h2>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`
        )
        .join('')}
    </table>
    <h3>Use case</h3>
    <p>${escapeHtml(input.useCase).replace(/\n/g, '<br/>')}</p>
  `;
}

function buildConfirmationEmail(contactName: string) {
  return `
    <h2>We received your Design Partner application.</h2>
    <p>Hi ${escapeHtml(contactName)},</p>
    <p>Thanks for applying to the Seizn Design Partner program. We will review fit, launch timing, and the feedback/case-study commitment before approving one of the ten 2026 slots.</p>
    <p>If approved, your Studio checkout will receive the ${DESIGN_PARTNER_COUPON_CODE} coupon for 66% off for 12 monthly cycles.</p>
    <p>- Seizn</p>
  `;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as DesignPartnerApplyRequest;
    const companyName = normalizeText(body.companyName, 160);
    const contactName = normalizeText(body.contactName, 120);
    const email = normalizeText(body.email, 180).toLowerCase();
    const role = normalizeText(body.role, 120);
    const website = normalizeText(body.website, 240);
    const gameTitle = normalizeText(body.gameTitle, 180);
    const teamSize = normalizeText(body.teamSize, 80);
    const useCase = normalizeText(body.useCase, 4000);
    const expectedMemoryVolume = normalizeText(body.expectedMemoryVolume, 120);

    if (companyName.length < 2) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }
    if (contactName.length < 2) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (useCase.length < 20) {
      return NextResponse.json({ error: 'Use case must be at least 20 characters' }, { status: 400 });
    }
    if (!body.feedbackCommitment || !body.caseStudyCommitment) {
      return NextResponse.json(
        { error: 'The feedback and public case-study commitments are required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const session = await auth().catch(() => null);
    const userId = session?.user?.id || null;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data: existing } = await supabase
      .from('design_partner_applications')
      .select('id')
      .eq('email', email)
      .gte('created_at', oneDayAgo.toISOString())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'We already received an application from this email recently.' },
        { status: 409 }
      );
    }

    const { data: profile } = userId
      ? await supabase
          .from('profiles')
          .select('organization_id, stripe_customer_id')
          .eq('id', userId)
          .maybeSingle()
      : { data: null };
    const profileRow = profile as {
      organization_id?: string | null;
      stripe_customer_id?: string | null;
    } | null;

    const { data: application, error } = await supabase
      .from('design_partner_applications')
      .insert({
        studio_id: profileRow?.organization_id || userId,
        user_id: userId,
        organization_id: profileRow?.organization_id || null,
        company_name: companyName,
        contact_name: contactName,
        email,
        role: role || null,
        website: website || null,
        game_title: gameTitle || null,
        team_size: teamSize || null,
        live_title: Boolean(body.liveTitle),
        use_case: useCase,
        expected_memory_volume: expectedMemoryVolume || null,
        feedback_commitment: true,
        case_study_commitment: true,
        status: 'pending',
        coupon_code: DESIGN_PARTNER_COUPON_CODE,
        stripe_customer_id: profileRow?.stripe_customer_id || null,
        metadata: {
          locale: body.locale || null,
          referrer: request.headers.get('referer'),
          user_agent: request.headers.get('user-agent'),
        },
      })
      .select('id')
      .single();

    if (error || !application) {
      logServerError('Design Partner application insert failed', error);
      return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
    }

    const emailPayload = {
      companyName,
      contactName,
      email,
      role,
      website,
      gameTitle,
      teamSize,
      liveTitle: Boolean(body.liveTitle),
      useCase,
      expectedMemoryVolume,
      feedbackCommitment: true,
      caseStudyCommitment: true,
      locale: body.locale || 'en',
      applicationId: application.id,
    };

    sendEmail({
      to: 'contact@seizn.com',
      subject: `[Design Partner] ${companyName}`,
      html: buildNotificationEmail(emailPayload),
      replyTo: email,
    }).catch((err) => logServerWarn('Design Partner notification email failed', err));

    sendEmail({
      to: email,
      subject: 'We received your Seizn Design Partner application',
      html: buildConfirmationEmail(contactName),
    }).catch((err) => logServerWarn('Design Partner confirmation email failed', err));

    const slots = await getDesignPartnerSlotStats(supabase).catch(() => null);
    return NextResponse.json({
      success: true,
      applicationId: application.id,
      status: 'pending',
      slotsRemaining: slots?.remainingSlots ?? null,
    });
  } catch (error) {
    logServerError('Design Partner application request failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
