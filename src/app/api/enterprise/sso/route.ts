import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';
import { getSSOService, SSOService } from '@/lib/enterprise';

/**
 * GET /api/enterprise/sso - Get SSO configuration or providers
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);
    const info = searchParams.get('info');

    if (info === 'providers') {
      return NextResponse.json({
        success: true,
        providers: SSOService.getSupportedProviders(),
      });
    }

    const ssoService = getSSOService();
    const config = ssoService.getConfig(authResult.orgId || authResult.userId);

    return NextResponse.json({
      success: true,
      config: config
        ? {
            id: config.id,
            enabled: config.enabled,
            provider: config.provider,
            domains: config.domains,
            defaultRole: config.defaultRole,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('SSO config error:', error);
    return ServerErrors.internal('sso_config');
  }
}

/**
 * POST /api/enterprise/sso - Create or update SSO configuration
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { provider, config, domains, defaultRole, enabled } = body;

    if (!provider || !config || !domains || domains.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'provider, config, and domains are required',
          },
        },
        { status: 400 }
      );
    }

    const ssoService = getSSOService();
    const orgId = authResult.orgId || authResult.userId;

    const ssoConfig = {
      id: crypto.randomUUID(),
      orgId,
      enabled: enabled !== false,
      provider,
      config,
      domains,
      defaultRole: defaultRole || 'viewer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ssoService.registerConfig(ssoConfig);

    return NextResponse.json({
      success: true,
      config: {
        id: ssoConfig.id,
        enabled: ssoConfig.enabled,
        provider: ssoConfig.provider,
        domains: ssoConfig.domains,
        defaultRole: ssoConfig.defaultRole,
      },
    });
  } catch (error) {
    console.error('SSO config error:', error);
    return ServerErrors.internal('sso_config_create');
  }
}

/**
 * DELETE /api/enterprise/sso - Disable SSO
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    // In production, this would update the config in the database
    return NextResponse.json({
      success: true,
      message: 'SSO disabled',
    });
  } catch (error) {
    console.error('SSO disable error:', error);
    return ServerErrors.internal('sso_disable');
  }
}
