/**
 * Math/Equation Extractor
 *
 * Extracts and normalizes mathematical expressions from documents.
 * Supports LaTeX, MathML, and common ASCII math notations.
 */

export type MathFormat = 'latex' | 'mathml' | 'ascii' | 'unicode';

export interface ExtractedEquation {
  id: string;
  page: number;
  lineNumber?: number;
  content: string;
  format: MathFormat;
  normalized: string; // Normalized LaTeX representation
  isInline: boolean;
  isNumbered: boolean;
  equationNumber?: string;
  confidence: number;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  context?: {
    before: string;
    after: string;
  };
}

export interface MathExtractionOptions {
  formats?: MathFormat[];
  extractInline?: boolean;
  extractDisplay?: boolean;
  normalizeToLatex?: boolean;
  includeContext?: boolean;
  contextLength?: number;
}

const DEFAULT_OPTIONS: MathExtractionOptions = {
  formats: ['latex', 'mathml', 'ascii', 'unicode'],
  extractInline: true,
  extractDisplay: true,
  normalizeToLatex: true,
  includeContext: true,
  contextLength: 50,
};

// Common Unicode math symbols and their LaTeX equivalents
const UNICODE_TO_LATEX: Record<string, string> = {
  // Greek letters
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\epsilon',
  'ζ': '\\zeta',
  'η': '\\eta',
  'θ': '\\theta',
  'ι': '\\iota',
  'κ': '\\kappa',
  'λ': '\\lambda',
  'μ': '\\mu',
  'ν': '\\nu',
  'ξ': '\\xi',
  'π': '\\pi',
  'ρ': '\\rho',
  'σ': '\\sigma',
  'τ': '\\tau',
  'υ': '\\upsilon',
  'φ': '\\phi',
  'χ': '\\chi',
  'ψ': '\\psi',
  'ω': '\\omega',
  'Γ': '\\Gamma',
  'Δ': '\\Delta',
  'Θ': '\\Theta',
  'Λ': '\\Lambda',
  'Ξ': '\\Xi',
  'Π': '\\Pi',
  'Σ': '\\Sigma',
  'Φ': '\\Phi',
  'Ψ': '\\Psi',
  'Ω': '\\Omega',
  // Operators
  '×': '\\times',
  '÷': '\\div',
  '±': '\\pm',
  '∓': '\\mp',
  '·': '\\cdot',
  '∗': '\\ast',
  '∘': '\\circ',
  // Relations
  '≤': '\\leq',
  '≥': '\\geq',
  '≠': '\\neq',
  '≈': '\\approx',
  '≡': '\\equiv',
  '∝': '\\propto',
  '≪': '\\ll',
  '≫': '\\gg',
  '∼': '\\sim',
  '≃': '\\simeq',
  // Arrows
  '→': '\\rightarrow',
  '←': '\\leftarrow',
  '↔': '\\leftrightarrow',
  '⇒': '\\Rightarrow',
  '⇐': '\\Leftarrow',
  '⇔': '\\Leftrightarrow',
  '↦': '\\mapsto',
  // Set theory
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊃': '\\supset',
  '⊆': '\\subseteq',
  '⊇': '\\supseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∅': '\\emptyset',
  // Calculus
  '∫': '\\int',
  '∬': '\\iint',
  '∭': '\\iiint',
  '∮': '\\oint',
  '∂': '\\partial',
  '∇': '\\nabla',
  '∞': '\\infty',
  // Sums/Products
  '∑': '\\sum',
  '∏': '\\prod',
  // Logic
  '∀': '\\forall',
  '∃': '\\exists',
  '∧': '\\land',
  '∨': '\\lor',
  '¬': '\\neg',
  '⊤': '\\top',
  '⊥': '\\bot',
  '⊢': '\\vdash',
  '⊨': '\\models',
  // Misc
  '√': '\\sqrt',
  '∠': '\\angle',
  '°': '^\\circ',
  '′': "'",
  '″': "''",
  '‰': '\\permil',
};

// ASCII math patterns
const ASCII_MATH_PATTERNS: Array<{ pattern: RegExp; latex: (match: RegExpMatchArray) => string }> = [
  // Fractions: a/b
  { pattern: /(\d+)\s*\/\s*(\d+)/g, latex: (m) => `\\frac{${m[1]}}{${m[2]}}` },
  // Superscript: x^2, x^{n}
  { pattern: /(\w)\^(\d+|\{[^}]+\})/g, latex: (m) => `${m[1]}^{${m[2].replace(/[{}]/g, '')}}` },
  // Subscript: x_i, x_{ij}
  { pattern: /(\w)_(\d+|\w|\{[^}]+\})/g, latex: (m) => `${m[1]}_{${m[2].replace(/[{}]/g, '')}}` },
  // Square root: sqrt(x)
  { pattern: /sqrt\(([^)]+)\)/gi, latex: (m) => `\\sqrt{${m[1]}}` },
  // Common functions
  { pattern: /\bsin\b/g, latex: () => '\\sin' },
  { pattern: /\bcos\b/g, latex: () => '\\cos' },
  { pattern: /\btan\b/g, latex: () => '\\tan' },
  { pattern: /\bln\b/g, latex: () => '\\ln' },
  { pattern: /\blog\b/g, latex: () => '\\log' },
  { pattern: /\bexp\b/g, latex: () => '\\exp' },
  { pattern: /\blim\b/g, latex: () => '\\lim' },
  { pattern: /\bsum\b/gi, latex: () => '\\sum' },
  { pattern: /\bprod\b/gi, latex: () => '\\prod' },
  { pattern: /\bint\b/gi, latex: () => '\\int' },
];

/**
 * Extract LaTeX equations from text
 */
export function extractLatexEquations(
  text: string,
  page: number = 1,
  options: MathExtractionOptions = DEFAULT_OPTIONS
): ExtractedEquation[] {
  const equations: ExtractedEquation[] = [];
  const lines = text.split('\n');

  // Display math: $$ ... $$ or \[ ... \]
  if (options.extractDisplay !== false) {
    // Double dollar sign
    const displayDollarRegex = /\$\$([\s\S]*?)\$\$/g;
    let match;

    while ((match = displayDollarRegex.exec(text)) !== null) {
      const lineNumber = getLineNumber(text, match.index);
      equations.push({
        id: `eq_${page}_${equations.length}`,
        page,
        lineNumber,
        content: match[0],
        format: 'latex',
        normalized: normalizeLatex(match[1]),
        isInline: false,
        isNumbered: false,
        confidence: 0.95,
        context: options.includeContext
          ? getContext(text, match.index, match[0].length, options.contextLength ?? 50)
          : undefined,
      });
    }

    // Bracket notation \[ ... \]
    const bracketRegex = /\\\[([\s\S]*?)\\\]/g;
    while ((match = bracketRegex.exec(text)) !== null) {
      const lineNumber = getLineNumber(text, match.index);
      equations.push({
        id: `eq_${page}_${equations.length}`,
        page,
        lineNumber,
        content: match[0],
        format: 'latex',
        normalized: normalizeLatex(match[1]),
        isInline: false,
        isNumbered: false,
        confidence: 0.95,
        context: options.includeContext
          ? getContext(text, match.index, match[0].length, options.contextLength ?? 50)
          : undefined,
      });
    }

    // Equation environments: \begin{equation} ... \end{equation}
    const envRegex = /\\begin\{(equation|align|gather|multline)\*?\}([\s\S]*?)\\end\{\1\*?\}/g;
    while ((match = envRegex.exec(text)) !== null) {
      const lineNumber = getLineNumber(text, match.index);
      const isNumbered = !match[1].endsWith('*');

      // Extract equation number if present
      const eqNumMatch = match[2].match(/\\tag\{([^}]+)\}/);

      equations.push({
        id: `eq_${page}_${equations.length}`,
        page,
        lineNumber,
        content: match[0],
        format: 'latex',
        normalized: normalizeLatex(match[2]),
        isInline: false,
        isNumbered,
        equationNumber: eqNumMatch?.[1],
        confidence: 0.98,
        context: options.includeContext
          ? getContext(text, match.index, match[0].length, options.contextLength ?? 50)
          : undefined,
      });
    }
  }

  // Inline math: $ ... $ or \( ... \)
  if (options.extractInline !== false) {
    // Single dollar sign (not double)
    const inlineDollarRegex = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+)\$(?!\$)/g;
    let match;

    while ((match = inlineDollarRegex.exec(text)) !== null) {
      const lineNumber = getLineNumber(text, match.index);
      equations.push({
        id: `eq_${page}_${equations.length}`,
        page,
        lineNumber,
        content: match[0],
        format: 'latex',
        normalized: normalizeLatex(match[1]),
        isInline: true,
        isNumbered: false,
        confidence: 0.9,
        context: options.includeContext
          ? getContext(text, match.index, match[0].length, options.contextLength ?? 50)
          : undefined,
      });
    }

    // Parenthesis notation \( ... \)
    const parenRegex = /\\\(((?:[^\\]|\\.)*?)\\\)/g;
    while ((match = parenRegex.exec(text)) !== null) {
      const lineNumber = getLineNumber(text, match.index);
      equations.push({
        id: `eq_${page}_${equations.length}`,
        page,
        lineNumber,
        content: match[0],
        format: 'latex',
        normalized: normalizeLatex(match[1]),
        isInline: true,
        isNumbered: false,
        confidence: 0.92,
        context: options.includeContext
          ? getContext(text, match.index, match[0].length, options.contextLength ?? 50)
          : undefined,
      });
    }
  }

  return equations;
}

/**
 * Extract Unicode math expressions
 */
export function extractUnicodeMath(
  text: string,
  page: number = 1,
  options: MathExtractionOptions = DEFAULT_OPTIONS
): ExtractedEquation[] {
  const equations: ExtractedEquation[] = [];

  // Look for sequences containing multiple math symbols
  const mathSymbolPattern = new RegExp(
    `[${Object.keys(UNICODE_TO_LATEX).join('')}]+[^\\s]*[${Object.keys(UNICODE_TO_LATEX).join('')}]*`,
    'g'
  );

  let match;
  while ((match = mathSymbolPattern.exec(text)) !== null) {
    // Filter out single-symbol matches that are likely not equations
    const symbolCount = match[0].split('').filter((c) => c in UNICODE_TO_LATEX).length;

    if (symbolCount >= 2 || match[0].length >= 3) {
      const lineNumber = getLineNumber(text, match.index);

      equations.push({
        id: `eq_${page}_${equations.length}`,
        page,
        lineNumber,
        content: match[0],
        format: 'unicode',
        normalized: options.normalizeToLatex !== false ? unicodeToLatex(match[0]) : match[0],
        isInline: true,
        isNumbered: false,
        confidence: 0.7,
        context: options.includeContext
          ? getContext(text, match.index, match[0].length, options.contextLength ?? 50)
          : undefined,
      });
    }
  }

  return equations;
}

/**
 * Extract ASCII math notation
 */
export function extractAsciiMath(
  text: string,
  page: number = 1,
  options: MathExtractionOptions = DEFAULT_OPTIONS
): ExtractedEquation[] {
  const equations: ExtractedEquation[] = [];

  // Look for common math patterns
  // Expression with operators and variables: ax^2 + bx + c = 0
  const mathExprPattern = /[a-zA-Z]\s*[*+\-/^=]\s*[a-zA-Z0-9]+(?:\s*[*+\-/^=]\s*[a-zA-Z0-9]+)*/g;

  let match;
  while ((match = mathExprPattern.exec(text)) !== null) {
    // Skip if it looks like regular text
    const expr = match[0].trim();
    if (expr.length < 5) continue;
    if (!/[=^*/]/.test(expr) && !/\d/.test(expr)) continue;

    const lineNumber = getLineNumber(text, match.index);

    equations.push({
      id: `eq_${page}_${equations.length}`,
      page,
      lineNumber,
      content: expr,
      format: 'ascii',
      normalized: options.normalizeToLatex !== false ? asciiToLatex(expr) : expr,
      isInline: true,
      isNumbered: false,
      confidence: 0.5,
      context: options.includeContext
        ? getContext(text, match.index, match[0].length, options.contextLength ?? 50)
        : undefined,
    });
  }

  return equations;
}

/**
 * Extract all math from text
 */
export function extractAllMath(
  text: string,
  page: number = 1,
  options: MathExtractionOptions = DEFAULT_OPTIONS
): ExtractedEquation[] {
  const allEquations: ExtractedEquation[] = [];
  const formats = options.formats ?? ['latex', 'mathml', 'ascii', 'unicode'];

  if (formats.includes('latex')) {
    allEquations.push(...extractLatexEquations(text, page, options));
  }

  if (formats.includes('unicode')) {
    allEquations.push(...extractUnicodeMath(text, page, options));
  }

  if (formats.includes('ascii')) {
    // Only extract ASCII if we didn't find LaTeX (ASCII is lowest confidence)
    const latexCount = allEquations.filter((e) => e.format === 'latex').length;
    if (latexCount === 0) {
      allEquations.push(...extractAsciiMath(text, page, options));
    }
  }

  // Remove duplicates (same content at same position)
  const seen = new Set<string>();
  return allEquations.filter((eq) => {
    const key = `${eq.page}:${eq.lineNumber}:${eq.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Normalize LaTeX expression
 */
function normalizeLatex(latex: string): string {
  let result = latex.trim();

  // Remove excessive whitespace
  result = result.replace(/\s+/g, ' ');

  // Normalize common variations
  result = result.replace(/\\left\s*\(/g, '\\left(');
  result = result.replace(/\\right\s*\)/g, '\\right)');

  // Remove comments
  result = result.replace(/%[^\n]*/g, '');

  return result.trim();
}

/**
 * Convert Unicode math to LaTeX
 */
function unicodeToLatex(unicode: string): string {
  let result = unicode;

  for (const [symbol, latex] of Object.entries(UNICODE_TO_LATEX)) {
    result = result.replace(new RegExp(symbol, 'g'), latex + ' ');
  }

  // Clean up extra spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Convert ASCII math to LaTeX
 */
function asciiToLatex(ascii: string): string {
  let result = ascii;

  for (const { pattern, latex } of ASCII_MATH_PATTERNS) {
    let match;
    const newPattern = new RegExp(pattern.source, pattern.flags);

    while ((match = newPattern.exec(result)) !== null) {
      const replacement = latex(match);
      result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
    }
  }

  return result;
}

/**
 * Get line number from character index
 */
function getLineNumber(text: string, charIndex: number): number {
  const beforeText = text.slice(0, charIndex);
  return beforeText.split('\n').length;
}

/**
 * Get context around a match
 */
function getContext(
  text: string,
  matchIndex: number,
  matchLength: number,
  contextLength: number
): { before: string; after: string } {
  const before = text.slice(Math.max(0, matchIndex - contextLength), matchIndex).trim();
  const after = text.slice(matchIndex + matchLength, matchIndex + matchLength + contextLength).trim();

  return { before, after };
}

/**
 * Validate LaTeX syntax (basic check)
 */
export function validateLatex(latex: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check balanced braces
  let braceCount = 0;
  for (const char of latex) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (braceCount < 0) {
      errors.push('Unbalanced braces: extra closing brace');
      break;
    }
  }
  if (braceCount > 0) {
    errors.push(`Unbalanced braces: ${braceCount} unclosed brace(s)`);
  }

  // Check \begin/\end matching
  const beginMatches = latex.match(/\\begin\{(\w+)\}/g) ?? [];
  const endMatches = latex.match(/\\end\{(\w+)\}/g) ?? [];

  if (beginMatches.length !== endMatches.length) {
    errors.push('Mismatched \\begin/\\end environments');
  }

  // Check for common errors
  if (/\\[a-zA-Z]+\{[^}]*$/.test(latex)) {
    errors.push('Incomplete command: missing closing brace');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert equation to searchable text
 */
export function equationToSearchText(equation: ExtractedEquation): string {
  const { normalized, context } = equation;

  // Convert LaTeX to readable form
  let readable = normalized
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\^(\{[^}]*\}|\d)/g, '^$1')
    .replace(/_(\{[^}]*\}|\d)/g, '_$1')
    .replace(/\\(alpha|beta|gamma|delta|theta|pi|sigma|omega)/gi, '$1')
    .replace(/\\(sin|cos|tan|log|ln|exp|lim|sum|prod|int)/g, '$1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Add context if available
  if (context) {
    readable = `${context.before} ${readable} ${context.after}`;
  }

  return readable;
}
