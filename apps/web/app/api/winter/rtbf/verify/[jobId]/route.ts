import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { z } from 'zod'

// Validation schemas
const jobIdSchema = z.string().uuid()

const exportQuerySchema = z.object({
  format: z.enum(['json', 'pdf']).optional().default('json'),
})

/**
 * GET /api/winter/rtbf/verify/:jobId
 *
 * Verify deletion completion and retrieve evidence for an RTBF job.
 * Returns verification status, hash, and detailed evidence.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createServerClient()

    // Validate job ID
    const jobIdResult = jobIdSchema.safeParse(params.jobId)
    if (!jobIdResult.success) {
      return NextResponse.json(
        { error: 'Invalid job ID format' },
        { status: 400 }
      )
    }
    const jobId = jobIdResult.data

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Call verification function
    const { data: verification, error: verifyError } = await supabase
      .rpc('verify_deletion_complete', { p_job_id: jobId })

    if (verifyError) {
      console.error('Verification error:', verifyError)

      if (verifyError.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: 'Failed to verify deletion', details: verifyError.message },
        { status: 500 }
      )
    }

    // Add API metadata
    const response = {
      ...verification,
      _meta: {
        api_version: '1.0',
        verified_at: new Date().toISOString(),
        endpoint: `/api/winter/rtbf/verify/${jobId}`,
      },
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('RTBF verification error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/winter/rtbf/verify/:jobId
 *
 * Generate verification hash and export evidence.
 * Optionally exports as PDF.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createServerClient()

    // Validate job ID
    const jobIdResult = jobIdSchema.safeParse(params.jobId)
    if (!jobIdResult.success) {
      return NextResponse.json(
        { error: 'Invalid job ID format' },
        { status: 400 }
      )
    }
    const jobId = jobIdResult.data

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    let format = 'json'
    try {
      const body = await request.json()
      const queryResult = exportQuerySchema.safeParse(body)
      if (queryResult.success) {
        format = queryResult.data.format
      }
    } catch {
      // Use default format
    }

    // Generate verification hash
    const { data: hash, error: hashError } = await supabase
      .rpc('generate_deletion_verification', { p_job_id: jobId })

    if (hashError) {
      console.error('Hash generation error:', hashError)
      return NextResponse.json(
        { error: 'Failed to generate verification hash', details: hashError.message },
        { status: 500 }
      )
    }

    // Calculate affected artifacts
    await supabase.rpc('calculate_affected_artifacts', { p_job_id: jobId })

    // Export evidence
    const { data: evidence, error: exportError } = await supabase
      .rpc('export_deletion_evidence', {
        p_job_id: jobId,
        p_format: format
      })

    if (exportError) {
      console.error('Evidence export error:', exportError)
      return NextResponse.json(
        { error: 'Failed to export evidence', details: exportError.message },
        { status: 500 }
      )
    }

    // Log the verification action
    await supabase.from('winter_rtbf_audit_logs').insert({
      job_id: jobId,
      action: 'verification_generated',
      details: {
        hash,
        format,
        exported_by: user.id,
      },
      performed_by: user.email || user.id,
    })

    // Return appropriate format
    if (format === 'pdf') {
      // For PDF, we'd typically generate a PDF here
      // For now, return JSON with a note
      return NextResponse.json({
        ...evidence,
        _meta: {
          note: 'PDF generation requires additional processing. Use the evidence data to generate a PDF client-side or via a dedicated PDF service.',
          format_requested: 'pdf',
          format_returned: 'json',
        },
      })
    }

    return NextResponse.json(evidence)

  } catch (error) {
    console.error('RTBF export error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
