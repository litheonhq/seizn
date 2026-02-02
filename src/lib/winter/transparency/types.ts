/**
 * Seizn Winter - EU AI Act Article 50 Transparency Types
 *
 * Types for compliance with EU AI Act Article 50 transparency requirements.
 * Effective date: 2026-08-02
 *
 * Article 50 requires:
 * 1. Disclosure when interacting with AI systems
 * 2. Marking of AI-generated/manipulated content (synthetic content)
 * 3. Machine-readable metadata for synthetic content
 *
 * @see https://ai-act-service-desk.ec.europa.eu/en/ai-act/timeline/timeline-implementation-eu-ai-act
 */

// ============================================
// Core Types
// ============================================

/**
 * Types of transparency events
 */
export type TransparencyEventType =
  | 'ai_interaction_disclosure' // Disclosure of AI interaction to user
  | 'synthetic_content_marking' // AI-generated/manipulated content marking
  | 'deepfake_disclosure' // Special case for deepfake content
  | 'emotion_recognition' // Emotion recognition system disclosure
  | 'biometric_categorization'; // Biometric categorization disclosure

/**
 * Content types that may require transparency marking
 */
export type SyntheticContentType =
  | 'text' // AI-generated text
  | 'image' // AI-generated or manipulated image
  | 'audio' // AI-generated or manipulated audio
  | 'video' // AI-generated or manipulated video (including deepfakes)
  | 'multimodal'; // Combined content types

/**
 * Publication context for Article 50 compliance
 */
export type PublicationContext =
  | 'public_interest' // Information of public interest (news, etc.)
  | 'commercial' // Commercial/advertising content
  | 'artistic' // Artistic/creative work (may have exemptions)
  | 'educational' // Educational content
  | 'research' // Research purposes
  | 'internal' // Internal use only (not published)
  | 'private'; // Private communication

/**
 * Machine-readable metadata format for synthetic content
 */
export interface SyntheticContentMetadata {
  // Required fields
  contentId: string;
  generatedAt: string; // ISO 8601
  generatorSystem: string; // Name/identifier of AI system
  contentType: SyntheticContentType;

  // Content origin
  isFullyGenerated: boolean; // True if entirely AI-generated
  isManipulated: boolean; // True if AI-manipulated existing content
  originalContentRef?: string; // Reference to original if manipulated

  // Technical metadata
  modelName?: string;
  modelVersion?: string;
  provider?: string;

  // Provenance chain
  provenance?: {
    inputHash?: string; // Hash of input/prompt (privacy-safe)
    outputHash: string; // Hash of generated content
    timestamp: string;
    sessionId?: string;
  };

  // C2PA/Content Credentials compatible fields
  c2pa?: {
    manifestRef?: string;
    assertionRef?: string;
  };
}

/**
 * Transparency event record
 */
export interface TransparencyEvent {
  id: string;
  organizationId: string;
  userId?: string; // User who triggered the event
  sessionId?: string; // Session context

  eventType: TransparencyEventType;
  timestamp: string; // ISO 8601

  // Disclosure details
  disclosure: {
    // What was disclosed
    message?: string; // Human-readable disclosure message
    machineReadable: boolean; // Whether machine-readable metadata included

    // How it was disclosed
    method: 'inline' | 'banner' | 'metadata' | 'watermark' | 'api_response';
    verified: boolean; // Whether disclosure was verified as shown to user

    // User acknowledgment (if applicable)
    userAcknowledged?: boolean;
    acknowledgedAt?: string;
  };

  // Content context
  content?: {
    type: SyntheticContentType;
    metadata?: SyntheticContentMetadata;
    publicationContext?: PublicationContext;
    destinationPlatform?: string; // Where content is being published
  };

  // Audit trail
  audit: {
    requestId?: string;
    traceId?: string;
    clientInfo?: {
      ip?: string; // Hashed for privacy
      userAgent?: string;
      sdkVersion?: string;
    };
  };
}

/**
 * Configuration for transparency requirements
 */
export interface TransparencyConfig {
  organizationId: string;

  // Global settings
  enabled: boolean;
  defaultDisclosureMethod: TransparencyEvent['disclosure']['method'];

  // Per-content-type settings
  contentSettings: {
    [K in SyntheticContentType]?: {
      requireMarking: boolean;
      markingMethod: TransparencyEvent['disclosure']['method'];
      includeMetadata: boolean;
      exemptContexts?: PublicationContext[];
    };
  };

  // Audit settings
  logAllEvents: boolean;
  retentionDays: number;

  // Integration settings
  webhookUrl?: string; // Notify external system of transparency events
  c2paEnabled?: boolean; // Enable C2PA/Content Credentials
}

/**
 * Article 50 compliance report section
 */
export interface Article50ComplianceSection {
  reportPeriod: {
    start: string;
    end: string;
  };

  summary: {
    totalEvents: number;
    eventsByType: Record<TransparencyEventType, number>;
    eventsByContentType: Record<SyntheticContentType, number>;
    disclosureRate: number; // Percentage of AI outputs with disclosure
  };

  details: {
    // AI interaction disclosures
    aiInteractions: {
      total: number;
      disclosed: number;
      userAcknowledged: number;
    };

    // Synthetic content
    syntheticContent: {
      total: number;
      marked: number;
      withMetadata: number;
      byContext: Record<PublicationContext, number>;
    };

    // Special categories
    deepfakes: {
      total: number;
      disclosed: number;
    };

    emotionRecognition: {
      total: number;
      disclosed: number;
    };
  };

  // Compliance metrics
  compliance: {
    overallScore: number; // 0-100
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      description: string;
      recommendation: string;
    }>;
  };

  // Evidence references
  evidenceRefs: string[];
}

// ============================================
// API Types
// ============================================

export interface CreateTransparencyEventInput {
  eventType: TransparencyEventType;
  disclosure: Omit<TransparencyEvent['disclosure'], 'verified'>;
  content?: TransparencyEvent['content'];
  sessionId?: string;
  traceId?: string;
}

export interface TransparencyEventFilter {
  organizationId: string;
  eventTypes?: TransparencyEventType[];
  contentTypes?: SyntheticContentType[];
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface TransparencyReportInput {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  includeDetails?: boolean;
}
