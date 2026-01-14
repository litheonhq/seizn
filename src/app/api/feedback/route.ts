import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";

/**
 * POST /api/feedback
 * Submit feedback for a resource (trace, search, answer, document)
 */
export async function POST(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body = await request.json();
    const { resource_type, resource_id, rating, reason } = body;

    // Validate required fields
    if (!resource_type || !resource_id || !rating) {
      return errorResponse(
        { code: "SEIZN_200", message: "Missing required fields: resource_type, resource_id, rating", status: 400 },
        context
      );
    }

    // Validate rating
    if (!["positive", "negative"].includes(rating)) {
      return errorResponse(
        { code: "SEIZN_209", message: "Rating must be 'positive' or 'negative'", status: 400 },
        context
      );
    }

    // Validate resource type
    const validTypes = ["trace", "search", "answer", "document"];
    if (!validTypes.includes(resource_type)) {
      return errorResponse(
        { code: "SEIZN_209", message: `Resource type must be one of: ${validTypes.join(", ")}`, status: 400 },
        context
      );
    }

    const supabase = createServerClient();

    // Insert feedback
    const { data, error } = await supabase
      .from("feedback")
      .insert({
        user_id: userId || null,
        resource_type,
        resource_id,
        rating,
        reason: reason || null,
        metadata: {
          user_agent: request.headers.get("user-agent"),
          request_id: context.requestId,
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to insert feedback:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to save feedback", status: 500 },
        context
      );
    }

    return successResponse(
      { feedback_id: data.id, message: "Feedback submitted successfully" },
      context
    );
  } catch (error) {
    console.error("Feedback API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * GET /api/feedback
 * Get feedback statistics (admin only)
 */
export async function GET(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse({ code: "SEIZN_104", message: "Authentication required", status: 401 }, context);
    }

    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const resourceType = searchParams.get("resource_type");
    const days = parseInt(searchParams.get("days") || "30");

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query = supabase
      .from("feedback")
      .select("rating, resource_type, created_at")
      .gte("created_at", startDate.toISOString());

    if (resourceType) {
      query = query.eq("resource_type", resourceType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch feedback:", error);
      return errorResponse({ code: "SEIZN_405", message: "Failed to fetch feedback", status: 500 }, context);
    }

    // Calculate statistics
    const stats = {
      total: data?.length || 0,
      positive: data?.filter((f) => f.rating === "positive").length || 0,
      negative: data?.filter((f) => f.rating === "negative").length || 0,
      by_type: {} as Record<string, { positive: number; negative: number }>,
    };

    data?.forEach((feedback) => {
      if (!stats.by_type[feedback.resource_type]) {
        stats.by_type[feedback.resource_type] = { positive: 0, negative: 0 };
      }
      stats.by_type[feedback.resource_type][feedback.rating as "positive" | "negative"]++;
    });

    return successResponse({ stats }, context);
  } catch (error) {
    console.error("Feedback API error:", error);
    return errorResponse({ code: "SEIZN_500", message: "Internal server error", status: 500 }, context);
  }
}
