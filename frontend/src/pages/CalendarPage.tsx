import { useState, useEffect } from 'react';
import { useTimeBlocks } from '@/hooks/useTimeBlocks';
import { useTasks } from '@/hooks/useTasks';
import { TimeBlockGrid } from '@/components/calendar/TimeBlockGrid';
import { TimeBlockForm } from '@/components/calendar/TimeBlockForm';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarSkeleton } from '@/components/ui/UXSkeletons';
import { ChevronLeft, ChevronRight, Sparkles, Loader2, Plus, Calendar } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';
import type { CreateTimeBlockData, TimeBlock } from '@/types/timeblock';

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [defaultCellDate, setDefaultCellDate] = useState<Date | undefined>(undefined);
  const [density, setDensity] = useState<'comfort' | 'compact'>('comfort');

  const {
    timeBlocks,
    loading: calendarLoading,
    fetchTimeBlocks,
    createTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    optimizeSchedule,
  } = useTimeBlocks();

  const { tasks, fetchTasks } = useTasks();

  // Load blocks and tasks on mount and week changes
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const monday = startOfWeek(currentDate, { weekStartsOn: 1 });
    const sunday = endOfWeek(currentDate, { weekStartsOn: 1 });
    fetchTimeBlocks(monday.toISOString(), sunday.toISOString());
  }, [currentDate, fetchTimeBlocks]);

  // Week navigation
  const prevWeek = () => setCurrentDate((prev) => subDays(prev, 7));
  const nextWeek = () => setCurrentDate((prev) => addDays(prev, 7));
  const goToday = () => setCurrentDate(new Date());

  const handleCellClick = (date: Date) => {
    setSelectedBlock(null);
    setDefaultCellDate(date);
    setIsFormOpen(true);
  };

  const handleBlockClick = (block: TimeBlock) => {
    setSelectedBlock(block);
    setIsFormOpen(true);
  };

  const handleSave = async (data: CreateTimeBlockData) => {
    if (selectedBlock) {
      await updateTimeBlock(selectedBlock.id, data);
    } else {
      await createTimeBlock(data);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTimeBlock(id);
  };

  return (
    <div className="space-y-5">
      {/* Calendar Control Header Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/[0.035] px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevWeek}
              className="text-slate-400 hover:text-white rounded-lg h-8 w-8 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="ghost"
              onClick={goToday}
              className="text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:bg-white/5 px-3 h-8 cursor-pointer"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextWeek}
              className="text-slate-400 hover:text-white rounded-lg h-8 w-8 cursor-pointer"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
          
          <div className="flex items-center gap-2 text-white">
            <Calendar size={18} className="text-purple-400 shrink-0" />
            <span className="text-sm font-extrabold tracking-wide uppercase">
              {format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d')} -{' '}
              {format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {(['comfort', 'compact'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDensity(mode)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                  density === mode
                    ? 'bg-white text-slate-950'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* AI Schedule Optimizer button */}
          <Button
            onClick={optimizeSchedule}
            disabled={calendarLoading}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white text-xs font-semibold text-slate-950 shadow-lg shadow-white/10 transition-all hover:bg-slate-100"
          >
            {calendarLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 animate-pulse text-slate-700" />
            )}
            Optimize Schedule
          </Button>

          <Button
            onClick={() => {
              setSelectedBlock(null);
              setDefaultCellDate(new Date());
              setIsFormOpen(true);
            }}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Plus size={16} />
            Add Block
          </Button>
        </div>
      </div>

      {/* Grid view canvas */}
      <div className="relative">
        {calendarLoading && timeBlocks.length === 0 && (
          <CalendarSkeleton />
        )}

        {(!calendarLoading || timeBlocks.length > 0) && (
          <TimeBlockGrid
            timeBlocks={timeBlocks}
            onBlockClick={handleBlockClick}
            onCellClick={handleCellClick}
            currentDate={currentDate}
            density={density}
          />
        )}
      </div>

      {/* Scheduler Modal */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <TimeBlockForm
          block={selectedBlock}
          tasks={tasks}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setIsFormOpen(false)}
          defaultDate={defaultCellDate}
        />
      </Dialog>
    </div>
  );
}
