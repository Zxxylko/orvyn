import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiErrorMessage, taskApi } from '../lib/api';
import { colors, radii, spacing } from '../theme';
import type { Task, TaskPriority, TaskStatus } from '../types';

interface TaskEditorModalProps {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const priorities: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Rendah' },
  { value: 'medium', label: 'Sedang' },
  { value: 'high', label: 'Tinggi' },
  { value: 'critical', label: 'Kritis' },
];

const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: 'pending', label: 'Belum' },
  { value: 'in_progress', label: 'Dikerjakan' },
  { value: 'completed', label: 'Selesai' },
  { value: 'cancelled', label: 'Batal' },
];

function deadlineInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function deadlinePayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T23:59:00`
    : trimmed.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error('Tanggal tidak valid');
  return date.toISOString();
}

export function TaskEditorModal({ visible, task, onClose, onSaved }: TaskEditorModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [duration, setDuration] = useState('60');
  const [difficulty, setDifficulty] = useState('2');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setDeadline(deadlineInput(task?.deadline ?? null));
    setStatus(task?.status ?? 'pending');
    setPriority(task?.priority ?? 'medium');
    setDuration(String(task?.duration_minutes || 60));
    setDifficulty(String(task?.difficulty || 2));
    setCategory(task?.category || 'general');
    setTags(task?.tags?.join(', ') ?? '');
  }, [task, visible]);

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Judul diperlukan', 'Isi judul tugas sebelum menyimpan.');
      return;
    }

    let parsedDeadline: string | null;
    try {
      parsedDeadline = deadlinePayload(deadline);
    } catch {
      Alert.alert('Deadline tidak valid', 'Gunakan format YYYY-MM-DD HH:mm, misalnya 2026-07-20 20:00.');
      return;
    }

    const durationMinutes = Math.max(1, Number.parseInt(duration, 10) || 60);
    const difficultyValue = Math.min(5, Math.max(1, Number.parseInt(difficulty, 10) || 2));
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      deadline: parsedDeadline,
      status,
      priority,
      duration_minutes: durationMinutes,
      difficulty: difficultyValue,
      category: category.trim() || 'general',
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    };

    setSaving(true);
    try {
      if (task) await taskApi.update(task.id, payload);
      else await taskApi.create(payload);
      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert('Tugas belum tersimpan', getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!task) return;
    Alert.alert('Hapus tugas?', `“${task.title}” akan dihapus permanen dari ORVYN.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => void (async () => {
          setDeleting(true);
          try {
            await taskApi.remove(task.id);
            await onSaved();
            onClose();
          } catch (error) {
            Alert.alert('Tugas belum dihapus', getApiErrorMessage(error));
          } finally {
            setDeleting(false);
          }
        })(),
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tutup editor tugas" onPress={onClose} style={styles.headerButton}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{task ? 'EDIT DETAIL' : 'TUGAS MANUAL'}</Text>
              <Text style={styles.heading}>{task ? 'Perbarui tugas' : 'Buat tugas'}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void save()} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>
              {saving ? <ActivityIndicator size="small" color={colors.black} /> : <Text style={styles.saveText}>Simpan</Text>}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Field label="Judul">
              <TextInput value={title} onChangeText={setTitle} maxLength={255} placeholder="Nama tugas" placeholderTextColor={colors.textMuted} style={styles.input} />
            </Field>
            <Field label="Deskripsi">
              <TextInput value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="Catatan dan konteks" placeholderTextColor={colors.textMuted} style={[styles.input, styles.textArea]} />
            </Field>
            <Field label="Deadline" hint="Format: YYYY-MM-DD HH:mm">
              <TextInput value={deadline} onChangeText={setDeadline} autoCapitalize="none" placeholder="2026-07-20 20:00" placeholderTextColor={colors.textMuted} style={styles.input} />
            </Field>
            <Field label="Status">
              <OptionGrid options={statuses} value={status} onChange={setStatus} />
            </Field>
            <Field label="Prioritas">
              <OptionGrid options={priorities} value={priority} onChange={setPriority} />
            </Field>
            <View style={styles.doubleRow}>
              <Field label="Durasi (menit)" style={styles.flex}>
                <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={styles.input} />
              </Field>
              <Field label="Kesulitan (1–5)" style={styles.flex}>
                <TextInput value={difficulty} onChangeText={setDifficulty} keyboardType="number-pad" style={styles.input} />
              </Field>
            </View>
            <Field label="Kategori">
              <TextInput value={category} onChangeText={setCategory} maxLength={80} placeholder="general, coding, theory" placeholderTextColor={colors.textMuted} style={styles.input} />
            </Field>
            <Field label="Tag" hint="Pisahkan dengan koma">
              <TextInput value={tags} onChangeText={setTags} maxLength={300} placeholder="kuliah, laporan" placeholderTextColor={colors.textMuted} style={styles.input} />
            </Field>
            {task ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Hapus tugas ${task.title}`} onPress={confirmDelete} disabled={saving || deleting} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed, (saving || deleting) && styles.disabled]}>
                {deleting ? <ActivityIndicator size="small" color={colors.rose} /> : <Ionicons name="trash-outline" size={17} color={colors.rose} />}
                <Text style={styles.deleteText}>{deleting ? 'Menghapus…' : 'Hapus tugas'}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, hint, style, children }: { label: string; hint?: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function OptionGrid<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.options}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={[styles.option, selected && styles.optionSelected]}>
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  heading: { marginTop: 4, color: colors.text, fontSize: 18, fontWeight: '900' },
  saveButton: { minWidth: 72, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.white },
  saveText: { color: colors.black, fontSize: 11, fontWeight: '900' },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
  field: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 13, fontWeight: '600' },
  textArea: { minHeight: 104, paddingTop: spacing.md, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minHeight: 40, minWidth: '46%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionSelected: { borderColor: 'rgba(103,232,249,0.45)', backgroundColor: 'rgba(34,211,238,0.1)' },
  optionText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  optionTextSelected: { color: colors.cyan },
  doubleRow: { flexDirection: 'row', gap: spacing.md },
  deleteButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(251,113,133,0.24)', backgroundColor: 'rgba(251,113,133,0.07)' },
  deleteText: { color: colors.rose, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
