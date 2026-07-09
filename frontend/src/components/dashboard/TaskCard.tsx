import type { Task } from '@/types/task';
import { motion } from 'framer-motion';
import { 
  Clock, 
  Calendar, 
  CheckCircle2, 
  Circle, 
  Trash2,
  AlertCircle,
  Zap
} from 'lucide-react';
import { format, isPast } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const priorityColors = {
  low: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
  medium: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
  high: 'from-orange-500/20 to-orange-600/20 border-orange-500/30',
  critical: 'from-red-500/20 to-red-600/20 border-red-500/30',
};

const priorityBadgeColors = {
  low: 'bg-blue-500/20 text-blue-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  high: 'bg-orange-500/20 text-orange-300',
  critical: 'bg-red-500/20 text-red-300',
};

export function TaskCard({ task, onToggle, onDelete }: TaskCardProps) {
  const isOverdue = task.deadline && isPast(new Date(task.deadline)) && task.status !== 'completed';
  const isCompleted = task.status === 'completed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`relative p-4 rounded-xl bg-gradient-to-br ${priorityColors[task.priority]} backdrop-blur-xl border shadow-lg hover:shadow-xl transition-all group`}
    >
      {/* AI Badge */}
      {task.ai_processed && (
        <div className="absolute top-2 right-2">
          <Zap className="w-3 h-3 text-purple-400" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task.id)}
          className="mt-1 flex-shrink-0 hover:scale-110 transition-transform"
        >
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <Circle className="w-5 h-5 text-white/40 hover:text-white/60" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium ${isCompleted ? 'line-through text-white/40' : 'text-white'}`}>
            {task.title}
          </h3>
          
          {task.description && (
            <p className="mt-1 text-xs text-white/60 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Meta info */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {/* Priority */}
            <span className={`px-2 py-0.5 rounded-full ${priorityBadgeColors[task.priority]}`}>
              {task.priority}
            </span>

            {/* Duration */}
            <span className="flex items-center gap-1 text-white/60">
              <Clock className="w-3 h-3" />
              {task.duration_minutes}m
            </span>

            {/* Deadline */}
            {task.deadline && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-white/60'}`}>
                {isOverdue && <AlertCircle className="w-3 h-3" />}
                <Calendar className="w-3 h-3" />
                {format(new Date(task.deadline), 'MMM d, h:mm a')}
              </span>
            )}

            {/* Category */}
            <span className="text-white/40">
              {task.category}
            </span>
          </div>

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
