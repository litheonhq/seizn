// Seizn Spring - File Analysis
// Supports: PDF, DOCX, TXT, CSV, JSON, Images (with OCR)

import { createServerClient } from '../supabase';
import OpenAI from 'openai';

// ===========================================
// Types
// ===========================================
export interface FileAnalysisResult {
  extractedText: string;
  summary?: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    characterCount: number;
    language?: string;
  };
  analysis?: {
    keyPoints?: string[];
    entities?: Array<{ type: string; value: string }>;
    sentiment?: 'positive' | 'negative' | 'neutral';
  };
}

export interface SupportedFileType {
  extension: string;
  mimeTypes: string[];
  maxSizeMB: number;
  extractionMethod: 'text' | 'pdf' | 'docx' | 'image' | 'data';
}

export const SUPPORTED_FILE_TYPES: SupportedFileType[] = [
  { extension: 'txt', mimeTypes: ['text/plain'], maxSizeMB: 10, extractionMethod: 'text' },
  { extension: 'md', mimeTypes: ['text/markdown'], maxSizeMB: 10, extractionMethod: 'text' },
  { extension: 'csv', mimeTypes: ['text/csv'], maxSizeMB: 50, extractionMethod: 'data' },
  { extension: 'json', mimeTypes: ['application/json'], maxSizeMB: 50, extractionMethod: 'data' },
  { extension: 'pdf', mimeTypes: ['application/pdf'], maxSizeMB: 25, extractionMethod: 'pdf' },
  { extension: 'docx', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxSizeMB: 25, extractionMethod: 'docx' },
  { extension: 'doc', mimeTypes: ['application/msword'], maxSizeMB: 25, extractionMethod: 'docx' },
  { extension: 'png', mimeTypes: ['image/png'], maxSizeMB: 10, extractionMethod: 'image' },
  { extension: 'jpg', mimeTypes: ['image/jpeg'], maxSizeMB: 10, extractionMethod: 'image' },
  { extension: 'jpeg', mimeTypes: ['image/jpeg'], maxSizeMB: 10, extractionMethod: 'image' },
  { extension: 'webp', mimeTypes: ['image/webp'], maxSizeMB: 10, extractionMethod: 'image' },
];

// ===========================================
// File Upload to Supabase Storage
// ===========================================
export async function uploadFileToStorage(
  userId: string,
  file: File,
  folder: string = 'uploads'
): Promise<{ url: string; path: string }> {
  const supabase = createServerClient();

  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${userId}/${folder}/${timestamp}-${sanitizedName}`;

  const { data, error } = await supabase.storage
    .from('spring-files')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`File upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('spring-files')
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
  };
}

// ===========================================
// Text Extraction
// ===========================================
export async function extractText(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  _filename: string
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const fileType = SUPPORTED_FILE_TYPES.find(t => t.mimeTypes.includes(mimeType));

  if (!fileType) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  switch (fileType.extractionMethod) {
    case 'text':
      return extractFromText(fileBuffer);
    case 'data':
      return extractFromData(fileBuffer, mimeType);
    case 'pdf':
      return extractFromPDF(fileBuffer);
    case 'docx':
      return extractFromDocx(fileBuffer);
    case 'image':
      return extractFromImage(fileBuffer, mimeType);
    default:
      throw new Error(`Unknown extraction method`);
  }
}

async function extractFromText(buffer: ArrayBuffer): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const text = new TextDecoder('utf-8').decode(buffer);
  return {
    text,
    metadata: {
      encoding: 'utf-8',
    },
  };
}

async function extractFromData(buffer: ArrayBuffer, mimeType: string): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const text = new TextDecoder('utf-8').decode(buffer);

  if (mimeType === 'application/json') {
    try {
      const parsed = JSON.parse(text);
      return {
        text: JSON.stringify(parsed, null, 2),
        metadata: {
          type: 'json',
          keys: Object.keys(parsed),
        },
      };
    } catch {
      return { text, metadata: { type: 'json', parseError: true } };
    }
  }

  // CSV
  const lines = text.split('\n');
  const headers = lines[0]?.split(',') || [];
  return {
    text,
    metadata: {
      type: 'csv',
      rowCount: lines.length - 1,
      columns: headers,
    },
  };
}

async function extractFromPDF(buffer: ArrayBuffer): Promise<{ text: string; metadata: Record<string, unknown> }> {
  // Use pdf-parse library
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(Buffer.from(buffer));

    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        info: data.info,
      },
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

async function extractFromDocx(buffer: ArrayBuffer): Promise<{ text: string; metadata: Record<string, unknown> }> {
  // Use mammoth library for DOCX
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });

    return {
      text: result.value,
      metadata: {
        messages: result.messages,
      },
    };
  } catch (error) {
    console.error('DOCX extraction error:', error);
    throw new Error('Failed to extract text from DOCX');
  }
}

async function extractFromImage(buffer: ArrayBuffer, mimeType: string): Promise<{ text: string; metadata: Record<string, unknown> }> {
  // Use OpenAI Vision for OCR
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY required for image text extraction');
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const base64Image = Buffer.from(buffer).toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all text from this image. If there is no text, describe the image content briefly. Return only the extracted text or description.',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const extractedText = response.choices[0]?.message?.content || '';

  return {
    text: extractedText,
    metadata: {
      method: 'vision-ocr',
      model: 'gpt-4o-mini',
      tokensUsed: response.usage?.total_tokens || 0,
    },
  };
}

// ===========================================
// AI Analysis
// ===========================================
export async function analyzeContent(
  text: string,
  options?: {
    summarize?: boolean;
    extractEntities?: boolean;
    analyzeSentiment?: boolean;
    customPrompt?: string;
  }
): Promise<FileAnalysisResult['analysis'] & { summary?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return {};
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Truncate if too long
  const maxChars = 15000;
  const truncatedText = text.length > maxChars
    ? text.substring(0, maxChars) + '\n...[truncated]'
    : text;

  const tasks: string[] = [];
  if (options?.summarize !== false) tasks.push('summary');
  if (options?.extractEntities) tasks.push('entities');
  if (options?.analyzeSentiment) tasks.push('sentiment');

  const systemPrompt = `You are a document analyzer. Analyze the given text and provide:
${tasks.includes('summary') ? '1. A concise summary (2-3 sentences)' : ''}
${tasks.includes('entities') ? '2. Key entities (people, organizations, dates, locations)' : ''}
${tasks.includes('sentiment') ? '3. Overall sentiment (positive/negative/neutral)' : ''}

Respond in JSON format:
{
  ${tasks.includes('summary') ? '"summary": "...", "keyPoints": ["point1", "point2", ...],' : ''}
  ${tasks.includes('entities') ? '"entities": [{"type": "person|org|date|location", "value": "..."}],' : ''}
  ${tasks.includes('sentiment') ? '"sentiment": "positive|negative|neutral"' : ''}
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: options?.customPrompt || truncatedText },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return result;
  } catch (error) {
    console.error('Analysis error:', error);
    return {};
  }
}

// ===========================================
// Main Analysis Function
// ===========================================
export async function analyzeFile(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  _filename: string,
  options?: {
    skipAnalysis?: boolean;
    extractEntities?: boolean;
    analyzeSentiment?: boolean;
  }
): Promise<FileAnalysisResult> {
  // 1. Extract text
  const { text, metadata } = await extractText(fileBuffer, mimeType, _filename);

  // 2. Calculate basic metrics
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const characterCount = text.length;

  // 3. AI Analysis (optional)
  let analysis: FileAnalysisResult['analysis'] & { summary?: string } = {};

  if (!options?.skipAnalysis && text.length > 50) {
    analysis = await analyzeContent(text, {
      summarize: true,
      extractEntities: options?.extractEntities,
      analyzeSentiment: options?.analyzeSentiment,
    });
  }

  return {
    extractedText: text,
    summary: analysis.summary,
    metadata: {
      pageCount: metadata.pageCount as number | undefined,
      wordCount,
      characterCount,
      language: detectLanguage(text),
    },
    analysis: {
      keyPoints: analysis.keyPoints,
      entities: analysis.entities,
      sentiment: analysis.sentiment,
    },
  };
}

// ===========================================
// Helpers
// ===========================================
function detectLanguage(text: string): string {
  // Simple detection based on character ranges
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  const chineseChars = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
  const totalChars = text.length;

  if (koreanChars / totalChars > 0.1) return 'ko';
  if (japaneseChars / totalChars > 0.1) return 'ja';
  if (chineseChars / totalChars > 0.1) return 'zh';
  return 'en';
}

export function validateFile(
  file: { name: string; type: string; size: number },
  maxSizeMB?: number
): { valid: boolean; error?: string } {
  const fileType = SUPPORTED_FILE_TYPES.find(t =>
    t.mimeTypes.includes(file.type) ||
    file.name.toLowerCase().endsWith(`.${t.extension}`)
  );

  if (!fileType) {
    return {
      valid: false,
      error: `Unsupported file type. Supported: ${SUPPORTED_FILE_TYPES.map(t => t.extension).join(', ')}`
    };
  }

  const maxSize = (maxSizeMB || fileType.maxSizeMB) * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxSizeMB || fileType.maxSizeMB}MB`
    };
  }

  return { valid: true };
}
