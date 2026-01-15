import { NextRequest, NextResponse } from "next/server";

type RumMetric = {
  id: string;
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  navigationType?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
};

export async function POST(request: NextRequest) {
  try {
    const metric = (await request.json()) as RumMetric;

    if (!metric?.name) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[RUM]", metric);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "parse_error" }, { status: 400 });
  }
}
