import { NextRequest } from 'next/server';
import {
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, (service) => service.getUsage());
}
