import {
  createServerClient,
  hasServerSupabaseServiceRoleConfig,
} from '@/lib/supabase';
import type { ParsedAuthorDocument } from '@/lib/author/parser';
import type { AuthorR2ObjectRef } from './r2-store';

export interface SaveAuthorImportTextInput {
  importId: string;
  projectId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  contentType?: string;
  storageRef: AuthorR2ObjectRef;
  parsed: ParsedAuthorDocument;
}

export class AuthorImportTextStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorImportTextStoreError';
  }
}

export async function saveAuthorImportText(input: SaveAuthorImportTextInput): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && process.env.AUTHOR_IMPORT_DISABLE_R2 === '1') {
    return;
  }

  if (!hasServerSupabaseServiceRoleConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new AuthorImportTextStoreError(
        'Supabase service-role configuration is required to persist parsed author imports'
      );
    }
    return;
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('author_imports_text')
    .upsert({
      import_id: input.importId,
      project_id: input.projectId,
      user_id: input.userId,
      file_name: input.fileName,
      file_size: input.fileSize,
      content_type: input.contentType ?? null,
      storage_bucket: input.storageRef.bucket,
      storage_key: input.storageRef.key,
      storage_endpoint: input.storageRef.endpoint,
      storage_owner: input.storageRef.owner,
      storage_migrate_by: input.storageRef.migrateBy ?? null,
      parsed_text: input.parsed.text,
      heading_structure: input.parsed.headingStructure,
      page_spans: input.parsed.pageSpans,
      parser_version: input.parsed.parserVersion,
      parser_metadata: input.parsed.metadata,
      parsed_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,project_id,import_id',
    });

  if (error) {
    throw new AuthorImportTextStoreError(`Failed to persist parsed author import: ${error.message}`);
  }
}
