import { NextRequest } from 'next/server';
import {
  AUTHOR_IMPORT_MAX_BYTES,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  return withAuthorUiService(request, (service) => service.listImports(projectId));
}

export async function POST(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  const declaredContentLength = parseContentLength(request.headers.get('content-length'));
  if (declaredContentLength && declaredContentLength > AUTHOR_IMPORT_MAX_BYTES) {
    return withAuthorUiService(request, (service) =>
      service.uploadImport(projectId, {
        fileName: 'oversized-upload',
        fileSize: declaredContentLength,
        fileType: request.headers.get('content-type') ?? undefined,
      })
    );
  }

  return withAuthorUiService(request, async (service) => {
    const form = await request.formData();
    const file = form.get('file');
    const sourceRole = form.get('source_role');
    const aOrDMode = form.get('a_or_d_mode');
    const fileRecord = file && typeof file === 'object' ? file as File : null;
    if (fileRecord && fileRecord.size > AUTHOR_IMPORT_MAX_BYTES) {
      return service.uploadImport(projectId, {
        fileName: fileRecord.name,
        fileSize: fileRecord.size,
        fileType: fileRecord.type || undefined,
        sourceRole: typeof sourceRole === 'string' ? sourceRole : undefined,
        aOrDMode: typeof aOrDMode === 'string' ? aOrDMode : undefined,
      });
    }
    const fileBytes = fileRecord
      ? Buffer.from(await fileRecord.arrayBuffer())
      : undefined;
    return service.uploadImport(projectId, {
      fileName: fileRecord?.name,
      fileSize: fileRecord?.size,
      fileType: fileRecord?.type || undefined,
      fileBytes,
      sourceRole: typeof sourceRole === 'string' ? sourceRole : undefined,
      aOrDMode: typeof aOrDMode === 'string' ? aOrDMode : undefined,
    });
  });
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
