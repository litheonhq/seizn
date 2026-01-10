// Seizn Spring - File Upload & Analysis API
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  analyzeFile,
  validateFile,
  uploadFileToStorage,
  SUPPORTED_FILE_TYPES,
} from '@/lib/spring/file-analyzer';
import {
  checkQuota,
  recordUsage,
  createFileUpload,
  updateFileUpload,
  getUserPlan,
} from '@/lib/spring/db';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for large file processing

// Plan-based file size limits (MB)
const PLAN_FILE_LIMITS: Record<string, number> = {
  free: 5,
  starter: 10,
  plus: 25,
  pro: 50,
  enterprise: 100,
};

// ===========================================
// POST /api/spring/files - Upload & Analyze File
// ===========================================
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Check quota
    const quotaCheck = await checkQuota(userId, { mediaType: 'sd_image' }); // Reuse for files
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { error: 'Daily file upload limit reached', quota: quotaCheck },
        { status: 429 }
      );
    }

    // 3. Get user plan for size limit
    const userPlan = await getUserPlan(userId);
    const maxSizeMB = PLAN_FILE_LIMITS[userPlan] || PLAN_FILE_LIMITS.free;

    // 4. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversation_id') as string | null;
    const skipAnalysis = formData.get('skip_analysis') === 'true';
    const extractEntities = formData.get('extract_entities') === 'true';
    const analyzeSentiment = formData.get('analyze_sentiment') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 5. Validate file
    const validation = validateFile(
      { name: file.name, type: file.type, size: file.size },
      maxSizeMB
    );

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 6. Upload to storage
    const { url: storageUrl } = await uploadFileToStorage(
      userId,
      file,
      'uploads'
    );

    // 7. Create file record
    const fileRecord = await createFileUpload(userId, {
      conversationId: conversationId || undefined,
      filename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      storageUrl,
    });

    // 8. Analyze file
    const startTime = Date.now();
    let analysisResult;

    try {
      const buffer = await file.arrayBuffer();
      analysisResult = await analyzeFile(buffer, file.type, file.name, {
        skipAnalysis,
        extractEntities,
        analyzeSentiment,
      });

      // Update file record with analysis
      await updateFileUpload(fileRecord.id, userId, {
        status: 'completed',
        extractedText: analysisResult.extractedText.substring(0, 50000), // Limit stored text
        analysisResult: {
          summary: analysisResult.summary,
          metadata: analysisResult.metadata,
          analysis: analysisResult.analysis,
        },
      });
    } catch (analysisError) {
      console.error('File analysis error:', analysisError);

      await updateFileUpload(fileRecord.id, userId, {
        status: 'failed',
        analysisResult: {
          error: analysisError instanceof Error ? analysisError.message : 'Analysis failed',
        },
      });

      return NextResponse.json(
        {
          error: 'File analysis failed',
          file: {
            id: fileRecord.id,
            filename: file.name,
            url: storageUrl,
            status: 'failed',
          },
        },
        { status: 500 }
      );
    }

    const processingTimeMs = Date.now() - startTime;

    // 9. Record usage
    await recordUsage(userId, {
      files: 1,
      fileBytes: file.size,
    });

    // 10. Return response
    return NextResponse.json({
      success: true,
      file: {
        id: fileRecord.id,
        filename: file.name,
        url: storageUrl,
        size_bytes: file.size,
        mime_type: file.type,
        status: 'completed',
      },
      analysis: {
        summary: analysisResult.summary,
        metadata: analysisResult.metadata,
        key_points: analysisResult.analysis?.keyPoints,
        entities: analysisResult.analysis?.entities,
        sentiment: analysisResult.analysis?.sentiment,
        extracted_text_preview: analysisResult.extractedText.substring(0, 500),
      },
      processing_time_ms: processingTimeMs,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'File upload failed' },
      { status: 500 }
    );
  }
}

// ===========================================
// GET /api/spring/files - List Uploaded Files
// ===========================================
export async function GET(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const supabase = createServerClient();

    // 2. Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const conversationId = searchParams.get('conversation_id');
    const status = searchParams.get('status');

    // 3. Build query
    let query = supabase
      .from('spring_file_uploads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: files, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      files: files || [],
      pagination: {
        limit,
        offset,
        has_more: (files?.length || 0) === limit,
      },
    });
  } catch (error) {
    console.error('List files error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    );
  }
}

// ===========================================
// GET /api/spring/files/types - Supported File Types
// ===========================================
export async function OPTIONS() {
  return NextResponse.json({
    supported_types: SUPPORTED_FILE_TYPES.map(t => ({
      extension: t.extension,
      mime_types: t.mimeTypes,
      max_size_mb: t.maxSizeMB,
    })),
  });
}
