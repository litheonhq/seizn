'use client';

/**
 * Accessibility Hooks
 *
 * React hooks for accessibility features.
 *
 * @module hooks/useA11y
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createFocusTrap,
  announce,
  prefersReducedMotion,
  onReducedMotionChange,
  createRovingTabindex,
} from '@/lib/a11y';

// =============================================================================
// useFocusTrap
// =============================================================================

/**
 * Hook for trapping focus within a container
 *
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   const { containerRef } = useFocusTrap({ enabled: isOpen });
 *
 *   return (
 *     <dialog ref={containerRef} open={isOpen}>
 *       <button onClick={onClose}>Close</button>
 *       <input placeholder="Name" />
 *     </dialog>
 *   );
 * }
 * ```
 */
export function useFocusTrap(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const trapRef = useRef<ReturnType<typeof createFocusTrap> | null>(null);

  useEffect(() => {
    if (!containerRef.current || !enabled) {
      trapRef.current?.deactivate();
      return;
    }

    trapRef.current = createFocusTrap(containerRef.current);
    trapRef.current.activate();

    return () => {
      trapRef.current?.deactivate();
    };
  }, [enabled]);

  return { containerRef };
}

// =============================================================================
// useAnnounce
// =============================================================================

/**
 * Hook for announcing messages to screen readers
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const { announce } = useAnnounce();
 *
 *   const handleSave = async () => {
 *     await save();
 *     announce('Changes saved successfully');
 *   };
 *
 *   return <button onClick={handleSave}>Save</button>;
 * }
 * ```
 */
export function useAnnounce() {
  const announceMessage = useCallback(
    (message: string, politeness: 'polite' | 'assertive' = 'polite') => {
      announce(message, politeness);
    },
    []
  );

  return { announce: announceMessage };
}

// =============================================================================
// useReducedMotion
// =============================================================================

/**
 * Hook for detecting reduced motion preference
 *
 * @example
 * ```tsx
 * function AnimatedComponent() {
 *   const prefersReduced = useReducedMotion();
 *
 *   return (
 *     <motion.div
 *       animate={{ x: 100 }}
 *       transition={{ duration: prefersReduced ? 0 : 0.3 }}
 *     />
 *   );
 * }
 * ```
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => prefersReducedMotion());

  useEffect(() => {
    return onReducedMotionChange(setPrefersReduced);
  }, []);

  return prefersReduced;
}

// =============================================================================
// useRovingTabindex
// =============================================================================

export interface UseRovingTabindexOptions {
  itemCount: number;
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  onSelect?: (index: number) => void;
}

/**
 * Hook for roving tabindex navigation
 *
 * @example
 * ```tsx
 * function TabList({ tabs, onSelect }) {
 *   const { activeIndex, getItemProps } = useRovingTabindex({
 *     itemCount: tabs.length,
 *     orientation: 'horizontal',
 *     onSelect,
 *   });
 *
 *   return (
 *     <div role="tablist">
 *       {tabs.map((tab, index) => (
 *         <button
 *           key={tab.id}
 *           role="tab"
 *           {...getItemProps(index)}
 *         >
 *           {tab.label}
 *         </button>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRovingTabindex(options: UseRovingTabindexOptions) {
  const { itemCount, orientation = 'vertical', loop = true, onSelect } = options;

  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const rovingTabindex = useRef(
    createRovingTabindex(itemCount, {
      initialIndex: 0,
      orientation,
      loop,
      onSelect,
    })
  );

  useEffect(() => {
    const unsubscribe = rovingTabindex.current.subscribe((index) => {
      setActiveIndex(index);
      itemRefs.current[index]?.focus();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const getItemProps = useCallback(
    (index: number) => ({
      ref: (el: HTMLElement | null) => {
        itemRefs.current[index] = el;
      },
      tabIndex: index === activeIndex ? 0 : -1,
      onKeyDown: rovingTabindex.current.handleKeyDown,
      onFocus: () => {
        setActiveIndex(index);
        rovingTabindex.current.setActiveIndex(index);
      },
    }),
    [activeIndex]
  );

  return {
    activeIndex,
    setActiveIndex: (index: number) => {
      setActiveIndex(index);
      rovingTabindex.current.setActiveIndex(index);
    },
    getItemProps,
  };
}

// =============================================================================
// useEscapeKey
// =============================================================================

/**
 * Hook for handling escape key press
 *
 * @example
 * ```tsx
 * function Modal({ onClose }) {
 *   useEscapeKey(onClose);
 *
 *   return <dialog>...</dialog>;
 * }
 * ```
 */
export function useEscapeKey(callback: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        callback();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [callback, enabled]);
}

// =============================================================================
// useAriaLive
// =============================================================================

/**
 * Hook for managing aria-live content
 */
export function useAriaLive(defaultPoliteness: 'polite' | 'assertive' = 'polite') {
  const [message, setMessage] = useState('');

  const setLiveMessage = useCallback(
    (newMessage: string, announce: boolean = true) => {
      setMessage(newMessage);
      if (announce) {
        // Also announce to screen readers
        window.setTimeout(() => setMessage(''), 100);
        window.setTimeout(() => setMessage(newMessage), 150);
      }
    },
    []
  );

  const clearMessage = useCallback(() => {
    setMessage('');
  }, []);

  return {
    message,
    setMessage: setLiveMessage,
    clearMessage,
    ariaProps: {
      role: 'status',
      'aria-live': defaultPoliteness,
      'aria-atomic': true,
    },
  };
}
