import type { TimeBlock } from '@/types/timeblock';
import { TimeBlockCard } from './TimeBlockCard';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { quietEase } from '@/components/ui/motion-config';

interface TimeBlockGridProps {
  timeBlocks: TimeBlock[];
  onBlockClick: (block: TimeBlock) => void;
  onCellClick: (date: Date) => void;
  currentDate: Date;
  density?: 'comfort' | 'compact';
}

export function TimeBlockGrid({
  timeBlocks,
  onBlockClick,
  onCellClick,
  currentDate,
  density = 'comfort',
}: TimeBlockGridProps) {
  const shouldReduceMotion = useReducedMotion();
  // Hours to show in calendar (8 AM to 8 PM)
  const startHour = 8;
  const endHour = 20;
  const totalHours = endHour - startHour;
  const hours = Array.from({ length: totalHours }, (_, i) => startHour + i);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cellHeight = density === 'compact' ? 56 : 80;
  const cellHeightClass = density === 'compact' ? 'h-14' : 'h-20';

  // Generate days of the currently viewed week (Monday to Sunday)
  const monday = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const now = useMemo(() => new Date(), []);
  const todayColumnIndex = weekDays.findIndex((day) => isSameDay(day, now));
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const showCurrentTime = todayColumnIndex !== -1 && currentHour >= startHour && currentHour <= endHour;
  const currentTimeTop = ((currentHour - startHour) / totalHours) * 100;

  useEffect(() => {
    if (!scrollContainerRef.current) {
      return;
    }

    const currentHourOffset = Math.max(0, currentHour - startHour - 1);
    scrollContainerRef.current.scrollTo({
      top: currentHourOffset * cellHeight,
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
    });
  }, [cellHeight, currentDate, currentHour, shouldReduceMotion]);

  // Position helpers
  const getPositionStyles = (block: TimeBlock) => {
    const start = new Date(block.start_time);
    const end = new Date(block.end_time);
    
    // Find matching day column index (0-6 for Mon-Sun)
    const dayIndex = weekDays.findIndex((d) => isSameDay(d, start));
    if (dayIndex === -1) return null; // block not in current week

    const startHr = start.getHours() + start.getMinutes() / 60;
    const endHr = end.getHours() + end.getMinutes() / 60;

    // Filter blocks outside visible range
    if (startHr >= endHour || endHr <= startHour) return null;

    const boundedStart = Math.max(startHour, startHr);
    const boundedEnd = Math.min(endHour, endHr);
    const duration = boundedEnd - boundedStart;

    // Calculation percentage positions
    const top = ((boundedStart - startHour) / totalHours) * 100;
    const height = (duration / totalHours) * 100;
    const left = (dayIndex / 7) * 100;
    const width = 100 / 7;

    return {
      top: `${top}%`,
      height: `${height}%`,
      left: `calc(${left}% + 4px)`,
      width: `calc(${width}% - 8px)`,
    };
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
      {/* Week column headers */}
      <div className="grid grid-cols-8 border-b border-white/10 bg-slate-950/60 py-3">
        {/* Empty space for hours column */}
        <div className="text-center" />
        
        {weekDays.map((day, idx) => (
          <div key={idx} className="flex flex-col items-center justify-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              {format(day, 'EEE')}
            </span>
            <span className={cn(
              "text-sm font-black mt-1 w-7 h-7 flex items-center justify-center rounded-full leading-none",
              isSameDay(day, new Date()) 
                ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20" 
                : "text-white"
            )}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* Grid Canvas area */}
      <div ref={scrollContainerRef} className="flex flex-1 overflow-y-auto relative h-[600px] min-h-[500px] scroll-smooth">
        {/* Hour label list */}
        <div className="w-[12.5%] flex flex-col border-r border-white/5 bg-slate-950/20 select-none">
          {hours.map((hour) => (
            <div 
              key={hour} 
              className={`${cellHeightClass} border-b border-white/5 flex items-start justify-center pr-3 pt-2 text-[9px] font-black text-slate-500 tracking-wider uppercase`}
            >
              {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
            </div>
          ))}
        </div>

        {/* Grid cells area */}
        <div className="flex-1 relative grid grid-cols-7" style={{ height: hours.length * cellHeight }}>
          {/* Day columns */}
          {weekDays.map((day, colIdx) => (
            <div key={colIdx} className="relative border-r border-white/5 h-full last:border-r-0">
              {hours.map((hour) => {
                const cellDate = new Date(day);
                cellDate.setHours(hour, 0, 0, 0);

                return (
                  <div
                    key={hour}
                    onClick={() => onCellClick(cellDate)}
                    className={`${cellHeightClass} border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group flex items-center justify-center`}
                  >
                    {/* Hover addition label hint */}
                    <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition scale-95 hover:scale-100">
                      + Add
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Absolute time block overlays */}
          <div className="absolute inset-0 pointer-events-none">
            {showCurrentTime && (
              <div
                className="absolute z-20 h-px bg-cyan-300/80 shadow-[0_0_12px_rgba(103,232,249,0.6)]"
                style={{
                  top: `${currentTimeTop}%`,
                  left: `calc(${(todayColumnIndex / 7) * 100}% + 4px)`,
                  width: `calc(${100 / 7}% - 8px)`,
                }}
              >
                <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
              </div>
            )}

            <AnimatePresence initial={false}>
            {timeBlocks.map((block) => {
              const style = getPositionStyles(block);
              if (!style) return null;

              return (
                <motion.div
                  key={block.id}
                  className="absolute pointer-events-auto"
                  style={style}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: quietEase }}
                >
                  <TimeBlockCard
                    block={block}
                    onClick={() => onBlockClick(block)}
                    style={{ width: '100%', height: '100%', top: 0, left: 0 }}
                  />
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
