/**
 * Language Detection
 *
 * Detects the language of text using multiple strategies:
 * 1. Script-based heuristics (fast, for obvious cases)
 * 2. FastText LID model (accurate, for ambiguous cases)
 * 3. n-gram analysis (fallback)
 *
 * @module lib/langpack/detector
 */

import type {
  LanguageDetectionResult,
  LanguageSegment,
  ScriptType,
} from './types';

// =============================================================================
// Script Detection
// =============================================================================

/**
 * Unicode script ranges for quick detection
 */
const SCRIPT_RANGES: Array<{
  script: ScriptType;
  ranges: Array<[number, number]>;
  languages: string[];
}> = [
  {
    script: 'han_simplified',
    ranges: [[0x4e00, 0x9fff]], // CJK Unified Ideographs
    languages: ['zh', 'ja'], // Could be Chinese or Japanese
  },
  {
    script: 'hangul',
    ranges: [
      [0xac00, 0xd7af], // Hangul Syllables
      [0x1100, 0x11ff], // Hangul Jamo
    ],
    languages: ['ko'],
  },
  {
    script: 'hiragana',
    ranges: [[0x3040, 0x309f]],
    languages: ['ja'],
  },
  {
    script: 'katakana',
    ranges: [[0x30a0, 0x30ff]],
    languages: ['ja'],
  },
  {
    script: 'cyrillic',
    ranges: [[0x0400, 0x04ff]],
    languages: ['ru', 'uk', 'bg', 'sr'],
  },
  {
    script: 'devanagari',
    ranges: [[0x0900, 0x097f]],
    languages: ['hi', 'mr', 'ne', 'sa'],
  },
  {
    script: 'arabic',
    ranges: [[0x0600, 0x06ff]],
    languages: ['ar', 'fa', 'ur'],
  },
  {
    script: 'hebrew',
    ranges: [[0x0590, 0x05ff]],
    languages: ['he', 'yi'],
  },
  {
    script: 'thai',
    ranges: [[0x0e00, 0x0e7f]],
    languages: ['th'],
  },
  {
    script: 'bengali',
    ranges: [[0x0980, 0x09ff]],
    languages: ['bn', 'as'],
  },
  {
    script: 'tamil',
    ranges: [[0x0b80, 0x0bff]],
    languages: ['ta'],
  },
  {
    script: 'telugu',
    ranges: [[0x0c00, 0x0c7f]],
    languages: ['te'],
  },
  {
    script: 'gujarati',
    ranges: [[0x0a80, 0x0aff]],
    languages: ['gu'],
  },
  {
    script: 'kannada',
    ranges: [[0x0c80, 0x0cff]],
    languages: ['kn'],
  },
  {
    script: 'malayalam',
    ranges: [[0x0d00, 0x0d7f]],
    languages: ['ml'],
  },
  {
    script: 'punjabi',
    ranges: [[0x0a00, 0x0a7f]],
    languages: ['pa'],
  },
];

/**
 * Detect the dominant script in text
 */
export function detectScript(text: string): {
  script: ScriptType;
  confidence: number;
  possibleLanguages: string[];
} {
  const scriptCounts = new Map<ScriptType, number>();
  let latinCount = 0;
  let totalChars = 0;

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;

    // Skip whitespace and common punctuation
    if (/\s/.test(char) || /[\p{P}\p{S}]/u.test(char)) continue;

    totalChars++;

    // Check against script ranges
    let matched = false;
    for (const { script, ranges } of SCRIPT_RANGES) {
      for (const [start, end] of ranges) {
        if (codePoint >= start && codePoint <= end) {
          scriptCounts.set(script, (scriptCounts.get(script) || 0) + 1);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    // Check Latin
    if (!matched && /[a-zA-Z]/.test(char)) {
      latinCount++;
    }
  }

  // Find dominant script
  let dominantScript: ScriptType = 'latin';
  let maxCount = latinCount;

  for (const [script, count] of scriptCounts) {
    if (count > maxCount) {
      dominantScript = script;
      maxCount = count;
    }
  }

  const confidence = totalChars > 0 ? maxCount / totalChars : 0;

  // Get possible languages for the script
  const scriptInfo = SCRIPT_RANGES.find((s) => s.script === dominantScript);
  const possibleLanguages = scriptInfo?.languages || ['en', 'de', 'fr', 'es', 'it', 'pt'];

  return {
    script: dominantScript,
    confidence,
    possibleLanguages,
  };
}

// =============================================================================
// Language Detection
// =============================================================================

/**
 * Common words for quick language identification (Latin script)
 */
const LANGUAGE_INDICATORS: Record<string, string[]> = {
  en: ['the', 'is', 'are', 'and', 'or', 'but', 'have', 'has', 'with', 'this', 'that', 'for'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'mit', 'auf', 'für', 'nicht'],
  fr: ['le', 'la', 'les', 'de', 'du', 'des', 'et', 'est', 'un', 'une', 'pour', 'dans'],
  es: ['el', 'la', 'los', 'las', 'de', 'del', 'en', 'es', 'un', 'una', 'por', 'para'],
  it: ['il', 'la', 'le', 'di', 'del', 'della', 'che', 'è', 'un', 'una', 'per', 'con'],
  pt: ['o', 'a', 'os', 'as', 'de', 'do', 'da', 'em', 'é', 'um', 'uma', 'para', 'com'],
  nl: ['de', 'het', 'een', 'van', 'en', 'is', 'op', 'te', 'dat', 'voor', 'met', 'zijn'],
  pl: ['i', 'w', 'na', 'z', 'do', 'nie', 'to', 'że', 'się', 'jest', 'co', 'jak'],
};

/**
 * Detect language using heuristics (fast path)
 */
function detectLanguageHeuristic(text: string): LanguageDetectionResult | null {
  const scriptResult = detectScript(text);

  // For non-Latin scripts with single language, return directly
  if (scriptResult.script !== 'latin' && scriptResult.possibleLanguages.length === 1) {
    return {
      language: scriptResult.possibleLanguages[0],
      confidence: scriptResult.confidence,
      script: scriptResult.script,
    };
  }

  // For Latin script, use word-based detection
  if (scriptResult.script === 'latin') {
    const words = text.toLowerCase().split(/\s+/);
    const langScores: Record<string, number> = {};

    for (const word of words) {
      for (const [lang, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
        if (indicators.includes(word)) {
          langScores[lang] = (langScores[lang] || 0) + 1;
        }
      }
    }

    // Find best match
    let bestLang = 'en';
    let bestScore = 0;
    let totalScore = 0;

    for (const [lang, score] of Object.entries(langScores)) {
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestLang = lang;
      }
    }

    if (bestScore >= 2) {
      return {
        language: bestLang,
        confidence: Math.min(0.9, bestScore / Math.max(words.length * 0.3, 1)),
        script: 'latin',
        alternatives: Object.entries(langScores)
          .filter(([lang]) => lang !== bestLang)
          .map(([language, score]) => ({
            language,
            confidence: score / Math.max(totalScore, 1),
          }))
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3),
      };
    }
  }

  return null;
}

/**
 * Configuration for the detector
 */
interface DetectorConfig {
  /** URL for FastText service (optional) */
  fastTextServiceUrl?: string;
  /** Minimum confidence to accept result */
  minConfidence?: number;
  /** Enable code-switching detection */
  detectCodeSwitching?: boolean;
}

let detectorConfig: DetectorConfig = {
  minConfidence: 0.5,
  detectCodeSwitching: false,
};

/**
 * Configure the language detector
 */
export function configureDetector(config: Partial<DetectorConfig>): void {
  detectorConfig = { ...detectorConfig, ...config };
}

/**
 * Detect the language of text
 *
 * Uses a multi-stage approach:
 * 1. Script detection for non-Latin scripts
 * 2. Heuristic word matching for Latin scripts
 * 3. FastText LID service call (if configured)
 *
 * @param text - Text to detect language for
 * @returns Language detection result
 */
export async function detectLanguage(text: string): Promise<LanguageDetectionResult> {
  // Handle empty text
  if (!text.trim()) {
    return {
      language: 'und', // Undetermined
      confidence: 0,
      script: 'latin',
    };
  }

  // Try heuristic detection first (fast)
  const heuristicResult = detectLanguageHeuristic(text);
  if (heuristicResult && heuristicResult.confidence >= (detectorConfig.minConfidence || 0.5)) {
    return heuristicResult;
  }

  // Try FastText service if configured
  if (detectorConfig.fastTextServiceUrl) {
    try {
      const response = await fetch(detectorConfig.fastTextServiceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          language: result.language || 'und',
          confidence: result.confidence || 0,
          script: detectScript(text).script,
          alternatives: result.alternatives,
        };
      }
    } catch (error) {
      console.warn('[langpack/detector] FastText service error:', error);
    }
  }

  // Fallback: return heuristic result or default
  if (heuristicResult) {
    return heuristicResult;
  }

  const scriptResult = detectScript(text);
  return {
    language: scriptResult.possibleLanguages[0] || 'und',
    confidence: scriptResult.confidence * 0.5, // Lower confidence for fallback
    script: scriptResult.script,
  };
}

/**
 * Detect language segments in mixed-language text (code-switching)
 *
 * @param text - Text with potential mixed languages
 * @returns Array of language segments
 */
export async function detectLanguageSegments(text: string): Promise<LanguageSegment[]> {
  // Simple implementation: split by script boundaries
  const segments: LanguageSegment[] = [];
  let currentSegment = '';
  let currentStart = 0;
  let currentScript: ScriptType | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charScript = detectScript(char).script;

    // Skip whitespace - include in current segment
    if (/\s/.test(char)) {
      currentSegment += char;
      continue;
    }

    if (currentScript === null) {
      currentScript = charScript;
      currentSegment = char;
      currentStart = i;
    } else if (charScript === currentScript || charScript === 'latin') {
      currentSegment += char;
    } else {
      // Script change - save current segment
      if (currentSegment.trim()) {
        const detection = await detectLanguage(currentSegment);
        segments.push({
          text: currentSegment,
          start: currentStart,
          end: i,
          language: detection.language,
          confidence: detection.confidence,
        });
      }

      // Start new segment
      currentSegment = char;
      currentStart = i;
      currentScript = charScript;
    }
  }

  // Don't forget the last segment
  if (currentSegment.trim()) {
    const detection = await detectLanguage(currentSegment);
    segments.push({
      text: currentSegment,
      start: currentStart,
      end: text.length,
      language: detection.language,
      confidence: detection.confidence,
    });
  }

  return segments;
}

/**
 * Check if text contains multiple languages
 */
export async function isMixedLanguage(text: string): Promise<boolean> {
  const segments = await detectLanguageSegments(text);
  const uniqueLanguages = new Set(segments.map((s) => s.language));
  return uniqueLanguages.size > 1;
}
