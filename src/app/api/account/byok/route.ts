import { NextRequest } from 'next/server';
import {
  readJsonBody,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, (service) => service.getByok());
}

export async function POST(request: NextRequest) {
  return withAuthorUiService(request, async (service) =>
    service.saveByok(await readJsonBody(request))
  );
}
