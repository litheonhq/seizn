/**
 * Submit Annotation API
 *
 * POST /api/annotations/items/[id]/annotate - Submit annotation for an item
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

interface AnnotationRequest {
  annotation_type: "label" | "rating" | "edit" | "flag" | "comment" | "multi";
  labels?: Array<{ name: string; value: string | number; scale?: number }>;
  rating?: number;
  rating_scale?: number;
  correction?: string;
  reasoning?: string;
  comments?: string;
  highlights?: Array<{
    start: number;
    end: number;
    label: string;
    comment?: string;
    severity?: string;
  }>;
  confidence?: number;
  time_spent_seconds?: number;
  metadata?: Record<string, unknown>;
}

/**
 * POST /api/annotations/items/[id]/annotate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = createRequestContext(request);
  const { id } = await params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const body: AnnotationRequest = await request.json();

    // Validate required fields
    if (!body.annotation_type) {
      return errorResponse(
        { code: "SEIZN_200", message: "annotation_type is required", status: 400 },
        context
      );
    }

    const supabase = createServerClient();

    // Get item and queue info
    const { data: item } = await supabase
      .from("annotation_items")
      .select(`
        *,
        annotation_queues (
          id,
          require_consensus,
          min_reviewers,
          consensus_threshold
        )
      `)
      .eq("id", id)
      .single();

    if (!item) {
      return errorResponse(
        { code: "SEIZN_404", message: "Item not found", status: 404 },
        context
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("org_id", item.org_id)
      .single();

    if (!membership) {
      return errorResponse(
        { code: "SEIZN_105", message: "Access denied", status: 403 },
        context
      );
    }

    // Check if user already annotated this item
    const { data: existingAnnotation } = await supabase
      .from("annotations")
      .select("id")
      .eq("item_id", id)
      .eq("annotator_id", session.user.id)
      .single();

    // Create or update annotation
    const annotationData = {
      item_id: id,
      annotator_id: session.user.id,
      annotation_type: body.annotation_type,
      labels: body.labels || [],
      rating: body.rating,
      rating_scale: body.rating_scale || 5,
      correction: body.correction,
      reasoning: body.reasoning,
      comments: body.comments,
      highlights: body.highlights || [],
      confidence: body.confidence,
      time_spent_seconds: body.time_spent_seconds,
      metadata: body.metadata || {},
    };

    let annotation;
    let error;

    if (existingAnnotation) {
      // Update existing
      ({ data: annotation, error } = await supabase
        .from("annotations")
        .update(annotationData)
        .eq("id", existingAnnotation.id)
        .select()
        .single());
    } else {
      // Create new
      ({ data: annotation, error } = await supabase
        .from("annotations")
        .insert(annotationData)
        .select()
        .single());
    }

    if (error) {
      console.error("Failed to save annotation:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to save annotation", status: 500 },
        context
      );
    }

    // Check if item should be marked as completed
    const queue = item.annotation_queues;
    if (queue) {
      // Get all annotations for this item
      const { data: allAnnotations } = await supabase
        .from("annotations")
        .select("*")
        .eq("item_id", id);

      const annotationCount = allAnnotations?.length || 0;

      // Check if we have enough annotations
      if (annotationCount >= (queue.min_reviewers || 1)) {
        if (queue.require_consensus) {
          // Check consensus
          const consensus = calculateConsensus(allAnnotations || []);
          if (consensus >= (queue.consensus_threshold || 0.67)) {
            await supabase
              .from("annotation_items")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
              })
              .eq("id", id);
          }
        } else {
          // No consensus required, mark as completed
          await supabase
            .from("annotation_items")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", id);
        }
      }
    }

    // Update annotator performance metrics
    await updateAnnotatorPerformance(supabase, session.user.id, item.org_id, item.queue_id);

    return successResponse(
      {
        annotation,
        message: existingAnnotation ? "Annotation updated" : "Annotation submitted",
      },
      context,
      existingAnnotation ? 200 : 201
    );
  } catch (error) {
    console.error("Annotate API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * Calculate consensus score from annotations
 */
function calculateConsensus(annotations: Array<Record<string, unknown>>): number {
  if (annotations.length < 2) return 1;

  // For ratings, calculate agreement
  const ratings = annotations.filter((a) => a.rating !== null).map((a) => a.rating as number);
  if (ratings.length >= 2) {
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const variance =
      ratings.reduce((sum, r) => sum + Math.pow(r - avgRating, 2), 0) / ratings.length;
    const maxVariance = 4; // Max variance for 5-point scale
    return 1 - variance / maxVariance;
  }

  // For labels, calculate agreement percentage
  const labelAnnotations = annotations.filter(
    (a) => a.labels && Array.isArray(a.labels) && (a.labels as unknown[]).length > 0
  );
  if (labelAnnotations.length >= 2) {
    // Simple majority agreement
    const labelCounts = new Map<string, number>();
    for (const ann of labelAnnotations) {
      const labels = ann.labels as Array<{ name: string; value: string }>;
      for (const label of labels) {
        const key = `${label.name}:${label.value}`;
        labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
      }
    }

    const maxCount = Math.max(...labelCounts.values());
    return maxCount / labelAnnotations.length;
  }

  return 1;
}

/**
 * Update annotator performance metrics
 */
async function updateAnnotatorPerformance(
  supabase: ReturnType<typeof createServerClient>,
  annotatorId: string,
  orgId: string,
  queueId: string
): Promise<void> {
  try {
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1); // First of month
    const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last of month

    // Get or create performance record
    const { data: existing } = await supabase
      .from("annotator_performance")
      .select("*")
      .eq("annotator_id", annotatorId)
      .eq("org_id", orgId)
      .eq("queue_id", queueId)
      .eq("period_start", periodStart.toISOString().split("T")[0])
      .single();

    if (existing) {
      // Update existing
      await supabase
        .from("annotator_performance")
        .update({
          items_completed: existing.items_completed + 1,
        })
        .eq("id", existing.id);
    } else {
      // Create new
      await supabase.from("annotator_performance").insert({
        annotator_id: annotatorId,
        org_id: orgId,
        queue_id: queueId,
        period_start: periodStart.toISOString().split("T")[0],
        period_end: periodEnd.toISOString().split("T")[0],
        items_completed: 1,
      });
    }
  } catch (error) {
    console.error("Failed to update annotator performance:", error);
  }
}
