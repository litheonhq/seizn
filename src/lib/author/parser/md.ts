import matter from 'gray-matter';
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import { AuthorDocumentParseError, type AuthorHeading, type ParsedAuthorDocument } from './types';

interface MarkdownNode {
  type?: string;
  depth?: number;
  value?: string;
  children?: MarkdownNode[];
  position?: {
    start?: { line?: number };
  };
}

export function parseMarkdownDocument(buffer: Buffer): ParsedAuthorDocument {
  const raw = buffer.toString('utf8').trim();
  if (!raw) {
    throw new AuthorDocumentParseError('empty_file', 'Markdown file is empty');
  }

  const parsed = matter(raw);
  const content = parsed.content.trim();
  if (!content) {
    throw new AuthorDocumentParseError('empty_file', 'Markdown body is empty');
  }

  const tree = remark().use(remarkParse).parse(content) as MarkdownNode;
  const headingStructure: AuthorHeading[] = [];
  collectHeadings(tree, headingStructure);

  return {
    fileType: 'md',
    text: content,
    parserVersion: 'author-parser-md-v1',
    headingStructure,
    pageSpans: [{
      start_line: 1,
      end_line: Math.max(1, content.split(/\r?\n/).length),
      start_char: 0,
      end_char: content.length,
    }],
    metadata: {
      frontmatter: parsed.data,
      excerpt: parsed.excerpt ?? null,
    },
  };
}

function collectHeadings(node: MarkdownNode, out: AuthorHeading[]): void {
  if (node.type === 'heading') {
    const text = flattenText(node).trim();
    if (text) {
      out.push({
        level: Math.max(1, Math.min(6, node.depth ?? 1)),
        text,
        line: node.position?.start?.line,
      });
    }
  }

  for (const child of node.children ?? []) {
    collectHeadings(child, out);
  }
}

function flattenText(node: MarkdownNode): string {
  if (typeof node.value === 'string') {
    return node.value;
  }
  return (node.children ?? []).map(flattenText).join('');
}
