import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CalendarClock,
  CheckCircle2,
  Code2,
  Compass,
  Edit2,
  ExternalLink,
  Flame,
  GraduationCap,
  HeartPulse,
  Link2,
  Loader2,
  MapPin,
  Plus,
  ShieldAlert,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { differenceInCalendarDays, format, isAfter, isBefore, startOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAcademic } from '@/hooks/useAcademic';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useCampusSchedules } from '@/hooks/useCampusSchedules';
import { useFinance } from '@/hooks/useFinance';
import { useHabits } from '@/hooks/useHabits';
import { useHealth } from '@/hooks/useHealth';
import { useTasks } from '@/hooks/useTasks';
import type { AcademicTask, AcademicTaskStatus, AcademicTaskType } from '@/types/telu';
import type { CampusClassType, CampusSchedule, CreateCampusScheduleData } from '@/types/campus';
import type { Task, TaskPriority, TaskStatus } from '@/types/task';
import { MotionCrossfade } from '@/components/ui/UXSkeletons';
import { MotionModal, ScrollReveal, StaggerGroup, StaggerItem } from '@/components/ui/motion';

type CaptureMode = 'task' | 'academic' | 'habit' | 'expense';
type ExpenseCategory = 'rent' | 'food' | 'laundry' | 'coffee' | 'developer_sub' | 'other';

interface DeadlineItem {
  id: string;
  title: string;
  source: 'task' | 'academic';
  course: string;
  type: string;
  deadline: Date;
  status: string;
  priority: TaskPriority;
  lmsUrl?: string | null;
}

interface CourseSummary {
  name: string;
  code?: string | null;
  lecturer?: string | null;
  meetings: number;
  weeklyMinutes: number;
  activeTasks: number;
  exams: number;
  projects: number;
  nextDeadline: DeadlineItem | null;
  links: Array<{ title: string; url: string }>;
}

const ACADEMIC_TYPE_LABEL: Record<AcademicTaskType, string> = {
  tp: 'TP',
  praktikum: 'Praktikum',
  jurnal: 'Jurnal',
  tubes: 'Tubes',
  exam: 'Ujian',
};

export function StudentHubPage() {
  const {
    tasks,
    createTask,
    updateTask: updateGeneralTask,
    deleteTask: deleteGeneralTask,
  } = useTasks();
  const {
    tasks: academicTasks,
    createTask: createAcademicTask,
    updateTask: updateAcademicTask,
    deleteTask: deleteAcademicTask,
  } = useAcademic();
  const {
    schedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  } = useCampusSchedules();
  const { habits, createHabit, checkInHabit } = useHabits();
  const { summary, logExpense } = useFinance();
  const { snapshot: healthSnapshot } = useHealth();
  const { snapshot: analyticsSnapshot } = useAnalytics();

  const [captureMode, setCaptureMode] = useState<CaptureMode>('task');
  const [quickText, setQuickText] = useState('');
  const [courseName, setCourseName] = useState('');
  const [academicTitle, setAcademicTitle] = useState('');
  const [academicType, setAcademicType] = useState<AcademicTaskType>('tubes');
  const [academicDeadline, setAcademicDeadline] = useState('');
  const [academicLink, setAcademicLink] = useState('');
  const [habitName, setHabitName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('food');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [academicEditor, setAcademicEditor] = useState<{ task: AcademicTask | null; courseName?: string } | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<{ schedule: CampusSchedule | null; courseName?: string } | null>(null);
  const [taskEditor, setTaskEditor] = useState<Task | null>(null);

  const deadlineRadar = useMemo(
    () => buildDeadlineRadar(tasks, academicTasks),
    [academicTasks, tasks]
  );
  const urgentDeadlines = deadlineRadar.filter((item) => daysUntil(item.deadline) <= 7).slice(0, 6);
  const courseSummaries = useMemo(
    () => buildCourseSummaries(schedules, academicTasks, deadlineRadar),
    [academicTasks, deadlineRadar, schedules]
  );
  const projectTasks = useMemo(
    () => buildProjectTracker(tasks, academicTasks),
    [academicTasks, tasks]
  );
  const examTasks = academicTasks
    .filter((task) => task.task_type === 'exam' && task.status !== 'completed')
    .sort(sortAcademicByDeadline);
  const lmsLinks = buildLmsLinks(academicTasks);
  const nextClass = findNextClass(schedules);
  const unCheckedHabits = habits.filter((habit) => habit.is_active && !habit.checked_in_today);
  const budgetUsed = summary ? Math.max(0, summary.monthly_limit - summary.remaining_budget) : 0;
  const budgetPercent = summary && summary.monthly_limit > 0
    ? Math.min(100, Math.round((budgetUsed / summary.monthly_limit) * 100))
    : 0;

  const submitQuickCapture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);

    try {
      if (captureMode === 'task') {
        if (!quickText.trim()) throw new Error('Tulis tugas dulu.');
        await createTask(quickText.trim());
        setQuickText('');
      }

      if (captureMode === 'academic') {
        if (!courseName.trim() || !academicTitle.trim()) {
          throw new Error('Isi mata kuliah dan judul tugas.');
        }

        await createAcademicTask({
          course_name: courseName.trim(),
          task_type: academicType,
          title: academicTitle.trim(),
          deadline: academicDeadline || undefined,
          lms_url: academicLink.trim() || undefined,
          status: 'todo',
        });
        setAcademicTitle('');
        setAcademicDeadline('');
        setAcademicLink('');
      }

      if (captureMode === 'habit') {
        if (!habitName.trim()) throw new Error('Isi nama habit.');
        await createHabit({
          name: habitName.trim(),
          category: 'personal',
          unit: habitName.toLowerCase().includes('lari') ? 'run' : 'session',
          color: 'pink',
        });
        setHabitName('');
      }

      if (captureMode === 'expense') {
        const amount = Number(expenseAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Nominal pengeluaran belum valid.');
        }

        await logExpense({
          amount,
          category: expenseCategory,
          description: expenseDescription.trim() || undefined,
          expense_date: format(new Date(), 'yyyy-MM-dd'),
        });
        setExpenseAmount('');
        setExpenseDescription('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
              <Compass className="h-3.5 w-3.5" />
              Student Hub
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Pusat Kendali Hidup Mahasiswa</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-400">
              Satu layar untuk semester, deadline, tubes, LMS, ujian, uang bulanan, habit, dan kesehatan.
            </p>
          </div>

          <StaggerGroup className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[640px]">
            <StaggerItem><HubStat icon={AlertTriangle} label="Deadline 7 hari" value={String(urgentDeadlines.length)} tone="text-rose-300" /></StaggerItem>
            <StaggerItem><HubStat icon={GraduationCap} label="Matkul aktif" value={String(courseSummaries.length)} tone="text-cyan-300" /></StaggerItem>
            <StaggerItem><HubStat icon={Code2} label="Tubes/proyek" value={String(projectTasks.length)} tone="text-amber-300" /></StaggerItem>
            <StaggerItem><HubStat icon={Flame} label="Habit belum" value={String(unCheckedHabits.length)} tone="text-pink-300" /></StaggerItem>
          </StaggerGroup>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <ScrollReveal amount={0.1}><DailyStudentBrief
            nextClass={nextClass}
            urgentDeadlines={urgentDeadlines}
            unCheckedHabits={unCheckedHabits}
            budgetPercent={budgetPercent}
            healthAlerts={healthSnapshot?.alerts ?? []}
            burnoutLevel={analyticsSnapshot?.burnout_level}
          /></ScrollReveal>

          <ScrollReveal amount={0.1}><DeadlineRadar items={deadlineRadar} /></ScrollReveal>

          <ScrollReveal amount={0.1}><SemesterPlanner
            courses={courseSummaries}
            schedules={schedules}
            academicTasks={academicTasks}
            onCreateSchedule={(course) => setScheduleEditor({ schedule: null, courseName: course })}
            onCreateAcademicTask={(course) => setAcademicEditor({ task: null, courseName: course })}
            onEditSchedule={(schedule) => setScheduleEditor({ schedule })}
            onDeleteSchedule={(id) => void deleteSchedule(id)}
            onEditAcademicTask={(task) => setAcademicEditor({ task })}
            onDeleteAcademicTask={(id) => void deleteAcademicTask(id)}
          /></ScrollReveal>

          <ScrollReveal amount={0.1}><ProjectTracker
            items={projectTasks}
            onComplete={(item) => {
              if (item.source === 'academic') void updateAcademicTask(item.id, { status: 'completed' });
              if (item.source === 'task') void updateGeneralTask(item.id, { status: 'completed' });
            }}
            onEdit={(item) => {
              if (item.source === 'academic') {
                const task = academicTasks.find((candidate) => candidate.id === item.id);
                if (task) setAcademicEditor({ task });
              }
              if (item.source === 'task') {
                const task = tasks.find((candidate) => candidate.id === item.id);
                if (task) setTaskEditor(task);
              }
            }}
            onDelete={(item) => {
              if (item.source === 'academic') void deleteAcademicTask(item.id);
              if (item.source === 'task') void deleteGeneralTask(item.id);
            }}
          /></ScrollReveal>
        </div>

        <div className="space-y-6">
          <ScrollReveal amount={0.1}><QuickCapture
            mode={captureMode}
            setMode={setCaptureMode}
            quickText={quickText}
            setQuickText={setQuickText}
            courseName={courseName}
            setCourseName={setCourseName}
            academicTitle={academicTitle}
            setAcademicTitle={setAcademicTitle}
            academicType={academicType}
            setAcademicType={setAcademicType}
            academicDeadline={academicDeadline}
            setAcademicDeadline={setAcademicDeadline}
            academicLink={academicLink}
            setAcademicLink={setAcademicLink}
            habitName={habitName}
            setHabitName={setHabitName}
            expenseAmount={expenseAmount}
            setExpenseAmount={setExpenseAmount}
            expenseCategory={expenseCategory}
            setExpenseCategory={setExpenseCategory}
            expenseDescription={expenseDescription}
            setExpenseDescription={setExpenseDescription}
            saving={saving}
            onSubmit={submitQuickCapture}
          /></ScrollReveal>

          <ScrollReveal amount={0.1}><LmsLinkHub links={lmsLinks} /></ScrollReveal>

          <ScrollReveal amount={0.1}><ExamPreparation exams={examTasks} /></ScrollReveal>

          <ScrollReveal amount={0.1}><BudgetGuard summary={summary} budgetPercent={budgetPercent} /></ScrollReveal>

          <ScrollReveal amount={0.1}><LifeGuard
            habits={unCheckedHabits}
            healthAlerts={healthSnapshot?.alerts ?? []}
            onCheckInHabit={checkInHabit}
          /></ScrollReveal>
        </div>
      </div>

      <MotionModal
        open={academicEditor !== null}
        onBackdropClick={() => setAcademicEditor(null)}
        label="Editor tugas kuliah"
      >
      {academicEditor && (
        <AcademicTaskEditor
          task={academicEditor.task}
          initialCourseName={academicEditor.courseName}
          onClose={() => setAcademicEditor(null)}
          onSave={async (data) => {
            if (academicEditor.task) {
              await updateAcademicTask(academicEditor.task.id, data);
            } else {
              await createAcademicTask(data);
            }
            setAcademicEditor(null);
          }}
        />
      )}
      </MotionModal>

      <MotionModal
        open={scheduleEditor !== null}
        onBackdropClick={() => setScheduleEditor(null)}
        label="Editor jadwal kuliah"
      >
      {scheduleEditor && (
        <ScheduleEditor
          schedule={scheduleEditor.schedule}
          initialCourseName={scheduleEditor.courseName}
          onClose={() => setScheduleEditor(null)}
          onSave={async (data) => {
            if (scheduleEditor.schedule) {
              await updateSchedule(scheduleEditor.schedule.id, data);
            } else {
              await createSchedule(data);
            }
            setScheduleEditor(null);
          }}
        />
      )}
      </MotionModal>

      <MotionModal
        open={taskEditor !== null}
        onBackdropClick={() => setTaskEditor(null)}
        label="Editor project"
      >
      {taskEditor && (
        <GeneralTaskEditor
          task={taskEditor}
          onClose={() => setTaskEditor(null)}
          onSave={async (data) => {
            await updateGeneralTask(taskEditor.id, data);
            setTaskEditor(null);
          }}
        />
      )}
      </MotionModal>
    </div>
  );
}

function HubStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        {label}
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function DailyStudentBrief({
  nextClass,
  urgentDeadlines,
  unCheckedHabits,
  budgetPercent,
  healthAlerts,
  burnoutLevel,
}: {
  nextClass: CampusSchedule | null;
  urgentDeadlines: DeadlineItem[];
  unCheckedHabits: Array<{ id: string; name: string }>;
  budgetPercent: number;
  healthAlerts: Array<{ type: string; message: string }>;
  burnoutLevel?: 'low' | 'medium' | 'high';
}) {
  const primaryDeadline = urgentDeadlines[0];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <Brain className="h-4 w-4 text-cyan-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Daily Student Brief
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BriefTile
          icon={MapPin}
          title={nextClass ? `${nextClass.course_name} ${nextClass.start_time}` : 'Tidak ada kelas tersisa'}
          detail={nextClass ? `${nextClass.building ?? 'Gedung belum diisi'} / ${nextClass.room ?? 'ruang TBA'}` : 'Pakai slot ini untuk tugas atau recovery.'}
          tone="text-cyan-300"
        />
        <BriefTile
          icon={AlertTriangle}
          title={primaryDeadline ? primaryDeadline.title : 'Deadline aman'}
          detail={primaryDeadline ? `${primaryDeadline.course} / ${formatDue(primaryDeadline.deadline)}` : 'Tidak ada deadline kritis dalam 7 hari.'}
          tone="text-rose-300"
        />
        <BriefTile
          icon={Flame}
          title={unCheckedHabits.length > 0 ? `${unCheckedHabits.length} habit belum check-in` : 'Habit hari ini aman'}
          detail={unCheckedHabits[0]?.name ?? 'Rutinitas penting sudah tertutup.'}
          tone="text-pink-300"
        />
        <BriefTile
          icon={HeartPulse}
          title={healthAlerts.length > 0 ? healthAlerts[0].message : `Beban ${burnoutLevel ?? 'low'}`}
          detail={`Budget bulan ini terpakai sekitar ${budgetPercent}%.`}
          tone={healthAlerts.length > 0 ? 'text-amber-300' : 'text-emerald-300'}
        />
      </div>
    </section>
  );
}

function BriefTile({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: typeof MapPin;
  title: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/35 p-4">
      <Icon className={`mb-3 h-5 w-5 ${tone}`} />
      <p className="line-clamp-2 text-sm font-bold text-white">{title}</p>
      <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function DeadlineRadar({ items }: { items: DeadlineItem[] }) {
  const visibleItems = items.slice(0, 8);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-rose-300" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Deadline Radar
          </span>
        </div>
        <Link to="/academic" className="text-[10px] font-bold uppercase tracking-widest text-cyan-300 hover:text-cyan-200">
          Kelola tugas
        </Link>
      </div>

      {visibleItems.length === 0 ? (
        <EmptyState title="Belum ada deadline aktif" detail="Tambahkan tugas kuliah atau task biasa agar radar mulai bekerja." />
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <div key={`${item.source}-${item.id}`} className="flex flex-col gap-3 rounded-xl border border-white/5 bg-slate-950/35 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${deadlineTone(item.deadline)}`}>
                    {formatDue(item.deadline)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                    {item.course} / {item.type}
                  </span>
                </div>
                <p className="truncate text-sm font-bold text-white">{item.title}</p>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {format(item.deadline, 'd MMM, HH:mm', { locale: localeId })}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SemesterPlanner({
  courses,
  schedules,
  academicTasks,
  onCreateSchedule,
  onCreateAcademicTask,
  onEditSchedule,
  onDeleteSchedule,
  onEditAcademicTask,
  onDeleteAcademicTask,
}: {
  courses: CourseSummary[];
  schedules: CampusSchedule[];
  academicTasks: AcademicTask[];
  onCreateSchedule: (courseName: string) => void;
  onCreateAcademicTask: (courseName: string) => void;
  onEditSchedule: (schedule: CampusSchedule) => void;
  onDeleteSchedule: (id: string) => void;
  onEditAcademicTask: (task: AcademicTask) => void;
  onDeleteAcademicTask: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-cyan-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Semester Planner
        </span>
      </div>

      {courses.length === 0 ? (
        <EmptyState title="Semester belum dipetakan" detail="Tambahkan jadwal kelas atau tugas kuliah untuk membuat ringkasan matkul." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {courses.slice(0, 6).map((course) => {
            const courseSchedules = schedules.filter((schedule) => schedule.course_name === course.name);
            const courseTasks = academicTasks.filter((task) => task.course_name === course.name);

            return (
              <div key={course.name} className="rounded-xl border border-white/5 bg-slate-950/35 p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{course.name}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                      {[course.code, course.lecturer].filter(Boolean).join(' / ') || 'Matkul'}
                    </p>
                  </div>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-cyan-200">
                    {Math.round(course.weeklyMinutes / 60)}j/minggu
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniMetric label="Kelas" value={String(course.meetings)} />
                  <MiniMetric label="Tugas" value={String(course.activeTasks)} />
                  <MiniMetric label="Ujian" value={String(course.exams)} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onCreateSchedule(course.name)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1.5 text-[10px] font-bold text-cyan-100 transition hover:bg-cyan-300/15"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Jadwal
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreateAcademicTask(course.name)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-100 transition hover:bg-amber-300/15"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tugas
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {courseSchedules.slice(0, 2).map((schedule) => (
                    <CompactCrudRow
                      key={schedule.id}
                      title={`${dayName(schedule.day_of_week)} ${schedule.start_time}-${schedule.end_time}`}
                      detail={[schedule.building, schedule.room].filter(Boolean).join(' / ') || 'Lokasi belum diisi'}
                      onEdit={() => onEditSchedule(schedule)}
                      onDelete={() => onDeleteSchedule(schedule.id)}
                    />
                  ))}
                  {courseTasks.slice(0, 2).map((task) => (
                    <CompactCrudRow
                      key={task.id}
                      title={task.title}
                      detail={`${ACADEMIC_TYPE_LABEL[task.task_type]} / ${task.status}`}
                      onEdit={() => onEditAcademicTask(task)}
                      onDelete={() => onDeleteAcademicTask(task.id)}
                    />
                  ))}
                </div>

                {course.nextDeadline && (
                  <p className="mt-3 rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2 text-xs font-semibold text-slate-400">
                    Berikutnya: {course.nextDeadline.title}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProjectTracker({
  items,
  onComplete,
  onEdit,
  onDelete,
}: {
  items: DeadlineItem[];
  onComplete: (item: DeadlineItem) => void;
  onEdit: (item: DeadlineItem) => void;
  onDelete: (item: DeadlineItem) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <Code2 className="h-4 w-4 text-amber-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Tubes / Project Tracker
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Belum ada tubes atau proyek" detail="Catat tugas bertipe tubes atau judul berisi project untuk muncul di sini." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {items.slice(0, 6).map((item) => (
            <div key={`${item.source}-${item.id}`} className="rounded-xl border border-white/5 bg-slate-950/35 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-200">
                  {item.status}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${deadlineTextTone(item.deadline)}`}>
                  {formatDue(item.deadline)}
                </span>
              </div>
              <p className="line-clamp-2 text-sm font-bold text-white">{item.title}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{item.course}</p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onComplete(item)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200 transition hover:bg-emerald-300/15"
                  aria-label="Tandai selesai"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.07]"
                  aria-label="Edit project"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-300/10 text-rose-200 transition hover:bg-rose-300/15"
                  aria-label="Hapus project"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {item.lmsUrl && (
                <a href={item.lmsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200">
                  Buka link <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompactCrudRow({
  title,
  detail,
  onEdit,
  onDelete,
}: {
  title: string;
  detail: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-white">{title}</p>
        <p className="truncate text-[10px] font-semibold text-slate-500">{detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.07]"
          aria-label="Edit item"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300/20 bg-rose-300/10 text-rose-200 transition hover:bg-rose-300/15"
          aria-label="Hapus item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AcademicTaskEditor({
  task,
  initialCourseName,
  onClose,
  onSave,
}: {
  task: AcademicTask | null;
  initialCourseName?: string;
  onClose: () => void;
  onSave: (data: {
    course_name: string;
    task_type: AcademicTaskType;
    title: string;
    description?: string;
    deadline?: string;
    status?: AcademicTaskStatus;
    lms_url?: string;
  }) => Promise<unknown>;
}) {
  const [courseName, setCourseName] = useState(task?.course_name ?? initialCourseName ?? '');
  const [title, setTitle] = useState(task?.title ?? '');
  const [taskType, setTaskType] = useState<AcademicTaskType>(task?.task_type ?? 'tubes');
  const [deadline, setDeadline] = useState(toDatetimeInput(task?.deadline));
  const [status, setStatus] = useState<AcademicTaskStatus>(task?.status ?? 'todo');
  const [link, setLink] = useState(task?.lms_url ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!courseName.trim() || !title.trim()) {
      toast.error('Mata kuliah dan judul wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        course_name: courseName.trim(),
        title: title.trim(),
        task_type: taskType,
        deadline: deadline || undefined,
        status,
        lms_url: link.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudModal title={task ? 'Edit Tugas Kuliah' : 'Tambah Tugas Kuliah'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ModalInput value={courseName} onChange={setCourseName} placeholder="Mata kuliah" />
        <ModalInput value={title} onChange={setTitle} placeholder="Judul tugas" />
        <div className="grid grid-cols-2 gap-2">
          <ModalSelect value={taskType} onChange={(value) => setTaskType(value as AcademicTaskType)}>
            {Object.entries(ACADEMIC_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </ModalSelect>
          <ModalSelect value={status} onChange={(value) => setStatus(value as AcademicTaskStatus)}>
            <option value="todo">Todo</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </ModalSelect>
        </div>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          className={modalFieldClass}
        />
        <ModalInput value={link} onChange={setLink} placeholder="Link LMS / GitHub / Drive" />
        <ModalActions saving={saving} onClose={onClose} />
      </form>
    </CrudModal>
  );
}

function ScheduleEditor({
  schedule,
  initialCourseName,
  onClose,
  onSave,
}: {
  schedule: CampusSchedule | null;
  initialCourseName?: string;
  onClose: () => void;
  onSave: (data: CreateCampusScheduleData) => Promise<unknown>;
}) {
  const [courseName, setCourseName] = useState(schedule?.course_name ?? initialCourseName ?? '');
  const [courseCode, setCourseCode] = useState(schedule?.course_code ?? '');
  const [lecturer, setLecturer] = useState(schedule?.lecturer ?? '');
  const [building, setBuilding] = useState(schedule?.building ?? '');
  const [room, setRoom] = useState(schedule?.room ?? '');
  const [day, setDay] = useState(String(schedule?.day_of_week ?? 1));
  const [startTime, setStartTime] = useState(schedule?.start_time?.slice(0, 5) ?? '07:30');
  const [endTime, setEndTime] = useState(schedule?.end_time?.slice(0, 5) ?? '09:30');
  const [classType, setClassType] = useState<CampusClassType>(schedule?.class_type ?? 'lecture');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!courseName.trim()) {
      toast.error('Nama mata kuliah wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        course_name: courseName.trim(),
        course_code: courseCode.trim() || undefined,
        lecturer: lecturer.trim() || undefined,
        building: building.trim() || undefined,
        room: room.trim() || undefined,
        day_of_week: Number(day),
        start_time: startTime,
        end_time: endTime,
        class_type: classType,
        commute_minutes: schedule?.commute_minutes ?? 20,
        prep_minutes: schedule?.prep_minutes ?? 15,
        is_active: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudModal title={schedule ? 'Edit Jadwal Kuliah' : 'Tambah Jadwal Kuliah'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ModalInput value={courseName} onChange={setCourseName} placeholder="Mata kuliah" />
        <div className="grid grid-cols-2 gap-2">
          <ModalInput value={courseCode} onChange={setCourseCode} placeholder="Kode kelas" />
          <ModalInput value={lecturer} onChange={setLecturer} placeholder="Dosen / asisten" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ModalInput value={building} onChange={setBuilding} placeholder="Gedung" />
          <ModalInput value={room} onChange={setRoom} placeholder="Ruang" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ModalSelect value={day} onChange={setDay}>
            {[1, 2, 3, 4, 5, 6, 0].map((value) => (
              <option key={value} value={value}>{dayName(value)}</option>
            ))}
          </ModalSelect>
          <ModalSelect value={classType} onChange={(value) => setClassType(value as CampusClassType)}>
            <option value="lecture">Kelas</option>
            <option value="lab">Lab</option>
            <option value="project">Project</option>
            <option value="exam">Ujian</option>
            <option value="seminar">Seminar</option>
          </ModalSelect>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={modalFieldClass} />
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={modalFieldClass} />
        </div>
        <ModalActions saving={saving} onClose={onClose} />
      </form>
    </CrudModal>
  );
}

function GeneralTaskEditor({
  task,
  onClose,
  onSave,
}: {
  task: Task;
  onClose: () => void;
  onSave: (data: Partial<Task>) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [deadline, setDeadline] = useState(toDatetimeInput(task.deadline));
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error('Judul task wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        deadline: deadline || null,
        priority,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudModal title="Edit Project" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ModalInput value={title} onChange={setTitle} placeholder="Judul project" />
        <ModalInput value={description} onChange={setDescription} placeholder="Catatan singkat" />
        <input
          type="datetime-local"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          className={modalFieldClass}
        />
        <div className="grid grid-cols-2 gap-2">
          <ModalSelect value={priority} onChange={(value) => setPriority(value as TaskPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </ModalSelect>
          <ModalSelect value={status} onChange={(value) => setStatus(value as TaskStatus)}>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </ModalSelect>
        </div>
        <ModalActions saving={saving} onClose={onClose} />
      </form>
    </CrudModal>
  );
}

function CrudModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm font-bold text-white">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.07]"
            aria-label="Tutup modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
  );
}

function ModalInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={modalFieldClass}
    />
  );
}

function ModalSelect({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={modalFieldClass}>
      {children}
    </select>
  );
}

function ModalActions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07]"
      >
        Batal
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Simpan
      </button>
    </div>
  );
}

function QuickCapture(props: {
  mode: CaptureMode;
  setMode: (mode: CaptureMode) => void;
  quickText: string;
  setQuickText: (value: string) => void;
  courseName: string;
  setCourseName: (value: string) => void;
  academicTitle: string;
  setAcademicTitle: (value: string) => void;
  academicType: AcademicTaskType;
  setAcademicType: (value: AcademicTaskType) => void;
  academicDeadline: string;
  setAcademicDeadline: (value: string) => void;
  academicLink: string;
  setAcademicLink: (value: string) => void;
  habitName: string;
  setHabitName: (value: string) => void;
  expenseAmount: string;
  setExpenseAmount: (value: string) => void;
  expenseCategory: ExpenseCategory;
  setExpenseCategory: (value: ExpenseCategory) => void;
  expenseDescription: string;
  setExpenseDescription: (value: string) => void;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const modes: Array<{ id: CaptureMode; label: string }> = [
    { id: 'task', label: 'Task' },
    { id: 'academic', label: 'Kuliah' },
    { id: 'habit', label: 'Habit' },
    { id: 'expense', label: 'Uang' },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <Plus className="h-4 w-4 text-cyan-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Quick Capture
        </span>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-slate-950/35 p-1">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => props.setMode(mode.id)}
            className={`rounded-lg px-2 py-2 text-[10px] font-bold uppercase tracking-widest transition ${
              props.mode === mode.id ? 'bg-white text-slate-950' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <form onSubmit={props.onSubmit} className="space-y-3">
        <MotionCrossfade stateKey={props.mode}>
        <div className="space-y-3">
        {props.mode === 'task' && (
          <input
            value={props.quickText}
            onChange={(event) => props.setQuickText(event.target.value)}
            placeholder="Praktikum Jarkom besok prioritas tinggi 2 jam"
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
          />
        )}

        {props.mode === 'academic' && (
          <>
            <input
              value={props.courseName}
              onChange={(event) => props.setCourseName(event.target.value)}
              placeholder="Mata kuliah"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
            />
            <input
              value={props.academicTitle}
              onChange={(event) => props.setAcademicTitle(event.target.value)}
              placeholder="Judul tugas / tubes / ujian"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={props.academicType}
                onChange={(event) => props.setAcademicType(event.target.value as AcademicTaskType)}
                className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
              >
                {Object.entries(ACADEMIC_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={props.academicDeadline}
                onChange={(event) => props.setAcademicDeadline(event.target.value)}
                className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
              />
            </div>
            <input
              value={props.academicLink}
              onChange={(event) => props.setAcademicLink(event.target.value)}
              placeholder="Link LMS / GitHub / Drive"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
            />
          </>
        )}

        {props.mode === 'habit' && (
          <input
            value={props.habitName}
            onChange={(event) => props.setHabitName(event.target.value)}
            placeholder="Lari setiap hari"
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
          />
        )}

        {props.mode === 'expense' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                value={props.expenseAmount}
                onChange={(event) => props.setExpenseAmount(event.target.value)}
                placeholder="Nominal"
                className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
              />
              <select
                value={props.expenseCategory}
                onChange={(event) => props.setExpenseCategory(event.target.value as ExpenseCategory)}
                className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition focus:border-cyan-300/40"
              >
                <option value="food">Makan</option>
                <option value="coffee">Kopi</option>
                <option value="laundry">Laundry</option>
                <option value="rent">Kost</option>
                <option value="developer_sub">Tools dev</option>
                <option value="other">Lainnya</option>
              </select>
            </div>
            <input
              value={props.expenseDescription}
              onChange={(event) => props.setExpenseDescription(event.target.value)}
              placeholder="Nasi, transport, print, langganan..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
            />
          </>
        )}
        </div>
        </MotionCrossfade>

        <button
          type="submit"
          disabled={props.saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Simpan Cepat
        </button>
      </form>
    </section>
  );
}

function LmsLinkHub({ links }: { links: Array<{ course: string; title: string; url: string }> }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-cyan-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          LMS & Link Hub
        </span>
      </div>

      {links.length === 0 ? (
        <EmptyState title="Belum ada link" detail="Tambahkan link LMS, GitHub, atau Drive saat mencatat tugas kuliah." compact />
      ) : (
        <div className="space-y-2">
          {links.slice(0, 5).map((link) => (
            <a
              key={`${link.course}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/35 p-3 transition hover:border-cyan-300/20 hover:bg-cyan-300/10"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{link.title}</p>
                <p className="truncate text-[10px] font-semibold text-slate-500">{link.course}</p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-cyan-300" />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function ExamPreparation({ exams }: { exams: AcademicTask[] }) {
  const exam = exams[0];
  const days = exam?.deadline ? differenceInCalendarDays(startOfDay(new Date(exam.deadline)), startOfDay(new Date())) : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-amber-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Exam Preparation
        </span>
      </div>

      {!exam ? (
        <EmptyState title="Belum ada ujian" detail="Catat UTS/UAS di Tugas Kuliah untuk membuat rencana belajar." compact />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
            <p className="text-sm font-bold text-white">{exam.title}</p>
            <p className="mt-1 text-xs font-semibold text-amber-100">{exam.course_name} / H-{Math.max(0, days ?? 0)}</p>
          </div>
          {['Ringkas materi', 'Latihan soal', 'Review error', 'Simulasi ujian'].map((step, index) => (
            <div key={step} className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/35 p-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-black text-white">
                {index + 1}
              </div>
              <p className="text-xs font-semibold text-slate-300">{step}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BudgetGuard({ summary, budgetPercent }: { summary: { remaining_budget: number; monthly_limit: number } | null; budgetPercent: number }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-emerald-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Kost & Bandung Budget
        </span>
      </div>

      <div className="rounded-xl border border-white/5 bg-slate-950/35 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold text-white">Budget bulan ini</p>
          <p className="text-xs font-black text-emerald-300">{budgetPercent}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${budgetPercent > 85 ? 'bg-rose-300' : budgetPercent > 65 ? 'bg-amber-300' : 'bg-emerald-300'}`}
            style={{ width: `${budgetPercent}%` }}
          />
        </div>
        <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
          {summary
            ? `Sisa sekitar Rp${summary.remaining_budget.toLocaleString('id-ID')} dari limit Rp${summary.monthly_limit.toLocaleString('id-ID')}.`
            : 'Belum ada ringkasan keuangan.'}
        </p>
      </div>
    </section>
  );
}

function LifeGuard({
  habits,
  healthAlerts,
  onCheckInHabit,
}: {
  habits: Array<{ id: string; name: string }>;
  healthAlerts: Array<{ type: string; message: string }>;
  onCheckInHabit: (id: string) => Promise<unknown>;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-pink-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Sleep & Burnout Guard
        </span>
      </div>

      <div className="space-y-2">
        {healthAlerts.length > 0 ? (
          healthAlerts.slice(0, 2).map((alert) => (
            <p key={alert.message} className="rounded-xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs font-semibold leading-relaxed text-amber-100">
              {alert.message}
            </p>
          ))
        ) : (
          <p className="rounded-xl border border-emerald-300/15 bg-emerald-300/10 p-3 text-xs font-semibold leading-relaxed text-emerald-100">
            Tidak ada alarm kesehatan besar hari ini.
          </p>
        )}

        {habits.slice(0, 2).map((habit) => (
          <button
            key={habit.id}
            type="button"
            onClick={() => void onCheckInHabit(habit.id)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/35 p-3 text-left transition hover:bg-white/[0.055]"
          >
            <span className="text-xs font-bold text-white">{habit.name}</span>
            <CheckCircle2 className="h-4 w-4 text-pink-300" />
          </button>
        ))}
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-dashed border-white/10 bg-slate-950/25 px-4 text-center ${compact ? 'py-6' : 'py-10'}`}>
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

const modalFieldClass = 'w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40';

function toDatetimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function dayName(day: number) {
  const labels: Record<number, string> = {
    0: 'Minggu',
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
  };

  return labels[day] ?? 'Hari';
}

function buildDeadlineRadar(tasks: Task[], academicTasks: AcademicTask[]): DeadlineItem[] {
  const now = startOfDay(new Date());
  const max = new Date();
  max.setDate(max.getDate() + 30);

  const taskItems: DeadlineItem[] = tasks
    .filter((task) => task.deadline && task.status !== 'completed' && task.status !== 'cancelled')
    .map((task) => ({
      id: task.id,
      title: task.title,
      source: 'task' as const,
      course: task.category ?? 'Task',
      type: 'Task',
      deadline: new Date(task.deadline as string),
      status: task.status,
      priority: task.priority,
    }));

  const academicItems: DeadlineItem[] = academicTasks
    .filter((task) => task.deadline && task.status !== 'completed')
    .map((task) => ({
      id: task.id,
      title: task.title,
      source: 'academic' as const,
      course: task.course_name,
      type: ACADEMIC_TYPE_LABEL[task.task_type],
      deadline: new Date(task.deadline as string),
      status: task.status,
      priority: task.task_type === 'exam' || task.task_type === 'tubes' ? 'critical' : 'high',
      lmsUrl: task.lms_url,
    }));

  return [...taskItems, ...academicItems]
    .filter((item) => !isBefore(item.deadline, now) && !isAfter(item.deadline, max))
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

function buildCourseSummaries(schedules: CampusSchedule[], academicTasks: AcademicTask[], deadlines: DeadlineItem[]): CourseSummary[] {
  const courses = new Map<string, CourseSummary>();

  const ensureCourse = (name: string) => {
    if (!courses.has(name)) {
      courses.set(name, {
        name,
        meetings: 0,
        weeklyMinutes: 0,
        activeTasks: 0,
        exams: 0,
        projects: 0,
        nextDeadline: null,
        links: [],
      });
    }

    return courses.get(name) as CourseSummary;
  };

  schedules.forEach((schedule) => {
    const course = ensureCourse(schedule.course_name);
    course.code ??= schedule.course_code;
    course.lecturer ??= schedule.lecturer;
    course.meetings += 1;
    course.weeklyMinutes += durationMinutes(schedule.start_time, schedule.end_time);
  });

  academicTasks.forEach((task) => {
    const course = ensureCourse(task.course_name);
    if (task.status !== 'completed') course.activeTasks += 1;
    if (task.task_type === 'exam') course.exams += 1;
    if (task.task_type === 'tubes') course.projects += 1;
    if (task.lms_url) {
      course.links.push({ title: task.title, url: task.lms_url });
    }
  });

  deadlines.forEach((deadline) => {
    const course = courses.get(deadline.course);
    if (course && !course.nextDeadline) {
      course.nextDeadline = deadline;
    }
  });

  return [...courses.values()].sort((a, b) => b.activeTasks - a.activeTasks || a.name.localeCompare(b.name));
}

function buildProjectTracker(tasks: Task[], academicTasks: AcademicTask[]): DeadlineItem[] {
  const projectTasks: DeadlineItem[] = academicTasks
    .filter((task) => task.task_type === 'tubes' && task.status !== 'completed' && task.deadline)
    .map((task) => ({
      id: task.id,
      title: task.title,
      source: 'academic' as const,
      course: task.course_name,
      type: 'Tubes',
      deadline: new Date(task.deadline as string),
      status: task.status,
      priority: 'critical',
      lmsUrl: task.lms_url,
    }));

  const normalProjects: DeadlineItem[] = tasks
    .filter((task) => {
      const haystack = `${task.title} ${task.description ?? ''} ${task.tags?.join(' ') ?? ''}`.toLowerCase();
      return task.deadline && task.status !== 'completed' && task.status !== 'cancelled' && (haystack.includes('tubes') || haystack.includes('project') || haystack.includes('github'));
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      source: 'task' as const,
      course: task.category ?? 'Project',
      type: 'Project',
      deadline: new Date(task.deadline as string),
      status: task.status,
      priority: task.priority,
    }));

  return [...projectTasks, ...normalProjects].sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

function buildLmsLinks(academicTasks: AcademicTask[]) {
  const seen = new Set<string>();

  return academicTasks
    .filter((task) => task.lms_url)
    .map((task) => ({
      course: task.course_name,
      title: task.title,
      url: task.lms_url as string,
    }))
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
}

function findNextClass(schedules: CampusSchedule[]) {
  const now = new Date();
  const day = now.getDay();

  return schedules
    .filter((schedule) => schedule.is_active && schedule.day_of_week === day && parseTimeToday(schedule.end_time) > now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0] ?? null;
}

function durationMinutes(start: string, end: string) {
  const startDate = parseTimeToday(start);
  const endDate = parseTimeToday(end);
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function parseTimeToday(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function daysUntil(date: Date) {
  return differenceInCalendarDays(startOfDay(date), startOfDay(new Date()));
}

function formatDue(date: Date) {
  const days = daysUntil(date);
  if (days < 0) return 'Lewat';
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Besok';
  return `H-${days}`;
}

function deadlineTone(date: Date) {
  const days = daysUntil(date);
  if (days <= 1) return 'border-rose-300/20 bg-rose-300/10 text-rose-200';
  if (days <= 7) return 'border-amber-300/20 bg-amber-300/10 text-amber-200';
  return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200';
}

function deadlineTextTone(date: Date) {
  const days = daysUntil(date);
  if (days <= 1) return 'text-rose-300';
  if (days <= 7) return 'text-amber-300';
  return 'text-cyan-300';
}

function sortAcademicByDeadline(a: AcademicTask, b: AcademicTask) {
  const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}
