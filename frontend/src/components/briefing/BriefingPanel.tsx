import type { AIBriefing } from '@/types/briefing';
import { BurnoutGauge } from '@/components/dashboard/BurnoutGauge';
import { getApiErrorMessage, timeBlockApi } from '@/lib/api';
import { CalendarClock, CalendarRange, CheckSquare, ClipboardList, Clock3, Droplet, Loader2, WalletCards } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';

interface BriefingPanelProps {
  briefing: AIBriefing;
}

export function BriefingPanel({ briefing }: BriefingPanelProps) {
  const formattedDate = format(new Date(briefing.briefing_date), 'EEEE, MMMM d, yyyy');
  const [optimizing, setOptimizing] = useState(false);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const context = briefing.context;
  const timelineItems = [
    ...(context?.today_schedule ?? []).map((item) => ({
      key: `schedule-${item.start}-${item.label}`,
      time: item.start && item.end ? `${item.start}-${item.end}` : 'Today',
      title: item.label,
      meta: item.type,
    })),
    ...(context?.academic_deadlines ?? []).slice(0, 3).map((item) => ({
      key: `academic-${item.course}-${item.title}`,
      time: item.deadline ? format(new Date(item.deadline), 'MMM d, h:mm a') : 'Soon',
      title: item.title,
      meta: `${item.course} / ${item.type}`,
    })),
    ...(context?.upcoming_deadlines ?? []).slice(0, 3).map((item) => ({
      key: `task-${item.title}`,
      time: item.deadline ? format(new Date(item.deadline), 'MMM d, h:mm a') : 'Soon',
      title: item.title,
      meta: 'task deadline',
    })),
  ].slice(0, 6);

  const sourceChips = context ? [
    `${context.tasks_count} active tasks`,
    `${context.upcoming_deadlines.length + context.academic_deadlines.length} deadlines`,
    context.health_today ? `${context.health_today.sleep_hours}h sleep` : 'no health log',
    `Rp ${Math.round(context.monthly_spend).toLocaleString('id-ID')} spend`,
  ] : [];

  const handleOptimizeSchedule = async () => {
    setOptimizing(true);

    try {
      const response = await timeBlockApi.optimizeSchedule();
      const blocks = Array.isArray(response.data?.data) ? response.data.data : [];
      setScheduledCount(blocks.length);
      toast.success(response.data?.message || 'Schedule optimized successfully.');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Schedule optimization failed'));
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Summary Card & Recommended Adjustments (takes 2 cols on lg) */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Main summary card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.035] p-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-300 border border-blue-500/20">
              <ClipboardList size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
                Workload Review
              </h2>
              <p className="text-[10px] text-slate-500 font-semibold">{formattedDate}</p>
            </div>
          </div>

          <div className="text-sm font-semibold text-slate-200 leading-relaxed space-y-3">
            {briefing.summary_content.split('\n\n').map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>

          {sourceChips.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/5 pt-4">
              {sourceChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Daily Timeline */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.035] p-6 shadow-xl backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-cyan-300" />
            <h3 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
              Timeline Hari Ini
            </h3>
          </div>

          {timelineItems.length > 0 ? (
            <div className="space-y-3">
              {timelineItems.map((item) => (
                <div key={item.key} className="grid grid-cols-[84px_1fr] gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <Clock3 className="h-3 w-3" />
                    {item.time}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">{item.title}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.meta}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-6 text-center text-xs font-semibold text-slate-500">
              Belum ada jadwal atau deadline untuk hari ini.
            </div>
          )}
        </div>

        {/* Recommended Adjustments Card */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.035] p-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare className="w-5 h-5 text-blue-300" />
            <h3 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
              Rencana Tindakan
            </h3>
          </div>

          {briefing.recommended_adjustments && briefing.recommended_adjustments.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {briefing.recommended_adjustments.map((adjustment, idx) => (
                <div 
                  key={idx} 
                  className="group flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4 transition-all hover:border-white/10 hover:bg-white/[0.055]"
                >
                  <div className="w-5 h-5 rounded bg-blue-500/10 text-blue-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-500/20 transition">
                    <CheckSquare size={12} />
                  </div>
                  <p className="text-xs font-semibold text-slate-300 leading-normal group-hover:text-white transition">
                    {adjustment}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Belum ada rekomendasi khusus untuk hari ini.
            </div>
          )}
        </div>
      </div>

      {/* Burnout risk gauge & quick calendar block overview (1 col) */}
      <div className="space-y-6">
        {/* Workload assessment */}
        <div className="h-fit">
          <BurnoutGauge metrics={briefing.health_metrics} />
        </div>

        {/* Action widget */}
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/5 backdrop-blur-xl flex flex-col justify-between items-start gap-4">
          <div className="flex items-center gap-2.5">
            <CalendarRange size={16} className="text-blue-300" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Perlu Penjadwalan?
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium leading-normal">
            Jika beban sedang tinggi, jadwal dapat dirapikan agar deadline tersebar ke slot kosong.
          </p>
          {scheduledCount !== null && (
            <div className="w-full rounded-xl border border-emerald-400/10 bg-emerald-400/5 px-3 py-2 text-xs font-semibold text-emerald-200">
              {scheduledCount === 0
                ? 'No new blocks were needed.'
                : `${scheduledCount} block${scheduledCount === 1 ? '' : 's'} scheduled.`}
            </div>
          )}
          <div className="grid w-full grid-cols-1 gap-2">
            <button
              type="button"
              onClick={handleOptimizeSchedule}
              disabled={optimizing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {optimizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarRange className="h-3.5 w-3.5" />
              )}
              Rapikan Jadwal
            </button>
            <a
              href="/calendar"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Buka Kalender
            </a>
          </div>
        </div>

        {context && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4">
              <Droplet className="mb-3 h-4 w-4 text-blue-300" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Hydration</p>
              <p className="mt-1 text-sm font-black text-white">{context.health_today?.hydration_ml ?? 0} ml</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4">
              <WalletCards className="mb-3 h-4 w-4 text-emerald-300" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Month Spend</p>
              <p className="mt-1 text-sm font-black text-white">Rp {Math.round(context.monthly_spend).toLocaleString('id-ID')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
