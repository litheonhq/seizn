/**
 * Seizn Winter - EU AI Act Article 50 Transparency Service
 *
 * Service for managing transparency events and generating compliance reports.
 */

import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase';
import {
  TransparencyEvent,
  TransparencyEventType,
  TransparencyEventFilter,
  CreateTransparencyEventInput,
  TransparencyReportInput,
  Article50ComplianceSection,
  SyntheticContentType,
  PublicationContext,
  TransparencyConfig,
} from './types';

// ============================================
// Event Management
// ============================================

/**
 * Create a transparency event
 */
export async function createTransparencyEvent(
  organizationId: string,
  userId: string | undefined,
  input: CreateTransparencyEventInput
): Promise<TransparencyEvent> {
  const supabase = createServerClient();

  const event: TransparencyEvent = {
    id: `te_${crypto.randomUUID().replace(/-/g, '')}`,
    organizationId,
    userId,
    sessionId: input.sessionId,
    eventType: input.eventType,
    timestamp: new Date().toISOString(),
    disclosure: {
      ...input.disclosure,
      verified: false, // Will be verified by callback
    },
    content: input.content,
    audit: {
      requestId: crypto.randomUUID(),
      traceId: input.traceId,
    },
  };

  // Store in database
  const { error } = await supabase.from('winter_transparency_events').insert({
    id: event.id,
    organization_id: event.organizationId,
    user_id: event.userId,
    session_id: event.sessionId,
    event_type: event.eventType,
    timestamp: event.timestamp,
    disclosure: event.disclosure,
    content: event.content,
    audit: event.audit,
  });

  if (error) {
    console.error('Failed to create transparency event:', error);
    throw new Error(`Failed to create transparency event: ${error.message}`);
  }

  // Log audit event
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'winter.transparency.event_created',
    resource_type: 'transparency_event',
    resource_id: event.id,
    details: {
      organization_id: organizationId,
      event_type: input.eventType,
      content_type: input.content?.type,
    },
    status: 'success',
  });

  return event;
}

/**
 * Mark a transparency event as verified (disclosure shown to user)
 */
export async function verifyTransparencyEvent(
  eventId: string,
  userAcknowledged?: boolean
): Promise<void> {
  const supabase = createServerClient();

  // Fetch current event to merge disclosure
  const { data: current, error: fetchError } = await supabase
    .from('winter_transparency_events')
    .select('disclosure')
    .eq('id', eventId)
    .single();

  if (fetchError || !current) {
    console.error('Failed to fetch transparency event:', fetchError);
    return;
  }

  // Merge disclosure updates
  const updatedDisclosure = {
    ...(current.disclosure as Record<string, unknown> || {}),
    verified: true,
    ...(userAcknowledged !== undefined && {
      userAcknowledged,
      acknowledgedAt: new Date().toISOString(),
    }),
  };

  const { error } = await supabase
    .from('winter_transparency_events')
    .update({ disclosure: updatedDisclosure })
    .eq('id', eventId);

  if (error) {
    console.error('Failed to verify transparency event:', error);
  }
}

/**
 * Query transparency events
 */
export async function queryTransparencyEvents(
  filter: TransparencyEventFilter
): Promise<{ data: TransparencyEvent[]; total: number }> {
  const supabase = createServerClient();

  let query = supabase
    .from('winter_transparency_events')
    .select('*', { count: 'exact' })
    .eq('organization_id', filter.organizationId);

  if (filter.eventTypes && filter.eventTypes.length > 0) {
    query = query.in('event_type', filter.eventTypes);
  }

  if (filter.contentTypes && filter.contentTypes.length > 0) {
    query = query.in('content->type', filter.contentTypes);
  }

  if (filter.startDate) {
    query = query.gte('timestamp', filter.startDate);
  }

  if (filter.endDate) {
    query = query.lte('timestamp', filter.endDate);
  }

  query = query
    .order('timestamp', { ascending: false })
    .range(
      filter.offset || 0,
      (filter.offset || 0) + (filter.limit || 100) - 1
    );

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to query transparency events:', error);
    throw new Error(`Failed to query transparency events: ${error.message}`);
  }

  return {
    data: (data || []).map(mapDbToEvent),
    total: count || 0,
  };
}

// ============================================
// Compliance Report Generation
// ============================================

/**
 * Generate Article 50 compliance report section
 */
export async function generateArticle50Report(
  input: TransparencyReportInput
): Promise<Article50ComplianceSection> {
  const supabase = createServerClient();

  const startDate = input.periodStart.toISOString();
  const endDate = input.periodEnd.toISOString();

  // Fetch all events in period
  const { data: events, error } = await supabase
    .from('winter_transparency_events')
    .select('*')
    .eq('organization_id', input.organizationId)
    .gte('timestamp', startDate)
    .lte('timestamp', endDate);

  if (error) {
    throw new Error(`Failed to fetch transparency events: ${error.message}`);
  }

  const allEvents = (events || []).map(mapDbToEvent);

  // Calculate statistics
  const eventsByType = allEvents.reduce(
    (acc, e) => {
      acc[e.eventType] = (acc[e.eventType] || 0) + 1;
      return acc;
    },
    {} as Record<TransparencyEventType, number>
  );

  const eventsByContentType = allEvents.reduce(
    (acc, e) => {
      if (e.content?.type) {
        acc[e.content.type] = (acc[e.content.type] || 0) + 1;
      }
      return acc;
    },
    {} as Record<SyntheticContentType, number>
  );

  // AI interaction stats
  const aiInteractions = allEvents.filter(
    (e) => e.eventType === 'ai_interaction_disclosure'
  );
  const disclosedInteractions = aiInteractions.filter(
    (e) => e.disclosure.verified
  );
  const acknowledgedInteractions = aiInteractions.filter(
    (e) => e.disclosure.userAcknowledged
  );

  // Synthetic content stats
  const syntheticEvents = allEvents.filter(
    (e) => e.eventType === 'synthetic_content_marking'
  );
  const markedContent = syntheticEvents.filter((e) => e.disclosure.verified);
  const withMetadata = syntheticEvents.filter(
    (e) => e.disclosure.machineReadable
  );

  const byContext = syntheticEvents.reduce(
    (acc, e) => {
      const ctx = e.content?.publicationContext || 'internal';
      acc[ctx] = (acc[ctx] || 0) + 1;
      return acc;
    },
    {} as Record<PublicationContext, number>
  );

  // Deepfake stats
  const deepfakes = allEvents.filter(
    (e) => e.eventType === 'deepfake_disclosure'
  );
  const disclosedDeepfakes = deepfakes.filter((e) => e.disclosure.verified);

  // Emotion recognition stats
  const emotionRecognition = allEvents.filter(
    (e) => e.eventType === 'emotion_recognition'
  );
  const disclosedEmotionRecognition = emotionRecognition.filter(
    (e) => e.disclosure.verified
  );

  // Calculate disclosure rate
  const totalOutputs = allEvents.length;
  const disclosedOutputs = allEvents.filter((e) => e.disclosure.verified).length;
  const disclosureRate = totalOutputs > 0 ? (disclosedOutputs / totalOutputs) * 100 : 100;

  // Calculate compliance score and issues
  const { score, issues } = calculateComplianceScore({
    disclosureRate,
    aiInteractions,
    disclosedInteractions,
    syntheticEvents,
    markedContent,
    withMetadata,
    deepfakes,
    disclosedDeepfakes,
  });

  return {
    reportPeriod: {
      start: startDate,
      end: endDate,
    },
    summary: {
      totalEvents: allEvents.length,
      eventsByType,
      eventsByContentType,
      disclosureRate,
    },
    details: {
      aiInteractions: {
        total: aiInteractions.length,
        disclosed: disclosedInteractions.length,
        userAcknowledged: acknowledgedInteractions.length,
      },
      syntheticContent: {
        total: syntheticEvents.length,
        marked: markedContent.length,
        withMetadata: withMetadata.length,
        byContext,
      },
      deepfakes: {
        total: deepfakes.length,
        disclosed: disclosedDeepfakes.length,
      },
      emotionRecognition: {
        total: emotionRecognition.length,
        disclosed: disclosedEmotionRecognition.length,
      },
    },
    compliance: {
      overallScore: score,
      issues,
    },
    evidenceRefs: allEvents.slice(0, 100).map((e) => e.id),
  };
}

// ============================================
// SDK Helper Functions
// ============================================

/**
 * Check if content requires transparency marking
 */
export function requiresTransparencyMarking(
  contentType: SyntheticContentType,
  publicationContext: PublicationContext,
  config?: TransparencyConfig
): boolean {
  // Artistic works may have exemptions under Article 50(4)
  if (publicationContext === 'artistic') {
    return false; // Simplified - real implementation would check specific criteria
  }

  // Internal use doesn't require marking
  if (publicationContext === 'internal' || publicationContext === 'private') {
    return false;
  }

  // Check config overrides
  if (config?.contentSettings?.[contentType]) {
    const settings = config.contentSettings[contentType];
    if (settings?.exemptContexts?.includes(publicationContext)) {
      return false;
    }
    return settings?.requireMarking ?? true;
  }

  // Default: all synthetic content for public contexts requires marking
  return true;
}

/**
 * Generate machine-readable metadata for synthetic content
 */
export function generateSyntheticContentMetadata(params: {
  contentType: SyntheticContentType;
  generatorSystem: string;
  modelName?: string;
  modelVersion?: string;
  provider?: string;
  isFullyGenerated: boolean;
  isManipulated: boolean;
  originalContentRef?: string;
  inputHash?: string;
  outputHash: string;
  sessionId?: string;
}): TransparencyEvent['content'] {
  return {
    type: params.contentType,
    metadata: {
      contentId: `sc_${crypto.randomUUID().replace(/-/g, '')}`,
      generatedAt: new Date().toISOString(),
      generatorSystem: params.generatorSystem,
      contentType: params.contentType,
      isFullyGenerated: params.isFullyGenerated,
      isManipulated: params.isManipulated,
      originalContentRef: params.originalContentRef,
      modelName: params.modelName,
      modelVersion: params.modelVersion,
      provider: params.provider,
      provenance: {
        inputHash: params.inputHash,
        outputHash: params.outputHash,
        timestamp: new Date().toISOString(),
        sessionId: params.sessionId,
      },
    },
  };
}

// ============================================
// Helper Functions
// ============================================

function mapDbToEvent(row: Record<string, unknown>): TransparencyEvent {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    userId: row.user_id as string | undefined,
    sessionId: row.session_id as string | undefined,
    eventType: row.event_type as TransparencyEventType,
    timestamp: row.timestamp as string,
    disclosure: row.disclosure as TransparencyEvent['disclosure'],
    content: row.content as TransparencyEvent['content'],
    audit: row.audit as TransparencyEvent['audit'],
  };
}

function calculateComplianceScore(data: {
  disclosureRate: number;
  aiInteractions: TransparencyEvent[];
  disclosedInteractions: TransparencyEvent[];
  syntheticEvents: TransparencyEvent[];
  markedContent: TransparencyEvent[];
  withMetadata: TransparencyEvent[];
  deepfakes: TransparencyEvent[];
  disclosedDeepfakes: TransparencyEvent[];
}): {
  score: number;
  issues: Article50ComplianceSection['compliance']['issues'];
} {
  const issues: Article50ComplianceSection['compliance']['issues'] = [];
  let score = 100;

  // Check AI interaction disclosure rate
  if (data.aiInteractions.length > 0) {
    const rate =
      (data.disclosedInteractions.length / data.aiInteractions.length) * 100;
    if (rate < 100) {
      score -= (100 - rate) * 0.3;
      issues.push({
        severity: rate < 90 ? 'critical' : 'warning',
        description: `${(100 - rate).toFixed(1)}% of AI interactions lack disclosure`,
        recommendation:
          'Ensure all AI interactions display disclosure to users',
      });
    }
  }

  // Check synthetic content marking
  if (data.syntheticEvents.length > 0) {
    const markingRate =
      (data.markedContent.length / data.syntheticEvents.length) * 100;
    if (markingRate < 100) {
      score -= (100 - markingRate) * 0.3;
      issues.push({
        severity: markingRate < 90 ? 'critical' : 'warning',
        description: `${(100 - markingRate).toFixed(1)}% of synthetic content lacks marking`,
        recommendation:
          'Mark all AI-generated content with appropriate labels',
      });
    }

    // Check metadata inclusion
    const metadataRate =
      (data.withMetadata.length / data.syntheticEvents.length) * 100;
    if (metadataRate < 80) {
      score -= (80 - metadataRate) * 0.2;
      issues.push({
        severity: 'warning',
        description: `${(100 - metadataRate).toFixed(1)}% of synthetic content lacks machine-readable metadata`,
        recommendation:
          'Include machine-readable metadata for better traceability',
      });
    }
  }

  // Deepfakes require 100% disclosure
  if (data.deepfakes.length > 0) {
    const deepfakeRate =
      (data.disclosedDeepfakes.length / data.deepfakes.length) * 100;
    if (deepfakeRate < 100) {
      score -= (100 - deepfakeRate) * 0.5;
      issues.push({
        severity: 'critical',
        description: `${data.deepfakes.length - data.disclosedDeepfakes.length} deepfake(s) without disclosure`,
        recommendation:
          'All deepfake content MUST be disclosed under Article 50',
      });
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
  };
}
