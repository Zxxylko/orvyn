import type { TimeBlock } from '@/types/timeblock';
import { Lock, BookOpen, Coffee, Award, CalendarDays, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface TimeBlockCardProps {
  block: TimeBlock;
  onClick: () => void;
  style?: React.CSSProperties;
}

export function TimeBlockCard({ block, onClick, style }: TimeBlockCardProps) {
  
  // Style config based on block type
  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'class':
        return {
          bg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20',
          icon: BookOpen,
          glow: 'shadow-indigo-500/5',
        };
      case 'break':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20',
          icon: Coffee,
          glow: 'shadow-emerald-500/5',
        };
      case 'personal':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20',
          icon: Award,
          glow: 'shadow-amber-500/5',
        };
      case 'study':
        return {
          bg: 'bg-violet-500/10 border-violet-500/30 text-violet-200 hover:bg-violet-500/20',
          icon: Brain,
          glow: 'shadow-violet-500/5',
        };
      case 'task':
      default:
        return {
          bg: 'bg-purple-500/10 border-purple-500/30 text-purple-200 hover:bg-purple-500/20',
          icon: CalendarDays,
          glow: 'shadow-purple-500/5',
        };
    }
  };

  const config = getTypeConfig(block.block_type);
  const Icon = config.icon;

  const startStr = format(new Date(block.start_time), 'h:mm a');
  const endStr = format(new Date(block.end_time), 'h:mm a');

  return (
    <button
      onClick={onClick}
      style={style}
      className={cn(
        "absolute rounded-xl border p-2 flex flex-col items-start justify-between text-left overflow-hidden select-none hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer backdrop-blur-md",
        config.bg,
        config.glow
      )}
    >
      <div className="w-full">
        <div className="flex items-center justify-between w-full gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider truncate flex-1 leading-none">
            {block.label}
          </span>
          {block.is_locked && <Lock size={10} className="text-slate-400 shrink-0" />}
        </div>
        
        <p className="text-[8px] font-bold text-slate-400 mt-1">
          {startStr} - {endStr}
        </p>
      </div>

      <div className="flex items-center justify-between w-full mt-1.5 pt-1.5 border-t border-white/5">
        <div className="flex items-center gap-1">
          <Icon size={10} className="opacity-80" />
          <span className="text-[8px] font-extrabold uppercase tracking-wide opacity-80">
            {block.block_type}
          </span>
        </div>
        {block.task && (
          <span className="text-[8px] font-extrabold px-1 rounded-sm bg-purple-500/20 text-purple-300 border border-purple-500/10 truncate max-w-[60px]">
            {block.task.title}
          </span>
        )}
      </div>
    </button>
  );
}
