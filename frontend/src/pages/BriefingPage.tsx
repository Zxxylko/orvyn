import { useEffect } from 'react';
import { useBriefing } from '@/hooks/useBriefing';
import { BriefingPanel } from '@/components/briefing/BriefingPanel';
import { Button } from '@/components/ui/button';
import { BriefingSkeleton } from '@/components/ui/UXSkeletons';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';

export function BriefingPage() {
  const {
    briefing,
    loading,
    generating,
    fetchTodayBriefing,
    generateBriefing,
  } = useBriefing();

  // Load briefing on mount
  useEffect(() => {
    fetchTodayBriefing();
  }, [fetchTodayBriefing]);

  if (loading) {
    return (
      <BriefingSkeleton />
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.035] px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-300">
            <ClipboardList size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-none">
              Ringkasan Harian
            </h2>
            <p className="text-[10px] text-slate-500 font-semibold mt-1">
              Review beban kuliah, risiko, dan rekomendasi tindakan hari ini
            </p>
          </div>
        </div>

        {briefing && (
          <Button
            onClick={generateBriefing}
            disabled={generating}
            className="h-10 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Perbarui Ringkasan
          </Button>
        )}
      </div>

      {generating && !briefing && (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.035] py-24 backdrop-blur-xl">
          <Loader2 className="w-10 h-10 animate-spin text-blue-300" />
          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mt-4 animate-pulse">
            Menyusun ringkasan...
          </p>
        </div>
      )}

      {/* Main content display */}
      {briefing ? (
        <BriefingPanel briefing={briefing} />
      ) : (
        !generating && (
          <div className="flex h-[400px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.035] px-6 py-20 text-center shadow-2xl backdrop-blur-xl">
            <ClipboardList size={48} className="text-blue-300 mb-6" />
            
            <h3 className="text-xl font-bold text-white tracking-tight mb-2">
              Buat Ringkasan Hari Ini
            </h3>
            <p className="text-xs text-slate-400 max-w-sm text-center font-semibold leading-relaxed mb-6">
              ORVYN akan membaca tugas, deadline, jadwal, dan indikator beban untuk menyusun prioritas harian.
            </p>

            <Button
              onClick={generateBriefing}
              className="rounded-xl bg-white px-8 py-3 text-xs font-semibold text-slate-950 shadow-xl shadow-white/10 transition-all hover:scale-[1.02] hover:bg-slate-100"
            >
              Buat Ringkasan
            </Button>
          </div>
        )
      )}
    </div>
  );
}
