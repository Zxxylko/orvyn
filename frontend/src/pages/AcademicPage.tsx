import { useState } from 'react';
import { useAcademic } from '@/hooks/useAcademic';
import { MotionCrossfade, SkeletonPulse } from '@/components/ui/UXSkeletons';
import type { AcademicTask, AcademicTaskType } from '@/types/telu';
import { 
  GraduationCap, Plus, Calendar, CheckCircle2, Circle, Trash2, 
  ExternalLink, Loader2, Sparkles, BookOpen, AlertCircle, Edit2, X
} from 'lucide-react';
import { format, isPast } from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MotionCollapse, MotionModal, ScrollReveal } from '@/components/ui/motion';
import { quietEase } from '@/components/ui/motion-config';

export function AcademicPage() {
  const { tasks, loading, createTask, updateTask, deleteTask } = useAcademic();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTask, setEditingTask] = useState<AcademicTask | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<AcademicTask | null>(null);

  // Form states
  const [courseName, setCourseName] = useState('');
  const [taskType, setTaskType] = useState<AcademicTaskType>('praktikum');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [lmsUrl, setLmsUrl] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const resetForm = () => {
    setCourseName('');
    setTaskType('praktikum');
    setTitle('');
    setDescription('');
    setDeadline('');
    setLmsUrl('');
    setEditingTask(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowAddForm(true);
  };

  const openEditForm = (task: AcademicTask) => {
    setEditingTask(task);
    setCourseName(task.course_name);
    setTaskType(task.task_type);
    setTitle(task.title);
    setDescription(task.description ?? '');
    setDeadline(task.deadline ? toDatetimeLocal(task.deadline) : '');
    setLmsUrl(task.lms_url ?? '');
    setShowAddForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName || !title) return;

    setFormSubmitting(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, {
          course_name: courseName,
          task_type: taskType,
          title,
          description: description || null,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          lms_url: lmsUrl || null,
        });
      } else {
        await createTask({
          course_name: courseName,
          task_type: taskType,
          title,
          description: description || undefined,
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
          status: 'todo',
          lms_url: lmsUrl || undefined,
        });
      }
      resetForm();
      setShowAddForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setFormSubmitting(false);
    }
  };

  const toggleTaskStatus = (task: AcademicTask) => {
    const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
    updateTask(task.id, { status: nextStatus });
  };

  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  // Helper colors
  const typeStyles = {
    tp: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    praktikum: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    jurnal: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    tubes: 'bg-red-500/10 text-red-300 border-red-500/20',
    exam: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -left-12 w-28 h-28 rounded-full blur-2xl bg-purple-500/10 pointer-events-none" />
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/15">
            <GraduationCap size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Tracker Akademik Tel-U</h1>
            <p className="text-xs text-slate-400">Kelola tugas, praktikum, ujian, dan Tugas Besar dalam satu tempat.</p>
          </div>
        </div>
        <button
          onClick={showAddForm ? () => setShowAddForm(false) : openCreateForm}
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-950 transition hover:bg-slate-100 cursor-pointer"
        >
          <Plus size={16} />
          {showAddForm ? 'Tutup Form' : 'Tambah Tugas'}
        </button>
      </div>

      {/* Collapsible Assignment Input Form */}
      <MotionCollapse open={showAddForm} motionKey="academic-task-form">
        <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl shadow-2xl space-y-4">
          <div className="flex items-center gap-2 mb-2 text-purple-300 text-xs font-extrabold uppercase tracking-widest">
            <Sparkles size={14} className="animate-pulse" /> {editingTask ? 'Edit Academic Milestone' : 'Add Academic Milestone'}
            {editingTask && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-slate-400">
                Update mode
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Course Name</label>
              <input
                type="text"
                placeholder="e.g. Algoritma, Matdis, RPL"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                required
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500 transition"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Milestone Type</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as AcademicTaskType)}
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500 transition"
              >
                <option value="tp">Tugas Pendahuluan (TP)</option>
                <option value="praktikum">Praktikum</option>
                <option value="jurnal">Jurnal Akhir</option>
                <option value="tubes">Tugas Besar (Tubes)</option>
                <option value="exam">UTS / UAS</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Milestone Title</label>
              <input
                type="text"
                placeholder="e.g. Modul 2, Tugas Akhir"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Description / Notes</label>
              <input
                type="text"
                placeholder="Brief assignment requirements or topics"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500 transition"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Deadline Date & Time</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">LMS / CeLOE Submission URL (Optional)</label>
            <input
              type="url"
              placeholder="https://lms.telkomuniversity.ac.id/..."
              value={lmsUrl}
              onChange={(e) => setLmsUrl(e.target.value)}
              className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500 transition"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowAddForm(false);
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-400 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white transition flex items-center gap-2"
            >
              {formSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTask ? 'Simpan Perubahan' : 'Simpan Tugas'}
            </button>
          </div>
        </form>
      </MotionCollapse>

      {/* Main Grid Layout */}
      <ScrollReveal className="grid grid-cols-1 gap-6 lg:grid-cols-3" amount={0.08}>
        {/* Left Columns: Tasks Matrix (Takes 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <MotionCrossfade stateKey={loading ? 'loading' : tasks.length === 0 ? 'empty' : 'content'}>
            {loading ? (
              <div className="space-y-3">
                <SkeletonPulse className="h-20 rounded-xl" />
                <SkeletonPulse className="h-20 rounded-xl" />
                <SkeletonPulse className="h-20 rounded-xl" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-12 rounded-2xl bg-white/5 border border-white/10 text-center space-y-3">
                <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-sm font-bold text-white">Belum ada tugas akademik</h3>
                <p className="text-xs text-slate-400">Mulai dengan praktikum, tugas kuliah, atau Tugas Besar pertamamu.</p>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  Tambahkan tugas pertama
                </button>
              </div>
            ) : (
              <div className="space-y-6">
              {/* Active milestones */}
              {activeTasks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="sticky top-0 z-10 flex items-center gap-1.5 bg-slate-950/90 py-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1 backdrop-blur-xl">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                    Tugas Akademik Aktif ({activeTasks.length})
                  </h3>
                  <div className="grid gap-3">
                    <AnimatePresence initial={false} mode="popLayout">
                    {activeTasks.map((task) => {
                      const isOverdue = task.deadline && isPast(new Date(task.deadline));
                      return (
                        <motion.div
                          key={task.id}
                          layout="position"
                          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: quietEase }}
                          className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3 justify-between hover:border-purple-500/30 transition group"
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleTaskStatus(task)}
                              className="mt-0.5 text-slate-400 hover:text-white transition"
                            >
                              <Circle size={18} />
                            </button>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-white">
                                  [{task.course_name}]
                                </span>
                                <h4 className="text-xs font-semibold text-slate-300">
                                  {task.title}
                                </h4>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${typeStyles[task.task_type]}`}>
                                  {task.task_type}
                                </span>
                              </div>
                              {task.description && (
                                <p className="text-xs text-slate-400 mt-1 leading-normal">
                                  {task.description}
                                </p>
                              )}
                              
                              <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] text-slate-500 font-medium">
                                {task.deadline && (
                                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400 font-bold' : ''}`}>
                                    {isOverdue && <AlertCircle size={10} />}
                                    <Calendar size={10} />
                                    Deadline: {format(new Date(task.deadline), 'MMM d, h:mm a')}
                                  </span>
                                )}
                                {task.lms_url && (
                                  <a
                                    href={task.lms_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-0.5 text-purple-400 hover:text-purple-300 transition"
                                  >
                                    LMS Link <ExternalLink size={8} />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                            <button
                              onClick={() => openEditForm(task)}
                              className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-400 transition hover:text-purple-300"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteCandidate(task)}
                              className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-400 transition hover:text-red-300"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Completed tasks */}
              {completedTasks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="sticky top-0 z-10 flex items-center gap-1.5 bg-slate-950/90 py-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1 backdrop-blur-xl">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Completed ({completedTasks.length})
                  </h3>
                  <div className="grid gap-3">
                    <AnimatePresence initial={false} mode="popLayout">
                    {completedTasks.map((task) => (
                      <motion.div
                        key={task.id}
                        layout="position"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: quietEase }}
                        className="p-4 rounded-xl bg-slate-900/30 border border-white/5 flex items-start gap-3 justify-between hover:border-emerald-500/20 transition group"
                      >
                        <div className="flex items-start gap-3 opacity-60">
                          <button
                            onClick={() => toggleTaskStatus(task)}
                            className="mt-0.5 text-emerald-400 hover:text-white transition"
                          >
                            <CheckCircle2 size={18} />
                          </button>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-slate-400 line-through">
                                [{task.course_name}]
                              </span>
                              <h4 className="text-xs font-semibold text-slate-400 line-through">
                                {task.title}
                              </h4>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border bg-slate-950 text-slate-500 border-white/5">
                                {task.task_type}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                          <button
                            onClick={() => openEditForm(task)}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-400 transition hover:text-purple-300"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteCandidate(task)}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-400 transition hover:text-red-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}
              </div>
            )}
          </MotionCrossfade>
        </div>

        {/* Right Column: Lab Track Visual (Roadmap info helper) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <Sparkles size={16} className="text-purple-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Lab Milestone Roadmaps</h3>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Teknik Informatika Telkom University memiliki alur pengerjaan praktikum terstruktur. Sistem ORVYN membagi tugas Anda ke dalam tiga komponen dasar:
            </p>

            <div className="space-y-4 pt-2">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-[10px] shrink-0">1</div>
                <div>
                  <h4 className="text-xs font-bold text-white">Tugas Pendahuluan (TP)</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Pertanyaan teoritis sebelum sesi lab. Dikerjakan mandiri untuk mendapatkan izin masuk praktikum.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-[10px] shrink-0">2</div>
                <div>
                  <h4 className="text-xs font-bold text-white">Pelaksanaan Praktikum</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Sesi pengerjaan coding terbimbing langsung di laboratorium. Sangat menentukan pemahaman materi modul.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-[10px] shrink-0">3</div>
                <div>
                  <h4 className="text-xs font-bold text-white">Jurnal Akhir Praktikum</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Penulisan laporan praktikum, penyimpulan code, dan penyusunan screenshot hasil running program.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
      <MotionModal
        open={deleteCandidate !== null}
        onBackdropClick={() => setDeleteCandidate(null)}
        label="Konfirmasi hapus tugas kuliah"
      >
        {deleteCandidate && (
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Hapus tugas kuliah?</h3>
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="rounded-xl border border-white/10 bg-white/[0.055] p-2 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm font-medium leading-relaxed text-slate-400">
              “{deleteCandidate.title}” dari {deleteCandidate.course_name} akan dihapus dari tracker akademik dan sinkron task terkait.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/[0.09]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteTask(deleteCandidate.id);
                  setDeleteCandidate(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-rose-200"
              >
                <Trash2 className="h-4 w-4" />
                Hapus
              </button>
            </div>
          </div>
        )}
      </MotionModal>
    </div>
  );
}

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
