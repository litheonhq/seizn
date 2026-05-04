import { NextResponse, type NextRequest } from "next/server";

const ENGINE_HOST = "engine.seizn.com";

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();

  // Engine surface: rewrite engine.seizn.com/* to /engine/*
  // (must run before next.js i18n redirect in src/app/page.tsx)
  if (host === ENGINE_HOST) {
    const { pathname, search } = request.nextUrl;

    // Skip API/internal/static so they reach their original routes
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/monitoring") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/apple-touch-icon") ||
      pathname.startsWith("/og-image") ||
      pathname.startsWith("/engine")
    ) {
      return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/engine" : `/engine${pathname}`;
    url.search = search;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every request except static assets and public files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|og-image.png|robots.txt|sitemap.xml).*)",
  ],
};
