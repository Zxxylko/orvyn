import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth';
import { echo } from '@/lib/echo';
import type { Task } from '@/types/task';
import type { AIBriefing } from '@/types/briefing';
import { toast } from 'sonner';

interface RealtimeCallbacks {
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
  onTaskDeleted?: (taskId: string) => void;
  onBriefingGenerated?: (briefing: AIBriefing) => void;
}

export function useRealtime({
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onBriefingGenerated,
}: RealtimeCallbacks = {}) {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const channelName = `App.Models.User.${user.id}`;
    
    // Subscribe to private channel
    const channel = echo.private(channelName);

    console.log(`Subscribing to private channel: ${channelName}`);

    // Register event listeners
    if (onTaskCreated) {
      channel.listen('.TaskCreated', (event: { task: Task }) => {
        console.log('Realtime event: TaskCreated', event);
        toast.info(`Task scheduled: ${event.task.title}`);
        onTaskCreated(event.task);
      });
    }

    if (onTaskUpdated) {
      channel.listen('.TaskUpdated', (event: { task: Task }) => {
        console.log('Realtime event: TaskUpdated', event);
        onTaskUpdated(event.task);
      });
    }

    if (onTaskDeleted) {
      channel.listen('.TaskDeleted', (event: { taskId: string }) => {
        console.log('Realtime event: TaskDeleted', event);
        onTaskDeleted(event.taskId);
      });
    }

    if (onBriefingGenerated) {
      channel.listen('.BriefingGenerated', (event: { briefing: AIBriefing }) => {
        console.log('Realtime event: BriefingGenerated', event);
        toast.success('Ringkasan harian diperbarui.');
        onBriefingGenerated(event.briefing);
      });
    }

    // Unsubscribe when cleaning up
    return () => {
      console.log(`Unsubscribing from private channel: ${channelName}`);
      echo.leave(channelName);
    };
  }, [isAuthenticated, user?.id, onTaskCreated, onTaskUpdated, onTaskDeleted, onBriefingGenerated]);
}
