export type ContentIntegrityWarningCode =
  | 'replacement_character_detected'
  | 'high_question_mark_ratio'
  | 'possible_mojibake';

export type ContentIntegrityWarning = {
  code: ContentIntegrityWarningCode;
  message: string;
  severity: 'low' | 'medium';
};

export type ContentIntegrityAnalysis = {
  warnings: ContentIntegrityWarning[];
};

const MOJIBAKE_TOKEN_PATTERN =
  /(Ã.|Â.|â.|ð.|ì.|ë.|ê.|í.|ï.|™|œ|ž|¢|£|¥|¦|©|®|±|¼|½|¾)/g;

function countMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Soft integrity checks for user-provided memory text.
 *
 * Purpose:
 * - Detect common mojibake/replacement patterns without blocking valid multilingual text.
 * - Return warnings that clients can surface or log for diagnostics.
 */
export function analyzeContentIntegrity(content: string): ContentIntegrityAnalysis {
  const warnings: ContentIntegrityWarning[] = [];
  const normalized = content || '';

  if (normalized.includes('\uFFFD')) {
    warnings.push({
      code: 'replacement_character_detected',
      message:
        'Replacement characters (�) were detected. This often means the text was decoded with the wrong encoding.',
      severity: 'medium',
    });
  }

  const length = normalized.length;
  if (length >= 40) {
    const questionMarkCount = countMatches(normalized, /\?/g);
    const ratio = questionMarkCount / length;
    if (ratio >= 0.15 || questionMarkCount >= 20) {
      warnings.push({
        code: 'high_question_mark_ratio',
        message:
          'A high number of question marks was detected. This can indicate text corruption in some clients.',
        severity: 'low',
      });
    }
  }

  const mojibakeScore = countMatches(normalized, MOJIBAKE_TOKEN_PATTERN);
  if (mojibakeScore >= 3) {
    warnings.push({
      code: 'possible_mojibake',
      message:
        'Text includes sequences commonly seen in mojibake. Verify client encoding (UTF-8 recommended).',
      severity: 'medium',
    });
  }

  return { warnings };
}
