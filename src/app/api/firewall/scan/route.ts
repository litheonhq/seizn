/**
 * POST /api/firewall/scan
 *
 * Scan input text for prompt injection attempts.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  createDetector,
  type FirewallConfig,
  type ScanRequest,
  type ScanResponse,
} from '@/lib/prompt-firewall';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: ScanRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.input || typeof body.input !== 'string') {
      return ValidationErrors.missingField('input');
    }

    // Create detector with optional custom config
    const config: Partial<FirewallConfig> = {
      enabled: true,
      mode: body.options?.returnSanitized ? 'sanitize' : 'block',
    };

    const detector = createDetector(config);
    const result = detector.scan(body.input);

    // Build response
    const response: ScanResponse = {
      safe: !result.detected,
      threatLevel: result.threatLevel,
      action: result.detected
        ? config.mode === 'sanitize'
          ? 'sanitized'
          : 'blocked'
        : 'allowed',
      threats: body.options?.includeMatches
        ? result.threats.map((t) => ({
            category: t.category,
            level: t.level,
            description: `${t.patternName}: ${t.matchedText}`,
          }))
        : result.threats.map((t) => ({
            category: t.category,
            level: t.level,
            description: t.patternName,
          })),
      sanitizedInput: result.sanitizedInput,
    };

    // Log the request
    await logRequest(
      { userId, keyId, endpoint: '/api/firewall/scan', method: 'POST', startTime },
      200
    );

    return NextResponse.json(response, {
      status: 200,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    console.error('Firewall scan error:', error);
    return ServerErrors.internal('Failed to scan input');
  }
}
