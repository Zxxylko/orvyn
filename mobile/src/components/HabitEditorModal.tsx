import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiErrorMessage, habitApi } from '../lib/api';
import { colors, radii, spacing } from '../theme';
import type { Habit } from '../types';

interface HabitEditorModalProps {
  habit: Habit | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const colorOptions = [
  { value: 'pink', tone: colors.pink },
  { value: 'cyan', tone: colors.cyan },
  { value: 'emerald', tone: colors.emerald },
  { value: 'amber', tone: colors.amber },
  { value: 'purple', tone: colors.purple },
] as const;

export function HabitEditorModal({ habit, onClose, onSaved }: HabitEditorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('health');
  const [target, setTarget] = useState('1');
  const [unit, setUnit] = useState('session');
  const [color, setColor] = useState('pink');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!habit) return;
    setName(habit.name);
    setDescription(habit.description ?? '');
    setCategory(habit.category || 'health');
    setTarget(String(habit.target_per_day || 1));
    setUnit(habit.unit || 'session');
    setColor(habit.color || 'pink');
    setIsActive(habit.is_active);
  }, [habit]);

  const save = async () => {
    if (!habit || !name.trim()) {
      Alert.alert('Nama diperlukan', 'Isi nama kebiasaan sebelum menyimpan.');
      return;
    }

    setSaving(true);
    try {
      await habitApi.update(habit.id, {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || 'health',
        target_per_day: Math.min(99, Math.max(1, Number.parseInt(target, 10) || 1)),
        unit: unit.trim() || 'session',
        color,
        is_active: isActive,
      });
      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert('Habit belum tersimpan', getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!habit) return;
    Alert.alert('Hapus habit?', `“${habit.name}” beserta riwayat check-in akan dihapus.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => void (async () => {
          setSaving(true);
          try {
            await habitApi.remove(habit.id);
            await onSaved();
            onClose();
          } catch (error) {
            Alert.alert('Habit belum dihapus', getApiErrorMessage(error));
          } finally {
            setSaving(false);
          }
        })(),
      },
    ]);
  };

  return (
    <Modal visible={habit !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tutup editor habit" onPress={onClose} style={styles.headerButton}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>KELOLA RUTINITAS</Text>
              <Text style={styles.heading}>Detail habit</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void save()} disabled={saving} style={[styles.saveButton, saving && styles.disabled]}>
              {saving ? <ActivityIndicator size="small" color={colors.black} /> : <Text style={styles.saveText}>Simpan</Text>}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={styles.label}>Nama</Text>
              <TextInput value={name} onChangeText={setName} maxLength={120} placeholder="Nama kebiasaan" placeholderTextColor={colors.textMuted} style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Deskripsi</Text>
              <TextInput value={description} onChangeText={setDescription} multiline maxLength={1000} placeholder="Kenapa kebiasaan ini penting?" placeholderTextColor={colors.textMuted} style={[styles.input, styles.textArea]} />
            </View>
            <View style={styles.doubleRow}>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Target per hari</Text>
                <TextInput value={target} onChangeText={setTarget} keyboardType="number-pad" maxLength={2} style={styles.input} />
              </View>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Satuan</Text>
                <TextInput value={unit} onChangeText={setUnit} maxLength={40} placeholder="session" placeholderTextColor={colors.textMuted} style={styles.input} />
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Kategori</Text>
              <TextInput value={category} onChangeText={setCategory} maxLength={60} placeholder="health, study, personal" placeholderTextColor={colors.textMuted} style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Warna</Text>
              <View style={styles.colorRow}>
                {colorOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityLabel={`Warna ${option.value}`}
                    accessibilityState={{ selected: color === option.value }}
                    onPress={() => setColor(option.value)}
                    style={[styles.colorButton, color === option.value && styles.colorButtonSelected]}
                  >
                    <View style={[styles.colorDot, { backgroundColor: option.tone }]} />
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: isActive }} onPress={() => setIsActive((value) => !value)} style={({ pressed }) => [styles.statusRow, pressed && styles.pressed]}>
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitle}>Habit aktif</Text>
                <Text style={styles.statusHint}>Habit nonaktif tetap tersimpan tetapi tidak masuk target harian.</Text>
              </View>
              <View style={[styles.switchTrack, isActive && styles.switchTrackActive]}>
                <View style={[styles.switchThumb, isActive && styles.switchThumbActive]} />
              </View>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={confirmDelete} disabled={saving} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed, saving && styles.disabled]}>
              <Ionicons name="trash-outline" size={17} color={colors.rose} />
              <Text style={styles.deleteText}>Hapus habit</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.emerald, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  heading: { marginTop: 4, color: colors.text, fontSize: 18, fontWeight: '900' },
  saveButton: { minWidth: 72, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.white },
  saveText: { color: colors.black, fontSize: 11, fontWeight: '900' },
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  input: { minHeight: 48, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 13, fontWeight: '600' },
  textArea: { minHeight: 104, paddingTop: spacing.md, textAlignVertical: 'top' },
  doubleRow: { flexDirection: 'row', gap: spacing.md },
  colorRow: { flexDirection: 'row', gap: spacing.sm },
  colorButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  colorButtonSelected: { borderColor: colors.textSecondary, backgroundColor: colors.surfaceRaised },
  colorDot: { width: 18, height: 18, borderRadius: 9 },
  statusRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  statusHint: { marginTop: 4, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  switchTrack: { width: 44, height: 26, justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surfaceRaised, paddingHorizontal: 3 },
  switchTrackActive: { backgroundColor: colors.emerald },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
  switchThumbActive: { alignSelf: 'flex-end', backgroundColor: colors.black },
  deleteButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(251,113,133,0.28)', backgroundColor: 'rgba(251,113,133,0.06)' },
  deleteText: { color: colors.rose, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
