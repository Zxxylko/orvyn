import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { TaskEditorModal } from '../components/TaskEditorModal';
import { TaskRow } from '../components/TaskRow';
import { getApiErrorMessage, taskApi } from '../lib/api';
import { colors, radii, spacing } from '../theme';
import type { Task } from '../types';

type TaskFilter = 'active' | 'urgent' | 'completed';
type TaskSort = 'deadline' | 'priority' | 'recent';

const priorityWeight: Record<Task['priority'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TaskSort>('deadline');
  const [input, setInput] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTask, setEditorTask] = useState<Task | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await taskApi.list();
      setTasks(response.data.data);
    } catch (error) {
      Alert.alert('Tugas belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load(true);
  }, [load]));

  const taskCounts = useMemo(() => ({
    active: tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled').length,
    urgent: tasks.filter((task) => {
      const overdue = task.deadline ? new Date(task.deadline).getTime() < Date.now() : false;
      return task.status !== 'completed' && task.status !== 'cancelled' && (task.priority === 'critical' || task.priority === 'high' || overdue);
    }).length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
    const filtered = tasks.filter((task) => {
      const matchesFilter = filter === 'completed'
        ? task.status === 'completed'
        : filter === 'urgent'
          ? task.status !== 'completed' && task.status !== 'cancelled' && (
            task.priority === 'critical'
            || task.priority === 'high'
            || Boolean(task.deadline && new Date(task.deadline).getTime() < Date.now())
          )
          : task.status !== 'completed' && task.status !== 'cancelled';

      if (!matchesFilter || !normalizedQuery) return matchesFilter;
      return [task.title, task.description, task.category, ...(task.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('id-ID')
        .includes(normalizedQuery);
    });

    const deadlineTime = (task: Task) => task.deadline ? new Date(task.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const recentTime = (task: Task) => new Date(task.updated_at || task.created_at).getTime();

    return [...filtered].sort((first, second) => {
      if (sort === 'priority') return priorityWeight[second.priority] - priorityWeight[first.priority] || deadlineTime(first) - deadlineTime(second);
      if (sort === 'recent') return recentTime(second) - recentTime(first);
      return deadlineTime(first) - deadlineTime(second) || priorityWeight[second.priority] - priorityWeight[first.priority];
    });
  }, [filter, query, sort, tasks]);

  const createTask = async () => {
    const nextInput = input.trim();
    if (!nextInput) return;
    setCreating(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await taskApi.smartCreate(nextInput);
      setInput('');
      await load(true);
    } catch (error) {
      Alert.alert('Tugas belum dibuat', getApiErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const toggleTask = async (task: Task) => {
    setBusyTaskId(task.id);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await taskApi.update(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' });
      await load(true);
    } catch (error) {
      Alert.alert('Status belum berubah', getApiErrorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const confirmDelete = (task: Task) => {
    Alert.alert('Hapus tugas?', `“${task.title}” akan dihapus dari ORVYN.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => void (async () => {
          setBusyTaskId(task.id);
          try {
            await taskApi.remove(task.id);
            await load(true);
          } catch (error) {
            Alert.alert('Tugas belum dihapus', getApiErrorMessage(error));
          } finally {
            setBusyTaskId(null);
          }
        })(),
      },
    ]);
  };

  const openEditor = (task: Task | null = null) => {
    setEditorTask(task);
    setEditorOpen(true);
  };

  return (
    <>
    <Screen
      eyebrow="SMART TASK"
      title="Tugas"
      refreshing={refreshing}
      onRefresh={() => void load()}
      action={(
        <Pressable accessibilityRole="button" accessibilityLabel="Buat tugas manual" onPress={() => openEditor()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <Ionicons name="add" size={22} color={colors.cyan} />
        </Pressable>
      )}
    >
      <Surface>
        <View style={styles.inputHeader}>
          <View style={styles.aiIcon}><Ionicons name="sparkles" size={17} color={colors.purple} /></View>
          <View style={styles.inputCopy}>
            <Text style={styles.inputTitle}>Tulis seperti biasa</Text>
            <Text style={styles.inputHint}>AI membaca deadline, durasi, dan prioritas.</Text>
          </View>
        </View>
        <TextInput
          accessibilityLabel="Deskripsi tugas pintar"
          value={input}
          onChangeText={setInput}
          placeholder="Laporan basis data besok jam 8 malam, 2 jam"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          style={styles.input}
        />
        <View style={styles.inputFooter}>
          <Text style={styles.characterCount}>{input.length}/500</Text>
          <View style={styles.inputActions}>
            <Pressable accessibilityRole="button" onPress={() => openEditor()} style={({ pressed }) => [styles.manualButton, pressed && styles.pressed]}>
              <Ionicons name="options-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.manualButtonText}>Manual</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void createTask()}
              disabled={!input.trim() || creating}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed, (!input.trim() || creating) && styles.disabled]}
            >
              {creating ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="arrow-up" size={18} color={colors.black} />}
              <Text style={styles.addButtonText}>{creating ? 'Memproses' : 'Tambah'}</Text>
            </Pressable>
          </View>
        </View>
      </Surface>

      <View style={styles.filters}>
        <FilterChip label="Aktif" count={taskCounts.active} selected={filter === 'active'} onPress={() => setFilter('active')} />
        <FilterChip label="Penting" count={taskCounts.urgent} selected={filter === 'urgent'} onPress={() => setFilter('urgent')} />
        <FilterChip label="Selesai" count={taskCounts.completed} selected={filter === 'completed'} onPress={() => setFilter('completed')} />
      </View>

      <Surface>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={query ? colors.cyan : colors.textMuted} />
          <TextInput
            accessibilityLabel="Cari tugas"
            value={query}
            onChangeText={setQuery}
            placeholder="Cari judul, kategori, atau tag"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Hapus pencarian" hitSlop={10} onPress={() => setQuery('')} style={({ pressed }) => pressed && styles.pressed}>
              <Ionicons name="close-circle" size={19} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.sortHeader}>
          <Text style={styles.sortLabel}>URUTKAN</Text>
          <Text style={styles.sortResult}>{visibleTasks.length} hasil</Text>
        </View>
        <View style={styles.sortRow}>
          <SortChip label="Deadline" icon="calendar-outline" selected={sort === 'deadline'} onPress={() => setSort('deadline')} />
          <SortChip label="Prioritas" icon="flag-outline" selected={sort === 'priority'} onPress={() => setSort('priority')} />
          <SortChip label="Terbaru" icon="time-outline" selected={sort === 'recent'} onPress={() => setSort('recent')} />
        </View>
      </Surface>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{filter === 'active' ? 'Tugas aktif' : filter === 'urgent' ? 'Butuh perhatian' : 'Sudah selesai'}</Text>
        <Text style={styles.longPressHint}>{visibleTasks.length} ditampilkan</Text>
      </View>

      <Surface>
        {initialLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Memuat daftar tugas…</Text>
          </View>
        ) : visibleTasks.length > 0 ? visibleTasks.map((task) => (
          <View key={task.id} style={busyTaskId === task.id ? styles.busy : undefined}>
            <TaskRow task={task} onPress={openEditor} onToggle={(item) => void toggleTask(item)} onLongPress={confirmDelete} />
          </View>
        )) : (
          <View style={styles.empty}>
            <Ionicons name={query ? 'search-outline' : 'file-tray-outline'} size={30} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{query ? `Tidak menemukan “${query.trim()}”` : 'Belum ada tugas di filter ini'}</Text>
            <Text style={styles.emptyCopy}>{query ? 'Coba kata kunci lain atau pindah filter tugas.' : 'Gunakan input pintar di atas untuk membuat tugas baru.'}</Text>
          </View>
        )}
      </Surface>
    </Screen>
    <TaskEditorModal
      visible={editorOpen}
      task={editorTask}
      onClose={() => setEditorOpen(false)}
      onSaved={() => load(true)}
    />
    </>
  );
}

function FilterChip({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.pressed]}>
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
      <View style={[styles.filterCount, selected && styles.filterCountSelected]}><Text style={styles.filterCountText}>{count}</Text></View>
    </Pressable>
  );
}

function SortChip({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Urutkan berdasarkan ${label}`} onPress={onPress} style={({ pressed }) => [styles.sortChip, selected && styles.sortChipSelected, pressed && styles.pressed]}>
      <Ionicons name={icon} size={14} color={selected ? colors.cyan : colors.textMuted} />
      <Text style={[styles.sortChipText, selected && styles.sortChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inputHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  aiIcon: { width: 38, height: 38, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(167,139,250,0.1)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)' },
  inputCopy: { flex: 1 },
  inputTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  inputHint: { marginTop: 3, color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  input: { minHeight: 92, marginTop: spacing.lg, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.black, color: colors.text, padding: spacing.md, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  inputFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  inputActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  characterCount: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  manualButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  manualButtonText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  addButton: { minWidth: 112, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.white },
  addButtonText: { color: colors.black, fontSize: 12, fontWeight: '900' },
  filters: { flexDirection: 'row', gap: spacing.sm },
  filterChip: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterChipSelected: { borderColor: 'rgba(103,232,249,0.4)', backgroundColor: 'rgba(34,211,238,0.09)' },
  filterText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  filterTextSelected: { color: colors.cyan },
  filterCount: { minWidth: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  filterCountSelected: { backgroundColor: 'rgba(103,232,249,0.16)' },
  filterCountText: { color: colors.textSecondary, fontSize: 9, fontWeight: '900' },
  searchBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.black, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 12, fontWeight: '600' },
  sortHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  sortLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  sortResult: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  sortRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  sortChip: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  sortChipSelected: { borderColor: 'rgba(103,232,249,0.38)', backgroundColor: 'rgba(34,211,238,0.08)' },
  sortChipText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  sortChipTextSelected: { color: colors.cyan },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  longPressHint: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyCopy: { maxWidth: 250, marginTop: 6, color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  loading: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  busy: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
