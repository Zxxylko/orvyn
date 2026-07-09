import { Sparkles, Flame, HelpCircle, TrendingUp, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FlowStateCardProps {
  score: number;
  currentStreak: number;
  longestStreak: number;
  hcf: {
    coding: number;
    theory: number;
    admin: number;
  };
}

export function FlowStateCard({ score = 50, currentStreak = 0, longestStreak = 0, hcf }: FlowStateCardProps) {
  // Determine text feedback based on Flow State Score
  const getFssFeedback = (fss: number) => {
    if (fss >= 80) return { label: 'Peak Flow', color: 'text-purple-400', desc: 'Incredible consistency and task execution. Keep riding this wave!' };
    if (fss >= 50) return { label: 'Optimal Rhythm', color: 'text-indigo-400', desc: 'Good balance of focused sessions and break scheduling.' };
    return { label: 'Building Focus', color: 'text-slate-400', desc: 'Focus ratios are emerging. Keep logging Pomodoro sessions.' };
  };

  const feedback = getFssFeedback(score);

  // Compute dash array for the SVG circle
  const radius = 54;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <TooltipProvider>
      <div className="p-6 rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-xl flex flex-col justify-between h-full relative overflow-hidden group">
        {/* Background ambient lighting */}
        <div className="absolute -top-12 -left-12 w-28 h-28 rounded-full blur-3xl bg-purple-600/10 pointer-events-none -z-10" />
        <div className="absolute -bottom-12 -right-12 w-28 h-28 rounded-full blur-3xl bg-indigo-600/10 pointer-events-none -z-10" />

        <div>
          <div className="flex items-center justify-between w-full mb-4">
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase flex items-center gap-1">
              Flow State Metrics
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-500 hover:text-slate-300 transition-colors">
                    <Info size={11} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-slate-950/90 text-white border border-white/10 p-3 rounded-lg backdrop-blur-md">
                  <p className="font-bold mb-1">Flow State Score (FSS)</p>
                  <p className="text-slate-300 text-[10px] leading-relaxed">
                    FSS balances study metrics (Focus ratio logging, Schedule integrity, and streak consistency) to promote sustainable productivity.
                  </p>
                </TooltipContent>
              </Tooltip>
            </span>
            
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-extrabold uppercase tracking-wide">
              <Sparkles size={11} className="animate-spin-slow" />
              {feedback.label}
            </div>
          </div>

          <div className="flex items-center gap-5 mt-3">
            {/* SVG Ring Progress */}
            <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  className="stroke-white/5 fill-transparent"
                  strokeWidth={strokeWidth}
                />
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  className="stroke-purple-500 fill-transparent transition-all duration-1000 ease-out"
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-2xl font-black text-white leading-none">
                  {Math.round(score)}
                </span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                  FSS Score
                </span>
              </div>
            </div>

            {/* Streak & Productivity overview */}
            <div className="space-y-3 flex-1 min-w-0">
              {/* Streak */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-md relative overflow-hidden",
                  currentStreak > 0 && "animate-pulse"
                )}>
                  <Flame size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">Focus Streak</p>
                  <p className="text-sm font-black text-white mt-1 leading-none">
                    {currentStreak} {currentStreak === 1 ? 'day' : 'days'}{' '}
                    <span className="text-[10px] font-normal text-slate-500">(Max {longestStreak})</span>
                  </p>
                </div>
              </div>

              {/* Progress trend advice */}
              <div className="flex items-start gap-1.5 text-[11px] font-medium text-slate-400 leading-snug">
                <TrendingUp size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                <p className="line-clamp-2 italic">"{feedback.desc}"</p>
              </div>
            </div>
          </div>

          {/* Schedule Multipliers (HCF) */}
          <div className="mt-5 pt-4 border-t border-white/5">
            <h4 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
              Historical Correction Multipliers (HCF)
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-500 hover:text-slate-300">
                    <HelpCircle size={10} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-slate-950 border border-white/10 p-2.5 rounded-lg text-[10px] text-slate-300 leading-normal">
                  Our scheduler learns from your completed tasks. If tasks in a category take you longer, the scheduler automatically scales up the duration buffers.
                </TooltipContent>
              </Tooltip>
            </h4>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-xl bg-slate-950/40 border border-white/5 text-center">
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Coding</p>
                <p className="text-xs font-black text-purple-300 mt-0.5">
                  {hcf?.coding ? `${hcf.coding.toFixed(2)}x` : '1.35x'}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/40 border border-white/5 text-center">
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Theory</p>
                <p className="text-xs font-black text-indigo-300 mt-0.5">
                  {hcf?.theory ? `${hcf.theory.toFixed(2)}x` : '1.20x'}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/40 border border-white/5 text-center">
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Admin</p>
                <p className="text-xs font-black text-slate-300 mt-0.5">
                  {hcf?.admin ? `${hcf.admin.toFixed(2)}x` : '1.00x'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
