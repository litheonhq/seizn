import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/ai';

// Demo user ID (fixed UUID for demo namespace)
const DEMO_USER_ID = 'demo-user-00000000-0000-0000-0000-000000000000';
const DEMO_NAMESPACE = 'demo:public';

// Sample memories showcasing Seizn capabilities
const DEMO_MEMORIES = [
  {
    content: 'User prefers dark mode and uses VSCode as their primary IDE',
    memory_type: 'preference',
    tags: ['settings', 'ide'],
  },
  {
    content: 'The project uses TypeScript with strict mode enabled and Next.js 14 App Router',
    memory_type: 'fact',
    tags: ['tech-stack', 'framework'],
  },
  {
    content: 'Always format code responses with syntax highlighting and include file paths',
    memory_type: 'instruction',
    tags: ['formatting', 'code'],
  },
  {
    content: 'User works at Acme Corp as a Senior Frontend Engineer, reports to Sarah (Engineering Manager)',
    memory_type: 'relationship',
    tags: ['work', 'team'],
  },
  {
    content: 'Successfully deployed the authentication system using NextAuth v5 with Google OAuth',
    memory_type: 'experience',
    tags: ['deployment', 'auth'],
  },
  {
    content: 'Prefers Korean language for comments but English for code and documentation',
    memory_type: 'preference',
    tags: ['language', 'localization'],
  },
  {
    content: 'The API rate limits are 1000 calls per day for free tier, 10000 for pro',
    memory_type: 'fact',
    tags: ['api', 'limits'],
  },
  {
    content: 'When debugging, always check the console logs first, then network requests',
    memory_type: 'instruction',
    tags: ['debugging', 'workflow'],
  },
  {
    content: 'Last week completed migration from REST to GraphQL for the mobile app',
    memory_type: 'experience',
    tags: ['migration', 'graphql'],
  },
  {
    content: 'Project deadline is end of Q1 2025, critical features must be code-complete by Feb 15',
    memory_type: 'fact',
    tags: ['deadline', 'planning'],
  },
];

/**
 * POST /api/internal/seed-demo - Seed demo memories (internal use only)
 * Requires INTERNAL_API_KEY header
 */
export async function POST(request: NextRequest) {
  // Verify internal API key
  const internalKey = request.headers.get('x-internal-key');
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    // First, ensure demo user exists in profiles (or skip if using service role)
    // For demo purposes, we'll insert directly with service role

    // Clear existing demo memories
    await supabase
      .from('memories')
      .delete()
      .eq('user_id', DEMO_USER_ID)
      .eq('namespace', DEMO_NAMESPACE);

    // Insert new demo memories with embeddings
    const insertPromises = DEMO_MEMORIES.map(async (memory) => {
      const embedding = await createEmbedding(memory.content);

      return supabase.from('memories').insert({
        user_id: DEMO_USER_ID,
        content: memory.content,
        embedding,
        memory_type: memory.memory_type,
        tags: memory.tags,
        namespace: DEMO_NAMESPACE,
        scope: 'user',
        source: 'seed',
        confidence: 1.0,
        importance: 5,
      });
    });

    const results = await Promise.all(insertPromises);

    // Check for errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Seed errors:', errors.map(e => e.error));
      return NextResponse.json({
        success: false,
        seeded: results.length - errors.length,
        errors: errors.length,
      }, { status: 207 });
    }

    return NextResponse.json({
      success: true,
      seeded: DEMO_MEMORIES.length,
      namespace: DEMO_NAMESPACE,
      user_id: DEMO_USER_ID,
    });
  } catch (error) {
    console.error('Seed demo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/internal/seed-demo - Check demo memory status
 */
export async function GET(request: NextRequest) {
  const internalKey = request.headers.get('x-internal-key');
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    const { data, error, count } = await supabase
      .from('memories')
      .select('id, content, memory_type', { count: 'exact' })
      .eq('user_id', DEMO_USER_ID)
      .eq('namespace', DEMO_NAMESPACE);

    if (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
      namespace: DEMO_NAMESPACE,
      memories: data?.map(m => ({
        id: m.id,
        content: m.content.substring(0, 50) + '...',
        memory_type: m.memory_type,
      })),
    });
  } catch (error) {
    console.error('Check demo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
