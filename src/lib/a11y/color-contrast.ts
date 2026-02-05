/**
 * Color Contrast
 *
 * Utilities for checking WCAG color contrast requirements.
 *
 * @module lib/a11y/color-contrast
 * @deprecated UNUSED - This module is exported but not currently used in the codebase.
 * Consider integrating into theme system or removing if not needed.
 * Code quality audit: 2026-02-05
 */

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculate relative luminance of a color
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
export function getContrastRatio(
  color1: string | { r: number; g: number; b: number },
  color2: string | { r: number; g: number; b: number }
): number {
  const rgb1 = typeof color1 === 'string' ? hexToRgb(color1) : color1;
  const rgb2 = typeof color2 === 'string' ? hexToRgb(color2) : color2;

  if (!rgb1 || !rgb2) return 0;

  const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG contrast requirements
 */
export const WCAG_REQUIREMENTS = {
  // Normal text
  AA_NORMAL: 4.5,
  AAA_NORMAL: 7,
  // Large text (18pt+ or 14pt+ bold)
  AA_LARGE: 3,
  AAA_LARGE: 4.5,
  // UI components and graphics
  AA_UI: 3,
} as const;

/**
 * Check if contrast meets WCAG requirements
 */
export function meetsContrastRequirement(
  foreground: string,
  background: string,
  level: keyof typeof WCAG_REQUIREMENTS = 'AA_NORMAL'
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= WCAG_REQUIREMENTS[level];
}

/**
 * Get WCAG compliance level for a color pair
 */
export function getContrastCompliance(
  foreground: string,
  background: string
): {
  ratio: number;
  normalAA: boolean;
  normalAAA: boolean;
  largeAA: boolean;
  largeAAA: boolean;
  uiAA: boolean;
} {
  const ratio = getContrastRatio(foreground, background);

  return {
    ratio,
    normalAA: ratio >= WCAG_REQUIREMENTS.AA_NORMAL,
    normalAAA: ratio >= WCAG_REQUIREMENTS.AAA_NORMAL,
    largeAA: ratio >= WCAG_REQUIREMENTS.AA_LARGE,
    largeAAA: ratio >= WCAG_REQUIREMENTS.AAA_LARGE,
    uiAA: ratio >= WCAG_REQUIREMENTS.AA_UI,
  };
}

/**
 * Find a color with sufficient contrast
 */
export function findAccessibleColor(
  targetColor: string,
  backgroundColor: string,
  options: { minRatio?: number; preferLight?: boolean } = {}
): string {
  const { minRatio = WCAG_REQUIREMENTS.AA_NORMAL, preferLight = false } = options;

  const rgb = hexToRgb(targetColor);
  if (!rgb) return targetColor;

  // If already meets requirement, return as-is
  if (getContrastRatio(targetColor, backgroundColor) >= minRatio) {
    return targetColor;
  }

  // Adjust lightness until we meet requirement
  let { r, g, b } = rgb;
  const step = preferLight ? 5 : -5;

  for (let i = 0; i < 50; i++) {
    r = Math.max(0, Math.min(255, r + step));
    g = Math.max(0, Math.min(255, g + step));
    b = Math.max(0, Math.min(255, b + step));

    const newColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    if (getContrastRatio(newColor, backgroundColor) >= minRatio) {
      return newColor;
    }
  }

  // Fallback to black or white
  const blackContrast = getContrastRatio('#000000', backgroundColor);
  const whiteContrast = getContrastRatio('#ffffff', backgroundColor);

  return blackContrast > whiteContrast ? '#000000' : '#ffffff';
}
