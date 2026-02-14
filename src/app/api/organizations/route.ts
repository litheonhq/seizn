import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import {
  AuthErrors,
  ValidationErrors,
  ServerErrors,
  ErrorCodes,
  createApiError,
} from '@/lib/api-error';

// GET /api/organizations - List user's organizations
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('organizations');
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('id');
    const supabase = createServerClient();

    // GET /api/organizations?id=... - Fetch a single organization (with your role)
    if (orgId) {
      const { data: membership, error } = await supabase
        .from('organization_members')
        .select(`
          role,
          organization:organizations (
            id,
            name,
            slug,
            plan,
            created_at,
            settings
          )
        `)
        .eq('organization_id', orgId)
        .eq('user_id', user.id)
        .single();

      if (error || !membership?.organization) {
        return createApiError({
          code: ErrorCodes.NOT_FOUND,
          message: 'Organization not found',
          status: 404,
          details: { id: orgId },
        });
      }

      return NextResponse.json({
        success: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        organization: { ...(membership.organization as any), role: membership.role },
      });
    }

    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(`
        role,
        organization:organizations (
          id,
          name,
          slug,
          plan,
          created_at
        )
      `)
      .eq('user_id', user.id);

    if (error) {
      console.error('Fetch organizations error:', error);
      return ServerErrors.database('fetch_organizations');
    }

    const organizations = memberships?.map((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(m.organization as any),
      role: m.role,
    })) || [];

    return NextResponse.json({
      success: true,
      organizations,
      count: organizations.length,
    });
  } catch (error) {
    console.error('Organizations GET error:', error);
    return ServerErrors.internal('list_organizations');
  }
}

// POST /api/organizations - Create a new organization
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('organizations');
    }

    const body = await request.json();
    const { name, slug } = body;

    if (!name || name.trim().length < 2) {
      return ValidationErrors.invalidField('name', 'must be at least 2 characters');
    }

    // Validate and sanitize slug
    const cleanSlug = (slug || name)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    if (cleanSlug.length < 2) {
      return ValidationErrors.invalidField('slug', 'must be at least 2 characters');
    }

    const supabase = createServerClient();

    // Check if slug is taken
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', cleanSlug)
      .single();

    if (existing) {
      return createApiError({
        code: ErrorCodes.DUPLICATE_ENTRY,
        message: 'This organization slug is already taken',
        status: 409,
        details: { slug: cleanSlug },
      });
    }

    // Check org limit (free users: 1 org, paid: 5)
    const { count: orgCount } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'owner');

    if ((orgCount || 0) >= 5) {
      return createApiError({
        code: ErrorCodes.QUOTA_EXCEEDED,
        message: 'Organization limit reached (max 5)',
        status: 429,
        details: { limit: 5, current: orgCount },
      });
    }

    // Create organization with owner
    const { data: orgId, error: createError } = await supabase.rpc('create_organization', {
      p_name: name.trim(),
      p_slug: cleanSlug,
      p_owner_id: user.id,
    });

    if (createError) {
      console.error('Create organization error:', createError);
      return ServerErrors.database('create_organization');
    }

    // Fetch the created org
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    return NextResponse.json({
      success: true,
      organization: org,
    });
  } catch (error) {
    console.error('Organizations POST error:', error);
    return ServerErrors.internal('create_organization');
  }
}

// PATCH /api/organizations - Update an organization
export async function PATCH(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('organizations');
    }

    const body = await request.json();
    const { id, name, slug, settings } = body;

    if (!id) {
      return ValidationErrors.missingField('id');
    }

    const supabase = createServerClient();

    // Check user is admin/owner
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return AuthErrors.unauthorized('organization');
    }

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (name) updates.name = name.trim();
    if (slug) {
      const cleanSlug = String(slug)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);

      if (cleanSlug.length < 2) {
        return ValidationErrors.invalidField('slug', 'must be at least 2 characters');
      }

      // Check if slug is taken by another org
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', cleanSlug)
        .neq('id', id)
        .single();

      if (existing) {
        return createApiError({
          code: ErrorCodes.DUPLICATE_ENTRY,
          message: 'This organization slug is already taken',
          status: 409,
          details: { slug: cleanSlug },
        });
      }

      updates.slug = cleanSlug;
    }
    if (settings) updates.settings = settings;

    const { data: org, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update organization error:', error);
      return ServerErrors.database('update_organization');
    }

    return NextResponse.json({
      success: true,
      organization: org,
    });
  } catch (error) {
    console.error('Organizations PATCH error:', error);
    return ServerErrors.internal('update_organization');
  }
}

// DELETE /api/organizations - Delete an organization
export async function DELETE(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('organizations');
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('id');

    if (!orgId) {
      return ValidationErrors.missingField('id');
    }

    const supabase = createServerClient();

    // Check user is owner
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'owner') {
      return AuthErrors.unauthorized('organization');
    }

    // Delete organization (cascades to members, invites)
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (error) {
      console.error('Delete organization error:', error);
      return ServerErrors.database('delete_organization');
    }

    return NextResponse.json({
      success: true,
      deleted: orgId,
    });
  } catch (error) {
    console.error('Organizations DELETE error:', error);
    return ServerErrors.internal('delete_organization');
  }
}
