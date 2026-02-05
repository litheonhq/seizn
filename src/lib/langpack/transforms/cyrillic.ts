/**
 * Cyrillic Transliteration Transform
 *
 * Handles transliteration between Cyrillic and Latin scripts.
 * Primarily targets Ukrainian, but supports Russian as well.
 *
 * Uses Ukrainian national romanization standard (KMU 2010)
 * for Ukrainian, and ISO 9 for other Cyrillic scripts.
 *
 * @module lib/langpack/transforms/cyrillic
 */

// =============================================================================
// Ukrainian Cyrillic → Latin Mapping (KMU 2010 standard)
// =============================================================================

const UK_CYRILLIC_TO_LATIN: Record<string, string> = {
  'А': 'A', 'а': 'a',
  'Б': 'B', 'б': 'b',
  'В': 'V', 'в': 'v',
  'Г': 'H', 'г': 'h',
  'Ґ': 'G', 'ґ': 'g',
  'Д': 'D', 'д': 'd',
  'Е': 'E', 'е': 'e',
  'Є': 'Ye', 'є': 'ye',
  'Ж': 'Zh', 'ж': 'zh',
  'З': 'Z', 'з': 'z',
  'И': 'Y', 'и': 'y',
  'І': 'I', 'і': 'i',
  'Ї': 'Yi', 'ї': 'yi',
  'Й': 'Y', 'й': 'y',
  'К': 'K', 'к': 'k',
  'Л': 'L', 'л': 'l',
  'М': 'M', 'м': 'm',
  'Н': 'N', 'н': 'n',
  'О': 'O', 'о': 'o',
  'П': 'P', 'п': 'p',
  'Р': 'R', 'р': 'r',
  'С': 'S', 'с': 's',
  'Т': 'T', 'т': 't',
  'У': 'U', 'у': 'u',
  'Ф': 'F', 'ф': 'f',
  'Х': 'Kh', 'х': 'kh',
  'Ц': 'Ts', 'ц': 'ts',
  'Ч': 'Ch', 'ч': 'ch',
  'Ш': 'Sh', 'ш': 'sh',
  'Щ': 'Shch', 'щ': 'shch',
  'Ю': 'Yu', 'ю': 'yu',
  'Я': 'Ya', 'я': 'ya',
  // Soft/hard sign — omitted in romanization
  'Ь': '', 'ь': '',
  // Apostrophe (Ukrainian uses this)
  '\u2019': '',
  '\u0027': '',
};

// =============================================================================
// Russian Cyrillic → Latin Mapping (ISO 9 simplified)
// =============================================================================

const RU_CYRILLIC_TO_LATIN: Record<string, string> = {
  'А': 'A', 'а': 'a',
  'Б': 'B', 'б': 'b',
  'В': 'V', 'в': 'v',
  'Г': 'G', 'г': 'g',
  'Д': 'D', 'д': 'd',
  'Е': 'Ye', 'е': 'ye',
  'Ё': 'Yo', 'ё': 'yo',
  'Ж': 'Zh', 'ж': 'zh',
  'З': 'Z', 'з': 'z',
  'И': 'I', 'и': 'i',
  'Й': 'Y', 'й': 'y',
  'К': 'K', 'к': 'k',
  'Л': 'L', 'л': 'l',
  'М': 'M', 'м': 'm',
  'Н': 'N', 'н': 'n',
  'О': 'O', 'о': 'o',
  'П': 'P', 'п': 'p',
  'Р': 'R', 'р': 'r',
  'С': 'S', 'с': 's',
  'Т': 'T', 'т': 't',
  'У': 'U', 'у': 'u',
  'Ф': 'F', 'ф': 'f',
  'Х': 'Kh', 'х': 'kh',
  'Ц': 'Ts', 'ц': 'ts',
  'Ч': 'Ch', 'ч': 'ch',
  'Ш': 'Sh', 'ш': 'sh',
  'Щ': 'Shch', 'щ': 'shch',
  'Ъ': '', 'ъ': '',
  'Ы': 'Y', 'ы': 'y',
  'Ь': '', 'ь': '',
  'Э': 'E', 'э': 'e',
  'Ю': 'Yu', 'ю': 'yu',
  'Я': 'Ya', 'я': 'ya',
};

// =============================================================================
// Transliteration Functions
// =============================================================================

/**
 * Transliterate Ukrainian Cyrillic to Latin script (KMU 2010)
 */
export function ukrainianToLatin(text: string): string {
  let result = '';
  for (const char of text) {
    result += UK_CYRILLIC_TO_LATIN[char] ?? char;
  }
  return result;
}

/**
 * Transliterate Russian Cyrillic to Latin script (ISO 9 simplified)
 */
export function russianToLatin(text: string): string {
  let result = '';
  for (const char of text) {
    result += RU_CYRILLIC_TO_LATIN[char] ?? char;
  }
  return result;
}

/**
 * Transliterate Cyrillic to Latin, auto-detecting Ukrainian vs Russian.
 *
 * Ukrainian-specific characters: Ґ, Є, І, Ї
 * Russian-specific characters: Ё, Ы, Э, Ъ
 */
export function cyrillicToLatin(text: string, language?: string): string {
  if (language === 'uk') return ukrainianToLatin(text);
  if (language === 'ru') return russianToLatin(text);

  // Auto-detect based on unique characters
  const hasUkrainianChars = /[ҐґЄєІіЇї]/.test(text);
  const hasRussianChars = /[ЁёЫыЭэЪъ]/.test(text);

  if (hasUkrainianChars && !hasRussianChars) {
    return ukrainianToLatin(text);
  }

  // Default to Russian romanization
  return russianToLatin(text);
}

/**
 * Check if text contains Cyrillic characters
 */
export function containsCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

/**
 * Detect if Cyrillic text is Ukrainian or Russian
 */
export function detectCyrillicLanguage(text: string): 'uk' | 'ru' | 'unknown' {
  const hasUkrainianChars = /[ҐґЄєІіЇї]/.test(text);
  const hasRussianChars = /[ЁёЫыЭэЪъ]/.test(text);

  if (hasUkrainianChars && !hasRussianChars) return 'uk';
  if (hasRussianChars && !hasUkrainianChars) return 'ru';
  return 'unknown';
}

/**
 * Generate variants for cross-script search.
 * Given Cyrillic text, returns the romanized form.
 */
export function getCyrillicVariants(text: string, language?: string): {
  cyrillic: string;
  romanized: string;
} {
  if (containsCyrillic(text)) {
    return {
      cyrillic: text,
      romanized: cyrillicToLatin(text, language),
    };
  }

  return {
    cyrillic: '',
    romanized: text,
  };
}
