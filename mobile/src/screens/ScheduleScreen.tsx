import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage, taskApi } from '../lib/api';
import { localDateKey } from '../lib/date';
import { productivityApi } from '../lib/productivity-api';
import { colors, radii, spacing } from '../theme';
import type { ScheduleStackParamList, Task } from '../types';
import type { TimeBlock, TimeBlockType } from '../types/productivity';

type LoadMode = 'loading' | 'refresh' | 'silent';

interface TimeBlockDraft {
  label: string;
  date: string;
  start: string;
  end: string;
  blockType: TimeBlockType;
  taskId: string;
  isLocked: boolean;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: TimeBlockType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'task', label: 'Tugas', icon: 'checkmark-circle-outline' },
  { value: 'study', label: 'Belajar', icon: 'book-outline' },
  { value: 'class', label: 'Kelas', icon: 'school-outline' },
  { value: 'break', label: 'Istirahat', icon: 'cafe-outline' },
  { value: 'personal', label: 'Pribadi', icon: 'person-outline' },
];

export function ScheduleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ScheduleStackParamList, 'Agenda'>>();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => localDateKey());
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<TimeBlockDraft | null>(null);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);

  const load = useCallback(async (mode: LoadMode = 'loading', rangeStart = weekStart) => {
    if (mode === 'loading') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    const rangeEnd = addDays(rangeStart, 6);
    try {
      const [nextBlocks, taskResponse] = await Promise.all([
        productivityApi.timeBlocks.list({ start_date: localDateKey(rangeStart), end_date: localDateKey(rangeEnd) }),
        taskApi.list({ active: true }),
      ]);
      setBlocks(nextBlocks);
      setTasks(taskResponse.data.data.filter((task) => task.status !== 'completed' && task.status !== 'cancelled'));
    } catch (error) {
      Alert.alert('Jadwal belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weekStart]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const visibleBlocks = useMemo(() => blocks
    .filter((block) => localDateKey(new Date(block.start_time)) === selectedDate)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()), [blocks, selectedDate]);

  const changeWeek = (offset: number) => {
    const nextWeek = addDays(weekStart, offset * 7);
    setWeekStart(nextWeek);
    setSelectedDate(localDateKey(nextWeek));
    closeEditor();
  };

  const goToday = () => {
    const today = new Date();
    setWeekStart(startOfWeek(today));
    setSelectedDate(localDateKey(today));
    closeEditor();
  };

  const openCreate = () => {
    const start = defaultStartTime(selectedDate);
    setEditingBlock(null);
    setDraft({
      label: '',
      date: selectedDate,
      start,
      end: addMinutesToClock(start, 60),
      blockType: 'study',
      taskId: '',
      isLocked: true,
    });
  };

  const openEdit = (block: TimeBlock) => {
    const startDate = new Date(block.start_time);
    const endDate = new Date(block.end_time);
    setEditingBlock(block);
    setDraft({
      label: block.label,
      date: localDateKey(startDate),
      start: clockValue(startDate),
      end: clockValue(endDate),
      blockType: block.block_type,
      taskId: block.task_id ?? '',
      isLocked: block.is_locked,
    });
  };

  const saveBlock = async () => {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) {
      Alert.alert('Judul belum diisi', 'Beri nama agar blok mudah dikenali di jadwal.');
      return;
    }

    const start = parseLocalDateTime(draft.date, draft.start);
    const end = parseLocalDateTime(draft.date, draft.end);
    if (!start || !end) {
      Alert.alert('Tanggal atau jam belum valid', 'Gunakan format tanggal YYYY-MM-DD dan jam HH:mm.');
      return;
    }
    if (end.getTime() <= start.getTime()) {
      Alert.alert('Rentang waktu belum valid', 'Jam selesai harus lebih akhir dari jam mulai pada hari yang sama.');
      return;
    }

    setSaving(true);
    try {
      const input = {
        label,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        block_type: draft.blockType,
        task_id: draft.taskId || null,
        is_locked: draft.isLocked,
      };
      if (editingBlock) await productivityApi.timeBlocks.update(editingBlock.id, input);
      else await productivityApi.timeBlocks.create(input);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const targetWeek = startOfWeek(start);
      setWeekStart(targetWeek);
      setSelectedDate(localDateKey(start));
      closeEditor();
      await load('silent', targetWeek);
    } catch (error) {
      Alert.alert('Blok jadwal belum tersimpan', getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (block: TimeBlock) => {
    Alert.alert('Hapus blok jadwal?', `“${block.label}” akan dihapus dari kalender.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => void (async () => {
          setBusyBlockId(block.id);
          try {
            await productivityApi.timeBlocks.remove(block.id);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (editingBlock?.id === block.id) closeEditor();
            await load('silent');
          } catch (error) {
            Alert.alert('Blok belum dihapus', getApiErrorMessage(error));
          } finally {
            setBusyBlockId(null);
          }
        })(),
      },
    ]);
  };

  const optimize = async () => {
    setOptimizing(true);
    try {
      const result = await productivityApi.timeBlocks.optimize();
      const today = new Date();
      const currentWeek = startOfWeek(today);
      setWeekStart(currentWeek);
      setSelectedDate(localDateKey(today));
      closeEditor();
      await load('silent', currentWeek);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Optimasi selesai', result.blocks.length > 0 ? `${result.blocks.length} blok baru dijadwalkan otomatis.` : result.message);
    } catch (error) {
      Alert.alert('Jadwal belum dapat dirapikan', getApiErrorMessage(error));
    } finally {
      setOptimizing(false);
    }
  };

  function closeEditor() {
    setDraft(null);
    setEditingBlock(null);
  }

  const headerActions = (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buka focus timer"
        onPress={() => navigation.navigate('Focus')}
        style={({ pressed }) => [styles.focusHeaderButton, pressed && styles.pressed]}
      >
        <Ionicons name="timer-outline" size={20} color={colors.purple} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tambah blok jadwal"
        onPress={openCreate}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={23} color={colors.black} />
      </Pressable>
    </View>
  );

  return (
    <Screen eyebrow="TIME BLOCKING" title="Jadwal" action={headerActions} refreshing={refreshing} onRefresh={() => void load('refresh')}>
      <Surface>
        <View style={styles.weekControls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Minggu sebelumnya" onPress={() => changeWeek(-1)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={19} color={colors.textSecondary} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={goToday} style={({ pressed }) => [styles.rangeCopy, pressed && styles.pressed]}>
            <Text style={styles.rangeLabel}>{weekRangeLabel(weekStart)}</Text>
            <Text style={styles.todayHint}>KETUK UNTUK HARI INI</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Minggu berikutnya" onPress={() => changeWeek(1)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="chevron-forward" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
          {days.map((date) => {
            const key = localDateKey(date);
            const selected = key === selectedDate;
            const isToday = key === localDateKey();
            const count = blocks.filter((block) => localDateKey(new Date(block.start_time)) === key).length;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${formatFullDay(date)}, ${count} blok`}
                onPress={() => { setSelectedDate(key); closeEditor(); }}
                style={({ pressed }) => [styles.dayChip, selected && styles.dayChipSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.dayName, selected && styles.dayNameSelected]}>{new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date)}</Text>
                <Text style={[styles.dayNumber, selected && styles.dayNumberSelected]}>{date.getDate()}</Text>
                <View style={[styles.dayCount, count > 0 && styles.dayCountFilled, isToday && styles.dayCountToday]}><Text style={styles.dayCountText}>{count}</Text></View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          disabled={optimizing}
          onPress={() => void optimize()}
          style={({ pressed }) => [styles.optimizeButton, pressed && styles.pressed, optimizing && styles.disabled]}
        >
          {optimizing ? <ActivityIndicator size="small" color={colors.purple} /> : <Ionicons name="sparkles" size={17} color={colors.purple} />}
          <View style={styles.optimizeCopy}>
            <Text style={styles.optimizeTitle}>{optimizing ? 'Merapikan jadwal…' : 'Optimasi dengan AI'}</Text>
            <Text style={styles.optimizeHint}>Sebarkan tugas aktif ke slot kosong 7 hari ke depan.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </Surface>

      {draft ? (
        <TimeBlockEditor
          draft={draft}
          editing={editingBlock}
          tasks={tasks}
          saving={saving}
          onChange={setDraft}
          onCancel={closeEditor}
          onSave={() => void saveBlock()}
          onDelete={editingBlock ? () => confirmDelete(editingBlock) : undefined}
        />
      ) : null}

      <View style={styles.listHeader}>
        <View>
          <Text style={styles.listTitle}>{formatFullDay(parseDateKey(selectedDate) ?? new Date())}</Text>
          <Text style={styles.listSubtitle}>{visibleBlocks.length} blok terjadwal</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={openCreate} style={({ pressed }) => [styles.smallAddButton, pressed && styles.pressed]}>
          <Ionicons name="add" size={16} color={colors.cyan} /><Text style={styles.smallAddText}>Tambah</Text>
        </Pressable>
      </View>

      {loading ? (
        <Surface><View style={styles.loading}><ActivityIndicator color={colors.purple} /><Text style={styles.loadingText}>Memuat jadwal…</Text></View></Surface>
      ) : visibleBlocks.length > 0 ? visibleBlocks.map((block) => (
        <TimeBlockCard key={block.id} block={block} busy={busyBlockId === block.id} onEdit={() => openEdit(block)} onDelete={() => confirmDelete(block)} />
      )) : (
        <Surface>
          <View style={styles.empty}>
            <Ionicons name="calendar-clear-outline" size={34} color={colors.purple} />
            <Text style={styles.emptyTitle}>Hari ini masih longgar</Text>
            <Text style={styles.emptyCopy}>Tambahkan blok manual atau gunakan optimasi untuk menjadwalkan tugas aktif.</Text>
            <Pressable accessibilityRole="button" onPress={openCreate} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}><Text style={styles.emptyButtonText}>Buat blok</Text></Pressable>
          </View>
        </Surface>
      )}
    </Screen>
  );
}

function TimeBlockEditor({
  draft,
  editing,
  tasks,
  saving,
  onChange,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: TimeBlockDraft;
  editing: TimeBlock | null;
  tasks: Task[];
  saving: boolean;
  onChange: (next: TimeBlockDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const patchDraft = (patch: Partial<TimeBlockDraft>) => onChange({ ...draft, ...patch });

  return (
    <Surface>
      <View style={styles.editorHeader}>
        <View style={styles.editorIcon}><Ionicons name={editing ? 'create-outline' : 'calendar-outline'} size={19} color={colors.purple} /></View>
        <View style={styles.editorCopy}>
          <Text style={styles.editorTitle}>{editing ? 'Edit blok jadwal' : 'Blok baru'}</Text>
          <Text style={styles.editorHint}>Jam memakai zona waktu perangkat.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Tutup form" onPress={onCancel} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Ionicons name="close" size={19} color={colors.textMuted} /></Pressable>
      </View>

      <Text style={styles.inputLabel}>JUDUL</Text>
      <TextInput
        accessibilityLabel="Judul blok"
        value={draft.label}
        onChangeText={(label) => patchDraft({ label })}
        placeholder="Contoh: Belajar basis data"
        placeholderTextColor={colors.textMuted}
        maxLength={255}
        style={styles.input}
      />

      <Text style={styles.inputLabel}>TANGGAL</Text>
      <TextInput
        accessibilityLabel="Tanggal blok"
        value={draft.date}
        onChangeText={(date) => patchDraft({ date })}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        maxLength={10}
        style={styles.input}
      />

      <View style={styles.timeInputs}>
        <View style={styles.timeInputWrap}>
          <Text style={styles.inputLabel}>MULAI</Text>
          <TextInput accessibilityLabel="Jam mulai" value={draft.start} onChangeText={(start) => patchDraft({ start })} placeholder="09:00" placeholderTextColor={colors.textMuted} autoCorrect={false} maxLength={5} style={styles.input} />
        </View>
        <Ionicons name="arrow-forward" size={17} color={colors.textMuted} style={styles.timeArrow} />
        <View style={styles.timeInputWrap}>
          <Text style={styles.inputLabel}>SELESAI</Text>
          <TextInput accessibilityLabel="Jam selesai" value={draft.end} onChangeText={(end) => patchDraft({ end })} placeholder="10:00" placeholderTextColor={colors.textMuted} autoCorrect={false} maxLength={5} style={styles.input} />
        </View>
      </View>

      <Text style={styles.inputLabel}>JENIS BLOK</Text>
      <View style={styles.typeGrid}>
        {TYPE_OPTIONS.map((option) => {
          const selected = draft.blockType === option.value;
          return (
            <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => patchDraft({ blockType: option.value })} style={({ pressed }) => [styles.typeChip, selected && styles.typeChipSelected, pressed && styles.pressed]}>
              <Ionicons name={option.icon} size={15} color={selected ? colors.purple : colors.textMuted} />
              <Text style={[styles.typeText, selected && styles.typeTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.inputLabel}>TAUTKAN TUGAS (OPSIONAL)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskChips} keyboardShouldPersistTaps="handled">
        <TaskChip label="Tanpa tugas" selected={!draft.taskId} onPress={() => patchDraft({ taskId: '' })} />
        {tasks.map((task) => <TaskChip key={task.id} label={task.title} selected={draft.taskId === task.id} onPress={() => patchDraft({ taskId: task.id })} />)}
      </ScrollView>

      <Pressable accessibilityRole="switch" accessibilityState={{ checked: draft.isLocked }} onPress={() => patchDraft({ isLocked: !draft.isLocked })} style={({ pressed }) => [styles.lockRow, pressed && styles.pressed]}>
        <View style={[styles.checkbox, draft.isLocked && styles.checkboxChecked]}>{draft.isLocked ? <Ionicons name="checkmark" size={14} color={colors.black} /> : null}</View>
        <View style={styles.lockCopy}>
          <Text style={styles.lockTitle}>Kunci posisi blok</Text>
          <Text style={styles.lockHint}>Optimizer tidak akan memindahkan blok ini.</Text>
        </View>
      </Pressable>

      <View style={styles.editorActions}>
        {onDelete ? <Pressable accessibilityRole="button" accessibilityLabel="Hapus blok jadwal" disabled={saving} onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed, saving && styles.disabled]}><Ionicons name="trash-outline" size={17} color={colors.rose} /></Pressable> : null}
        <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed, saving && styles.disabled]}><Text style={styles.cancelText}>Batal</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={saving || !draft.label.trim()} onPress={onSave} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, (saving || !draft.label.trim()) && styles.disabled]}>
          {saving ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="checkmark" size={18} color={colors.black} />}
          <Text style={styles.saveText}>{saving ? 'Menyimpan' : editing ? 'Simpan' : 'Jadwalkan'}</Text>
        </Pressable>
      </View>
    </Surface>
  );
}

function TaskChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.taskChip, selected && styles.taskChipSelected, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.taskChipText, selected && styles.taskChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function TimeBlockCard({ block, busy, onEdit, onDelete }: { block: TimeBlock; busy: boolean; onEdit: () => void; onDelete: () => void }) {
  const start = new Date(block.start_time);
  const end = new Date(block.end_time);
  const duration = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  const tone = typeTone(block.block_type);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${block.label}`} disabled={busy} onPress={onEdit} onLongPress={onDelete} style={({ pressed }) => [styles.blockCard, { borderLeftColor: tone }, pressed && styles.pressed, busy && styles.disabled]}>
      <View style={styles.blockTime}>
        <Text style={[styles.blockStart, { color: tone }]}>{clockValue(start)}</Text>
        <Text style={styles.blockEnd}>{clockValue(end)}</Text>
      </View>
      <View style={styles.blockCopy}>
        <View style={styles.blockTitleRow}>
          <Text numberOfLines={2} style={styles.blockTitle}>{block.label}</Text>
          {block.is_locked ? <Ionicons name="lock-closed" size={12} color={colors.textMuted} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.blockMeta}>{typeLabel(block.block_type)} · {duration} menit{block.task?.title ? ` · ${block.task.title}` : ''}</Text>
      </View>
      {busy ? <ActivityIndicator size="small" color={tone} /> : <Ionicons name="create-outline" size={17} color={colors.textMuted} />}
    </Pressable>
  );
}

function startOfWeek(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function addDays(value: Date, amount: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function parseDateKey(value: string): Date | null {
  return parseLocalDateTime(value, '12:00');
}

function parseLocalDateTime(dateValue: string, timeValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(`${dateValue}T${timeValue}`);
  if (!match) return null;
  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  const hourText = match[4];
  const minuteText = match[5];
  if (!yearText || !monthText || !dayText || !hourText || !minuteText) return null;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date;
}

function clockValue(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function defaultStartTime(dateKey: string): string {
  const now = new Date();
  if (dateKey !== localDateKey(now) || now.getHours() >= 22) return '09:00';
  const rounded = new Date(now);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15);
  return clockValue(rounded);
}

function addMinutesToClock(value: string, amount: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = Number(match?.[1] ?? 9);
  const minute = Number(match?.[2] ?? 0);
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + amount);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function weekRangeLabel(start: Date): string {
  const end = addDays(start, 6);
  const startLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(start);
  const endLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(end);
  return `${startLabel} – ${endLabel}`;
}

function formatFullDay(value: Date): string {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(value);
}

function typeLabel(type: TimeBlockType): string {
  return TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function typeTone(type: TimeBlockType): string {
  if (type === 'break') return colors.emerald;
  if (type === 'class') return colors.cyan;
  if (type === 'personal') return colors.pink;
  if (type === 'task') return colors.amber;
  return colors.purple;
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  focusHeaderButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(167,139,250,0.24)', backgroundColor: 'rgba(167,139,250,0.08)' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.white },
  weekControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  rangeCopy: { flex: 1, alignItems: 'center' },
  rangeLabel: { color: colors.text, fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  todayHint: { marginTop: 4, color: colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  daysRow: { gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  dayChip: { width: 58, minHeight: 88, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  dayChipSelected: { borderColor: 'rgba(167,139,250,0.42)', backgroundColor: 'rgba(167,139,250,0.11)' },
  dayName: { color: colors.textMuted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  dayNameSelected: { color: colors.purple },
  dayNumber: { marginTop: 4, color: colors.textSecondary, fontSize: 19, fontWeight: '900' },
  dayNumberSelected: { color: colors.text },
  dayCount: { minWidth: 20, height: 17, marginTop: 5, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
  dayCountFilled: { backgroundColor: 'rgba(167,139,250,0.14)' },
  dayCountToday: { borderWidth: 1, borderColor: colors.cyan },
  dayCountText: { color: colors.textMuted, fontSize: 8, fontWeight: '900' },
  optimizeButton: { minHeight: 58, marginTop: spacing.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', backgroundColor: 'rgba(167,139,250,0.07)' },
  optimizeCopy: { flex: 1 },
  optimizeTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  optimizeHint: { marginTop: 3, color: colors.textMuted, fontSize: 9, lineHeight: 13, fontWeight: '600' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  listTitle: { color: colors.text, fontSize: 17, fontWeight: '900', textTransform: 'capitalize' },
  listSubtitle: { marginTop: 4, color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  smallAddButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(103,232,249,0.22)', backgroundColor: 'rgba(34,211,238,0.07)' },
  smallAddText: { color: colors.cyan, fontSize: 10, fontWeight: '900' },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 15, fontWeight: '900' },
  emptyCopy: { marginTop: 6, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  emptyButton: { minHeight: 40, marginTop: spacing.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.medium, backgroundColor: colors.white },
  emptyButtonText: { color: colors.black, fontSize: 11, fontWeight: '900' },
  blockCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.large, borderWidth: 1, borderLeftWidth: 4, borderColor: colors.border, backgroundColor: colors.surface },
  blockTime: { width: 47 },
  blockStart: { fontSize: 13, fontWeight: '900' },
  blockEnd: { marginTop: 5, color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  blockCopy: { flex: 1 },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  blockTitle: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  blockMeta: { marginTop: 6, color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  editorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  editorIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: 'rgba(167,139,250,0.1)' },
  editorCopy: { flex: 1 },
  editorTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  editorHint: { marginTop: 3, color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, backgroundColor: colors.surfaceSoft },
  inputLabel: { marginTop: spacing.md, marginBottom: 6, color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  input: { minHeight: 46, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.black, color: colors.text, paddingHorizontal: spacing.md, fontSize: 12, fontWeight: '700' },
  timeInputs: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  timeInputWrap: { flex: 1 },
  timeArrow: { marginBottom: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  typeChipSelected: { borderColor: 'rgba(167,139,250,0.35)', backgroundColor: 'rgba(167,139,250,0.1)' },
  typeText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  typeTextSelected: { color: colors.purple },
  taskChips: { gap: spacing.sm, paddingBottom: spacing.xs },
  taskChip: { maxWidth: 190, minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  taskChipSelected: { borderColor: 'rgba(103,232,249,0.32)', backgroundColor: 'rgba(34,211,238,0.08)' },
  taskChipText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  taskChipTextSelected: { color: colors.cyan },
  lockRow: { minHeight: 58, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  checkbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong },
  checkboxChecked: { borderColor: colors.emerald, backgroundColor: colors.emerald },
  lockCopy: { flex: 1 },
  lockTitle: { color: colors.text, fontSize: 11, fontWeight: '900' },
  lockHint: { marginTop: 3, color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  editorActions: { marginTop: spacing.lg, paddingTop: spacing.lg, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 'auto', borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(251,113,133,0.22)', backgroundColor: 'rgba(251,113,133,0.08)' },
  cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textSecondary, fontSize: 10, fontWeight: '900' },
  saveButton: { minWidth: 112, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.medium, backgroundColor: colors.white },
  saveText: { color: colors.black, fontSize: 10, fontWeight: '900' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.48 },
});
