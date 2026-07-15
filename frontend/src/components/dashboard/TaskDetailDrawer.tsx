import { useState } from 'react';
import { CalendarClock, Check, Loader2, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { Task, TaskCategory, TaskPriority, TaskStatus } from '@/types/task';

interface TaskDetailDrawerProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<Task>) => Promise<Task | void>;
  onDelete: (id: string) => Promise<void>;
}

const toLocalDateTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function TaskDetailDrawer({ task, open, onOpenChange, onUpdate, onDelete }: TaskDetailDrawerProps) {
  const [form, setForm] = useState(() => ({
    title: task?.title ?? '',
    description: task?.description ?? '',
    deadline: toLocalDateTime(task?.deadline ?? null),
    status: task?.status ?? 'pending' as TaskStatus,
    priority: task?.priority ?? 'medium' as TaskPriority,
    duration_minutes: task?.duration_minutes ?? 30,
    difficulty: task?.difficulty ?? 3,
    category: task?.category ?? 'academics' as TaskCategory,
    tags: task?.tags.join(', ') ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const save = async () => {
    if (!task || !form.title.trim() || saving) return;
    setSaving(true);
    try {
      await onUpdate(task.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        status: form.status,
        priority: form.priority,
        duration_minutes: Math.max(1, form.duration_minutes),
        difficulty: form.difficulty,
        category: form.category,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setSaving(true);
    try {
      await onDelete(task.id);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-white/10 bg-slate-950 p-0 text-white shadow-2xl sm:max-w-lg"
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-5 py-5 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-300">
            <CalendarClock className="h-4 w-4" /> Detail tugas
          </div>
          <SheetTitle className="mt-2 pr-10 text-xl font-semibold text-white">Edit tanpa pindah halaman</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-slate-500">
            Perubahan disimpan langsung dan akan dipulihkan jika koneksi gagal.
          </SheetDescription>
        </div>

        {task && (
          <div className="space-y-5 px-5 py-6 sm:px-6">
            <label className="block">
              <span className="field-label">Judul</span>
              <input
                value={form.title}
                onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                className="field-control"
                autoFocus
              />
            </label>

            <label className="block">
              <span className="field-label">Catatan</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
                rows={4}
                placeholder="Tambahkan konteks, link, atau langkah berikutnya..."
                className="field-control resize-y"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label>
                <span className="field-label">Status</span>
                <select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as TaskStatus }))} className="field-control">
                  <option value="pending">Belum dimulai</option>
                  <option value="in_progress">Sedang dikerjakan</option>
                  <option value="completed">Selesai</option>
                  <option value="cancelled">Ditahan</option>
                </select>
              </label>
              <label>
                <span className="field-label">Prioritas</span>
                <select value={form.priority} onChange={(event) => setForm((value) => ({ ...value, priority: event.target.value as TaskPriority }))} className="field-control">
                  <option value="low">Rendah</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi</option>
                  <option value="critical">Kritis</option>
                </select>
              </label>
              <label>
                <span className="field-label">Deadline</span>
                <input type="datetime-local" value={form.deadline} onChange={(event) => setForm((value) => ({ ...value, deadline: event.target.value }))} className="field-control [color-scheme:dark]" />
              </label>
              <label>
                <span className="field-label">Durasi (menit)</span>
                <input type="number" min="1" value={form.duration_minutes} onChange={(event) => setForm((value) => ({ ...value, duration_minutes: Number(event.target.value) }))} className="field-control" />
              </label>
              <label>
                <span className="field-label">Kategori</span>
                <select value={form.category} onChange={(event) => setForm((value) => ({ ...value, category: event.target.value as TaskCategory }))} className="field-control">
                  <option value="academics">Akademik</option>
                  <option value="personal">Pribadi</option>
                  <option value="health">Kesehatan</option>
                  <option value="social">Sosial</option>
                  <option value="work">Pekerjaan</option>
                </select>
              </label>
              <label>
                <span className="field-label">Tingkat kesulitan: {form.difficulty}</span>
                <input type="range" min="1" max="5" value={form.difficulty} onChange={(event) => setForm((value) => ({ ...value, difficulty: Number(event.target.value) }))} className="mt-2 w-full accent-cyan-400" />
              </label>
            </div>

            <label className="block">
              <span className="field-label">Tag, pisahkan dengan koma</span>
              <input value={form.tags} onChange={(event) => setForm((value) => ({ ...value, tags: event.target.value }))} placeholder="praktikum, kelompok, revisi" className="field-control" />
            </label>

            <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                className={`focus-ring inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${deleteArmed ? 'bg-red-500 text-white' : 'border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15'}`}
              >
                <Trash2 className="h-4 w-4" /> {deleteArmed ? 'Klik lagi untuk hapus' : 'Hapus tugas'}
              </button>
              <button type="button" onClick={() => void save()} disabled={saving || !form.title.trim()} className="primary-action min-w-36 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? 'Menyimpan...' : 'Simpan perubahan'}
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
