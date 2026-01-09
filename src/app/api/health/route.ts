import { NextResponse } from 'next/server';

// GET /api/health - Health check endpoint for Docker and load balancers
export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  // Check database connectivity (optional - can slow down health checks)
  // const dbHealthy = await checkDatabase();

  return NextResponse.json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
