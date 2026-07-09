import { Brain, ShieldAlert, Sparkles, Smile, Info } from 'lucide-react';
import type { HealthMetrics } from '@/types/briefing';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BurnoutGaugeProps {
  metrics?: HealthMetrics | null;
  liveBri?: number;
  liveLevel?: 'low' | 'medium' | 'high';
  activeTasksCount?: number;
  overdueTasksCount?: number;
}

export function BurnoutGauge({ 
  metrics, 
  liveBri, 
  liveLevel,
  activeTasksCount = 0,
  overdueTasksCount = 0 
}: BurnoutGaugeProps) {
  // Default values if no briefings generated yet
  const defaultMetrics: HealthMetrics = {
    burnout_risk: 'low',
    workload_balance: 'balanced',
    stress_level: 2.0,
    cognitive_load: 4.0,
  };

  const currentMetrics = metrics || defaultMetrics;
  
  // Resolve live metrics vs briefing metrics
  const isLive = liveBri !== undefined;
  const burnoutRisk = isLive ? (liveLevel || 'low') : currentMetrics.burnout_risk;
  const stressScore = isLive ? parseFloat((liveBri * 10).toFixed(1)) : currentMetrics.stress_level;
  
  // Cognitive load calculation (live CLM is approximated from tasks weight or shown dynamically)
  const displayClm = isLive 
    ? parseFloat((liveBri * 18).toFixed(1)) // In AnalyticsService, CLM max is 18
    : (currentMetrics.cognitive_load || (currentMetrics.stress_level * 2));

  // Risk styling helpers
  const getRiskDetails = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'high':
        return {
          label: 'Burnout Alert',
          color: 'text-red-400',
          border: 'border-red-500/30',
          bg: 'bg-red-500/10',
          indicator: 'bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_12px_rgba(239,68,68,0.5)]',
          icon: ShieldAlert,
          description: 'Take a break! Overdue tasks or high difficulty is causing extreme load.'
        };
      case 'medium':
        return {
          label: 'Moderate Risk',
          color: 'text-amber-400',
          border: 'border-amber-500/30',
          bg: 'bg-amber-500/10',
          indicator: 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]',
          icon: Brain,
          description: 'Workload is accumulating. Guard your focus periods and sleep schedule.'
        };
      case 'low':
      default:
        return {
          label: 'Healthy State',
          color: 'text-emerald-400',
          border: 'border-emerald-500/30',
          bg: 'bg-emerald-500/10',
          indicator: 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]',
          icon: Smile,
          description: 'Your schedule is highly optimized. Maintain this steady rhythm.'
        };
    }
  };

  const getBalanceLabel = () => {
    if (isLive) {
      if (liveBri > 0.75) return 'Overloaded';
      if (liveBri > 0.40) return 'Heavy Load';
      if (activeTasksCount === 0) return 'Light Load';
      if (overdueTasksCount > 0) return `Strained (${overdueTasksCount} overdue)`;
      return 'Optimal';
    }
    
    switch (currentMetrics.workload_balance) {
      case 'overloaded':
        return 'Overloaded';
      case 'underloaded':
        return 'Light Load';
      case 'balanced':
      default:
        return 'Optimal';
    }
  };

  const risk = getRiskDetails(burnoutRisk);
  const RiskIcon = risk.icon;

  return (
    <TooltipProvider>
      <div className="p-6 rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-xl flex flex-col justify-between h-full relative overflow-hidden group">
        {/* Background radial glow */}
        <div className={cn(
          "absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none -z-10 transition-all duration-700",
          burnoutRisk === 'high' ? 'bg-red-500' : burnoutRisk === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
        )} />

        <div>
          <div className="flex items-center justify-between w-full mb-4">
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase flex items-center gap-1">
              {isLive ? 'Live Health Status' : 'Health Status'}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-500 hover:text-slate-300 transition-colors">
                    <Info size={11} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-slate-950/90 text-white border border-white/10 p-3 rounded-lg backdrop-blur-md">
                  <p className="font-bold mb-1">Burnout Safeguards</p>
                  <p className="text-slate-300 text-[10px] leading-relaxed">
                    We track your daily Cognitive Load Metric (CLM). If your load exceeds 18 points, the scheduler automatically enforces Recharge Breaks to protect your mental health.
                  </p>
                </TooltipContent>
              </Tooltip>
            </span>
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wide transition-all",
              risk.bg,
              risk.color,
              risk.border
            )}>
              <RiskIcon size={12} className="shrink-0 animate-pulse" />
              {risk.label}
            </div>
          </div>

          {/* Stress score progress */}
          <div className="space-y-3 mt-2">
            <div className="flex items-end justify-between px-1">
              <span className="text-xs font-bold text-slate-300">Live Burnout Index</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl font-black text-white">{stressScore}</span>
                <span className="text-[10px] text-slate-500 font-bold">/10</span>
              </div>
            </div>
            
            <div className="h-3 w-full bg-slate-950 border border-white/5 rounded-full overflow-hidden p-[2px]">
              <div 
                className={cn("h-full rounded-full transition-all duration-500", risk.indicator)}
                style={{ width: `${Math.min(100, Math.max(5, stressScore * 10))}%` }}
              />
            </div>
          </div>

          {/* Load status info */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                Workload Balance
              </span>
              <p className="text-xs font-black text-white">
                {getBalanceLabel()}
              </p>
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1 cursor-help hover:border-white/10 transition-colors">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-0.5">
                    Cognitive Load
                    <Info size={8} />
                  </span>
                  <p className="text-xs font-black text-purple-300 flex items-center gap-1">
                    <Sparkles size={11} className="text-purple-400" />
                    {displayClm.toFixed(1)} CLM
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-950/90 text-white border border-white/10 p-2.5 rounded-lg text-[10px] max-w-[200px]">
                <p className="font-bold">CLM Score Breakdown</p>
                <p className="text-slate-400 mt-1">
                  CLM = Hours × Difficulty. Safe limit is 18. Continuous intervals over 90 mins trigger Sage break offsets.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 font-medium mt-5 leading-relaxed italic border-t border-white/5 pt-3">
          "{risk.description}"
        </p>
      </div>
    </TooltipProvider>
  );
}
