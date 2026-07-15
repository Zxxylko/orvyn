import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { format } from 'date-fns';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Coffee,
  Droplet,
  Edit2,
  Gamepad2,
  HeartPulse,
  Info,
  Loader2,
  Monitor,
  Moon,
  MousePointer2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
} from 'lucide-react';
import { MotionCrossfade, SkeletonPulse } from '@/components/ui/UXSkeletons';
import { useHealth } from '@/hooks/useHealth';
import type { HealthLog, HealthSnapshot } from '@/types/telu';
import { MotionModal, ScrollReveal, StaggerGroup, StaggerItem } from '@/components/ui/motion';

type WindowWithWebkitAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const HYDRATION_TARGET = 2000;
const CAFFEINE_LIMIT = 400;
const SCREEN_LIMIT = 480;
const SLEEP_TARGET = 8;
const EYE_BREAK_SECONDS = 20;
const EYE_BREAK_CELLS = 9;

export function HealthPage() {
  const { snapshot, logs, loading, logHealth, updateLog, deleteLog, refreshHealth } = useHealth();
  const [sleepInput, setSleepInput] = useState('');
  const [screenTimeInput, setScreenTimeInput] = useState('');
  const [loggingHydration, setLoggingHydration] = useState(false);
  const [loggingCaffeine, setLoggingCaffeine] = useState(false);
  const [submittingSleep, setSubmittingSleep] = useState(false);
  const [submittingScreen, setSubmittingScreen] = useState(false);
  const [editingLog, setEditingLog] = useState<HealthLog | null>(null);
  const [editHydration, setEditHydration] = useState('');
  const [editCaffeine, setEditCaffeine] = useState('');
  const [editScreenTime, setEditScreenTime] = useState('');
  const [editSleep, setEditSleep] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [breakTimer, setBreakTimer] = useState(20 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);
  const [gameTimeLeft, setGameTimeLeft] = useState(EYE_BREAK_SECONDS);
  const [gameScore, setGameScore] = useState(0);
  const [targetIndex, setTargetIndex] = useState(4);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('orvyn-eye-reset-best') ?? 0));

  const readiness = useMemo(() => buildHealthReadiness(snapshot), [snapshot]);
  const metrics = useMemo(() => buildMetricCards(snapshot), [snapshot]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (timerRunning && breakTimer > 0) {
      interval = setInterval(() => {
        setBreakTimer((prev) => prev - 1);
      }, 1000);
    } else if (breakTimer === 0) {
      queueMicrotask(() => {
        setTimerRunning(false);
        playSoftPing();
        alert('Waktunya istirahat mata. Lihat objek jauh selama 20 detik, lalu lanjut dengan ritme yang lebih ringan.');
        setBreakTimer(20 * 60);
      });
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning, breakTimer]);

  useEffect(() => {
    if (!gameRunning) return;

    const interval = setInterval(() => {
      setGameTimeLeft((current) => {
        if (current <= 1) {
          setGameRunning(false);
          setTargetIndex(4);
          setBestScore((best) => {
            const nextBest = Math.max(best, gameScore);
            localStorage.setItem('orvyn-eye-reset-best', String(nextBest));
            return nextBest;
          });
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameRunning, gameScore]);

  const quickAddWater = async () => {
    setLoggingHydration(true);
    try {
      await logHealth({
        log_date: todayDate(),
        hydration_ml: 250,
        accumulate: true,
      });
    } finally {
      setLoggingHydration(false);
    }
  };

  const quickAddCoffee = async () => {
    setLoggingCaffeine(true);
    try {
      await logHealth({
        log_date: todayDate(),
        caffeine_mg: 100,
        accumulate: true,
      });
    } finally {
      setLoggingCaffeine(false);
    }
  };

  const handleSleepSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hours = parseFloat(sleepInput);
    if (Number.isNaN(hours) || hours < 0 || hours > 24) return;

    setSubmittingSleep(true);
    try {
      await logHealth({
        log_date: todayDate(),
        sleep_hours: hours,
      });
      setSleepInput('');
    } finally {
      setSubmittingSleep(false);
    }
  };

  const handleScreenSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = parseInt(screenTimeInput, 10);
    if (Number.isNaN(minutes) || minutes < 0 || minutes > 1440) return;

    setSubmittingScreen(true);
    try {
      await logHealth({
        log_date: todayDate(),
        screen_time_minutes: minutes,
        accumulate: true,
      });
      setScreenTimeInput('');
    } finally {
      setSubmittingScreen(false);
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingLog) return;

    setSubmittingEdit(true);
    try {
      await updateLog(editingLog.id, {
        hydration_ml: parseInt(editHydration, 10) || 0,
        caffeine_mg: parseInt(editCaffeine, 10) || 0,
        screen_time_minutes: parseInt(editScreenTime, 10) || 0,
        sleep_hours: parseFloat(editSleep) || 0,
      });
      setEditingLog(null);
    } finally {
      setSubmittingEdit(false);
    }
  };

  const startEyeGame = () => {
    setGameRunning(true);
    setGameTimeLeft(EYE_BREAK_SECONDS);
    setGameScore(0);
    setTargetIndex(randomTargetIndex(null));
  };

  const hitTarget = (index: number) => {
    if (!gameRunning || index !== targetIndex) return;

    setGameScore((score) => score + 1);
    setTargetIndex(randomTargetIndex(index));
  };

  const startQuickEyeBreak = () => {
    setBreakTimer(EYE_BREAK_SECONDS);
    setTimerRunning(true);
    startEyeGame();
  };

  return (
    <div className="space-y-6 pb-16">
      <section className="reactive-card overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-xl">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 sm:p-7">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                  <HeartPulse className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Health Guard
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                    Kesiapan tubuh hari ini
                  </h1>
                </div>
              </div>
              <button
                type="button"
                onClick={() => refreshHealth()}
                className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.09] hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <p className="max-w-3xl text-sm font-medium leading-relaxed text-slate-400">
              Panel ini dibuat untuk ritme mahasiswa informatika: hidrasi, kafein, screen time, tidur,
              dan jeda mata dipantau dalam satu alur yang cepat dipakai.
            </p>

            <StaggerGroup className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StaggerItem><HealthSummaryPill label="Status" value={readiness.label} tone={readiness.tone} /></StaggerItem>
              <StaggerItem><HealthSummaryPill label="Alert aktif" value={`${snapshot?.alerts.length ?? 0}`} tone="text-cyan-200" /></StaggerItem>
              <StaggerItem><HealthSummaryPill label="Log tersimpan" value={`${logs.length} hari`} tone="text-slate-200" /></StaggerItem>
            </StaggerGroup>
          </div>

          <div className="border-t border-white/10 bg-slate-950/35 p-6 sm:p-7 lg:border-l lg:border-t-0">
            <MotionCrossfade stateKey={loading ? 'readiness-loading' : 'readiness-content'}>
            {loading ? (
              <div className="space-y-5">
                <SkeletonPulse className="h-24 rounded-2xl" />
                <SkeletonPulse className="h-12 rounded-xl" />
              </div>
            ) : (
            <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Readiness score</p>
                <p className="mt-2 text-5xl font-black tracking-tight text-white">{readiness.score}</p>
              </div>
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.035]">
                <div
                  className="absolute inset-2 rounded-full"
                  style={{
                    background: `conic-gradient(rgb(110 231 183) ${readiness.score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
                  }}
                />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-emerald-100">
                  {readiness.score}%
                </div>
              </div>
            </div>
            <p className="mt-5 text-sm font-medium leading-relaxed text-slate-400">{readiness.message}</p>
            </>
            )}
            </MotionCrossfade>
          </div>
        </div>
      </section>

      <MotionCrossfade stateKey={loading ? 'loading' : 'content'}>
        {loading ? (
          <HealthLoadingState />
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.85fr]">
          <div className="space-y-6">
            <StaggerGroup className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <StaggerItem key={metric.label}><MetricCard metric={metric} /></StaggerItem>
              ))}
            </StaggerGroup>

            <ScrollReveal amount={0.1}><HealthAlertsPanel
              snapshot={snapshot}
              onWater={quickAddWater}
              onEyeBreak={startQuickEyeBreak}
            /></ScrollReveal>

            <ScrollReveal amount={0.1}><QuickLogPanel
              sleepInput={sleepInput}
              screenTimeInput={screenTimeInput}
              loggingHydration={loggingHydration}
              loggingCaffeine={loggingCaffeine}
              submittingSleep={submittingSleep}
              submittingScreen={submittingScreen}
              onSleepInput={setSleepInput}
              onScreenTimeInput={setScreenTimeInput}
              onWater={quickAddWater}
              onCoffee={quickAddCoffee}
              onSleepSubmit={handleSleepSubmit}
              onScreenSubmit={handleScreenSubmit}
            /></ScrollReveal>

            <ScrollReveal amount={0.1}><WellnessLedger
              logs={logs}
              onEdit={(log) => {
                setEditingLog(log);
                setEditHydration(log.hydration_ml.toString());
                setEditCaffeine(log.caffeine_mg.toString());
                setEditScreenTime(log.screen_time_minutes.toString());
                setEditSleep(log.sleep_hours.toString());
              }}
              onDelete={deleteLog}
            /></ScrollReveal>
          </div>

          <aside className="space-y-6">
            <ScrollReveal amount={0.1}><EyeBreakTimer
              breakTimer={breakTimer}
              timerRunning={timerRunning}
              onToggle={() => setTimerRunning((running) => !running)}
              onReset={() => {
                setTimerRunning(false);
                setBreakTimer(20 * 60);
              }}
            /></ScrollReveal>

            <ScrollReveal amount={0.1}><EyeResetGame
              running={gameRunning}
              timeLeft={gameTimeLeft}
              score={gameScore}
              bestScore={bestScore}
              targetIndex={targetIndex}
              onStart={startEyeGame}
              onHit={hitTarget}
            /></ScrollReveal>

            <ScrollReveal amount={0.1}><ErgonomicTips /></ScrollReveal>
          </aside>
          </div>
        )}
      </MotionCrossfade>

      <MotionModal
        open={editingLog !== null}
        onBackdropClick={() => setEditingLog(null)}
        label="Edit log kesehatan"
      >
      {editingLog && (
        <EditHealthLogModal
          log={editingLog}
          hydration={editHydration}
          caffeine={editCaffeine}
          screenTime={editScreenTime}
          sleep={editSleep}
          submitting={submittingEdit}
          onHydration={setEditHydration}
          onCaffeine={setEditCaffeine}
          onScreenTime={setEditScreenTime}
          onSleep={setEditSleep}
          onClose={() => setEditingLog(null)}
          onSubmit={handleEditSubmit}
        />
      )}
      </MotionModal>
    </div>
  );
}

function HealthLoadingState() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.85fr]">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SkeletonPulse className="h-36 rounded-2xl" />
          <SkeletonPulse className="h-36 rounded-2xl" />
          <SkeletonPulse className="h-36 rounded-2xl" />
          <SkeletonPulse className="h-36 rounded-2xl" />
        </div>
        <SkeletonPulse className="h-48 rounded-2xl" />
        <SkeletonPulse className="h-64 rounded-2xl" />
      </div>
      <div className="space-y-6">
        <SkeletonPulse className="h-72 rounded-2xl" />
        <SkeletonPulse className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

interface MetricCardModel {
  label: string;
  value: string;
  target: string;
  progress: number;
  tone: string;
  icon: typeof Droplet;
}

function MetricCard({ metric }: { metric: MetricCardModel }) {
  const Icon = metric.icon;

  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${metric.tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
          {Math.round(metric.progress)}%
        </span>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{metric.label}</p>
      <p className="mt-2 text-2xl font-black text-white">{metric.value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{metric.target}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.055]">
        <div
          className="h-full rounded-full bg-white/80 transition-all duration-500"
          style={{ width: `${metric.progress}%` }}
        />
      </div>
    </div>
  );
}

function HealthSummaryPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
      <p className={`mt-1 text-sm font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function HealthAlertsPanel({
  snapshot,
  onWater,
  onEyeBreak,
}: {
  snapshot: HealthSnapshot | null;
  onWater: () => void;
  onEyeBreak: () => void;
}) {
  const alerts = snapshot?.alerts ?? [];

  return (
    <section className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Health diagnostics</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Saran yang perlu diperhatikan</h2>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {alerts.length} alert
        </span>
      </div>

      {alerts.length > 0 ? (
        <div className="grid gap-3">
          {alerts.map((alert, index) => {
            const AlertIcon = getAlertIcon(alert.type);
            return (
              <div key={`${alert.category}-${index}`} className={`rounded-xl border p-4 ${getAlertStyle(alert.type)}`}>
                <div className="flex items-start gap-3">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-80">{getCategoryLabel(alert.category)}</p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-100">{alert.message}</p>
                    <HealthAlertAction category={alert.category} onWater={onWater} onEyeBreak={onEyeBreak} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-200" />
            <div>
              <p className="text-sm font-bold text-emerald-100">Parameter aman.</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-400">
                Tidak ada alert besar saat ini. Pertahankan hidrasi, jeda mata, dan jam tidur.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function QuickLogPanel({
  sleepInput,
  screenTimeInput,
  loggingHydration,
  loggingCaffeine,
  submittingSleep,
  submittingScreen,
  onSleepInput,
  onScreenTimeInput,
  onWater,
  onCoffee,
  onSleepSubmit,
  onScreenSubmit,
}: {
  sleepInput: string;
  screenTimeInput: string;
  loggingHydration: boolean;
  loggingCaffeine: boolean;
  submittingSleep: boolean;
  submittingScreen: boolean;
  onSleepInput: (value: string) => void;
  onScreenTimeInput: (value: string) => void;
  onWater: () => void;
  onCoffee: () => void;
  onSleepSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onScreenSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Quick log</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Catat kondisi tanpa ribet</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <QuickLogButton
            icon={Droplet}
            label="Tambah air"
            detail="+250 ml"
            loading={loggingHydration}
            tone="border-blue-300/20 bg-blue-300/10 text-blue-100"
            onClick={onWater}
          />
          <QuickLogButton
            icon={Coffee}
            label="Tambah kafein"
            detail="+100 mg"
            loading={loggingCaffeine}
            tone="border-amber-300/20 bg-amber-300/10 text-amber-100"
            onClick={onCoffee}
          />
        </div>

        <div className="grid gap-3">
          <HealthForm
            label="Jam tidur tadi malam"
            value={sleepInput}
            placeholder="Contoh: 7.5"
            step="0.5"
            loading={submittingSleep}
            icon={Moon}
            onValue={onSleepInput}
            onSubmit={onSleepSubmit}
          />
          <HealthForm
            label="Tambah screen time"
            value={screenTimeInput}
            placeholder="Contoh: 60"
            loading={submittingScreen}
            icon={Monitor}
            onValue={onScreenTimeInput}
            onSubmit={onScreenSubmit}
          />
        </div>
      </div>
    </section>
  );
}

function QuickLogButton({
  icon: Icon,
  label,
  detail,
  tone,
  loading,
  onClick,
}: {
  icon: typeof Droplet;
  label: string;
  detail: string;
  tone: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`focus-ring interactive-surface flex min-h-[104px] items-center gap-4 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${tone}`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/10">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">{detail}</p>
      </div>
    </button>
  );
}

function HealthForm({
  label,
  value,
  placeholder,
  step,
  loading,
  icon: Icon,
  onValue,
  onSubmit,
}: {
  label: string;
  value: string;
  placeholder: string;
  step?: string;
  loading: boolean;
  icon: typeof Moon;
  onValue: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
      <label className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          step={step}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onValue(event.target.value)}
          required
          className="focus-ring min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white outline-none placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={loading}
          className="focus-ring interactive-surface inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={`Simpan ${label}`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}

function WellnessLedger({
  logs,
  onEdit,
  onDelete,
}: {
  logs: HealthLog[];
  onEdit: (log: HealthLog) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ledger</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Riwayat 7 hari</h2>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {logs.length} catatan
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-slate-300">Belum ada log kesehatan.</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Mulai dari air minum atau jam tidur hari ini.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {logs.map((log) => (
            <div
              key={log.id}
              className="group grid grid-cols-1 gap-3 border-b border-white/10 bg-slate-950/25 p-4 transition last:border-b-0 hover:bg-white/[0.04] md:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  <p className="text-xs font-bold text-white">{format(new Date(log.log_date), 'EEEE, d MMM yyyy')}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <LedgerMetric label="Air" value={`${log.hydration_ml} ml`} />
                  <LedgerMetric label="Kafein" value={`${log.caffeine_mg} mg`} />
                  <LedgerMetric label="Screen" value={`${log.screen_time_minutes} m`} />
                  <LedgerMetric label="Tidur" value={`${log.sleep_hours} h`} />
                </div>
              </div>

              <div className="flex items-center gap-2 md:opacity-0 md:transition md:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(log)}
                  className="focus-ring interactive-surface inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-400 hover:text-white"
                  aria-label="Edit log kesehatan"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(log.id)}
                  className="focus-ring interactive-surface inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-300/10 text-rose-300 hover:text-rose-100"
                  aria-label="Hapus log kesehatan"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LedgerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
      <p className="mt-1 text-xs font-bold text-slate-200">{value}</p>
    </div>
  );
}

function EyeBreakTimer({
  breakTimer,
  timerRunning,
  onToggle,
  onReset,
}: {
  breakTimer: number;
  timerRunning: boolean;
  onToggle: () => void;
  onReset: () => void;
}) {
  return (
    <section className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-center shadow-xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
        <Monitor className="h-7 w-7" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">20-20-20 timer</p>
      <h2 className="mt-2 text-lg font-semibold text-white">Jeda mata terarah</h2>
      <p className="mx-auto mt-2 max-w-xs text-xs font-medium leading-relaxed text-slate-500">
        Pakai timer ini saat ngoding atau membaca materi panjang.
      </p>
      <div className="my-6 text-5xl font-black tracking-tight text-white">{formatTimerTime(breakTimer)}</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-slate-950 hover:bg-slate-100"
        >
          <Timer className="h-4 w-4" />
          {timerRunning ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/[0.09]"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>
    </section>
  );
}

function EyeResetGame({
  running,
  timeLeft,
  score,
  bestScore,
  targetIndex,
  onStart,
  onHit,
}: {
  running: boolean;
  timeLeft: number;
  score: number;
  bestScore: number;
  targetIndex: number;
  onStart: () => void;
  onHit: (index: number) => void;
}) {
  return (
    <section className="reactive-card overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-xl">
      <div className="border-b border-white/10 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-pink-300" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Mini game</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-slate-400">
            Best {bestScore}
          </span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-white">Eye Reset</h2>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
          Klik target yang berpindah selama 20 detik. Cocok untuk break ringan tanpa keluar aplikasi.
        </p>
      </div>

      <div className="p-5">
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <GameStat label="Waktu" value={`${timeLeft}s`} />
          <GameStat label="Skor" value={`${score}`} />
          <GameStat label="Status" value={running ? 'Main' : 'Siap'} />
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-2">
          {Array.from({ length: EYE_BREAK_CELLS }, (_, index) => {
            const active = running && index === targetIndex;
            return (
              <button
                key={index}
                type="button"
                onClick={() => onHit(index)}
                disabled={!running}
                className={`focus-ring flex aspect-square items-center justify-center rounded-xl border transition ${
                  active
                    ? 'border-pink-200 bg-pink-200 text-slate-950 shadow-[0_0_28px_rgba(249,168,212,0.32)]'
                    : 'border-white/5 bg-white/[0.035] text-slate-700 hover:bg-white/[0.06] disabled:cursor-default'
                }`}
                aria-label={active ? 'Target aktif' : 'Area kosong'}
              >
                {active ? <MousePointer2 className="h-5 w-5" /> : <span className="h-2 w-2 rounded-full bg-current" />}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onStart}
          className="focus-ring interactive-surface mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-slate-950 hover:bg-slate-100"
        >
          <Sparkles className="h-4 w-4" />
          {running ? 'Restart game' : 'Mulai game'}
        </button>
      </div>
    </section>
  );
}

function GameStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function ErgonomicTips() {
  const tips = [
    'Jarak layar ideal sekitar 50-70 cm dari mata.',
    'Bagian atas monitor sebaiknya sejajar dengan mata.',
    'Gunakan cahaya ruangan yang cukup agar kontras layar tidak terlalu keras.',
    'Setiap sesi panjang perlu jeda singkat untuk bahu, leher, dan mata.',
  ];

  return (
    <section className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-300" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ergonomic tips</p>
      </div>
      <div className="space-y-3">
        {tips.map((tip, index) => (
          <div key={tip} className="flex gap-3 rounded-xl border border-white/5 bg-slate-950/35 p-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-slate-950">
              {index + 1}
            </span>
            <p className="text-xs font-medium leading-relaxed text-slate-400">{tip}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EditHealthLogModal({
  log,
  hydration,
  caffeine,
  screenTime,
  sleep,
  submitting,
  onHydration,
  onCaffeine,
  onScreenTime,
  onSleep,
  onClose,
  onSubmit,
}: {
  log: HealthLog;
  hydration: string;
  caffeine: string;
  screenTime: string;
  sleep: string;
  submitting: boolean;
  onHydration: (value: string) => void;
  onCaffeine: (value: string) => void;
  onScreenTime: (value: string) => void;
  onSleep: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Edit log</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{format(new Date(log.log_date), 'd MMM yyyy')}</h3>
          </div>
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-400">
            Manual
          </span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <EditField label="Air (ml)" value={hydration} onChange={onHydration} max="10000" />
            <EditField label="Kafein (mg)" value={caffeine} onChange={onCaffeine} max="2000" />
            <EditField label="Screen (m)" value={screenTime} onChange={onScreenTime} max="1440" />
            <EditField label="Tidur (h)" value={sleep} onChange={onSleep} max="24" step="0.1" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring interactive-surface rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.09]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="focus-ring interactive-surface inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-xs font-bold text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Simpan
            </button>
          </div>
        </form>
      </div>
  );
}

function EditField({
  label,
  value,
  max,
  step,
  onChange,
}: {
  label: string;
  value: string;
  max: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min="0"
        max={max}
        onChange={(event) => onChange(event.target.value)}
        required
        className="focus-ring w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white outline-none"
      />
    </label>
  );
}

function HealthAlertAction({
  category,
  onWater,
  onEyeBreak,
}: {
  category: 'hydration' | 'caffeine' | 'sleep' | 'screentime';
  onWater: () => void;
  onEyeBreak: () => void;
}) {
  if (category === 'hydration' || category === 'caffeine') {
    return (
      <button
        type="button"
        onClick={onWater}
        className="focus-ring interactive-surface mt-3 w-fit rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-white/15"
      >
        Tambah air
      </button>
    );
  }

  if (category === 'screentime') {
    return (
      <button
        type="button"
        onClick={onEyeBreak}
        className="focus-ring interactive-surface mt-3 w-fit rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-white/15"
      >
        Mulai eye break
      </button>
    );
  }

  return (
    <a
      href="/calendar"
      className="focus-ring interactive-surface mt-3 inline-flex w-fit rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-white/15"
    >
      Review jadwal
    </a>
  );
}

function buildMetricCards(snapshot: HealthSnapshot | null): MetricCardModel[] {
  const hydration = snapshot?.hydration_ml ?? 0;
  const caffeine = snapshot?.caffeine_mg ?? 0;
  const screenTime = snapshot?.screen_time_minutes ?? 0;
  const sleep = snapshot?.sleep_hours ?? 0;

  return [
    {
      label: 'Air minum',
      value: `${hydration} ml`,
      target: `Target ${HYDRATION_TARGET} ml`,
      progress: clampPercent((hydration / HYDRATION_TARGET) * 100),
      tone: 'border-blue-300/20 bg-blue-300/10 text-blue-200',
      icon: Droplet,
    },
    {
      label: 'Kafein',
      value: `${caffeine} mg`,
      target: `Batas ${CAFFEINE_LIMIT} mg`,
      progress: clampPercent(100 - (caffeine / CAFFEINE_LIMIT) * 100),
      tone: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
      icon: Coffee,
    },
    {
      label: 'Screen time',
      value: `${screenTime} m`,
      target: `Batas ${SCREEN_LIMIT} m`,
      progress: clampPercent(100 - (screenTime / SCREEN_LIMIT) * 100),
      tone: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200',
      icon: Monitor,
    },
    {
      label: 'Tidur',
      value: `${sleep} h`,
      target: `Goal 7-8 h`,
      progress: clampPercent((sleep / SLEEP_TARGET) * 100),
      tone: 'border-violet-300/20 bg-violet-300/10 text-violet-200',
      icon: Moon,
    },
  ];
}

function buildHealthReadiness(snapshot: HealthSnapshot | null) {
  if (!snapshot) {
    return {
      score: 0,
      label: 'Belum ada data',
      tone: 'text-slate-300',
      message: 'Catat air, tidur, kafein, atau screen time untuk melihat kesiapan hari ini.',
    };
  }

  const hydrationScore = clampPercent((snapshot.hydration_ml / HYDRATION_TARGET) * 100);
  const caffeineScore = clampPercent(100 - (snapshot.caffeine_mg / CAFFEINE_LIMIT) * 100);
  const screenScore = clampPercent(100 - (snapshot.screen_time_minutes / SCREEN_LIMIT) * 100);
  const sleepScore = snapshot.sleep_hours <= 0 ? 55 : clampPercent((snapshot.sleep_hours / SLEEP_TARGET) * 100);
  const alertPenalty = Math.min(24, snapshot.alerts.length * 8);
  const score = Math.round(((hydrationScore + caffeineScore + screenScore + sleepScore) / 4) - alertPenalty);
  const safeScore = Math.max(0, Math.min(100, score));

  if (safeScore >= 80) {
    return {
      score: safeScore,
      label: 'Siap fokus',
      tone: 'text-emerald-200',
      message: 'Kondisi hari ini cukup stabil. Cocok untuk sesi belajar atau coding yang butuh konsentrasi.',
    };
  }

  if (safeScore >= 55) {
    return {
      score: safeScore,
      label: 'Perlu dijaga',
      tone: 'text-amber-200',
      message: 'Kondisi masih bisa dipakai, tapi ada area yang perlu diperbaiki sebelum sesi panjang.',
    };
  }

  return {
    score: safeScore,
    label: 'Kurangi beban',
    tone: 'text-rose-200',
    message: 'Prioritaskan recovery singkat, hidrasi, dan kurangi screen time sebelum mengambil tugas berat.',
  };
}

function getAlertIcon(type: 'danger' | 'warning' | 'info') {
  switch (type) {
    case 'danger':
      return AlertOctagon;
    case 'warning':
      return AlertTriangle;
    case 'info':
    default:
      return Info;
  }
}

function getAlertStyle(type: 'danger' | 'warning' | 'info') {
  switch (type) {
    case 'danger':
      return 'border-rose-300/20 bg-rose-300/10 text-rose-100';
    case 'warning':
      return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
    case 'info':
    default:
      return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100';
  }
}

function getCategoryLabel(category: 'hydration' | 'caffeine' | 'sleep' | 'screentime') {
  switch (category) {
    case 'hydration':
      return 'Hidrasi';
    case 'caffeine':
      return 'Kafein';
    case 'sleep':
      return 'Tidur';
    case 'screentime':
      return 'Screen time';
  }
}

function playSoftPing() {
  try {
    const AudioContextConstructor = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
    gain.gain.setValueAtTime(0.34, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.55);
  } catch (error) {
    console.warn('Web Audio play failed', error);
  }
}

function randomTargetIndex(previous: number | null) {
  let next = Math.floor(Math.random() * EYE_BREAK_CELLS);
  if (previous !== null && EYE_BREAK_CELLS > 1) {
    while (next === previous) {
      next = Math.floor(Math.random() * EYE_BREAK_CELLS);
    }
  }
  return next;
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatTimerTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
