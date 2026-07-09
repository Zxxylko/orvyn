import { useState, useEffect } from 'react';
import type { CreateTimeBlockData, TimeBlock } from '@/types/timeblock';
import type { Task } from '@/types/task';
import { format } from 'date-fns';
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TimeBlockFormProps {
  block?: TimeBlock | null;
  tasks: Task[];
  onSave: (data: CreateTimeBlockData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
  defaultDate?: Date;
}

export function TimeBlockForm({
  block,
  tasks,
  onSave,
  onDelete,
  onClose,
  defaultDate = new Date(),
}: TimeBlockFormProps) {
  const [label, setLabel] = useState('');
  const [blockType, setBlockType] = useState<'task' | 'break' | 'class' | 'personal' | 'study'>('task');
  const [isLocked, setIsLocked] = useState(false);
  const [taskId, setTaskId] = useState('');
  
  // Start / End date/time states (formatted for inputs: 'YYYY-MM-DDTHH:MM')
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (block) {
        setLabel(block.label);
        setBlockType(block.block_type);
        setIsLocked(block.is_locked);
        setTaskId(block.task_id || '');
        setStartTime(format(new Date(block.start_time), "yyyy-MM-dd'T'HH:mm"));
        setEndTime(format(new Date(block.end_time), "yyyy-MM-dd'T'HH:mm"));
      } else {
        // Default creation state
        setLabel('');
        setBlockType('task');
        setIsLocked(false);
        setTaskId('');
        
        const start = new Date(defaultDate);
        start.setMinutes(0, 0, 0); // round to hour
        const end = new Date(start);
        end.setHours(start.getHours() + 1); // 1 hour duration
        
        setStartTime(format(start, "yyyy-MM-dd'T'HH:mm"));
        setEndTime(format(end, "yyyy-MM-dd'T'HH:mm"));
      }
    });
  }, [block, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    setSubmitting(true);
    try {
      const data = {
        label: label.trim(),
        block_type: blockType,
        is_locked: isLocked,
        task_id: taskId || null,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      };
      await onSave(data);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!block || !onDelete) return;
    setSubmitting(true);
    try {
      await onDelete(block.id);
      onClose();
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[425px] bg-slate-900 border border-white/10 text-white">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold tracking-tight text-white">
          {block ? 'Edit Time Block' : 'Schedule Time Block'}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        {/* Label input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Block Title
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. OS Lecture, ML Study Session..."
            className="bg-white/5 border-white/10 focus:border-purple-500 text-sm font-semibold rounded-xl"
            required
          />
        </div>

        {/* Start & End Times */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Start Time
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              End Time
            </label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
              required
            />
          </div>
        </div>

        {/* Block Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Block Category
          </label>
          <select
            value={blockType}
            onChange={(e) => setBlockType(e.target.value as typeof blockType)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-semibold text-white outline-none focus:border-purple-500/50"
          >
            <option value="task">Focus Session (Task)</option>
            <option value="class">Class / Lecture</option>
            <option value="study">Individual Study</option>
            <option value="break">Short Break</option>
            <option value="personal">Personal / Leisure</option>
          </select>
        </div>

        {/* Optional Task Linking */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Link to Active Task (Optional)
          </label>
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-semibold text-white outline-none focus:border-purple-500/50"
          >
            <option value="">No task linked</option>
            {tasks
              .filter((t) => t.status !== 'completed' || t.id === block?.task_id)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
          </select>
        </div>

        {/* Locked checkbox */}
        <div className="flex items-center gap-2.5 py-1 px-1">
          <input
            id="is_locked"
            type="checkbox"
            checked={isLocked}
            onChange={(e) => setIsLocked(e.target.checked)}
            className="w-4 h-4 accent-purple-500 rounded bg-white/5 border-white/10"
          />
          <label htmlFor="is_locked" className="text-xs font-bold tracking-wide text-slate-300 select-none cursor-pointer">
            Lock schedule block (Scheduler will not reorder this)
          </label>
        </div>

        {/* Dialog footer controls */}
        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t border-white/5">
          {block && onDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
              className="rounded-xl px-4 py-2 text-xs font-bold uppercase cursor-pointer"
            >
              Delete Block
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl px-4 py-2 text-xs font-bold uppercase cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-white px-5 py-2 text-xs font-semibold uppercase text-slate-950 transition hover:bg-slate-100 cursor-pointer"
            >
              {block ? 'Update Block' : 'Schedule'}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
