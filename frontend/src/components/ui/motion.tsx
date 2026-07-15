import { Children, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { quietEase } from './motion-config';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  amount?: number;
  once?: boolean;
  y?: number;
}

interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  maxDelay?: number;
}

/** Coordinates a short cascade across a small, related set of cards. */
export function StaggerGroup({
  children,
  className,
  delay = 0.04,
  stagger = 0.05,
  maxDelay = 0.24,
}: StaggerGroupProps) {
  const shouldReduceMotion = useReducedMotion();
  const childCount = Children.count(children);
  const boundedStagger = childCount > 1 ? Math.min(stagger, maxDelay / (childCount - 1)) : 0;

  return (
    <motion.div
      variants={{
        hidden: {},
        visible: {
          transition: shouldReduceMotion
            ? { delayChildren: 0, staggerChildren: 0 }
            : { delayChildren: delay, staggerChildren: boundedStagger },
        },
      }}
      initial={shouldReduceMotion ? false : 'hidden'}
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  layout?: boolean | 'position' | 'size' | 'preserve-aspect';
}

export function StaggerItem({ children, className, layout }: StaggerItemProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      layout={layout}
      variants={{
        hidden: shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: quietEase },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Reveals a major section once it enters the viewport. Keep this at section
 * level so dense controls and table rows remain visually stable.
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  amount = 0.18,
  once = true,
  y = 12,
}: ScrollRevealProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount, margin: '0px 0px -8% 0px' }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.36, delay, ease: quietEase }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface MotionCollapseProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  motionKey?: string;
}

/** Smoothly mounts and unmounts expandable UI without leaving dead space. */
export function MotionCollapse({
  open,
  children,
  className,
  contentClassName,
  motionKey = 'motion-collapse-content',
}: MotionCollapseProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key={motionKey}
          initial={shouldReduceMotion ? false : { opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.24, ease: quietEase }}
          className={cn('overflow-hidden', className)}
        >
          <div className={contentClassName}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface MotionModalProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  onBackdropClick?: () => void;
  label?: string;
}

/** Shared backdrop/panel entrance for the remaining page-owned modals. */
export function MotionModal({
  open,
  children,
  className,
  onBackdropClick,
  label,
}: MotionModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onBackdropClick);

  useEffect(() => {
    closeRef.current = onBackdropClick;
  }, [onBackdropClick]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
      );
      (firstFocusable ?? panelRef.current)?.focus();
    }, shouldReduceMotion ? 0 : 80);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, shouldReduceMotion]);

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn('fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md', className)}
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
          onClick={onBackdropClick}
          role="presentation"
        >
          <motion.div
            ref={panelRef}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, ease: quietEase }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
