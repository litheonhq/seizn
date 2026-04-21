import { NextResponse } from "next/server";
import { getOpenApiSpec } from "@/lib/openapi/spec";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(getOpenApiSpec(), {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
