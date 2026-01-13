import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, NotFoundErrors, ServerErrors, ValidationErrors } from '@/lib/api-error';
import { getTraceStore } from '@/lib/fall/flight-recorder';
import {
  generateReceipt,
  formatReceiptAsText,
  formatReceiptAsJSON,
} from '@/lib/retrieval/receipt';

/**
 * GET /api/retrieval/traces/[id]/receipt/download
 *
 * Downloads a receipt as a file (JSON or PDF).
 * Query params:
 * - format: 'json' | 'pdf' (default: 'json')
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key or session
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { id } = await context.params;

    if (!id) {
      return NotFoundErrors.resource('trace');
    }

    const store = getTraceStore();
    const trace = await store.getTrace(id, authResult.userId);

    if (!trace) {
      return NotFoundErrors.resource('trace');
    }

    // Get format from query params
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    if (format !== 'json' && format !== 'pdf') {
      return ValidationErrors.invalidField('format', 'must be json or pdf');
    }

    // Generate receipt from stored trace
    const receipt = generateReceipt(trace);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `seizn-receipt-${receipt.receipt_id}-${timestamp}`;

    if (format === 'json') {
      const jsonContent = formatReceiptAsJSON(receipt);
      return new NextResponse(jsonContent, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${baseFilename}.json"`,
        },
      });
    }

    // PDF format - generate a text-based PDF using basic PDF structure
    // For production, consider using a library like @react-pdf/renderer or pdfkit
    const textContent = formatReceiptAsText(receipt);
    const pdfContent = generateSimplePdf(textContent, receipt);

    return new NextResponse(new Uint8Array(pdfContent), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${baseFilename}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Receipt download error:', error);
    return ServerErrors.internal('receipt_download');
  }
}

/**
 * Generate a simple PDF document from text content.
 * This is a basic implementation - for production, use a proper PDF library.
 */
function generateSimplePdf(text: string, _receipt: { receipt_id: string; timestamp: string }): Buffer {
  // Clean and prepare text for PDF
  const lines = text.split('\n');
  const maxWidth = 80;

  // Basic PDF structure
  const objects: string[] = [];
  let objectNumber = 1;

  // PDF header
  let pdf = '%PDF-1.4\n';

  // Catalog (object 1)
  objects.push(`${objectNumber} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objectNumber++;

  // Pages (object 2)
  objects.push(`${objectNumber} 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
  objectNumber++;

  // Calculate content height needed
  const fontSize = 10;
  const lineHeight = fontSize * 1.2;
  const pageHeight = 792; // Letter size
  const pageWidth = 612;
  const margin = 50;
  const contentHeight = lines.length * lineHeight + margin * 2;
  const actualPageHeight = Math.max(pageHeight, contentHeight);

  // Page (object 3)
  objects.push(
    `${objectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${actualPageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`
  );
  objectNumber++;

  // Content stream (object 4)
  let contentStream = 'BT\n';
  contentStream += `/F1 ${fontSize} Tf\n`;
  contentStream += `${margin} ${actualPageHeight - margin} Td\n`;
  contentStream += `${lineHeight} TL\n`;

  for (const line of lines) {
    // Escape special characters for PDF
    const escapedLine = line
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .substring(0, maxWidth);
    contentStream += `(${escapedLine}) Tj T*\n`;
  }

  contentStream += 'ET';

  const streamBytes = Buffer.from(contentStream, 'utf-8');
  objects.push(
    `${objectNumber} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`
  );
  objectNumber++;

  // Font (object 5) - Courier for monospace receipt
  objects.push(
    `${objectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`
  );
  objectNumber++;

  // Combine all objects
  const offsets: number[] = [];
  let currentOffset = pdf.length;

  for (const obj of objects) {
    offsets.push(currentOffset);
    pdf += obj;
    currentOffset += obj.length;
  }

  // Cross-reference table
  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objectNumber}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  pdf += 'trailer\n';
  pdf += `<< /Size ${objectNumber} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF';

  return Buffer.from(pdf, 'utf-8');
}
