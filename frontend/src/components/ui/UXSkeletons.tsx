import type { Key, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface MotionCrossfadeProps {
  stateKey: Key;
  children: ReactNode;
  className?: string;
  mode?: 'sync' | 'wait';
}

/** Keeps loading and loaded states in the same motion boundary for a clean handoff. */
export function MotionCrossfade({
  stateKey,
  children,
  className,
  mode = 'wait',
}: MotionCrossfadeProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false} mode={mode}>
      <motion.div
        key={stateKey}
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: shouldReduceMotion ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.1,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function SkeletonPulse({ className }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={shouldReduceMotion ? { opacity: 0.5 } : { opacity: [0.35, 0.65, 0.35] }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      className={`bg-white/10 dark:bg-white/5 backdrop-blur-md rounded-lg ${className}`}
    />
  );
}

export function BriefingSkeleton() {
  return (
    <div className="space-y-6 p-6 border border-white/10 rounded-2xl bg-slate-900/50 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="space-y-2">
          <SkeletonPulse className="h-8 w-48" />
          <SkeletonPulse className="h-4 w-32" />
        </div>
        <SkeletonPulse className="h-10 w-24" />
      </div>
      
      <div className="space-y-4">
        <SkeletonPulse className="h-6 w-full" />
        <SkeletonPulse className="h-4 w-[90%]" />
        <SkeletonPulse className="h-4 w-[95%]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        <div className="p-4 rounded-xl border border-white/5 bg-white/5 space-y-3">
          <SkeletonPulse className="h-5 w-36" />
          <div className="space-y-2">
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-4 w-[80%]" />
          </div>
        </div>
        <div className="p-4 rounded-xl border border-white/5 bg-white/5 space-y-3">
          <SkeletonPulse className="h-5 w-36" />
          <div className="space-y-2">
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-4 w-[85%]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 border border-white/5 rounded-xl bg-slate-900/30 backdrop-blur-md">
      <div className="flex items-center space-x-3 w-2/3">
        <SkeletonPulse className="h-5 w-5 rounded-md flex-shrink-0" />
        <div className="space-y-2 w-full">
          <SkeletonPulse className="h-5 w-[60%]" />
          <SkeletonPulse className="h-3 w-[40%]" />
        </div>
      </div>
      <div className="flex space-x-2">
        <SkeletonPulse className="h-6 w-16 rounded-full" />
        <SkeletonPulse className="h-6 w-12 rounded-full" />
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4 p-4 border border-white/10 rounded-2xl bg-slate-900/50 backdrop-blur-xl">
      <div className="flex items-center justify-between pb-2">
        <SkeletonPulse className="h-8 w-36" />
        <div className="flex space-x-2">
          <SkeletonPulse className="h-9 w-20" />
          <SkeletonPulse className="h-9 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonPulse className="h-6 w-full" />
            <div className="space-y-2 h-96 border border-white/5 rounded-lg p-1 bg-white/5">
              {i % 2 === 0 && <SkeletonPulse className="h-24 w-full" />}
              {i % 3 === 1 && <SkeletonPulse className="h-16 w-full" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-6 border border-white/10 rounded-2xl bg-slate-900/50 backdrop-blur-xl space-y-4">
              <SkeletonPulse className="h-5 w-24" />
              <SkeletonPulse className="h-10 w-16" />
            </div>
            <div className="p-6 border border-white/10 rounded-2xl bg-slate-900/50 backdrop-blur-xl space-y-4">
              <SkeletonPulse className="h-5 w-32" />
              <SkeletonPulse className="h-10 w-16" />
            </div>
          </div>
          <div className="p-6 border border-white/10 rounded-2xl bg-slate-900/50 backdrop-blur-xl space-y-4">
            <SkeletonPulse className="h-6 w-32" />
            <div className="space-y-2">
              <TaskSkeleton />
              <TaskSkeleton />
              <TaskSkeleton />
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="p-6 border border-white/10 rounded-2xl bg-slate-900/50 backdrop-blur-xl flex flex-col items-center justify-center space-y-4 h-64">
            <SkeletonPulse className="h-28 w-28 rounded-full" />
            <SkeletonPulse className="h-4 w-32" />
          </div>
          <div className="p-6 border border-white/10 rounded-2xl bg-slate-900/50 backdrop-blur-xl space-y-4">
            <SkeletonPulse className="h-6 w-28" />
            <SkeletonPulse className="h-20 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
