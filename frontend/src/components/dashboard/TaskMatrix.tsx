import type { Task } from '@/types/task';
import { TaskCard } from './TaskCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { TaskSkeleton } from '@/components/ui/UXSkeletons';

interface TaskMatrixProps {
  tasks: Task[];
  loading: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskMatrix({ tasks, loading, onToggle, onDelete }: TaskMatrixProps) {
  const activeTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  if (loading) {
    return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <TaskSkeleton />
        <TaskSkeleton />
        <TaskSkeleton />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <Inbox className="w-16 h-16 text-white/20 mb-4" />
        <h3 className="text-lg font-medium text-white/60 mb-2">No tasks yet</h3>
        <p className="text-sm text-white/40">
          Start by adding your first task above, or press Cmd/Ctrl + K and choose Add Smart Task.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Active Tasks ({activeTasks.length})
          </h2>
          <div className="grid gap-3">
            <AnimatePresence mode="popLayout">
              {activeTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Completed ({completedTasks.length})
          </h2>
          <div className="grid gap-3">
            <AnimatePresence mode="popLayout">
              {completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
