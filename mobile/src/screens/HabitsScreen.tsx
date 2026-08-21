import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { HabitEditorModal } from '../components/HabitEditorModal';
import { Surface } from '../components/Surface';
import { getApiErrorMessage, habitApi } from '../lib/api';
import { localDateKey } from '../lib/date';
import { colors, radii, spacing } from '../theme';
import type { Habit } from '../types';

export function HabitsScreen() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [name, setName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorHabit, setEditorHabit] = useState<Habit | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await habitApi.list();
      setHabits(response.data.data);
    } catch (error) {
      Alert.alert('Habit belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load(true);
  }, [load]));

  const createHabit = async () => {
    const nextName = name.trim();
    if (!nextName) return;
    setCreating(true);
    try {
      await habitApi.create(nextName);
      setName('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load(true);
    } catch (error) {
      Alert.alert('Habit belum dibuat', getApiErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const toggleCheckIn = async (habit: Habit) => {
    setBusyId(habit.id);
    try {
      const today = localDateKey();
      if (habit.checked_in_today) await habitApi.uncheck(habit.id, today);
      else await habitApi.checkIn(habit.id, today);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await load(true);
    } catch (error) {
      Alert.alert('Check-in belum berubah', getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const activeHabits = habits.filter((habit) => habit.is_active);
  const checkedCount = activeHabits.filter((habit) => habit.checked_in_today).length;

  return (
    <>
    <Screen eyebrow="RITME HARIAN" title="Habit" refreshing={refreshing} onRefresh={() => void load()}>
      <Surface>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.summaryEyebrow}>CHECK-IN HARI INI</Text>
            <Text style={styles.summaryValue}>{checkedCount}<Text style={styles.summaryTotal}>/{activeHabits.length}</Text></Text>
          </View>
          <View style={styles.ring}>
            <Ionicons name={checkedCount === activeHabits.length && activeHabits.length > 0 ? 'checkmark' : 'repeat'} size={24} color={colors.emerald} />
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${activeHabits.length > 0 ? Math.round((checkedCount / activeHabits.length) * 100) : 0}%` }]} />
        </View>
        <Text style={styles.summaryCopy}>{checkedCount === activeHabits.length && activeHabits.length > 0 ? 'Semua kebiasaan hari ini sudah aman.' : 'Konsistensi kecil lebih penting daripada target yang terlalu besar.'}</Text>
      </Surface>

      <View style={styles.createRow}>
        <TextInput
          accessibilityLabel="Nama habit baru"
          value={name}
          onChangeText={setName}
          placeholder="Contoh: Baca 20 menit"
          placeholderTextColor={colors.textMuted}
          maxLength={120}
          style={styles.input}
          onSubmitEditing={() => void createHabit()}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Tambah habit" onPress={() => void createHabit()} disabled={!name.trim() || creating} style={({ pressed }) => [styles.addButton, pressed && styles.pressed, (!name.trim() || creating) && styles.disabled]}>
          {creating ? <ActivityIndicator color={colors.black} /> : <Ionicons name="add" size={24} color={colors.black} />}
        </Pressable>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Semua kebiasaan</Text>
        <Text style={styles.listHint}>Ketuk check-in · ••• kelola</Text>
      </View>

      {habits.length > 0 ? habits.map((habit) => (
        <HabitCard key={habit.id} habit={habit} busy={busyId === habit.id} onPress={() => void toggleCheckIn(habit)} onManage={() => setEditorHabit(habit)} />
      )) : (
        <Surface>
          <View style={styles.empty}>
            <Ionicons name="leaf-outline" size={32} color={colors.emerald} />
            <Text style={styles.emptyTitle}>Mulai dari satu kebiasaan</Text>
            <Text style={styles.emptyCopy}>Buat rutinitas yang realistis dan mudah dilakukan setiap hari.</Text>
          </View>
        </Surface>
      )}
    </Screen>
    <HabitEditorModal habit={editorHabit} onClose={() => setEditorHabit(null)} onSaved={() => load(true)} />
    </>
  );
}

function HabitCard({ habit, busy, onPress, onManage }: { habit: Habit; busy: boolean; onPress: () => void; onManage: () => void }) {
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const checkInDates = new Set(habit.check_ins.map((checkIn) => checkIn.check_in_date));

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${habit.checked_in_today ? 'Batalkan check-in' : 'Check-in'} ${habit.name}`} accessibilityState={{ checked: habit.checked_in_today, disabled: busy || !habit.is_active }} onPress={() => habit.is_active && onPress()} onLongPress={onManage} disabled={busy} style={({ pressed }) => [styles.habitCard, habit.checked_in_today && styles.habitCardDone, !habit.is_active && styles.habitCardInactive, pressed && styles.pressed, busy && styles.disabled]}>
      <View style={styles.habitHeader}>
        <View style={[styles.habitIcon, habit.checked_in_today && styles.habitIconDone]}>
          {busy ? <ActivityIndicator size="small" color={colors.emerald} /> : <Ionicons name={habit.checked_in_today ? 'checkmark' : 'fitness-outline'} size={19} color={habit.checked_in_today ? colors.black : colors.pink} />}
        </View>
        <View style={styles.habitCopy}>
          <Text style={styles.habitName}>{habit.name}</Text>
          <Text style={styles.habitMeta}>{habit.is_active ? habit.checked_in_today ? 'Selesai hari ini' : 'Belum check-in' : 'Nonaktif'} · {habit.current_streak} hari streak</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Kelola habit ${habit.name}`}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onManage();
          }}
          style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}
        >
          <Ionicons name="ellipsis-horizontal" size={19} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.daysRow}>
        {recentDays.map((date) => {
          const key = localDateKey(date);
          const done = checkInDates.has(key);
          return (
            <View key={key} style={styles.dayItem}>
              <View style={[styles.dayDot, done && styles.dayDotDone]}>{done ? <Ionicons name="checkmark" size={11} color={colors.black} /> : null}</View>
              <Text style={styles.dayLabel}>{new Intl.DateTimeFormat('id-ID', { weekday: 'narrow' }).format(date)}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryEyebrow: { color: colors.emerald, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  summaryValue: { marginTop: 5, color: colors.text, fontSize: 34, fontWeight: '900' },
  summaryTotal: { color: colors.textMuted, fontSize: 20 },
  ring: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(110,231,183,0.28)', backgroundColor: 'rgba(110,231,183,0.08)' },
  progressTrack: { height: 7, marginTop: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.black, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.emerald },
  summaryCopy: { marginTop: spacing.md, color: colors.textSecondary, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  createRow: { flexDirection: 'row', gap: spacing.sm },
  input: { flex: 1, minHeight: 50, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 13, fontWeight: '600' },
  addButton: { width: 50, height: 50, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  listHint: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  habitCard: { borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  habitCardDone: { borderColor: 'rgba(110,231,183,0.26)', backgroundColor: 'rgba(110,231,183,0.055)' },
  habitCardInactive: { opacity: 0.62, borderStyle: 'dashed' },
  habitHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  habitIcon: { width: 40, height: 40, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,114,182,0.1)', borderWidth: 1, borderColor: 'rgba(244,114,182,0.18)' },
  habitIconDone: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  habitCopy: { flex: 1 },
  habitName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  habitMeta: { marginTop: 5, color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  manageButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, paddingHorizontal: spacing.xs },
  dayItem: { alignItems: 'center', gap: 6 },
  dayDot: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  dayDotDone: { borderColor: colors.emerald, backgroundColor: colors.emerald },
  dayLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  empty: { minHeight: 190, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyCopy: { maxWidth: 250, marginTop: 6, color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.48 },
});
