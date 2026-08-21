import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage } from '../lib/api';
import { academicTaskApi } from '../lib/student-api';
import {
  ACADEMIC_TASK_STATUSES,
  ACADEMIC_TASK_TYPES,
  type AcademicTask,
  type AcademicTaskInput,
  type AcademicTaskStatus,
  type AcademicTaskType,
} from '../lib/student-types';
import { colors, radii, spacing } from '../theme';

type AcademicFilter = 'active' | 'completed' | 'all';

interface AcademicDraft {
  courseName: string;
  taskType: AcademicTaskType;
  title: string;
  description: string;
  deadline: string;
  status: AcademicTaskStatus;
  lmsUrl: string;
}

const EMPTY_DRAFT: AcademicDraft = {
  courseName: '',
  taskType: 'praktikum',
  title: '',
  description: '',
  deadline: '',
  status: 'todo',
  lmsUrl: '',
};

const TYPE_LABELS: Record<AcademicTaskType, string> = {
  tp: 'TP',
  praktikum: 'Praktikum',
  jurnal: 'Jurnal',
  tubes: 'Tubes',
  exam: 'Ujian',
};

const STATUS_LABELS: Record<AcademicTaskStatus, string> = {
  todo: 'Belum mulai',
  in_progress: 'Dikerjakan',
  completed: 'Selesai',
};

const STATUS_ACTION_LABELS: Record<AcademicTaskStatus, string> = {
  todo: 'Mulai',
  in_progress: 'Selesaikan',
  completed: 'Buka lagi',
};

const NEXT_STATUS: Record<AcademicTaskStatus, AcademicTaskStatus> = {
  todo: 'in_progress',
  in_progress: 'completed',
  completed: 'todo',
};

const TYPE_TONES: Record<AcademicTaskType, { backgroundColor: string; borderColor: string; color: string }> = {
  tp: { backgroundColor: 'rgba(96,165,250,0.10)', borderColor: 'rgba(96,165,250,0.24)', color: '#93C5FD' },
  praktikum: { backgroundColor: 'rgba(167,139,250,0.10)', borderColor: 'rgba(167,139,250,0.24)', color: colors.purple },
  jurnal: { backgroundColor: 'rgba(103,232,249,0.10)', borderColor: 'rgba(103,232,249,0.24)', color: colors.cyan },
  tubes: { backgroundColor: 'rgba(251,113,133,0.10)', borderColor: 'rgba(251,113,133,0.24)', color: colors.rose },
  exam: { backgroundColor: 'rgba(252,211,77,0.10)', borderColor: 'rgba(252,211,77,0.24)', color: colors.amber },
};

export function AcademicScreen() {
  const [tasks, setTasks] = useState<AcademicTask[]>([]);
  const [filter, setFilter] = useState<AcademicFilter>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AcademicTask | null>(null);
  const [draft, setDraft] = useState<AcademicDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    try {
      const response = await academicTaskApi.list();
      setTasks([...response.data.data].sort(sortAcademicTasks));
    } catch (error) {
      Alert.alert('Akademik belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const closeForm = () => {
    setFormOpen(false);
    setEditingTask(null);
    setDraft(EMPTY_DRAFT);
  };

  const openCreateForm = () => {
    setEditingTask(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  };

  const openEditForm = (task: AcademicTask) => {
    setEditingTask(task);
    setDraft({
      courseName: task.course_name,
      taskType: task.task_type,
      title: task.title,
      description: task.description ?? '',
      deadline: toLocalDeadlineInput(task.deadline),
      status: task.status,
      lmsUrl: task.lms_url ?? '',
    });
    setFormOpen(true);
  };

  const saveTask = async () => {
    const courseName = draft.courseName.trim();
    const title = draft.title.trim();
    if (!courseName || !title) {
      Alert.alert('Data belum lengkap', 'Nama mata kuliah dan judul tugas wajib diisi.');
      return;
    }

    const parsedDeadline = parseDeadlineInput(draft.deadline);
    if (!parsedDeadline.ok) {
      Alert.alert('Format deadline belum tepat', 'Gunakan format YYYY-MM-DD HH:mm, misalnya 2026-07-20 23:59.');
      return;
    }

    const lmsUrl = draft.lmsUrl.trim();
    if (lmsUrl && !/^https?:\/\/\S+$/i.test(lmsUrl)) {
      Alert.alert('Tautan LMS belum valid', 'Gunakan alamat lengkap yang diawali http:// atau https://.');
      return;
    }

    const payload: AcademicTaskInput = {
      course_name: courseName,
      task_type: draft.taskType,
      title,
      description: emptyToNull(draft.description),
      deadline: parsedDeadline.value,
      status: draft.status,
      lms_url: lmsUrl || null,
    };

    setSaving(true);
    try {
      const response = editingTask
        ? await academicTaskApi.update(editingTask.id, payload)
        : await academicTaskApi.create(payload);
      const savedTask = response.data.data;
      setTasks((current) => {
        const withoutSaved = current.filter((task) => task.id !== savedTask.id);
        return [...withoutSaved, savedTask].sort(sortAcademicTasks);
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeForm();
    } catch (error) {
      Alert.alert(
        editingTask ? 'Tugas belum diperbarui' : 'Tugas belum dibuat',
        getApiErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (task: AcademicTask) => {
    setBusyTaskId(task.id);
    try {
      const response = await academicTaskApi.update(task.id, { status: NEXT_STATUS[task.status] });
      setTasks((current) => current.map((item) => item.id === task.id ? response.data.data : item));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      Alert.alert('Status belum berubah', getApiErrorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const confirmDelete = (task: AcademicTask) => {
    Alert.alert(
      'Hapus tugas akademik?',
      `“${task.title}” dari ${task.course_name} juga akan dihapus dari antrean scheduler.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => void deleteTask(task),
        },
      ],
    );
  };

  const deleteTask = async (task: AcademicTask) => {
    setBusyTaskId(task.id);
    try {
      await academicTaskApi.remove(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (editingTask?.id === task.id) closeForm();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Tugas belum dihapus', getApiErrorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const activeTasks = tasks.filter((task) => task.status !== 'completed');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const overdueCount = activeTasks.filter(isAcademicTaskOverdue).length;
  const visibleTasks = filter === 'active' ? activeTasks : filter === 'completed' ? completedTasks : tasks;

  return (
    <Screen
      eyebrow="TEL-U ACADEMIC"
      title="Akademik"
      refreshing={refreshing}
      onRefresh={() => void load(true)}
      action={(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={formOpen ? 'Tutup formulir tugas akademik' : 'Tambah tugas akademik'}
          onPress={formOpen ? closeForm : openCreateForm}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Ionicons name={formOpen ? 'close' : 'add'} size={21} color={colors.black} />
        </Pressable>
      )}
    >
      <Surface>
        <View style={styles.heroHeader}>
          <View style={styles.heroIcon}>
            <Ionicons name="school" size={25} color={colors.purple} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Milestone kuliah</Text>
            <Text style={styles.heroHint}>Tugas tersinkron otomatis ke AI Scheduler.</Text>
          </View>
        </View>
        <View style={styles.metricRow}>
          <AcademicMetric label="Aktif" value={activeTasks.length} tone={colors.purple} />
          <AcademicMetric label="Terlambat" value={overdueCount} tone={colors.rose} />
          <AcademicMetric label="Selesai" value={completedTasks.length} tone={colors.emerald} />
        </View>
      </Surface>

      {formOpen ? (
        <Surface>
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formEyebrow}>{editingTask ? 'EDIT MILESTONE' : 'MILESTONE BARU'}</Text>
              <Text style={styles.formTitle}>{editingTask ? 'Perbarui tugas kuliah' : 'Catat tugas kuliah'}</Text>
            </View>
            {editingTask ? <Text style={styles.editBadge}>MODE EDIT</Text> : null}
          </View>

          <FieldLabel text="Mata kuliah *" />
          <TextInput
            accessibilityLabel="Nama mata kuliah"
            value={draft.courseName}
            onChangeText={(courseName) => setDraft((current) => ({ ...current, courseName }))}
            placeholder="Contoh: Struktur Data"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
            style={styles.input}
          />

          <FieldLabel text="Jenis milestone *" />
          <View style={styles.choiceWrap}>
            {ACADEMIC_TASK_TYPES.map((taskType) => (
              <ChoiceChip
                key={taskType}
                label={TYPE_LABELS[taskType]}
                selected={draft.taskType === taskType}
                onPress={() => setDraft((current) => ({ ...current, taskType }))}
              />
            ))}
          </View>

          <FieldLabel text="Judul *" />
          <TextInput
            accessibilityLabel="Judul tugas akademik"
            value={draft.title}
            onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
            placeholder="Contoh: Modul 4 — Binary Tree"
            placeholderTextColor={colors.textMuted}
            maxLength={255}
            style={styles.input}
          />

          <FieldLabel text="Catatan" />
          <TextInput
            accessibilityLabel="Catatan tugas akademik"
            value={draft.description}
            onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
            placeholder="Topik, requirement, atau progres terakhir"
            placeholderTextColor={colors.textMuted}
            maxLength={1200}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.multilineInput]}
          />

          <FieldLabel text="Deadline" hint="YYYY-MM-DD HH:mm" />
          <TextInput
            accessibilityLabel="Deadline tugas akademik"
            value={draft.deadline}
            onChangeText={(deadline) => setDraft((current) => ({ ...current, deadline }))}
            placeholder="2026-07-20 23:59"
            placeholderTextColor={colors.textMuted}
            maxLength={16}
            autoCapitalize="none"
            style={styles.input}
          />

          <FieldLabel text="Status" />
          <View style={styles.choiceWrap}>
            {ACADEMIC_TASK_STATUSES.map((status) => (
              <ChoiceChip
                key={status}
                label={STATUS_LABELS[status]}
                selected={draft.status === status}
                onPress={() => setDraft((current) => ({ ...current, status }))}
              />
            ))}
          </View>

          <FieldLabel text="Tautan LMS / CeLOE" />
          <TextInput
            accessibilityLabel="Tautan LMS atau CeLOE"
            value={draft.lmsUrl}
            onChangeText={(lmsUrl) => setDraft((current) => ({ ...current, lmsUrl }))}
            placeholder="https://lms.telkomuniversity.ac.id/..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={500}
            style={styles.input}
          />

          <View style={styles.formActions}>
            <Pressable
              accessibilityRole="button"
              onPress={closeForm}
              disabled={saving}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, saving && styles.disabled]}
            >
              <Text style={styles.secondaryButtonText}>Batal</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void saveTask()}
              disabled={saving}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}
            >
              {saving ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="save-outline" size={17} color={colors.black} />}
              <Text style={styles.primaryButtonText}>{editingTask ? 'Simpan' : 'Tambah'}</Text>
            </Pressable>
          </View>
        </Surface>
      ) : null}

      <View style={styles.filters}>
        <FilterChip label="Aktif" count={activeTasks.length} selected={filter === 'active'} onPress={() => setFilter('active')} />
        <FilterChip label="Selesai" count={completedTasks.length} selected={filter === 'completed'} onPress={() => setFilter('completed')} />
        <FilterChip label="Semua" count={tasks.length} selected={filter === 'all'} onPress={() => setFilter('all')} />
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{filter === 'active' ? 'Milestone aktif' : filter === 'completed' ? 'Riwayat selesai' : 'Semua milestone'}</Text>
        <Text style={styles.listHint}>{visibleTasks.length} tugas</Text>
      </View>

      {loading ? (
        <Surface>
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.purple} />
            <Text style={styles.loadingText}>Memuat tugas akademik…</Text>
          </View>
        </Surface>
      ) : visibleTasks.length > 0 ? visibleTasks.map((task) => (
        <AcademicTaskCard
          key={task.id}
          task={task}
          busy={busyTaskId === task.id}
          onEdit={() => openEditForm(task)}
          onDelete={() => confirmDelete(task)}
          onAdvanceStatus={() => void advanceStatus(task)}
          onOpenLms={() => void openLms(task.lms_url)}
        />
      )) : (
        <Surface>
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={34} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Belum ada milestone di sini</Text>
            <Text style={styles.emptyCopy}>Tambahkan tugas, praktikum, jurnal, tubes, atau ujian dari tombol +.</Text>
          </View>
        </Surface>
      )}
    </Screen>
  );
}

function AcademicMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{text}</Text>
      {hint ? <Text style={styles.labelHint}>{hint}</Text> : null}
    </View>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choiceChip, selected && styles.choiceChipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
      <Text style={[styles.filterCount, selected && styles.filterCountSelected]}>{count}</Text>
    </Pressable>
  );
}

function AcademicTaskCard({
  task,
  busy,
  onEdit,
  onDelete,
  onAdvanceStatus,
  onOpenLms,
}: {
  task: AcademicTask;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAdvanceStatus: () => void;
  onOpenLms: () => void;
}) {
  const done = task.status === 'completed';
  const overdue = isAcademicTaskOverdue(task);
  const tone = TYPE_TONES[task.task_type];

  return (
    <Surface>
      <View style={[styles.taskCard, busy && styles.disabled]}>
        <View style={styles.taskHeader}>
          <View style={styles.taskHeading}>
            <View style={styles.badgeRow}>
              <View style={[styles.typeBadge, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
                <Text style={[styles.typeBadgeText, { color: tone.color }]}>{TYPE_LABELS[task.task_type]}</Text>
              </View>
              <View style={[styles.statusBadge, done && styles.statusBadgeDone]}>
                <Text style={[styles.statusBadgeText, done && styles.statusBadgeTextDone]}>{STATUS_LABELS[task.status]}</Text>
              </View>
              {overdue ? (
                <View style={styles.overdueBadge}>
                  <Ionicons name="warning-outline" size={11} color={colors.rose} />
                  <Text style={styles.overdueText}>TERLAMBAT</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.courseName, done && styles.completedText]}>{task.course_name}</Text>
            <Text style={[styles.taskTitle, done && styles.completedText]}>{task.title}</Text>
          </View>
          {busy ? <ActivityIndicator size="small" color={colors.purple} /> : null}
        </View>

        {task.description ? <Text style={styles.taskDescription}>{task.description}</Text> : null}

        <View style={styles.taskMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={overdue ? colors.rose : colors.textMuted} />
            <Text style={[styles.metaText, overdue && styles.metaTextOverdue]}>{formatAcademicDeadline(task.deadline)}</Text>
          </View>
          {task.lms_url ? (
            <Pressable accessibilityRole="link" onPress={onOpenLms} style={({ pressed }) => [styles.lmsLink, pressed && styles.pressed]}>
              <Ionicons name="open-outline" size={13} color={colors.purple} />
              <Text style={styles.lmsLinkText}>Buka LMS</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${STATUS_ACTION_LABELS[task.status]} ${task.title}`}
            onPress={onAdvanceStatus}
            disabled={busy}
            style={({ pressed }) => [styles.statusAction, pressed && styles.pressed, busy && styles.disabled]}
          >
            <Ionicons name={done ? 'refresh-outline' : task.status === 'todo' ? 'play-outline' : 'checkmark'} size={15} color={done ? colors.cyan : colors.emerald} />
            <Text style={styles.statusActionText}>{STATUS_ACTION_LABELS[task.status]}</Text>
          </Pressable>
          <View style={styles.iconActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={onEdit} disabled={busy} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons name="create-outline" size={17} color={colors.textSecondary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${task.title}`} onPress={onDelete} disabled={busy} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons name="trash-outline" size={17} color={colors.rose} />
            </Pressable>
          </View>
        </View>
      </View>
    </Surface>
  );
}

async function openLms(url: string | null) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Tautan tidak dapat dibuka', 'Periksa kembali alamat LMS pada tugas ini.');
  }
}

function sortAcademicTasks(a: AcademicTask, b: AcademicTask) {
  const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
  const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
  if (aDeadline !== bDeadline) return aDeadline - bDeadline;
  return a.title.localeCompare(b.title, 'id');
}

function isAcademicTaskOverdue(task: AcademicTask) {
  if (!task.deadline || task.status === 'completed') return false;
  const deadline = new Date(task.deadline).getTime();
  return Number.isFinite(deadline) && deadline < Date.now();
}

function formatAcademicDeadline(value: string | null) {
  if (!value) return 'Tanpa deadline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Deadline tidak valid';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toLocalDeadlineInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function parseDeadlineInput(value: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return { ok: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const valid = date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    && date.getHours() === hour
    && date.getMinutes() === minute;

  return valid ? { ok: true, value: date.toISOString() } : { ok: false };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

const styles = StyleSheet.create({
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.22)',
    backgroundColor: 'rgba(167,139,250,0.09)',
  },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  heroHint: { marginTop: 4, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  metricRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    paddingVertical: spacing.md,
  },
  metricValue: { fontSize: 22, fontWeight: '900' },
  metricLabel: { marginTop: 3, color: colors.textMuted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  formEyebrow: { color: colors.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  formTitle: { marginTop: 4, color: colors.text, fontSize: 17, fontWeight: '900' },
  editBadge: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, borderWidth: 1, borderColor: 'rgba(103,232,249,0.22)', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 5 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: 7 },
  label: { color: colors.textSecondary, fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  labelHint: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.black,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 13,
    fontWeight: '600',
  },
  multilineInput: { minHeight: 88, lineHeight: 19 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceChip: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.md },
  choiceChipSelected: { borderColor: 'rgba(167,139,250,0.42)', backgroundColor: 'rgba(167,139,250,0.12)' },
  choiceText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  choiceTextSelected: { color: colors.purple },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  secondaryButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 11, fontWeight: '900' },
  primaryButton: { flex: 1.35, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.white },
  primaryButtonText: { color: colors.black, fontSize: 11, fontWeight: '900' },
  filters: { flexDirection: 'row', gap: spacing.sm },
  filterChip: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterChipSelected: { borderColor: 'rgba(167,139,250,0.4)', backgroundColor: 'rgba(167,139,250,0.09)' },
  filterText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  filterTextSelected: { color: colors.purple },
  filterCount: { minWidth: 18, color: colors.textMuted, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  filterCountSelected: { color: colors.text },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  listHint: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  taskCard: { gap: spacing.md },
  taskHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  taskHeading: { flex: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  typeBadge: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  typeBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  statusBadge: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeDone: { borderColor: 'rgba(110,231,183,0.24)', backgroundColor: 'rgba(110,231,183,0.08)' },
  statusBadgeText: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  statusBadgeTextDone: { color: colors.emerald },
  overdueBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(251,113,133,0.24)', backgroundColor: 'rgba(251,113,133,0.08)', paddingHorizontal: 7, paddingVertical: 4 },
  overdueText: { color: colors.rose, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  courseName: { marginTop: spacing.md, color: colors.purple, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  taskTitle: { marginTop: 4, color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  completedText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  taskDescription: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, fontWeight: '500' },
  taskMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  metaTextOverdue: { color: colors.rose },
  lmsLink: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, backgroundColor: 'rgba(167,139,250,0.08)', paddingHorizontal: 9, paddingVertical: 6 },
  lmsLinkText: { color: colors.purple, fontSize: 9, fontWeight: '900' },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  statusAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.md },
  statusActionText: { color: colors.textSecondary, fontSize: 10, fontWeight: '900' },
  iconActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  emptyState: { minHeight: 190, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 14, fontWeight: '900' },
  emptyCopy: { maxWidth: 260, marginTop: 6, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.46 },
});
