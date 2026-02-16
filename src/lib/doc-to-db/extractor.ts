import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Doc-to-DB: Main Structure Extractor
 *
 * Extracts structured data from document content using LLM + rule-based parsing.
 */

import { createServerClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/ai';
import {
  autoParseTable,
  toTableStructure,
  extractTableCells,
  parseList,
  parseKeyValuePairs,
  extractKeyValueCells,
} from './table-parser';
import { generateSchema, inferCellType } from './schema-inference';
import { COMBINED_EXTRACTION_PROMPT, DESCRIPTION_GENERATION_PROMPT } from './prompts';
import type {
  ExtractionOptions,
  ExtractionResult,
  ExtractionMetadata,
  ParsedStructure,
  ParsedCell,
  DocumentStructure,
  DocumentStructureInsert,
  StructureCellInsert,
  IdentifiedStructure,
  DEFAULT_EXTRACTION_OPTIONS,
  BatchInsertResult,
} from './types';

// ============================================================
// Constants
// ============================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ============================================================
// Main Extraction Function
// ============================================================

/**
 * Extract structured data from document content
 *
 * @param content - Document text content
 * @param documentId - Source document ID
 * @param userId - User ID for ownership
 * @param options - Extraction options
 * @returns Extraction result with structures and cells
 */
export async function extractStructures(
  content: string,
  documentId: string,
  userId: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const startTime = Date.now();

  // Merge with defaults
  const opts: ExtractionOptions = {
    extractTables: true,
    extractLists: true,
    extractKeyValue: true,
    extractHierarchy: false,
    inferSchema: true,
    minTableRows: 2,
    minTableCols: 2,
    generateEmbeddings: true,
    generateCellEmbeddings: false,
    model: 'haiku',
    ...options,
  };

  const structures: ParsedStructure[] = [];
  const cells: Map<number, ParsedCell[]> = new Map();

  // Metadata tracking
  const metadata: ExtractionMetadata = {
    tablesFound: 0,
    listsFound: 0,
    keyValuePairsFound: 0,
    hierarchiesFound: 0,
    totalCells: 0,
    processingTimeMs: 0,
    modelUsed: opts.model === 'sonnet' ? 'claude-3-5-sonnet' : 'claude-3-5-haiku',
    tokensUsed: 0,
  };

  try {
    // Step 1: Use LLM to identify structures in the content
    const identifiedStructures = await identifyStructuresWithLLM(content, opts);

    if (identifiedStructures.length === 0) {
      // Try rule-based extraction as fallback
      const ruleBasedStructures = extractStructuresRuleBased(content, opts);
      identifiedStructures.push(...ruleBasedStructures);
    }

    // Step 2: Parse each identified structure
    for (let i = 0; i < identifiedStructures.length; i++) {
      const identified = identifiedStructures[i];

      const parsed = await parseIdentifiedStructure(identified, opts);
      if (!parsed) continue;

      // Filter by minimum size
      if (parsed.type === 'table') {
        if (
          parsed.row_count < (opts.minTableRows || 2) ||
          parsed.column_count < (opts.minTableCols || 2)
        ) {
          continue;
        }
      }

      // Add to results
      structures.push(parsed);

      // Extract cells
      const structureCells = extractCellsFromStructure(parsed);
      cells.set(structures.length - 1, structureCells);

      // Update metadata
      switch (parsed.type) {
        case 'table':
          metadata.tablesFound++;
          break;
        case 'list':
          metadata.listsFound++;
          break;
        case 'key_value':
          metadata.keyValuePairsFound++;
          break;
        case 'hierarchy':
          metadata.hierarchiesFound++;
          break;
      }

      metadata.totalCells += structureCells.length;
    }

    metadata.processingTimeMs = Date.now() - startTime;

    return {
      structures,
      cells,
      metadata,
    };
  } catch (error) {
    console.error('Structure extraction error:', error);
    metadata.processingTimeMs = Date.now() - startTime;

    return {
      structures: [],
      cells: new Map(),
      metadata,
    };
  }
}

// ============================================================
// LLM Structure Identification
// ============================================================

/**
 * Use LLM to identify structures in content
 */
async function identifyStructuresWithLLM(
  content: string,
  options: ExtractionOptions
): Promise<IdentifiedStructure[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, falling back to rule-based extraction');
    return [];
  }

  const modelId =
    options.model === 'sonnet' ? 'claude-3-5-sonnet-20241022' : 'claude-3-5-haiku-20241022';

  // Truncate content if too long
  const maxContentLength = 50000;
  const truncatedContent =
    content.length > maxContentLength ? content.slice(0, maxContentLength) + '\n...[truncated]' : content;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildAnthropicHeaders(apiKey),
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        system: COMBINED_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract all structured data from this document:\n\n${truncatedContent}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return [];
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Parse the JSON response
    const parsed = JSON.parse(text);
    const llmStructures = parsed.structures || [];

    // Convert to IdentifiedStructure format
    return llmStructures.map(
      (s: {
        type: string;
        title?: string;
        raw_content?: string;
        headers?: string[];
        rows?: string[][];
        pairs?: { key: string; value: string }[];
        items?: string[];
        start_position?: number;
        end_position?: number;
        confidence?: number;
        description?: string;
      }) => ({
        type: s.type as IdentifiedStructure['type'],
        title: s.title,
        raw_content: s.raw_content || buildRawContent(s),
        start_position: s.start_position || 0,
        end_position: s.end_position || 0,
        confidence: s.confidence || 0.8,
        // Pass through additional parsed data
        _parsed: s,
      })
    );
  } catch (error) {
    console.error('LLM extraction error:', error);
    return [];
  }
}

/**
 * Build raw content string from parsed structure data
 */
function buildRawContent(structure: {
  headers?: string[];
  rows?: string[][];
  pairs?: { key: string; value: string }[];
  items?: string[];
}): string {
  if (structure.headers && structure.rows) {
    // Table
    const headerLine = structure.headers.join(' | ');
    const rowLines = structure.rows.map((row) => row.join(' | ')).join('\n');
    return `${headerLine}\n${rowLines}`;
  }

  if (structure.pairs) {
    // Key-value
    return structure.pairs.map((p) => `${p.key}: ${p.value}`).join('\n');
  }

  if (structure.items) {
    // List
    return structure.items.map((item) => `- ${item}`).join('\n');
  }

  return '';
}

// ============================================================
// Rule-Based Extraction (Fallback)
// ============================================================

/**
 * Extract structures using rule-based patterns (no LLM)
 */
function extractStructuresRuleBased(
  content: string,
  options: ExtractionOptions
): IdentifiedStructure[] {
  const structures: IdentifiedStructure[] = [];

  // Try to find tables
  if (options.extractTables) {
    // Look for markdown tables
    const tableRegex = /(\|[^\n]+\|(?:\n\|[-:| ]+\|)?(?:\n\|[^\n]+\|)+)/g;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      structures.push({
        type: 'table',
        raw_content: match[1],
        start_position: match.index,
        end_position: match.index + match[1].length,
        confidence: 0.9,
      });
    }
  }

  // Look for lists
  if (options.extractLists) {
    // Bullet lists
    const bulletListRegex = /((?:^[ \t]*[-*+][ \t]+[^\n]+\n?)+)/gm;
    let match;
    while ((match = bulletListRegex.exec(content)) !== null) {
      if (match[1].split('\n').filter((l) => l.trim()).length >= 2) {
        structures.push({
          type: 'list',
          raw_content: match[1],
          start_position: match.index,
          end_position: match.index + match[1].length,
          confidence: 0.8,
        });
      }
    }

    // Numbered lists
    const numberedListRegex = /((?:^[ \t]*\d+[\.\)][ \t]+[^\n]+\n?)+)/gm;
    while ((match = numberedListRegex.exec(content)) !== null) {
      if (match[1].split('\n').filter((l) => l.trim()).length >= 2) {
        structures.push({
          type: 'list',
          raw_content: match[1],
          start_position: match.index,
          end_position: match.index + match[1].length,
          confidence: 0.8,
        });
      }
    }
  }

  // Look for key-value pairs
  if (options.extractKeyValue) {
    // Lines with colon separator
    const kvRegex = /((?:^[^:\n]+:[ \t]+[^\n]+\n?){3,})/gm;
    let match;
    while ((match = kvRegex.exec(content)) !== null) {
      structures.push({
        type: 'key_value',
        raw_content: match[1],
        start_position: match.index,
        end_position: match.index + match[1].length,
        confidence: 0.7,
      });
    }
  }

  return structures;
}

// ============================================================
// Structure Parsing
// ============================================================

/**
 * Parse an identified structure into a structured format
 */
async function parseIdentifiedStructure(
  identified: IdentifiedStructure & { _parsed?: Record<string, unknown> },
  options: ExtractionOptions
): Promise<ParsedStructure | null> {
  const { type, raw_content, start_position, end_position, _parsed } = identified;

  try {
    switch (type) {
      case 'table': {
        // Check if already parsed by LLM
        if (_parsed?.headers && _parsed?.rows) {
          return {
            type: 'table',
            title: (identified.title as string) || undefined,
            description: (_parsed.description as string) || undefined,
            headers: _parsed.headers as string[],
            rows: _parsed.rows as string[][],
            raw_text: raw_content,
            source_location: {
              start_char: start_position,
              end_char: end_position,
            },
            row_count: (_parsed.rows as string[][]).length,
            column_count: (_parsed.headers as string[]).length,
          };
        }

        // Parse using rule-based parser
        const parsed = autoParseTable(raw_content);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          return null;
        }

        return toTableStructure(
          parsed,
          identified.title,
          undefined,
          { start_char: start_position, end_char: end_position }
        );
      }

      case 'list': {
        // Check if already parsed by LLM
        if (_parsed?.items) {
          const items = _parsed.items as string[];
          return {
            type: 'list',
            title: (identified.title as string) || undefined,
            description: (_parsed.description as string) || undefined,
            headers: undefined,
            rows: items.map((item) => [item]),
            raw_text: raw_content,
            source_location: {
              start_char: start_position,
              end_char: end_position,
            },
            row_count: items.length,
            column_count: 1,
          };
        }

        // Parse using rule-based parser
        const parsed = parseList(raw_content);
        return {
          type: 'list',
          title: identified.title,
          description: undefined,
          headers: undefined,
          rows: parsed.items.map((item) => [item]),
          raw_text: raw_content,
          source_location: {
            start_char: start_position,
            end_char: end_position,
          },
          row_count: parsed.items.length,
          column_count: 1,
        };
      }

      case 'key_value': {
        // Check if already parsed by LLM
        if (_parsed?.pairs) {
          const pairs = _parsed.pairs as { key: string; value: string }[];
          return {
            type: 'key_value',
            title: (identified.title as string) || undefined,
            description: (_parsed.description as string) || undefined,
            headers: ['Key', 'Value'],
            rows: pairs.map((p) => [p.key, p.value]),
            raw_text: raw_content,
            source_location: {
              start_char: start_position,
              end_char: end_position,
            },
            row_count: pairs.length,
            column_count: 2,
          };
        }

        // Parse using rule-based parser
        const parsed = parseKeyValuePairs(raw_content);
        return {
          type: 'key_value',
          title: identified.title,
          description: undefined,
          headers: ['Key', 'Value'],
          rows: parsed.pairs.map((p) => [p.key, p.value]),
          raw_text: raw_content,
          source_location: {
            start_char: start_position,
            end_char: end_position,
          },
          row_count: parsed.pairs.length,
          column_count: 2,
        };
      }

      case 'hierarchy': {
        // For now, represent hierarchy as nested list
        return {
          type: 'hierarchy',
          title: identified.title,
          description: undefined,
          headers: undefined,
          rows: [[raw_content]], // Store raw for now
          raw_text: raw_content,
          source_location: {
            start_char: start_position,
            end_char: end_position,
          },
          row_count: 1,
          column_count: 1,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Error parsing ${type} structure:`, error);
    return null;
  }
}

/**
 * Extract cells from a parsed structure
 */
function extractCellsFromStructure(structure: ParsedStructure): ParsedCell[] {
  if (structure.type === 'table' && structure.headers && structure.rows) {
    return extractTableCells(structure.headers, structure.rows);
  }

  if (structure.type === 'key_value' && structure.rows) {
    return structure.rows.map((row, index) => ({
      row_index: index,
      col_index: undefined,
      cell_key: String(row[0]),
      cell_value: String(row[1]),
      data_type: inferCellType(String(row[1])),
    }));
  }

  if (structure.type === 'list' && structure.rows) {
    return structure.rows.map((row, index) => ({
      row_index: index,
      col_index: 0,
      cell_key: undefined,
      cell_value: String(row[0]),
      data_type: inferCellType(String(row[0])),
    }));
  }

  return [];
}

// ============================================================
// Database Operations
// ============================================================

/**
 * Save extracted structures to database
 */
export async function saveExtractedStructures(
  userId: string,
  documentId: string,
  result: ExtractionResult,
  options: ExtractionOptions = {}
): Promise<BatchInsertResult> {
  const supabase = createServerClient();
  const errors: { index: number; error: string }[] = [];
  let structuresInserted = 0;
  let cellsInserted = 0;

  for (let i = 0; i < result.structures.length; i++) {
    const structure = result.structures[i];
    const structureCells = result.cells.get(i) || [];

    try {
      // Generate embedding for structure summary
      let embedding: number[] | undefined;
      if (options.generateEmbeddings) {
        const summaryText = generateStructureSummary(structure);
        embedding = await createEmbedding(summaryText);
      }

      // Insert structure
      const structureInsert: DocumentStructureInsert = {
        user_id: userId,
        document_id: documentId,
        collection_id: options.collectionId,
        structure_type: structure.type,
        title: structure.title,
        description: structure.description,
        headers: structure.headers ? JSON.parse(JSON.stringify(structure.headers)) : undefined,
        rows: structure.rows ? JSON.parse(JSON.stringify(structure.rows)) : undefined,
        schema_def: structure.schema_def,
        raw_text: structure.raw_text,
        source_page: structure.source_location?.page,
        source_location: structure.source_location,
        metadata: {},
        embedding,
        row_count: structure.row_count,
        column_count: structure.column_count,
      };

      const { data: insertedStructure, error: structureError } = await supabase
        .from('document_structures')
        .insert(structureInsert)
        .select('id')
        .single();

      if (structureError) {
        errors.push({ index: i, error: structureError.message });
        continue;
      }

      structuresInserted++;

      // Insert cells
      if (structureCells.length > 0 && insertedStructure?.id) {
        const cellInserts: StructureCellInsert[] = [];

        for (const cell of structureCells) {
          let cellEmbedding: number[] | undefined;
          if (options.generateCellEmbeddings) {
            cellEmbedding = await createEmbedding(cell.cell_value);
          }

          cellInserts.push({
            structure_id: insertedStructure.id,
            row_index: cell.row_index,
            col_index: cell.col_index,
            cell_key: cell.cell_key,
            cell_value: cell.cell_value,
            data_type: cell.data_type,
            embedding: cellEmbedding,
          });
        }

        // Batch insert cells
        const { error: cellsError } = await supabase
          .from('structure_cells')
          .insert(cellInserts);

        if (cellsError) {
          errors.push({
            index: i,
            error: `Cells insertion error: ${cellsError.message}`,
          });
        } else {
          cellsInserted += cellInserts.length;
        }
      }
    } catch (error) {
      errors.push({
        index: i,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    structuresInserted,
    cellsInserted,
    errors,
  };
}

/**
 * Generate a text summary of a structure for embedding
 */
function generateStructureSummary(structure: ParsedStructure): string {
  const parts: string[] = [];

  if (structure.title) {
    parts.push(`Title: ${structure.title}`);
  }

  parts.push(`Type: ${structure.type}`);

  if (structure.description) {
    parts.push(`Description: ${structure.description}`);
  }

  if (structure.headers && structure.headers.length > 0) {
    parts.push(`Columns: ${structure.headers.join(', ')}`);
  }

  parts.push(`Size: ${structure.row_count} rows x ${structure.column_count} columns`);

  // Include sample data
  if (structure.rows && structure.rows.length > 0) {
    const sampleRows = structure.rows.slice(0, 3);
    const sampleText = sampleRows
      .map((row) => row.map((cell) => String(cell)).join(', '))
      .join(' | ');
    parts.push(`Sample data: ${sampleText}`);
  }

  return parts.join('\n');
}

// ============================================================
// Search Functions
// ============================================================

/**
 * Search for structures by query
 */
export async function searchStructures(
  userId: string,
  query: string,
  options: {
    collectionId?: string;
    structureType?: string;
    limit?: number;
    similarityThreshold?: number;
  } = {}
) {
  const supabase = createServerClient();

  // Generate query embedding
  const queryEmbedding = await createEmbedding(query);

  // Call search function
  const { data, error } = await supabase.rpc('search_document_structures', {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_collection_id: options.collectionId || null,
    p_structure_type: options.structureType || null,
    p_limit: options.limit || 10,
    p_similarity_threshold: options.similarityThreshold || 0.5,
  });

  if (error) {
    throw new Error(`Search error: ${error.message}`);
  }

  return data;
}

/**
 * Search for cells by query
 */
export async function searchCells(
  userId: string,
  query: string,
  options: {
    structureId?: string;
    dataType?: string;
    limit?: number;
    similarityThreshold?: number;
  } = {}
) {
  const supabase = createServerClient();

  // Generate query embedding
  const queryEmbedding = await createEmbedding(query);

  // Call search function
  const { data, error } = await supabase.rpc('search_structure_cells', {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_structure_id: options.structureId || null,
    p_data_type: options.dataType || null,
    p_limit: options.limit || 20,
    p_similarity_threshold: options.similarityThreshold || 0.5,
  });

  if (error) {
    throw new Error(`Cell search error: ${error.message}`);
  }

  return data;
}
