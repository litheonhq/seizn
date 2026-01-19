/**
 * Clipboard utility with fallback for Linux browser compatibility
 * Supports: Chrome/Chromium, Firefox on Windows/macOS/Linux
 */

export type CopyResult = {
  success: boolean;
  method: 'clipboard-api' | 'execCommand' | 'manual';
  error?: string;
};

/**
 * Copy text to clipboard with progressive fallback
 * 1. navigator.clipboard.writeText (modern, requires HTTPS/focus)
 * 2. document.execCommand('copy') (legacy fallback)
 * 3. Returns manual copy instruction if both fail
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  // Method 1: Modern Clipboard API (preferred)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, method: 'clipboard-api' };
    } catch (err) {
      // Clipboard API failed (permission denied, not focused, etc.)
      console.warn('Clipboard API failed, trying fallback:', err);
    }
  }

  // Method 2: Legacy execCommand fallback
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;

    // Prevent scrolling to bottom of page
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (successful) {
      return { success: true, method: 'execCommand' };
    }
  } catch (err) {
    console.warn('execCommand fallback failed:', err);
  }

  // Method 3: Return manual instruction
  return {
    success: false,
    method: 'manual',
    error: 'Clipboard access denied. Please copy manually using Ctrl+C / Cmd+C',
  };
}

/**
 * Hook-friendly clipboard copy with toast notification support
 */
export async function copyWithFeedback(
  text: string,
  options?: {
    onSuccess?: (method: CopyResult['method']) => void;
    onError?: (error: string) => void;
  }
): Promise<boolean> {
  const result = await copyToClipboard(text);

  if (result.success) {
    options?.onSuccess?.(result.method);
    return true;
  } else {
    options?.onError?.(result.error || 'Copy failed');
    return false;
  }
}

/**
 * Detect if the current platform is macOS (for keyboard shortcut display)
 */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/**
 * Get the appropriate modifier key label for the current platform
 */
export function getModifierKey(): 'Cmd' | 'Ctrl' {
  return isMacOS() ? 'Cmd' : 'Ctrl';
}

/**
 * Get keyboard shortcut string for display (e.g., "Ctrl+C" or "⌘C")
 */
export function getKeyboardShortcut(key: string, useSymbol = false): string {
  const isMac = isMacOS();
  if (useSymbol) {
    return isMac ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
  }
  return isMac ? `Cmd+${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}
