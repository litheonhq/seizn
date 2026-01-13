/**
 * Doc-to-DB: LLM Prompts for Structure Extraction
 *
 * Prompts used to identify and extract structured data from documents.
 */

import type { ExtractionOptions } from './types';

// ============================================================
// Structure Identification Prompt
// ============================================================

export const STRUCTURE_IDENTIFICATION_PROMPT = `You are an expert at identifying structured data within documents.

## Your Task
Analyze the document content and identify any structured data present:
- **Tables**: Data organized in rows and columns
- **Lists**: Ordered or unordered collections of items
- **Key-Value Pairs**: Definition-style content (term: definition, label: value)
- **Hierarchies**: Nested structures like outlines or tree structures

## Output Format
Return a JSON array of identified structures. Each structure should have:
\`\`\`json
[
  {
    "type": "table" | "list" | "key_value" | "hierarchy",
    "title": "Optional title or heading for the structure",
    "raw_content": "The exact text content of the structure",
    "start_position": 0,
    "end_position": 100,
    "confidence": 0.95
  }
]
\`\`\`

## Guidelines
1. Include the EXACT raw text from the document - do not modify or reformat
2. start_position and end_position are character indices in the original text
3. confidence should be 0.0-1.0 based on how clearly structured the data is
4. Only identify genuine structures, not prose text that happens to have some formatting
5. For tables, look for:
   - Markdown tables (|header|header|)
   - ASCII tables with separators
   - Tab-separated or comma-separated data
   - Aligned columnar text
6. For lists, look for:
   - Bullet points (-, *, +)
   - Numbered lists (1., 2., etc.)
   - Lettered lists (a., b., etc.)
7. For key-value pairs, look for:
   - Colon-separated pairs (key: value)
   - Definition lists
   - Form-like content (Field Name: Field Value)
8. For hierarchies, look for:
   - Indented outlines
   - Nested numbered lists (1.1, 1.2, etc.)
   - Tree structures

Return ONLY valid JSON array. No markdown formatting, no explanation.
If no structures found, return empty array: []`;

// ============================================================
// Table Parsing Prompt
// ============================================================

export const TABLE_PARSING_PROMPT = `You are an expert at parsing table structures.

## Your Task
Parse the following table content and extract:
1. Column headers (if present)
2. Data rows
3. A brief description of what the table contains

## Output Format
Return a JSON object:
\`\`\`json
{
  "headers": ["Column1", "Column2", "Column3"],
  "rows": [
    ["value1", "value2", "value3"],
    ["value4", "value5", "value6"]
  ],
  "description": "Brief description of table content",
  "has_header_row": true
}
\`\`\`

## Guidelines
1. Preserve the original values exactly as they appear
2. If no clear header row exists, set has_header_row to false and headers to null
3. Handle missing cells with null values
4. Parse numbers as strings (type inference happens later)
5. Handle merged cells by repeating the value or using null
6. For multi-line cell content, join with a space

Return ONLY valid JSON object. No markdown, no explanation.`;

// ============================================================
// List Parsing Prompt
// ============================================================

export const LIST_PARSING_PROMPT = `You are an expert at parsing list structures.

## Your Task
Parse the following list content and extract:
1. List items
2. List type (ordered/unordered)
3. Nesting structure if present

## Output Format
Return a JSON object:
\`\`\`json
{
  "items": [
    "Item 1",
    "Item 2",
    "Item 3"
  ],
  "list_type": "ordered" | "unordered",
  "description": "Brief description of the list",
  "nested": false
}
\`\`\`

For nested lists:
\`\`\`json
{
  "items": [
    { "value": "Parent item", "children": ["Child 1", "Child 2"] },
    "Simple item"
  ],
  "list_type": "unordered",
  "description": "Nested list description",
  "nested": true
}
\`\`\`

## Guidelines
1. Preserve item text exactly as written
2. Strip list markers (-, *, 1., etc.) from the item text
3. Maintain order for ordered lists
4. For nested lists, create hierarchical structure
5. Detect list type from markers:
   - Unordered: -, *, +, bullet characters
   - Ordered: 1., 2., a., b., i., ii., etc.

Return ONLY valid JSON object. No markdown, no explanation.`;

// ============================================================
// Key-Value Parsing Prompt
// ============================================================

export const KEY_VALUE_PARSING_PROMPT = `You are an expert at parsing key-value structures.

## Your Task
Parse the following content and extract key-value pairs.

## Output Format
Return a JSON object:
\`\`\`json
{
  "pairs": [
    { "key": "Field Name", "value": "Field Value" },
    { "key": "Another Field", "value": "Another Value" }
  ],
  "description": "Brief description of the key-value content"
}
\`\`\`

## Guidelines
1. Identify the separator pattern (colon, equals, arrow, etc.)
2. Trim whitespace from keys and values
3. Keys should be normalized (consistent case, no trailing colons)
4. Multi-line values should be combined
5. Handle nested key-value pairs if present
6. Common patterns:
   - "Key: Value"
   - "Key = Value"
   - "Key -> Value"
   - "Key | Value"

Return ONLY valid JSON object. No markdown, no explanation.`;

// ============================================================
// Hierarchy Parsing Prompt
// ============================================================

export const HIERARCHY_PARSING_PROMPT = `You are an expert at parsing hierarchical structures.

## Your Task
Parse the following content and extract the hierarchical structure.

## Output Format
Return a JSON object:
\`\`\`json
{
  "root": {
    "label": "Root Node",
    "children": [
      {
        "label": "Child 1",
        "children": [
          { "label": "Grandchild 1.1", "children": [] }
        ]
      },
      { "label": "Child 2", "children": [] }
    ]
  },
  "description": "Brief description of the hierarchy",
  "depth": 3
}
\`\`\`

## Guidelines
1. Detect indentation levels to determine nesting
2. Each node should have a label and children array
3. Leaf nodes have empty children arrays
4. Calculate the maximum depth
5. Common patterns:
   - Indented outlines
   - Numbered sections (1, 1.1, 1.1.1)
   - Directory/file structures
   - Org charts

Return ONLY valid JSON object. No markdown, no explanation.`;

// ============================================================
// Schema Inference Prompt
// ============================================================

export const SCHEMA_INFERENCE_PROMPT = `You are an expert at inferring data schemas from tabular data.

## Your Task
Analyze the table headers and data rows to infer the schema.

## Output Format
Return a JSON array of field definitions:
\`\`\`json
[
  {
    "name": "field_name",
    "type": "text" | "number" | "date" | "currency" | "percentage" | "boolean" | "email" | "url" | "phone" | "unknown",
    "required": true,
    "description": "What this field represents",
    "constraints": {
      "min": 0,
      "max": 100,
      "pattern": "regex_pattern",
      "enum": ["value1", "value2"]
    }
  }
]
\`\`\`

## Data Type Detection Rules
- **number**: Integers, floats, numeric values (123, 45.67, -89)
- **date**: Date formats (2024-01-15, Jan 15 2024, 15/01/2024)
- **currency**: Money values ($100, USD 50, 100.00, with currency symbols)
- **percentage**: Percent values (50%, 0.5 as percentage context)
- **boolean**: Yes/No, True/False, 1/0, Y/N
- **email**: Email addresses
- **url**: Web URLs
- **phone**: Phone numbers
- **text**: Everything else

## Guidelines
1. Analyze multiple rows to determine the most likely type
2. Handle mixed types by choosing the most general
3. Set required=true if all rows have non-empty values
4. Add constraints when patterns are detected
5. enum constraints for fields with limited distinct values (<10)

Return ONLY valid JSON array. No markdown, no explanation.`;

// ============================================================
// Helper: Build extraction prompt based on options
// ============================================================

export function buildIdentificationPrompt(options: ExtractionOptions): string {
  const structureTypes: string[] = [];

  if (options.extractTables !== false) {
    structureTypes.push('tables');
  }
  if (options.extractLists !== false) {
    structureTypes.push('lists');
  }
  if (options.extractKeyValue !== false) {
    structureTypes.push('key-value pairs');
  }
  if (options.extractHierarchy) {
    structureTypes.push('hierarchies');
  }

  if (structureTypes.length === 0) {
    // Default to all if nothing specified
    return STRUCTURE_IDENTIFICATION_PROMPT;
  }

  return STRUCTURE_IDENTIFICATION_PROMPT.replace(
    '- **Tables**',
    structureTypes.includes('tables') ? '- **Tables**' : ''
  )
    .replace('- **Lists**', structureTypes.includes('lists') ? '- **Lists**' : '')
    .replace(
      '- **Key-Value Pairs**',
      structureTypes.includes('key-value pairs') ? '- **Key-Value Pairs**' : ''
    )
    .replace(
      '- **Hierarchies**',
      structureTypes.includes('hierarchies') ? '- **Hierarchies**' : ''
    );
}

// ============================================================
// Combined Extraction Prompt (for single-call extraction)
// ============================================================

export const COMBINED_EXTRACTION_PROMPT = `You are an expert at extracting structured data from documents.

## Your Task
Analyze the document and extract ALL structured data in a single pass.

## Output Format
Return a JSON object with extracted structures:
\`\`\`json
{
  "structures": [
    {
      "type": "table",
      "title": "Sales Data Q4",
      "description": "Quarterly sales figures by region",
      "headers": ["Region", "Q1", "Q2", "Q3", "Q4"],
      "rows": [
        ["North", "100", "120", "115", "130"],
        ["South", "90", "95", "100", "110"]
      ],
      "start_position": 0,
      "end_position": 200,
      "confidence": 0.95
    },
    {
      "type": "key_value",
      "title": "Product Specifications",
      "description": "Technical specifications for Product X",
      "pairs": [
        { "key": "Weight", "value": "2.5 kg" },
        { "key": "Dimensions", "value": "30 x 20 x 10 cm" }
      ],
      "start_position": 250,
      "end_position": 400,
      "confidence": 0.9
    },
    {
      "type": "list",
      "title": "Requirements",
      "description": "System requirements list",
      "items": ["Node.js 18+", "PostgreSQL 14+", "Redis 7+"],
      "list_type": "unordered",
      "start_position": 450,
      "end_position": 550,
      "confidence": 0.85
    }
  ]
}
\`\`\`

## Structure Types

### Tables
- headers: Array of column headers
- rows: 2D array of cell values

### Lists
- items: Array of list items (strings or nested objects)
- list_type: "ordered" or "unordered"

### Key-Value Pairs
- pairs: Array of {key, value} objects

### Hierarchies
- root: Nested object with label and children

## Guidelines
1. Extract ALL structures, not just the first one
2. Preserve original text values exactly
3. Provide accurate start/end positions (character indices)
4. Add descriptive titles and descriptions
5. Set confidence based on structure clarity (0.0-1.0)
6. For tables, minimum 2 rows and 2 columns unless very clearly a table
7. Distinguish between genuine structures and formatted prose

Return ONLY valid JSON. No markdown code blocks, no explanation.
If no structures found, return: { "structures": [] }`;

// ============================================================
// Description Generation Prompt
// ============================================================

export const DESCRIPTION_GENERATION_PROMPT = `Generate a concise, informative description for this data structure.

## Guidelines
1. Describe what the data represents
2. Mention key columns/fields
3. Note any patterns or insights
4. Keep it under 100 words
5. Be specific and useful for search

Return only the description text, no JSON, no quotes.`;
