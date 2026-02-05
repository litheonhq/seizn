/**
 * Live Announcer
 *
 * Announces messages to screen readers via aria-live regions.
 *
 * @module lib/a11y/announcer
 */

type Politeness = 'polite' | 'assertive' | 'off';

let politeAnnouncer: HTMLElement | null = null;
let assertiveAnnouncer: HTMLElement | null = null;

/**
 * Create aria-live region
 */
function createAnnouncer(politeness: 'polite' | 'assertive'): HTMLElement {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', politeness);
  announcer.setAttribute('aria-atomic', 'true');

  // Visually hidden but accessible to screen readers
  Object.assign(announcer.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });

  document.body.appendChild(announcer);
  return announcer;
}

/**
 * Get or create announcer
 */
function getAnnouncer(politeness: 'polite' | 'assertive'): HTMLElement {
  if (politeness === 'assertive') {
    if (!assertiveAnnouncer) {
      assertiveAnnouncer = createAnnouncer('assertive');
    }
    return assertiveAnnouncer;
  }

  if (!politeAnnouncer) {
    politeAnnouncer = createAnnouncer('polite');
  }
  return politeAnnouncer;
}

/**
 * Announce a message to screen readers
 *
 * @example
 * ```ts
 * announce('Item saved successfully');
 * announce('Error: Please fill in all required fields', 'assertive');
 * ```
 */
export function announce(message: string, politeness: Politeness = 'polite'): void {
  if (politeness === 'off') return;

  const announcer = getAnnouncer(politeness);

  // Clear previous message
  announcer.textContent = '';

  // Set new message after a small delay to ensure it's announced
  setTimeout(() => {
    announcer.textContent = message;
  }, 50);
}

/**
 * Clear announcement
 */
export function clearAnnouncement(politeness?: 'polite' | 'assertive'): void {
  if (!politeness || politeness === 'polite') {
    if (politeAnnouncer) politeAnnouncer.textContent = '';
  }
  if (!politeness || politeness === 'assertive') {
    if (assertiveAnnouncer) assertiveAnnouncer.textContent = '';
  }
}

/**
 * Create announcer context for React
 */
export function createAnnouncerContext() {
  return {
    announce,
    clearAnnouncement,
  };
}

/**
 * Cleanup announcers (call on unmount)
 */
export function cleanupAnnouncers(): void {
  if (politeAnnouncer) {
    document.body.removeChild(politeAnnouncer);
    politeAnnouncer = null;
  }
  if (assertiveAnnouncer) {
    document.body.removeChild(assertiveAnnouncer);
    assertiveAnnouncer = null;
  }
}
