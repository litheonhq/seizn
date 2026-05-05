import { NextRequest } from 'next/server';
import { apiV1Result, handleApiV1, handleApiV1Options } from '@/lib/api-v1/middleware';
import { authorApiService, createProject, listProjects } from '@/lib/api-v1/author';

export const runtime = 'nodejs';

export function OPTIONS() {
  return handleApiV1Options();
}

export async function GET(request: NextRequest) {
  return handleApiV1(request, {
    scope: 'projects:read',
    costUnits: 0,
    tool: 'projects',
  }, async ({ apiKey }) => listProjects(authorApiService(apiKey.userId)));
}

export async function POST(request: NextRequest) {
  return handleApiV1(request, {
    scope: 'projects:write',
    costUnits: 1,
    tool: 'projects',
    idempotent: true,
  }, async ({ apiKey }) => {
    const body = await request.json().catch(() => ({}));
    return apiV1Result(await createProject(authorApiService(apiKey.userId), body), 201);
  });
}
