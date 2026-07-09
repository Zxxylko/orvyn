import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { SmartTaskInput } from '@/components/dashboard/SmartTaskInput';
import { TaskMatrix } from '@/components/dashboard/TaskMatrix';
import { FocusTimer } from '@/components/dashboard/FocusTimer';
import { BurnoutGauge } from '@/components/dashboard/BurnoutGauge';
import { FlowStateCard } from '@/components/dashboard/FlowStateCard';
import { ChronotypeHeatmap } from '@/components/dashboard/ChronotypeHeatmap';
import { useTasks } from '@/hooks/useTasks';
import { useBriefing } from '@/hooks/useBriefing';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useHabits } from '@/hooks/useHabits';
import { getApiErrorMessage, timeBlockApi } from '@/lib/api';
import type { FocusLog } from '@/types/analytics';
import type { Habit } from '@/types/habit';
import type { Task } from '@/types/task';
import { Activity, AlertTriangle, BarChart3, Brain, CalendarCheck, CalendarDays, CheckCircle2, Circle, Edit2, Flame, Loader2, ListTodo, Plus, Target, Trash2, Trophy, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, isPast, isSameDay, isToday, isTomorrow, subDays } from 'date-fns';
import { toast } from 'sonner';

export function DashboardPage() {
  const { tasks, loading, createTask, toggleTaskStatus, deleteTask, updateTask } = useTasks();
  const { briefing, fetchTodayBriefing, generateBriefing } = useBriefing();
  const { snapshot, focusLogs, logFocusSession } = useAnalytics();
  const { habits, createHabit, updateHabit, deleteHabit, checkInHabit, uncheckHabit } = useHabits();

  useEffect(() => {
    fetchTodayBriefing();
  }, [fetchTodayBriefing]);

  const activeTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const priorityBoard = buildPriorityBoard(activeTasks);
  const assistPlan = useMemo(
    () => buildAssistPlan(activeTasks, snapshot?.burnout_level, briefing?.summary_content ?? null),
    [activeTasks, briefing?.summary_content, snapshot?.burnout_level]
  );

  // Real-time statistics override from live snapshot if available
  const displayActiveCount = snapshot !== null ? snapshot.active_tasks : activeTasks.length;
  const displayCompletedCount = snapshot !== null ? snapshot.completed_this_week : completedTasks.length;
  const displayStreak = snapshot !== null ? snapshot.current_streak : 0;
  const displayLongestStreak = snapshot !== null ? snapshot.longest_streak : 0;

  return (
    <div className="space-y-6">
      {/* Dynamic Statistics counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active tasks card */}
        <div className="reactive-card p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex items-center gap-4 relative overflow-hidden shadow-lg">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/15">
            <ListTodo size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
              Tugas Aktif
            </p>
            <p className="text-2xl font-black text-white mt-1.5 leading-none">
              {displayActiveCount}
            </p>
          </div>
        </div>

        {/* Completed tasks card */}
        <div className="reactive-card p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex items-center gap-4 relative overflow-hidden shadow-lg">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
              Selesai Minggu Ini
            </p>
            <p className="text-2xl font-black text-white mt-1.5 leading-none">
              {displayCompletedCount}
            </p>
          </div>
        </div>

        {/* Focus Streak card */}
        <div className="reactive-card p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex items-center gap-4 relative overflow-hidden shadow-lg">
          <div className="p-3 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/15">
            <Flame size={20} className="animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
              Streak Fokus
            </p>
            <p className="text-2xl font-black text-white mt-1.5 leading-none">
              {displayStreak} {displayStreak === 1 ? 'Hari' : 'Hari'}
            </p>
          </div>
        </div>
      </div>

      <StudentDailyFlow plan={assistPlan} />

      <TodayAssist
        plan={assistPlan}
        onGenerateBriefing={generateBriefing}
        onOptimizeSchedule={async () => {
          const response = await timeBlockApi.optimizeSchedule();
          toast.success(response.data?.message || 'Schedule optimized successfully.');
        }}
        onStartTopTask={async () => {
          if (!assistPlan.topTask) {
            window.dispatchEvent(new CustomEvent('orvyn:focus-smart-task'));
            return;
          }

          await updateTask(assistPlan.topTask.id, { status: 'in_progress' });
        }}
      />

      <HabitStreakBoard
        habits={habits}
        onCreateHabit={createHabit}
        onUpdateHabit={updateHabit}
        onDeleteHabit={deleteHabit}
        onCheckIn={checkInHabit}
        onUncheck={uncheckHabit}
      />

      {/* Main dashboard two-column layout grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Side: Input & Core Task list (Takes 2 cols on lg) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Natural language parser input */}
          <SmartTaskInput onSubmit={createTask} />

          <TaskPriorityBoard columns={priorityBoard} />

          {/* Core Task List matrix */}
          <TaskMatrix
            tasks={tasks}
            loading={loading}
            onToggle={toggleTaskStatus}
            onDelete={deleteTask}
          />
        </div>

        {/* Right Side: Productivity Widgets */}
        <div className="space-y-6">
          {/* Quick Briefing Summary Widget */}
          <div className="reactive-card p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-purple-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Ringkasan Hari Ini
                </span>
              </div>
              <Link 
                to="/briefing" 
                className="text-[9px] font-bold text-purple-400 hover:text-purple-300 uppercase tracking-wider transition"
              >
                Buka →
              </Link>
            </div>
            
            {briefing ? (
              <p className="text-xs font-semibold text-slate-300 leading-relaxed line-clamp-3">
                "{briefing.summary_content}"
              </p>
            ) : (
              <p className="text-xs font-semibold text-slate-500 leading-relaxed italic">
                Ringkasan belum dibuat hari ini. Buka Ringkasan Harian untuk melihat beban kuliah.
              </p>
            )}
          </div>

          {/* Pomodoro Focus Timer */}
          <FocusTimer 
            tasks={tasks} 
            onCompleteTask={(id) => updateTask(id, { status: 'completed' })} 
            onLogSession={logFocusSession}
          />

          <FocusMiniChart logs={focusLogs} />

          <StreakTracker
            currentStreak={displayStreak}
            longestStreak={displayLongestStreak}
            logs={focusLogs}
          />

          {/* Live Flow State Score Card */}
          {snapshot !== null && (
            <FlowStateCard
              score={snapshot.flow_state_score}
              currentStreak={snapshot.current_streak}
              longestStreak={snapshot.longest_streak}
              hcf={snapshot.hcf}
            />
          )}

          {/* Burnout/Stress score dial */}
          <BurnoutGauge 
            metrics={briefing ? briefing.health_metrics : null} 
            liveBri={snapshot?.burnout_risk_index}
            liveLevel={snapshot?.burnout_level}
            activeTasksCount={activeTasks.length}
            overdueTasksCount={snapshot !== null ? snapshot.overdue_tasks : 0}
          />

          {/* Chronotype Heatmap block */}
          {snapshot !== null && (
            <ChronotypeHeatmap
              peakHours={snapshot.peak_hours}
              chronotype={snapshot.chronotype}
              confidence={snapshot.avg_focus_rating / 5} // Approximate from ratings
              heatmap={[]} // Falls back gracefully
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface AssistPlan {
  title: string;
  detail: string;
  topTask: Task | null;
  nextDeadline: Task | null;
  overdueCount: number;
  riskLabel: string;
  briefingHint: string;
}

function buildAssistPlan(tasks: Task[], burnoutLevel?: 'low' | 'medium' | 'high', briefingSummary?: string | null): AssistPlan {
  const activeTasks = tasks.filter((task) => task.status !== 'cancelled');
  const overdueTasks = activeTasks.filter((task) => task.deadline && isPast(new Date(task.deadline)));
  const sortedTasks = [...activeTasks].sort((a, b) => {
    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    return aDeadline - bDeadline;
  });
  const nextDeadline = [...activeTasks]
    .filter((task) => task.deadline)
    .sort((a, b) => new Date(a.deadline as string).getTime() - new Date(b.deadline as string).getTime())[0] ?? null;
  const topTask = overdueTasks[0] ?? sortedTasks[0] ?? null;

  if (overdueTasks.length > 0) {
    return {
      title: 'Selesaikan yang terlambat dulu',
      detail: `${overdueTasks.length} tugas sudah lewat deadline. Bereskan ini sebelum menambah komitmen baru.`,
      topTask,
      nextDeadline,
      overdueCount: overdueTasks.length,
      riskLabel: burnoutLevel ?? 'medium',
      briefingHint: briefingSummary ? 'Briefing hari ini sudah siap.' : 'Buat briefing hari ini untuk melihat konteks beban kuliah.',
    };
  }

  if (!topTask) {
    return {
      title: 'Catat tugas pertama yang konkret',
      detail: 'Belum ada tugas aktif. Tambahkan satu tugas dengan deadline atau estimasi durasi.',
      topTask: null,
      nextDeadline: null,
      overdueCount: 0,
      riskLabel: burnoutLevel ?? 'low',
      briefingHint: briefingSummary ? 'Briefing hari ini sudah siap.' : 'Buat briefing setelah menambahkan tugas.',
    };
  }

  return {
    title: 'Mulai dari tugas paling penting',
    detail: `Langkah pertama: ${topTask.title}. Buat blok belajar yang kecil dan terukur.`,
    topTask,
    nextDeadline,
    overdueCount: 0,
    riskLabel: burnoutLevel ?? 'low',
    briefingHint: briefingSummary ? 'Briefing hari ini sudah siap.' : 'Buat briefing hari ini untuk rekomendasi yang lebih tajam.',
  };
}

function StudentDailyFlow({ plan }: { plan: AssistPlan }) {
  const focusTaskInput = () => window.dispatchEvent(new CustomEvent('orvyn:focus-smart-task'));

  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
            <CalendarDays className="h-3.5 w-3.5" />
            Alur Mahasiswa
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Langkah hari ini</h2>
        </div>
        <p className="max-w-xl text-sm font-medium leading-relaxed text-slate-400">
          {plan.topTask ? `Prioritas terdekat: ${plan.topTask.title}` : 'Mulai dengan mencatat satu tugas kuliah yang jelas.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Link
          to="/campus"
          className="focus-ring interactive-surface group rounded-xl border border-white/5 bg-slate-950/35 p-4 transition hover:border-cyan-300/20 hover:bg-cyan-300/10"
        >
          <CalendarCheck className="mb-3 h-5 w-5 text-cyan-300 transition group-hover:scale-105" />
          <p className="text-sm font-bold text-white">Cek kelas</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Ruangan, jam, berangkat</p>
        </Link>

        <button
          type="button"
          onClick={focusTaskInput}
          className="focus-ring interactive-surface group rounded-xl border border-white/5 bg-slate-950/35 p-4 text-left transition hover:border-pink-300/20 hover:bg-pink-300/10"
        >
          <Target className="mb-3 h-5 w-5 text-pink-300 transition group-hover:scale-105" />
          <p className="text-sm font-bold text-white">Tulis tugas</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Deadline, durasi, prioritas</p>
        </button>

        <Link
          to="/calendar"
          className="focus-ring interactive-surface group rounded-xl border border-white/5 bg-slate-950/35 p-4 transition hover:border-emerald-300/20 hover:bg-emerald-300/10"
        >
          <CalendarDays className="mb-3 h-5 w-5 text-emerald-300 transition group-hover:scale-105" />
          <p className="text-sm font-bold text-white">Atur slot</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Belajar, praktikum, istirahat</p>
        </Link>

        <Link
          to="/health"
          className="focus-ring interactive-surface group rounded-xl border border-white/5 bg-slate-950/35 p-4 transition hover:border-amber-300/20 hover:bg-amber-300/10"
        >
          <Activity className="mb-3 h-5 w-5 text-amber-300 transition group-hover:scale-105" />
          <p className="text-sm font-bold text-white">Jaga energi</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Tidur, air, screen time</p>
        </Link>
      </div>
    </div>
  );
}

function TodayAssist({
  plan,
  onGenerateBriefing,
  onOptimizeSchedule,
  onStartTopTask,
}: {
  plan: AssistPlan;
  onGenerateBriefing: () => Promise<void>;
  onOptimizeSchedule: () => Promise<void>;
  onStartTopTask: () => Promise<void>;
}) {
  const [runningAction, setRunningAction] = useState<'focus' | 'briefing' | 'schedule' | null>(null);

  const runAction = async (action: 'focus' | 'briefing' | 'schedule', callback: () => Promise<void>) => {
    setRunningAction(action);
    try {
      await callback();
      if (action === 'focus') {
        toast.success(plan.topTask ? 'Tugas utama dipindah ke in progress.' : 'Input tugas siap diisi.');
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Aksi gagal'));
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
              <Zap className="h-3 w-3" />
              Asisten Hari Ini
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Beban: {plan.riskLabel}
            </span>
            {plan.nextDeadline && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Deadline: {format(new Date(plan.nextDeadline.deadline as string), 'MMM d, h:mm a')}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-white">{plan.title}</h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-slate-400">{plan.detail}</p>
          <p className="mt-3 text-xs font-semibold text-slate-500">{plan.briefingHint}</p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[420px]">
          <button
            type="button"
            onClick={() => void runAction('focus', onStartTopTask)}
            disabled={runningAction !== null}
            className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runningAction === 'focus' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {plan.topTask ? 'Mulai Tugas' : 'Tambah Tugas'}
          </button>
          <button
            type="button"
            onClick={() => void runAction('schedule', onOptimizeSchedule)}
            disabled={runningAction !== null}
            className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runningAction === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
            Jadwal
          </button>
          <button
            type="button"
            onClick={() => void runAction('briefing', onGenerateBriefing)}
            disabled={runningAction !== null}
            className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runningAction === 'briefing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            Briefing
          </button>
        </div>
      </div>
    </div>
  );
}

function HabitStreakBoard({
  habits,
  onCreateHabit,
  onUpdateHabit,
  onDeleteHabit,
  onCheckIn,
  onUncheck,
}: {
  habits: Habit[];
  onCreateHabit: (data: { name: string; category?: string; unit?: string; color?: string }) => Promise<Habit>;
  onUpdateHabit: (id: string, data: { name?: string; category?: string; unit?: string; color?: string; is_active?: boolean }) => Promise<Habit>;
  onDeleteHabit: (id: string) => Promise<void>;
  onCheckIn: (id: string) => Promise<Habit>;
  onUncheck: (id: string) => Promise<Habit>;
}) {
  const [habitName, setHabitName] = useState('');
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [saving, setSaving] = useState(false);
  const activeHabits = habits.filter((habit) => habit.is_active);

  const submitHabit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = habitName.trim();
    if (!name) return;

    setSaving(true);
    try {
      if (editingHabit) {
        await onUpdateHabit(editingHabit.id, {
          name,
          unit: name.toLowerCase().includes('lari') ? 'run' : editingHabit.unit,
        });
        setEditingHabit(null);
      } else {
        await onCreateHabit({
          name,
          category: 'health',
          unit: name.toLowerCase().includes('lari') ? 'run' : 'session',
          color: 'pink',
        });
      }
      setHabitName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-pink-300" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Habit Harian
            </span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Jaga kebiasaan penting</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-400">
            Lari, baca, minum air, tidur tepat waktu, atau rutinitas kecil lain.
          </p>
        </div>

        <form onSubmit={submitHabit} className="flex w-full flex-col gap-2 sm:flex-row lg:w-[420px]">
          <input
            value={habitName}
            onChange={(event) => setHabitName(event.target.value)}
            placeholder="Contoh: Lari setiap hari"
            className="focus-ring min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-pink-300/40"
          />
          <button
            type="submit"
            disabled={saving || !habitName.trim()}
            className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingHabit ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingHabit ? 'Update Habit' : 'Tambah Habit'}
          </button>
          {editingHabit && (
            <button
              type="button"
              onClick={() => {
                setEditingHabit(null);
                setHabitName('');
              }}
              className="focus-ring interactive-surface rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.09]"
            >
              Batal
            </button>
          )}
        </form>
      </div>

      {activeHabits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/25 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-300">Belum ada habit.</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Tambahkan “Lari setiap hari”, lalu check-in setiap hari.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {activeHabits.slice(0, 3).map((habit) => (
            <HabitStreakCard
              key={habit.id}
              habit={habit}
              onEdit={() => {
                setEditingHabit(habit);
                setHabitName(habit.name);
              }}
              onDelete={() => onDeleteHabit(habit.id)}
              onCheckIn={() => onCheckIn(habit.id)}
              onUncheck={() => onUncheck(habit.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HabitStreakCard({
  habit,
  onEdit,
  onDelete,
  onCheckIn,
  onUncheck,
}: {
  habit: Habit;
  onEdit: () => void;
  onDelete: () => void;
  onCheckIn: () => Promise<Habit>;
  onUncheck: () => Promise<Habit>;
}) {
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 7 }, (_, index) => subDays(new Date(), 6 - index));
  const completedDays = days.map((day) =>
    habit.check_ins.some((checkIn) => isSameDay(new Date(checkIn.check_in_date), day))
  );

  const toggleToday = async () => {
    setBusy(true);
    try {
      await (habit.checked_in_today ? onUncheck() : onCheckIn());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reactive-card rounded-xl border border-white/5 bg-slate-950/35 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{habit.name}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {habit.category} / {habit.target_per_day} {habit.unit}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-widest ${
              habit.checked_in_today
                ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
                : 'border-white/10 bg-white/[0.04] text-slate-400'
            }`}
          >
            {habit.checked_in_today ? 'Selesai' : 'Hari ini'}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-500 transition hover:text-pink-200"
            aria-label="Edit habit"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-500 transition hover:text-rose-200"
            aria-label="Delete habit"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Streak</p>
          <p className="mt-1 text-2xl font-black text-white">{habit.current_streak}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Terbaik</p>
          <p className="mt-1 text-2xl font-black text-white">{habit.longest_streak}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div
            key={day.toISOString()}
            className={`flex h-9 items-center justify-center rounded-lg border text-[9px] font-black uppercase transition ${
              completedDays[index]
                ? 'border-pink-300/20 bg-pink-300/10 text-pink-100'
                : 'border-white/5 bg-white/[0.025] text-slate-600'
            }`}
            title={format(day, 'MMM d')}
          >
            {format(day, 'EEEEE')}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void toggleToday()}
        disabled={busy}
        className={`focus-ring interactive-surface inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          habit.checked_in_today
            ? 'border border-white/10 bg-white/[0.055] text-slate-200 hover:bg-white/[0.09]'
            : 'bg-pink-200 text-slate-950 hover:bg-pink-100'
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {habit.checked_in_today ? 'Batalkan hari ini' : 'Check-in hari ini'}
      </button>
    </div>
  );
}

function FocusMiniChart({ logs }: { logs: FocusLog[] }) {
  const days = Array.from({ length: 7 }, (_, index) => subDays(new Date(), 6 - index));
  const dailyMinutes = days.map((day) =>
    logs
      .filter((log) => isSameDay(new Date(log.started_at), day))
      .reduce((total, log) => total + log.actual_minutes, 0)
  );
  const maxMinutes = Math.max(60, ...dailyMinutes);
  const totalMinutes = dailyMinutes.reduce((sum, minutes) => sum + minutes, 0);

  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-300" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Tren Fokus
          </span>
        </div>
        <span className="text-[10px] font-bold text-slate-500">{totalMinutes}m / 7d</span>
      </div>

      <div className="flex h-28 items-end gap-2">
        {dailyMinutes.map((minutes, index) => (
          <div key={days[index].toISOString()} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-20 w-full items-end rounded-full bg-slate-950/60 p-1">
              <div
                className="w-full rounded-full bg-cyan-300/80 shadow-[0_0_12px_rgba(103,232,249,0.35)] transition-all duration-500"
                style={{ height: `${Math.max(8, (minutes / maxMinutes) * 100)}%` }}
                title={`${minutes} focus minutes`}
              />
            </div>
            <span className="text-[9px] font-bold uppercase text-slate-600">
              {format(days[index], 'EEE')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StreakTracker({
  currentStreak,
  longestStreak,
  logs,
}: {
  currentStreak: number;
  longestStreak: number;
  logs: FocusLog[];
}) {
  const days = Array.from({ length: 7 }, (_, index) => subDays(new Date(), 6 - index));
  const completedDays = days.map((day) =>
    logs.some((log) => log.completed && isSameDay(new Date(log.started_at), day))
  );
  const loggedToday = logs.some((log) => log.completed && isToday(new Date(log.started_at)));
  const weekCompletion = completedDays.filter(Boolean).length;
  const statusText = loggedToday
    ? 'Streak hari ini aman. Sesi tambahan tetap membantu ritme belajar.'
    : 'Selesaikan satu sesi fokus hari ini untuk menjaga streak.';

  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Flame className="h-4 w-4 text-pink-300" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Penjaga Streak
            </span>
          </div>
          <p className="text-sm font-semibold leading-relaxed text-slate-300">{statusText}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${
            loggedToday
              ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
              : 'border-amber-300/20 bg-amber-300/10 text-amber-200'
          }`}
        >
          {loggedToday ? 'Aman' : 'Terbuka'}
        </span>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2">
        <div className="reactive-card rounded-xl border border-white/5 bg-slate-950/40 p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Streak</p>
          <p className="mt-1 text-xl font-black text-white">{currentStreak}</p>
        </div>
        <div className="reactive-card rounded-xl border border-white/5 bg-slate-950/40 p-3">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
            <Trophy className="h-3 w-3 text-amber-300" />
            Terbaik
          </div>
          <p className="mt-1 text-xl font-black text-white">{longestStreak}</p>
        </div>
        <div className="reactive-card rounded-xl border border-white/5 bg-slate-950/40 p-3">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
            <CalendarDays className="h-3 w-3 text-cyan-300" />
            Pekan
          </div>
          <p className="mt-1 text-xl font-black text-white">{weekCompletion}/7</p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, index) => {
          const completed = completedDays[index];
          return (
            <div
              key={day.toISOString()}
              className={`reactive-card flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border transition duration-300 ${
                completed
                  ? 'border-pink-300/20 bg-pink-300/10 text-pink-100 shadow-[0_0_16px_rgba(244,114,182,0.16)]'
                  : 'border-white/5 bg-slate-950/35 text-slate-500'
              }`}
              title={completed ? 'Sesi fokus selesai' : 'Belum ada sesi fokus'}
            >
              {completed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              <span className="text-[9px] font-bold uppercase">{format(day, 'EEE')}</span>
              <span className="text-[10px] font-semibold">{format(day, 'd')}</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('orvyn:focus-smart-task'))}
        className="focus-ring interactive-surface mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.09]"
      >
        <Target className="h-4 w-4" />
        {loggedToday ? 'Rencanakan fokus lagi' : 'Mulai fokus hari ini'}
      </button>
    </div>
  );
}

function buildPriorityBoard(tasks: Task[]) {
  const sortedTasks = [...tasks].sort((a, b) => {
    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    return aDeadline - bDeadline;
  });

  const blocked = sortedTasks
    .filter((task) => task.status === 'cancelled')
    .slice(0, 3);
  const now = sortedTasks
    .filter((task) => task.status !== 'cancelled' && task.deadline && (isPast(new Date(task.deadline)) || isToday(new Date(task.deadline))))
    .slice(0, 3);
  const next = sortedTasks
    .filter((task) => task.status !== 'cancelled' && task.deadline && isTomorrow(new Date(task.deadline)))
    .slice(0, 3);
  const later = sortedTasks
    .filter((task) => task.status !== 'cancelled' && !now.includes(task) && !next.includes(task))
    .slice(0, 3);

  return [
    { label: 'Hari Ini', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/20', tasks: now },
    { label: 'Besok', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20', tasks: next },
    { label: 'Nanti', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20', tasks: later },
    { label: 'Ditahan', tone: 'text-slate-300 bg-slate-500/10 border-white/10', tasks: blocked },
  ];
}

function TaskPriorityBoard({ columns }: { columns: ReturnType<typeof buildPriorityBoard> }) {
  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-xl backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-cyan-300" />
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Papan Prioritas
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {columns.map((column) => (
          <div key={column.label} className="reactive-card rounded-xl border border-white/5 bg-slate-950/40 p-3">
            <div className={`mb-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${column.tone}`}>
              {column.label}
            </div>
            <div className="space-y-2">
              {column.tasks.length > 0 ? (
                column.tasks.map((task) => (
                  <div key={task.id} className="reactive-card rounded-lg border border-white/5 bg-white/[0.035] p-2.5">
                    <p className="line-clamp-2 text-xs font-bold text-white">{task.title}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {task.priority}
                      {task.deadline ? ` / ${new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-[10px] font-semibold text-slate-600">
                  Kosong
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
