import type { Task } from '@/types/task';
import { TaskCard } from './TaskCard';
import { AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronDown, Inbox, Search } from 'lucide-react';
import { MotionCrossfade, TaskSkeleton } from '@/components/ui/UXSkeletons';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { MotionCollapse } from '@/components/ui/motion';

interface TaskMatrixProps {
  tasks: Task[];
  loading: boolean;
  onToggle: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onOpenTask?: (task: Task) => void;
  onAddTask?: () => void;
}

type TaskFilter = 'all' | 'urgent' | 'in_progress';

export function TaskMatrix({ tasks, loading, onToggle, onDelete, onOpenTask, onAddTask }: TaskMatrixProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const activeTasks = useMemo(() => tasks.filter((task) => {
    if (task.status === 'completed') return false;
    if (normalizedQuery && !`${task.title} ${task.description ?? ''} ${task.category}`.toLowerCase().includes(normalizedQuery)) return false;
    if (filter === 'urgent') return task.priority === 'critical' || task.priority === 'high';
    if (filter === 'in_progress') return task.status === 'in_progress';
    return true;
  }), [filter, normalizedQuery, tasks]);
  const completedTasks = tasks.filter(t => t.status === 'completed');

  if (loading) {
    return (
      <MotionCrossfade stateKey="loading">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <TaskSkeleton />
          <TaskSkeleton />
          <TaskSkeleton />
        </div>
      </MotionCrossfade>
    );
  }

  if (tasks.length === 0) {
    return (
      <MotionCrossfade stateKey="empty">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Inbox className="w-16 h-16 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white/60 mb-2">Belum ada tugas</h3>
          <p className="text-sm text-white/40">
            Tambahkan tugas pertama di atas, atau tekan Cmd/Ctrl + K lalu pilih Tambah Tugas Cepat.
          </p>
          {onAddTask && (
            <button type="button" onClick={onAddTask} className="primary-action mt-5">
              Tambahkan tugas pertama
            </button>
          )}
        </div>
      </MotionCrossfade>
    );
  }

  return (
    <MotionCrossfade stateKey="content">
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari tugas aktif..."
              className="focus-ring h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 pl-9 pr-3 text-sm font-medium text-white outline-none placeholder:text-slate-600"
              aria-label="Cari tugas aktif"
            />
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" aria-label="Filter tugas">
            {([
              ['all', 'Semua'],
              ['urgent', 'Prioritas tinggi'],
              ['in_progress', 'Dikerjakan'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold transition',
                  filter === value ? 'bg-white text-slate-950' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Tasks */}
        {activeTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Tugas Aktif ({activeTasks.length})
            </h2>
            <div className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {activeTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onOpen={onOpenTask}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {activeTasks.length === 0 && (query || filter !== 'all') && (
          <div className="rounded-2xl border border-dashed border-white/10 py-9 text-center">
            <Search className="mx-auto mb-3 h-7 w-7 text-slate-700" />
            <p className="text-sm font-semibold text-slate-400">Tidak ada tugas yang cocok</p>
            <button
              type="button"
              onClick={() => { setQuery(''); setFilter('all'); }}
              className="focus-ring mt-3 rounded-lg px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-300/10"
            >
              Reset filter
            </button>
          </div>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowCompleted((value) => !value)}
              className="focus-ring mb-3 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.035] hover:text-white"
              aria-expanded={showCompleted}
            >
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              Selesai ({completedTasks.length})
              <ChevronDown className={cn('ml-auto h-4 w-4 transition', showCompleted && 'rotate-180')} />
            </button>
            <MotionCollapse open={showCompleted} motionKey="completed-tasks">
                <div className="grid gap-3">
                  {completedTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={onToggle}
                      onDelete={onDelete}
                      onOpen={onOpenTask}
                    />
                  ))}
                </div>
            </MotionCollapse>
          </div>
        )}
      </div>
    </MotionCrossfade>
  );
}
