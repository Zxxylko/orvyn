import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDeadline } from '../lib/date';
import { colors, radii, spacing } from '../theme';
import type { Task } from '../types';

interface TaskRowProps {
  task: Task;
  onPress?: (task: Task) => void;
  onToggle?: (task: Task) => void;
  onLongPress?: (task: Task) => void;
  compact?: boolean;
}

const priorityColors: Record<Task['priority'], string> = {
  low: colors.textMuted,
  medium: colors.cyan,
  high: colors.amber,
  critical: colors.rose,
};

export function TaskRow({ task, onPress, onToggle, onLongPress, compact = false }: TaskRowProps) {
  const isCompleted = task.status === 'completed';
  const deadlineIsLate = task.deadline ? new Date(task.deadline).getTime() < Date.now() && !isCompleted : false;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${onPress ? 'Buka detail' : isCompleted ? 'Buka kembali' : 'Selesaikan'} tugas ${task.title}`}
      onPress={() => (onPress ?? onToggle)?.(task)}
      onLongPress={() => onLongPress?.(task)}
      style={({ pressed }) => [styles.row, compact && styles.compactRow, pressed && styles.pressed]}
    >
      <View style={[styles.priority, { backgroundColor: priorityColors[task.priority] }]} />
      <View style={styles.copy}>
        <Text numberOfLines={compact ? 1 : 2} style={[styles.title, isCompleted && styles.completed]}>{task.title}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, deadlineIsLate && styles.late]}>{formatDeadline(task.deadline)}</Text>
          <View style={styles.dot} />
          <Text style={styles.meta}>{task.duration_minutes || 0} menit</Text>
        </View>
      </View>
      {onPress && onToggle ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`${isCompleted ? 'Buka kembali' : 'Selesaikan'} tugas ${task.title}`}
          accessibilityState={{ checked: isCompleted }}
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation();
            onToggle(task);
          }}
          style={({ pressed }) => pressed && styles.togglePressed}
        >
          <TaskStatusIcon task={task} />
        </Pressable>
      ) : <TaskStatusIcon task={task} />}
    </Pressable>
  );
}

function TaskStatusIcon({ task }: { task: Task }) {
  const isCompleted = task.status === 'completed';

  return (
    <Ionicons
      name={isCompleted ? 'checkmark-circle' : task.status === 'in_progress' ? 'play-circle' : 'ellipse-outline'}
      size={23}
      color={isCompleted ? colors.emerald : task.status === 'in_progress' ? colors.cyan : colors.textMuted}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.medium,
  },
  compactRow: {
    minHeight: 62,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
    transform: [{ scale: 0.99 }],
  },
  togglePressed: {
    opacity: 0.55,
    transform: [{ scale: 0.9 }],
  },
  priority: {
    width: 4,
    height: 38,
    borderRadius: radii.pill,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  completed: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  late: {
    color: colors.rose,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
});
