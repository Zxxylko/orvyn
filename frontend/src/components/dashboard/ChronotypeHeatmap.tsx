import { Sun, Moon, Info, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ChronotypeHeatmapProps {
  peakHours: number[];
  chronotype: 'early_bird' | 'night_owl' | 'standard';
  confidence: number;
  heatmap: Record<number, number> | number[];
}

export function ChronotypeHeatmap({
  peakHours = [9, 10, 11, 12],
  chronotype = 'standard',
  confidence = 0.5,
  heatmap = {}
}: ChronotypeHeatmapProps) {

  // Helper to resolve chronotype descriptions
  const getChronotypeDetails = (type: string) => {
    switch (type) {
      case 'early_bird':
        return {
          title: 'Early Bird Chronotype',
          desc: 'Your peak focus occurs in the mornings. The scheduler shifts high-difficulty task blocks to mornings.',
          icon: Sun,
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          glow: 'bg-amber-500/5'
        };
      case 'night_owl':
        return {
          title: 'Night Owl Chronotype',
          desc: 'Your peak focus shifts to evenings. The scheduler optimizes difficult tasks during late hours.',
          icon: Moon,
          color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
          glow: 'bg-indigo-500/5'
        };
      case 'standard':
      default:
        return {
          title: 'Standard Chronotype',
          desc: 'Your focus follows standard daylight patterns. Tasks are scheduled in balanced daytime intervals.',
          icon: Sparkles,
          color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
          glow: 'bg-cyan-500/5'
        };
    }
  };

  const details = getChronotypeDetails(chronotype);
  const ChronotypeIcon = details.icon;

  // Convert heatmap object or array to safe numeric lookup
  const getHeatmapIntensity = (hour: number) => {
    return Array.isArray(heatmap) ? heatmap[hour] || 0 : heatmap[hour] || 0;
  };

  // Find max value in heatmap to compute relative opacity
  let maxVal = 1;
  for (let i = 0; i < 24; i++) {
    const v = getHeatmapIntensity(i);
    if (v > maxVal) {
      maxVal = v;
    }
  }

  // Format hour label for tooltip
  const formatHourLabel = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:00 ${ampm}`;
  };

  return (
    <TooltipProvider>
      <div className="p-6 rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-xl flex flex-col justify-between h-full relative overflow-hidden group">
        {/* Background glow matching chronotype */}
        <div className={cn(
          "absolute -top-12 -right-12 w-28 h-28 rounded-full blur-3xl pointer-events-none -z-10",
          chronotype === 'early_bird' ? 'bg-amber-500/10' : chronotype === 'night_owl' ? 'bg-indigo-500/10' : 'bg-cyan-500/10'
        )} />

        <div>
          <div className="flex items-center justify-between w-full mb-4">
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase flex items-center gap-1">
              Circadian Rhythm Analysis
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-500 hover:text-slate-300 transition-colors">
                    <Info size={11} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-slate-950/90 text-white border border-white/10 p-3 rounded-lg backdrop-blur-md">
                  <p className="font-bold mb-1">Chronotype Sync</p>
                  <p className="text-slate-300 text-[10px] leading-relaxed">
                    By tracking completed Pomodoro ratings, we learn when you work best. The scheduler aligns difficult task blocks with your peak focus hours.
                  </p>
                </TooltipContent>
              </Tooltip>
            </span>
            
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wide",
              details.color
            )}>
              <ChronotypeIcon size={12} className="shrink-0" />
              {chronotype.replace('_', ' ')}
            </div>
          </div>

          {/* Heatmap Grid Title */}
          <div className="flex items-baseline justify-between mb-3 px-1">
            <span className="text-xs font-bold text-slate-300">Peak Focus Heatmap</span>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              Confidence: {Math.round(confidence * 100)}%
            </span>
          </div>

          {/* 24 hour Heatmap visualization blocks */}
          <div className="grid grid-cols-12 gap-1.5 p-2 rounded-xl bg-slate-950/40 border border-white/5">
            {Array.from({ length: 24 }).map((_, hour) => {
              const score = getHeatmapIntensity(hour);
              const isPeak = peakHours.includes(hour);
              
              // Calculate opacity based on relative score (min opacity 0.05, max 0.8)
              const baseOpacity = score > 0 ? 0.15 + (score / maxVal) * 0.65 : 0.04;
              
              return (
                <Tooltip key={hour}>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "h-6 rounded-md transition-all duration-300 relative cursor-crosshair border border-white/5",
                        isPeak 
                          ? "border-purple-500 shadow-[0_0_6px_rgba(139,92,246,0.3)]" 
                          : "hover:border-white/20"
                      )}
                      style={{
                        backgroundColor: isPeak
                          ? `rgba(168, 85, 247, ${baseOpacity})`
                          : `rgba(255, 255, 255, ${baseOpacity})`
                      }}
                    >
                      {isPeak && (
                        <div className="absolute top-1 left-1 w-1 h-1 rounded-full bg-purple-400" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-950 border border-white/10 p-2 rounded text-[10px]">
                    <p className="font-bold text-white">{formatHourLabel(hour)}</p>
                    <p className="text-slate-400 mt-0.5">
                      {isPeak ? 'High Productivity Window' : 'Standard Window'}
                    </p>
                    {score > 0 && (
                      <p className="text-purple-300 font-medium mt-0.5">
                        Productivity Weight: {Math.round(score)}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Heatmap Legend */}
          <div className="flex items-center justify-between text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-2 px-1">
            <span>Midnight (12 AM)</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500/80" /> Peak Hour
            </div>
            <span>Noon (12 PM)</span>
          </div>
        </div>

        {/* Circadian Schedule Recommendation */}
        <p className="text-[10px] text-slate-400 font-medium mt-4 leading-relaxed italic border-t border-white/5 pt-3">
          "{details.desc}"
        </p>
      </div>
    </TooltipProvider>
  );
}
