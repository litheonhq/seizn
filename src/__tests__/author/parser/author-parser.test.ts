import iconv from 'iconv-lite';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  AuthorDocumentParseError,
  parseAuthorDocument,
} from '@/lib/author/parser';
import { buildAuthorR2ObjectKey } from '@/lib/author/storage/r2-store';

describe('Author Memory v3 import parser', () => {
  it('parses markdown body, frontmatter, and headings', async () => {
    const parsed = await parseAuthorDocument({
      fileName: 'character.md',
      contentType: 'text/markdown',
      buffer: Buffer.from('---\ntitle: Sori\n---\n# Sori\n\nCanon body', 'utf8'),
    });

    expect(parsed.fileType).toBe('md');
    expect(parsed.text).toContain('Canon body');
    expect(parsed.headingStructure).toEqual([{ level: 1, text: 'Sori', line: 1 }]);
    expect(parsed.metadata.frontmatter).toMatchObject({ title: 'Sori' });
  });

  it('detects UTF-8 and EUC-KR text inputs', async () => {
    const utf8 = await parseAuthorDocument({
      fileName: 'scene.txt',
      contentType: 'text/plain',
      buffer: Buffer.from('청학여고\n소리', 'utf8'),
    });
    const eucKr = await parseAuthorDocument({
      fileName: 'scene.txt',
      contentType: 'text/plain',
      buffer: iconv.encode('청학여고\n나리', 'euc-kr'),
    });

    expect(utf8.metadata.encoding).toBe('utf-8');
    expect(eucKr.metadata.encoding).toBe('euc-kr');
    expect(eucKr.text).toContain('나리');
  });

  it('parses DOCX text and heading structure', async () => {
    const parsed = await parseAuthorDocument({
      fileName: 'bible.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: await createDocxFixture(),
    });

    expect(parsed.fileType).toBe('docx');
    expect(parsed.text).toContain('Sori likes quiet observations.');
    expect(parsed.headingStructure[0]).toMatchObject({ level: 1, text: 'Sori' });
  });

  it('parses PDF text and page spans', async () => {
    const parsed = await parseAuthorDocument({
      fileName: 'scene.pdf',
      contentType: 'application/pdf',
      buffer: createPdfFixture(),
    });

    expect(parsed.fileType).toBe('pdf');
    expect(parsed.text).toContain('Hello PDF');
    expect(parsed.pageSpans).toHaveLength(1);
  });

  it('rejects unsupported authoring formats explicitly', async () => {
    await expect(parseAuthorDocument({
      fileName: 'draft.hwp',
      buffer: Buffer.from('hwp'),
    })).rejects.toMatchObject<Partial<AuthorDocumentParseError>>({
      code: 'unsupported_format',
    });
  });

  it('builds stable R2 object keys without path traversal', () => {
    expect(buildAuthorR2ObjectKey({
      projectId: 'knot/short1',
      importId: 'import:1',
      fileName: '..\\Sori Bible.md',
    })).toBe('knot-short1/import-1/Sori-Bible.md');
  });
});

async function createDocxFixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', xml(`<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`));
  zip.folder('_rels')?.file('.rels', xml(`<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`));
  zip.folder('word')?.file('styles.xml', xml(`<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
      </w:style>
    </w:styles>`));
  zip.folder('word')?.file('document.xml', xml(`<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Sori</w:t></w:r></w:p>
        <w:p><w:r><w:t>Sori likes quiet observations.</w:t></w:r></w:p>
      </w:body>
    </w:document>`));
  return zip.generateAsync({ type: 'nodebuffer' });
}

function createPdfFixture(): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 700 Td (Hello PDF) Tj ET\nendstream\nendobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

function xml(value: string): string {
  return value.replace(/\n\s+/g, '');
}
