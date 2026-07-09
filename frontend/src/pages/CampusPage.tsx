import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { addMinutes, format, subMinutes } from 'date-fns';
import {
  BookOpen,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Code2,
  Coffee,
  Edit2,
  Laptop,
  Loader2,
  MapPin,
  Plus,
  Route,
  ShieldCheck,
  Trash2,
  Umbrella,
  Wifi,
} from 'lucide-react';
import { useCampusSchedules } from '@/hooks/useCampusSchedules';
import type { CampusClassType, CampusSchedule, CreateCampusScheduleData } from '@/types/campus';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_FORM = {
  course_name: '',
  course_code: '',
  lecturer: '',
  building: 'TULT',
  room: '',
  day_of_week: new Date().getDay(),
  start_time: '08:30',
  end_time: '10:30',
  class_type: 'lecture' as CampusClassType,
  commute_minutes: 35,
  prep_minutes: 20,
  notes: '',
};

export function CampusPage() {
  const { schedules, loading, createSchedule, updateSchedule, deleteSchedule } = useCampusSchedules();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingSchedule, setEditingSchedule] = useState<CampusSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const now = useMemo(() => new Date(), []);
  const todayIndex = now.getDay();

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.is_active).sort(sortSchedules),
    [schedules]
  );
  const todaySchedules = useMemo(
    () => activeSchedules.filter((schedule) => schedule.day_of_week === todayIndex),
    [activeSchedules, todayIndex]
  );
  const nextSchedule = useMemo(
    () => todaySchedules.find((schedule) => parseTimeToday(schedule.end_time) > now) ?? null,
    [todaySchedules, now]
  );
  const weeklyMinutes = activeSchedules.reduce((total, schedule) => total + durationMinutes(schedule), 0);
  const departureTime = nextSchedule
    ? format(subMinutes(parseTimeToday(nextSchedule.start_time), nextSchedule.commute_minutes + nextSchedule.prep_minutes), 'HH:mm')
    : '--:--';

  const submitSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.course_name.trim()) return;

    const payload: CreateCampusScheduleData = {
      course_name: form.course_name.trim(),
      course_code: emptyToUndefined(form.course_code),
      lecturer: emptyToUndefined(form.lecturer),
      building: emptyToUndefined(form.building),
      room: emptyToUndefined(form.room),
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
      class_type: form.class_type,
      commute_minutes: Number(form.commute_minutes),
      prep_minutes: Number(form.prep_minutes),
      notes: emptyToUndefined(form.notes),
    };

    setSaving(true);
    try {
      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, payload);
        setEditingSchedule(null);
      } else {
        await createSchedule(payload);
      }
      setForm({ ...DEFAULT_FORM, day_of_week: Number(form.day_of_week) });
    } finally {
      setSaving(false);
    }
  };

  const startEditingSchedule = (schedule: CampusSchedule) => {
    setEditingSchedule(schedule);
    setForm({
      course_name: schedule.course_name,
      course_code: schedule.course_code ?? '',
      lecturer: schedule.lecturer ?? '',
      building: schedule.building ?? '',
      room: schedule.room ?? '',
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time.slice(0, 5),
      end_time: schedule.end_time.slice(0, 5),
      class_type: schedule.class_type,
      commute_minutes: schedule.commute_minutes,
      prep_minutes: schedule.prep_minutes,
      notes: schedule.notes ?? '',
    });
  };

  const cancelEditingSchedule = () => {
    setEditingSchedule(null);
    setForm(DEFAULT_FORM);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
              <MapPin className="h-3.5 w-3.5" />
              Telkom University / Informatika
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Campus Life</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-400">
              {format(now, 'EEEE, MMM d')} in Bandung. Keep classes, commute, and daily campus readiness in one view.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
            <CampusStat label="Today" value={`${todaySchedules.length}`} detail="classes" icon={CalendarDays} />
            <CampusStat label="Depart" value={departureTime} detail={nextSchedule?.building ?? 'next class'} icon={Route} />
            <CampusStat label="Weekly" value={`${Math.round(weeklyMinutes / 60)}h`} detail="scheduled" icon={Clock3} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-cyan-300" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Today Timeline
                  </span>
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-white">{DAYS[todayIndex]}</h2>
              </div>
              {loading && <Loader2 className="h-5 w-5 animate-spin text-slate-500" />}
            </div>

            {todaySchedules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/25 px-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-300">No campus schedule today.</p>
                <p className="mt-1 text-xs font-medium text-slate-500">Good day for project work, review, or recovery.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todaySchedules.map((schedule) => (
                  <CampusTodayCard
                    key={schedule.id}
                    schedule={schedule}
                    onEdit={() => startEditingSchedule(schedule)}
                    onDelete={() => deleteSchedule(schedule.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <WeeklyScheduleGrid schedules={activeSchedules} />
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
            <div className="mb-5 flex items-center gap-2">
              <Plus className="h-4 w-4 text-pink-300" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {editingSchedule ? 'Edit Class' : 'Add Class'}
              </span>
            </div>

            <form onSubmit={submitSchedule} className="space-y-3">
              <input
                value={form.course_name}
                onChange={(event) => setForm({ ...form, course_name: event.target.value })}
                placeholder="Struktur Data"
                className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={form.course_code}
                  onChange={(event) => setForm({ ...form, course_code: event.target.value })}
                  placeholder="Course code"
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
                />
                <select
                  value={form.class_type}
                  onChange={(event) => setForm({ ...form, class_type: event.target.value as CampusClassType })}
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
                >
                  <option value="lecture">Lecture</option>
                  <option value="lab">Lab</option>
                  <option value="project">Project</option>
                  <option value="exam">Exam</option>
                  <option value="seminar">Seminar</option>
                </select>
              </div>
              <input
                value={form.lecturer}
                onChange={(event) => setForm({ ...form, lecturer: event.target.value })}
                placeholder="Lecturer"
                className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={form.building}
                  onChange={(event) => setForm({ ...form, building: event.target.value })}
                  placeholder="Building"
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
                />
                <input
                  value={form.room}
                  onChange={(event) => setForm({ ...form, room: event.target.value })}
                  placeholder="Room"
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={form.day_of_week}
                  onChange={(event) => setForm({ ...form, day_of_week: Number(event.target.value) })}
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
                >
                  {DAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {DAY_SHORT[index]}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(event) => setForm({ ...form, start_time: event.target.value })}
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
                />
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(event) => setForm({ ...form, end_time: event.target.value })}
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">Commute</span>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={form.commute_minutes}
                    onChange={(event) => setForm({ ...form, commute_minutes: Number(event.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">Prep</span>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={form.prep_minutes}
                    onChange={(event) => setForm({ ...form, prep_minutes: Number(event.target.value) })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
                  />
                </label>
              </div>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Quiz, laptop lab, group meeting..."
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
              />
              <button
                type="submit"
                disabled={saving || !form.course_name.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editingSchedule ? 'Update Schedule' : 'Save Schedule'}
              </button>
              {editingSchedule && (
                <button
                  type="button"
                  onClick={cancelEditingSchedule}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.09]"
                >
                  Cancel edit
                </button>
              )}
            </form>
          </section>

          <CampusReadinessPanel nextSchedule={nextSchedule} />
        </div>
      </div>
    </div>
  );
}

function CampusStat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CalendarDays;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        <Icon className="h-3 w-3 text-cyan-300" />
        {label}
      </div>
      <p className="truncate text-xl font-black text-white">{value}</p>
      <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{detail}</p>
    </div>
  );
}

function CampusTodayCard({
  schedule,
  onEdit,
  onDelete,
}: {
  schedule: CampusSchedule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const start = parseTimeToday(schedule.start_time);
  const end = parseTimeToday(schedule.end_time);
  const depart = subMinutes(start, schedule.commute_minutes + schedule.prep_minutes);
  const postClass = addMinutes(end, 20);
  const status = getScheduleStatus(schedule);
  const tone = getTypeTone(schedule.class_type);

  return (
    <div className="group rounded-xl border border-white/5 bg-slate-950/35 p-4 transition hover:border-white/10 hover:bg-white/[0.045]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${tone}`}>
              {schedule.class_type}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
              {status}
            </span>
          </div>
          <h3 className="truncate text-base font-bold text-white">{schedule.course_name}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {[schedule.course_code, schedule.lecturer].filter(Boolean).join(' / ') || 'No code or lecturer'}
          </p>
        </div>

        <div className="flex gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-500 transition hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-300"
            aria-label={`Edit ${schedule.course_name}`}
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-500 transition hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-300"
            aria-label={`Delete ${schedule.course_name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MiniInfo icon={Clock3} label="Class" value={`${schedule.start_time} - ${schedule.end_time}`} />
        <MiniInfo icon={Route} label="Leave" value={format(depart, 'HH:mm')} />
        <MiniInfo icon={MapPin} label="Location" value={[schedule.building, schedule.room].filter(Boolean).join(' / ') || 'TBA'} />
        <MiniInfo icon={BookOpen} label="After" value={format(postClass, 'HH:mm')} />
      </div>

      {schedule.notes && (
        <p className="mt-3 rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2 text-xs font-medium leading-relaxed text-slate-400">
          {schedule.notes}
        </p>
      )}
    </div>
  );
}

function WeeklyScheduleGrid({ schedules }: { schedules: CampusSchedule[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-cyan-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Weekly Map
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {DAYS.map((day, dayIndex) => {
          const daySchedules = schedules.filter((schedule) => schedule.day_of_week === dayIndex);
          return (
            <div key={day} className="min-h-[148px] rounded-xl border border-white/5 bg-slate-950/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{DAY_SHORT[dayIndex]}</p>
                <span className="text-[10px] font-black text-slate-600">{daySchedules.length}</span>
              </div>
              <div className="space-y-2">
                {daySchedules.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/5 px-2 py-5 text-center text-[10px] font-semibold text-slate-700">
                    Clear
                  </p>
                ) : (
                  daySchedules.map((schedule) => (
                    <div key={schedule.id} className="rounded-lg border border-white/5 bg-white/[0.035] p-2">
                      <p className="line-clamp-2 text-[11px] font-bold leading-snug text-white">{schedule.course_name}</p>
                      <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        {schedule.start_time} / {schedule.building ?? 'TBA'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CampusReadinessPanel({ nextSchedule }: { nextSchedule: CampusSchedule | null }) {
  const kit = [
    { icon: Laptop, label: 'Laptop + charger', detail: 'coding, praktikum, tubes' },
    { icon: Wifi, label: 'Hotspot backup', detail: 'lab/network fallback' },
    { icon: Umbrella, label: 'Umbrella or jacket', detail: 'Bandung rain buffer' },
    { icon: Coffee, label: 'Meal budget', detail: 'keep one planned meal' },
    { icon: Code2, label: 'Git checkpoint', detail: 'push before leaving' },
    { icon: ShieldCheck, label: 'KTM + essentials', detail: 'campus access ready' },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Campus Readiness
        </span>
      </div>

      <div className="mb-4 rounded-xl border border-cyan-300/15 bg-cyan-300/10 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-200">Next move</p>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
          {nextSchedule
            ? `${nextSchedule.course_name} at ${nextSchedule.start_time}, ${[nextSchedule.building, nextSchedule.room].filter(Boolean).join(' / ') || 'location TBA'}.`
            : 'No remaining class today. Use the next block for assignment progress or recovery.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {kit.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/30 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{item.label}</p>
                <p className="truncate text-[10px] font-semibold text-slate-500">{item.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-white/5 bg-slate-950/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Bus className="h-4 w-4 text-amber-300" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Bandung Buffer</p>
        </div>
        <p className="text-xs font-medium leading-relaxed text-slate-400">
          Keep 35-45 minutes for commute around rush hours near Dayeuhkolot, Bojongsoang, and Buah Batu.
        </p>
      </div>
    </section>
  );
}

function MiniInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        <Icon className="h-3 w-3 text-slate-400" />
        {label}
      </div>
      <p className="truncate text-xs font-bold text-white">{value}</p>
    </div>
  );
}

function sortSchedules(a: CampusSchedule, b: CampusSchedule) {
  if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
  return a.start_time.localeCompare(b.start_time);
}

function parseTimeToday(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function durationMinutes(schedule: CampusSchedule) {
  const start = parseTimeToday(schedule.start_time);
  const end = parseTimeToday(schedule.end_time);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function getScheduleStatus(schedule: CampusSchedule) {
  const now = new Date();
  const start = parseTimeToday(schedule.start_time);
  const end = parseTimeToday(schedule.end_time);
  const depart = subMinutes(start, schedule.commute_minutes + schedule.prep_minutes);

  if (now > end) return 'Done';
  if (now >= start && now <= end) return 'Now';
  if (now >= depart && now < start) return 'Leave';
  return 'Upcoming';
}

function getTypeTone(type: CampusClassType) {
  const tones = {
    lecture: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200',
    lab: 'border-pink-300/20 bg-pink-300/10 text-pink-200',
    project: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
    exam: 'border-rose-300/20 bg-rose-300/10 text-rose-200',
    seminar: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
  };

  return tones[type];
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
