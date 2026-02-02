/**
 * Seizn Winter - EU AI Act Article 50 Transparency Module
 *
 * Provides compliance with EU AI Act Article 50 transparency requirements.
 * Effective date: 2026-08-02
 *
 * Features:
 * - AI interaction disclosure tracking
 * - Synthetic content marking
 * - Machine-readable metadata generation
 * - Compliance reporting
 *
 * @example
 * ```typescript
 * import { transparency } from '@seizn/winter';
 *
 * // Record AI interaction disclosure
 * await transparency.createEvent(orgId, userId, {
 *   eventType: 'ai_interaction_disclosure',
 *   disclosure: {
 *     message: 'You are interacting with an AI assistant',
 *     machineReadable: true,
 *     method: 'banner',
 *   },
 * });
 *
 * // Generate synthetic content metadata
 * const metadata = transparency.generateMetadata({
 *   contentType: 'text',
 *   generatorSystem: 'seizn-spring',
 *   isFullyGenerated: true,
 *   isManipulated: false,
 *   outputHash: hashContent(generatedText),
 * });
 * ```
 */

// Types
export type {
  TransparencyEvent,
  TransparencyEventType,
  TransparencyEventFilter,
  CreateTransparencyEventInput,
  TransparencyReportInput,
  Article50ComplianceSection,
  SyntheticContentType,
  SyntheticContentMetadata,
  PublicationContext,
  TransparencyConfig,
} from './types';

// Service functions
export {
  createTransparencyEvent,
  verifyTransparencyEvent,
  queryTransparencyEvents,
  generateArticle50Report,
  requiresTransparencyMarking,
  generateSyntheticContentMetadata,
} from './service';
