import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage } from '../lib/api';
import { campusScheduleApi } from '../lib/student-api';
import {
  CAMPUS_CLASS_TYPES,
  type CampusClassType,
  type CampusSchedule,
  type CampusScheduleInput,
} from '../lib/student-types';
import { colors, radii, spacing } from '../theme';

type CampusView = 'today' | 'week';

interface CampusDraft {
  courseName: string;
  courseCode: string;
  lecturer: string;
  building: string;
  room: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classType: CampusClassType;
  commuteMinutes: string;
  prepMinutes: string;
  notes: string;
  isActive: boolean;
}

const DAY_OPTIONS = [
  { value: 0, label: 'Minggu', short: 'Min' },
  { value: 1, label: 'Senin', short: 'Sen' },
  { value: 2, label: 'Selasa', short: 'Sel' },
  { value: 3, label: 'Rabu', short: 'Rab' },
  { value: 4, label: 'Kamis', short: 'Kam' },
  { value: 5, label: 'Jumat', short: 'Jum' },
  { value: 6, label: 'Sabtu', short: 'Sab' },
] as const;

const CLASS_TYPE_LABELS: Record<CampusClassType, string> = {
  lecture: 'Kuliah',
  lab: 'Lab',
  project: 'Proyek',
  exam: 'Ujian',
  seminar: 'Seminar',
};

const CLASS_TYPE_TONES: Record<CampusClassType, { backgroundColor: string; borderColor: string; color: string }> = {
  lecture: { backgroundColor: 'rgba(103,232,249,0.09)', borderColor: 'rgba(103,232,249,0.23)', color: colors.cyan },
  lab: { backgroundColor: 'rgba(244,114,182,0.09)', borderColor: 'rgba(244,114,182,0.23)', color: colors.pink },
  project: { backgroundColor: 'rgba(252,211,77,0.09)', borderColor: 'rgba(252,211,77,0.23)', color: colors.amber },
  exam: { backgroundColor: 'rgba(251,113,133,0.09)', borderColor: 'rgba(251,113,133,0.23)', color: colors.rose },
  seminar: { backgroundColor: 'rgba(110,231,183,0.09)', borderColor: 'rgba(110,231,183,0.23)', color: colors.emerald },
};

export function CampusScreen() {
  const [schedules, setSchedules] = useState<CampusSchedule[]>([]);
  const [view, setView] = useState<CampusView>('today');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<CampusSchedule | null>(null);
  const [draft, setDraft] = useState<CampusDraft>(() => createCampusDraft());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    try {
      const response = await campusScheduleApi.list();
      setSchedules([...response.data.data].sort(sortCampusSchedules));
    } catch (error) {
      Alert.alert('Jadwal kampus belum dapat dimuat', getApiErrorMessage(error));
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
    setEditingSchedule(null);
    setDraft(createCampusDraft());
  };

  const openCreateForm = () => {
    setEditingSchedule(null);
    setDraft(createCampusDraft());
    setFormOpen(true);
  };

  const openEditForm = (schedule: CampusSchedule) => {
    setEditingSchedule(schedule);
    setDraft({
      courseName: schedule.course_name,
      courseCode: schedule.course_code ?? '',
      lecturer: schedule.lecturer ?? '',
      building: schedule.building ?? '',
      room: schedule.room ?? '',
      dayOfWeek: schedule.day_of_week,
      startTime: schedule.start_time.slice(0, 5),
      endTime: schedule.end_time.slice(0, 5),
      classType: schedule.class_type,
      commuteMinutes: String(schedule.commute_minutes),
      prepMinutes: String(schedule.prep_minutes),
      notes: schedule.notes ?? '',
      isActive: schedule.is_active,
    });
    setFormOpen(true);
  };

  const saveSchedule = async () => {
    const courseName = draft.courseName.trim();
    if (!courseName) {
      Alert.alert('Nama mata kuliah belum diisi', 'Masukkan nama kelas sebelum menyimpan jadwal.');
      return;
    }

    const startMinutes = timeToMinutes(draft.startTime);
    const endMinutes = timeToMinutes(draft.endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      Alert.alert('Jam kelas belum valid', 'Gunakan format HH:mm dan pastikan jam selesai setelah jam mulai.');
      return;
    }

    const commuteMinutes = parseBoundedMinutes(draft.commuteMinutes);
    const prepMinutes = parseBoundedMinutes(draft.prepMinutes);
    if (commuteMinutes === null || prepMinutes === null) {
      Alert.alert('Durasi belum valid', 'Waktu perjalanan dan persiapan harus berupa angka 0–180 menit.');
      return;
    }

    const payload: CampusScheduleInput = {
      course_name: courseName,
      course_code: emptyToNull(draft.courseCode),
      lecturer: emptyToNull(draft.lecturer),
      building: emptyToNull(draft.building),
      room: emptyToNull(draft.room),
      day_of_week: draft.dayOfWeek,
      start_time: draft.startTime,
      end_time: draft.endTime,
      class_type: draft.classType,
      commute_minutes: commuteMinutes,
      prep_minutes: prepMinutes,
      notes: emptyToNull(draft.notes),
      is_active: draft.isActive,
    };

    setSaving(true);
    try {
      const response = editingSchedule
        ? await campusScheduleApi.update(editingSchedule.id, payload)
        : await campusScheduleApi.create(payload);
      const savedSchedule = response.data.data;
      setSchedules((current) => {
        const withoutSaved = current.filter((schedule) => schedule.id !== savedSchedule.id);
        return [...withoutSaved, savedSchedule].sort(sortCampusSchedules);
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeForm();
    } catch (error) {
      Alert.alert(
        editingSchedule ? 'Jadwal belum diperbarui' : 'Jadwal belum dibuat',
        getApiErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleSchedule = async (schedule: CampusSchedule) => {
    setBusyScheduleId(schedule.id);
    try {
      const response = await campusScheduleApi.update(schedule.id, { is_active: !schedule.is_active });
      setSchedules((current) => current.map((item) => item.id === schedule.id ? response.data.data : item));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      Alert.alert('Status jadwal belum berubah', getApiErrorMessage(error));
    } finally {
      setBusyScheduleId(null);
    }
  };

  const confirmDelete = (schedule: CampusSchedule) => {
    Alert.alert('Hapus jadwal kelas?', `“${schedule.course_name}” akan dihapus dari jadwal mingguan.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => void deleteSchedule(schedule) },
    ]);
  };

  const deleteSchedule = async (schedule: CampusSchedule) => {
    setBusyScheduleId(schedule.id);
    try {
      await campusScheduleApi.remove(schedule.id);
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      if (editingSchedule?.id === schedule.id) closeForm();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Jadwal belum dihapus', getApiErrorMessage(error));
    } finally {
      setBusyScheduleId(null);
    }
  };

  const now = new Date();
  const todayIndex = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const activeSchedules = schedules.filter((schedule) => schedule.is_active);
  const todaySchedules = schedules.filter((schedule) => schedule.day_of_week === todayIndex);
  const activeTodaySchedules = todaySchedules.filter((schedule) => schedule.is_active);
  const nextSchedule = activeTodaySchedules.find((schedule) => (timeToMinutes(schedule.end_time) ?? -1) > nowMinutes) ?? null;
  const weeklyMinutes = activeSchedules.reduce((total, schedule) => total + scheduleDuration(schedule), 0);
  const departureTime = nextSchedule
    ? formatClock((timeToMinutes(nextSchedule.start_time) ?? 0) - nextSchedule.commute_minutes - nextSchedule.prep_minutes)
    : '--:--';

  return (
    <Screen
      eyebrow="CAMPUS LIFE"
      title="Jadwal Kampus"
      refreshing={refreshing}
      onRefresh={() => void load(true)}
      action={(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={formOpen ? 'Tutup formulir jadwal' : 'Tambah jadwal kampus'}
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
            <Ionicons name="location" size={24} color={colors.cyan} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{dayName(todayIndex)} di kampus</Text>
            <Text style={styles.heroHint}>Kelas, lokasi, persiapan, dan perjalanan dalam satu ritme.</Text>
          </View>
        </View>
        <View style={styles.metricRow}>
          <CampusMetric label="Hari ini" value={String(activeTodaySchedules.length)} detail="kelas aktif" tone={colors.cyan} />
          <CampusMetric label="Berangkat" value={departureTime} detail={nextSchedule?.building ?? 'kelas berikut'} tone={colors.amber} />
          <CampusMetric label="Mingguan" value={`${formatHours(weeklyMinutes)}j`} detail="terjadwal" tone={colors.emerald} />
        </View>
      </Surface>

      {formOpen ? (
        <Surface>
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formEyebrow}>{editingSchedule ? 'EDIT KELAS' : 'KELAS BARU'}</Text>
              <Text style={styles.formTitle}>{editingSchedule ? 'Perbarui jadwal' : 'Tambah jadwal'}</Text>
            </View>
            {editingSchedule ? <Text style={styles.editBadge}>MODE EDIT</Text> : null}
          </View>

          <FieldLabel text="Mata kuliah *" />
          <TextInput
            accessibilityLabel="Nama mata kuliah"
            value={draft.courseName}
            onChangeText={(courseName) => setDraft((current) => ({ ...current, courseName }))}
            placeholder="Contoh: Struktur Data"
            placeholderTextColor={colors.textMuted}
            maxLength={160}
            style={styles.input}
          />

          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Kode" />
              <TextInput
                accessibilityLabel="Kode mata kuliah"
                value={draft.courseCode}
                onChangeText={(courseCode) => setDraft((current) => ({ ...current, courseCode }))}
                placeholder="CII2A4"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={30}
                style={styles.input}
              />
            </View>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Dosen" />
              <TextInput
                accessibilityLabel="Nama dosen"
                value={draft.lecturer}
                onChangeText={(lecturer) => setDraft((current) => ({ ...current, lecturer }))}
                placeholder="Nama dosen"
                placeholderTextColor={colors.textMuted}
                maxLength={160}
                style={styles.input}
              />
            </View>
          </View>

          <FieldLabel text="Jenis kelas" />
          <View style={styles.choiceWrap}>
            {CAMPUS_CLASS_TYPES.map((classType) => (
              <ChoiceChip
                key={classType}
                label={CLASS_TYPE_LABELS[classType]}
                selected={draft.classType === classType}
                onPress={() => setDraft((current) => ({ ...current, classType }))}
              />
            ))}
          </View>

          <FieldLabel text="Hari" />
          <View style={styles.choiceWrap}>
            {DAY_OPTIONS.map((day) => (
              <ChoiceChip
                key={day.value}
                label={day.short}
                selected={draft.dayOfWeek === day.value}
                onPress={() => setDraft((current) => ({ ...current, dayOfWeek: day.value }))}
              />
            ))}
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Mulai *" hint="HH:mm" />
              <TextInput
                accessibilityLabel="Jam mulai kelas"
                value={draft.startTime}
                onChangeText={(startTime) => setDraft((current) => ({ ...current, startTime }))}
                placeholder="08:30"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                maxLength={5}
                style={styles.input}
              />
            </View>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Selesai *" hint="HH:mm" />
              <TextInput
                accessibilityLabel="Jam selesai kelas"
                value={draft.endTime}
                onChangeText={(endTime) => setDraft((current) => ({ ...current, endTime }))}
                placeholder="10:30"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                maxLength={5}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Gedung" />
              <TextInput
                accessibilityLabel="Gedung kelas"
                value={draft.building}
                onChangeText={(building) => setDraft((current) => ({ ...current, building }))}
                placeholder="TULT"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
                style={styles.input}
              />
            </View>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Ruangan" />
              <TextInput
                accessibilityLabel="Ruangan kelas"
                value={draft.room}
                onChangeText={(room) => setDraft((current) => ({ ...current, room }))}
                placeholder="0708"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Perjalanan" hint="menit" />
              <TextInput
                accessibilityLabel="Durasi perjalanan ke kampus"
                value={draft.commuteMinutes}
                onChangeText={(commuteMinutes) => setDraft((current) => ({ ...current, commuteMinutes }))}
                placeholder="35"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={3}
                style={styles.input}
              />
            </View>
            <View style={styles.fieldColumn}>
              <FieldLabel text="Persiapan" hint="menit" />
              <TextInput
                accessibilityLabel="Durasi persiapan kelas"
                value={draft.prepMinutes}
                onChangeText={(prepMinutes) => setDraft((current) => ({ ...current, prepMinutes }))}
                placeholder="20"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={3}
                style={styles.input}
              />
            </View>
          </View>

          <FieldLabel text="Catatan" />
          <TextInput
            accessibilityLabel="Catatan kelas"
            value={draft.notes}
            onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
            placeholder="Bawa laptop, quiz, diskusi kelompok…"
            placeholderTextColor={colors.textMuted}
            maxLength={1000}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.multilineInput]}
          />

          <View style={styles.activeRow}>
            <View style={styles.activeCopy}>
              <Text style={styles.activeTitle}>Jadwal aktif</Text>
              <Text style={styles.activeHint}>Jadwal aktif muncul dalam perhitungan hari ini.</Text>
            </View>
            <Switch
              accessibilityLabel="Jadwal aktif"
              value={draft.isActive}
              onValueChange={(isActive) => setDraft((current) => ({ ...current, isActive }))}
              trackColor={{ false: colors.surfaceRaised, true: 'rgba(34,211,238,0.38)' }}
              thumbColor={draft.isActive ? colors.cyan : colors.textMuted}
            />
          </View>

          <View style={styles.formActions}>
            <Pressable accessibilityRole="button" onPress={closeForm} disabled={saving} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, saving && styles.disabled]}>
              <Text style={styles.secondaryButtonText}>Batal</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void saveSchedule()} disabled={saving} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}>
              {saving ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="save-outline" size={17} color={colors.black} />}
              <Text style={styles.primaryButtonText}>{editingSchedule ? 'Simpan' : 'Tambah'}</Text>
            </Pressable>
          </View>
        </Surface>
      ) : null}

      <View style={styles.viewTabs}>
        <ViewTab label="Hari ini" count={todaySchedules.length} selected={view === 'today'} onPress={() => setView('today')} />
        <ViewTab label="Mingguan" count={schedules.length} selected={view === 'week'} onPress={() => setView('week')} />
      </View>

      {loading ? (
        <Surface>
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Memuat jadwal kampus…</Text>
          </View>
        </Surface>
      ) : view === 'today' ? (
        <TodayScheduleList
          schedules={todaySchedules}
          todayIndex={todayIndex}
          busyScheduleId={busyScheduleId}
          onEdit={openEditForm}
          onDelete={confirmDelete}
          onToggle={(schedule) => void toggleSchedule(schedule)}
        />
      ) : (
        <WeeklyScheduleList
          schedules={schedules}
          todayIndex={todayIndex}
          busyScheduleId={busyScheduleId}
          onEdit={openEditForm}
          onDelete={confirmDelete}
          onToggle={(schedule) => void toggleSchedule(schedule)}
        />
      )}
    </Screen>
  );
}

function TodayScheduleList({
  schedules,
  todayIndex,
  busyScheduleId,
  onEdit,
  onDelete,
  onToggle,
}: ScheduleListProps) {
  if (schedules.length === 0) {
    return (
      <Surface>
        <View style={styles.emptyState}>
          <Ionicons name="cafe-outline" size={34} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Tidak ada kelas hari ini</Text>
          <Text style={styles.emptyCopy}>Gunakan waktu kosong untuk progres tugas, review, atau pemulihan.</Text>
        </View>
      </Surface>
    );
  }

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{dayName(todayIndex)}</Text>
        <Text style={styles.sectionHint}>{schedules.filter((schedule) => schedule.is_active).length} aktif</Text>
      </View>
      {schedules.map((schedule) => (
        <CampusScheduleCard
          key={schedule.id}
          schedule={schedule}
          todayIndex={todayIndex}
          busy={busyScheduleId === schedule.id}
          onEdit={() => onEdit(schedule)}
          onDelete={() => onDelete(schedule)}
          onToggle={() => onToggle(schedule)}
        />
      ))}
    </>
  );
}

function WeeklyScheduleList({
  schedules,
  todayIndex,
  busyScheduleId,
  onEdit,
  onDelete,
  onToggle,
}: ScheduleListProps) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Peta mingguan</Text>
        <Text style={styles.sectionHint}>{schedules.filter((schedule) => schedule.is_active).length} jadwal aktif</Text>
      </View>
      {DAY_OPTIONS.map((day) => {
        const daySchedules = schedules.filter((schedule) => schedule.day_of_week === day.value);
        const isToday = day.value === todayIndex;
        return (
          <View key={day.value} style={[styles.dayGroup, isToday && styles.dayGroupToday]}>
            <View style={styles.dayHeader}>
              <View style={styles.dayTitleRow}>
                <Text style={[styles.dayTitle, isToday && styles.dayTitleToday]}>{day.label}</Text>
                {isToday ? <Text style={styles.todayBadge}>HARI INI</Text> : null}
              </View>
              <Text style={styles.dayCount}>{daySchedules.length}</Text>
            </View>
            {daySchedules.length > 0 ? daySchedules.map((schedule) => (
              <CampusScheduleCard
                key={schedule.id}
                schedule={schedule}
                todayIndex={todayIndex}
                busy={busyScheduleId === schedule.id}
                compact
                onEdit={() => onEdit(schedule)}
                onDelete={() => onDelete(schedule)}
                onToggle={() => onToggle(schedule)}
              />
            )) : <Text style={styles.clearDay}>Tidak ada kelas</Text>}
          </View>
        );
      })}
    </>
  );
}

interface ScheduleListProps {
  schedules: CampusSchedule[];
  todayIndex: number;
  busyScheduleId: string | null;
  onEdit: (schedule: CampusSchedule) => void;
  onDelete: (schedule: CampusSchedule) => void;
  onToggle: (schedule: CampusSchedule) => void;
}

function CampusScheduleCard({
  schedule,
  todayIndex,
  busy,
  compact = false,
  onEdit,
  onDelete,
  onToggle,
}: {
  schedule: CampusSchedule;
  todayIndex: number;
  busy: boolean;
  compact?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const tone = CLASS_TYPE_TONES[schedule.class_type];
  const leaveTime = formatClock((timeToMinutes(schedule.start_time) ?? 0) - schedule.commute_minutes - schedule.prep_minutes);
  const status = campusScheduleStatus(schedule, todayIndex);
  const location = [schedule.building, schedule.room].filter(Boolean).join(' · ') || 'Lokasi belum diisi';

  return (
    <Surface>
      <View style={[styles.scheduleCard, !schedule.is_active && styles.inactiveCard, busy && styles.disabled]}>
        <View style={styles.scheduleHeader}>
          <View style={styles.scheduleHeading}>
            <View style={styles.badgeRow}>
              <View style={[styles.typeBadge, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
                <Text style={[styles.typeBadgeText, { color: tone.color }]}>{CLASS_TYPE_LABELS[schedule.class_type]}</Text>
              </View>
              <View style={[styles.statusBadge, !schedule.is_active && styles.statusBadgeInactive]}>
                <Text style={[styles.statusBadgeText, !schedule.is_active && styles.statusBadgeTextInactive]}>{status}</Text>
              </View>
            </View>
            <Text style={styles.courseName}>{schedule.course_name}</Text>
            <Text style={styles.courseMeta}>{[schedule.course_code, schedule.lecturer].filter(Boolean).join(' · ') || 'Kode dan dosen belum diisi'}</Text>
          </View>
          {busy ? <ActivityIndicator size="small" color={colors.cyan} /> : (
            <Switch
              accessibilityLabel={`${schedule.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${schedule.course_name}`}
              value={schedule.is_active}
              onValueChange={onToggle}
              trackColor={{ false: colors.surfaceRaised, true: 'rgba(34,211,238,0.38)' }}
              thumbColor={schedule.is_active ? colors.cyan : colors.textMuted}
            />
          )}
        </View>

        <View style={styles.infoGrid}>
          <CampusInfo icon="time-outline" label="Kelas" value={`${schedule.start_time}–${schedule.end_time}`} />
          <CampusInfo icon="navigate-outline" label="Berangkat" value={leaveTime} />
          <CampusInfo icon="location-outline" label="Lokasi" value={location} />
          <CampusInfo icon="hourglass-outline" label="Buffer" value={`${schedule.commute_minutes}m jalan · ${schedule.prep_minutes}m siap`} />
        </View>

        {!compact && schedule.notes ? <Text style={styles.notes}>{schedule.notes}</Text> : null}

        <View style={styles.cardActions}>
          <Text style={styles.durationText}>{formatDuration(scheduleDuration(schedule))}</Text>
          <View style={styles.iconActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${schedule.course_name}`} onPress={onEdit} disabled={busy} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons name="create-outline" size={17} color={colors.textSecondary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${schedule.course_name}`} onPress={onDelete} disabled={busy} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons name="trash-outline" size={17} color={colors.rose} />
            </Pressable>
          </View>
        </View>
      </View>
    </Surface>
  );
}

function CampusInfo({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoLabelRow}>
        <Ionicons name={icon} size={12} color={colors.textMuted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function CampusMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricDetail} numberOfLines={1}>{detail}</Text>
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
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.choiceChip, selected && styles.choiceChipSelected, pressed && styles.pressed]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ViewTab({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.viewTab, selected && styles.viewTabSelected, pressed && styles.pressed]}>
      <Ionicons name={label === 'Hari ini' ? 'today-outline' : 'calendar-outline'} size={16} color={selected ? colors.cyan : colors.textMuted} />
      <Text style={[styles.viewTabText, selected && styles.viewTabTextSelected]}>{label}</Text>
      <Text style={[styles.viewTabCount, selected && styles.viewTabCountSelected]}>{count}</Text>
    </Pressable>
  );
}

function createCampusDraft(): CampusDraft {
  return {
    courseName: '',
    courseCode: '',
    lecturer: '',
    building: 'TULT',
    room: '',
    dayOfWeek: new Date().getDay(),
    startTime: '08:30',
    endTime: '10:30',
    classType: 'lecture',
    commuteMinutes: '35',
    prepMinutes: '20',
    notes: '',
    isActive: true,
  };
}

function sortCampusSchedules(a: CampusSchedule, b: CampusSchedule) {
  if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
  return a.start_time.localeCompare(b.start_time);
}

function timeToMinutes(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClock(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function scheduleDuration(schedule: CampusSchedule) {
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  if (start === null || end === null) return 0;
  return Math.max(0, end - start);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} menit`;
  if (remainder === 0) return `${hours} jam`;
  return `${hours}j ${remainder}m`;
}

function formatHours(minutes: number) {
  const rounded = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function campusScheduleStatus(schedule: CampusSchedule, todayIndex: number) {
  if (!schedule.is_active) return 'Nonaktif';
  if (schedule.day_of_week !== todayIndex) return 'Terjadwal';
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(schedule.start_time) ?? 0;
  const end = timeToMinutes(schedule.end_time) ?? 0;
  const leave = start - schedule.commute_minutes - schedule.prep_minutes;
  if (current > end) return 'Selesai';
  if (current >= start) return 'Sedang kelas';
  if (current >= leave) return 'Bersiap';
  return 'Berikutnya';
}

function dayName(dayIndex: number) {
  return DAY_OPTIONS.find((day) => day.value === dayIndex)?.label ?? 'Hari ini';
}

function parseBoundedMinutes(value: string) {
  if (!/^\d{1,3}$/.test(value.trim())) return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 180 ? minutes : null;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

const styles = StyleSheet.create({
  headerButton: { width: 42, height: 42, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 50, height: 50, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(103,232,249,0.22)', backgroundColor: 'rgba(103,232,249,0.08)' },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  heroHint: { marginTop: 4, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  metricRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  metricItem: { flex: 1, minWidth: 0, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, padding: spacing.md },
  metricLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  metricValue: { marginTop: 6, fontSize: 20, fontWeight: '900' },
  metricDetail: { marginTop: 3, color: colors.textMuted, fontSize: 8, fontWeight: '700' },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  formEyebrow: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  formTitle: { marginTop: 4, color: colors.text, fontSize: 17, fontWeight: '900' },
  editBadge: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, borderWidth: 1, borderColor: 'rgba(103,232,249,0.22)', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 5 },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldColumn: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: 7 },
  label: { color: colors.textSecondary, fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  labelHint: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.black, color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 13, fontWeight: '600' },
  multilineInput: { minHeight: 88, lineHeight: 19 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceChip: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.md },
  choiceChipSelected: { borderColor: 'rgba(103,232,249,0.42)', backgroundColor: 'rgba(103,232,249,0.11)' },
  choiceText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  choiceTextSelected: { color: colors.cyan },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, padding: spacing.md },
  activeCopy: { flex: 1 },
  activeTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  activeHint: { marginTop: 3, color: colors.textMuted, fontSize: 9, lineHeight: 14, fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  secondaryButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 11, fontWeight: '900' },
  primaryButton: { flex: 1.35, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.white },
  primaryButtonText: { color: colors.black, fontSize: 11, fontWeight: '900' },
  viewTabs: { flexDirection: 'row', gap: spacing.sm },
  viewTab: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  viewTabSelected: { borderColor: 'rgba(103,232,249,0.4)', backgroundColor: 'rgba(103,232,249,0.09)' },
  viewTabText: { color: colors.textMuted, fontSize: 11, fontWeight: '900' },
  viewTabTextSelected: { color: colors.cyan },
  viewTabCount: { color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  viewTabCountSelected: { color: colors.text },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionHint: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  dayGroup: { gap: spacing.md, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(17,24,39,0.52)', padding: spacing.md },
  dayGroupToday: { borderColor: 'rgba(103,232,249,0.26)', backgroundColor: 'rgba(103,232,249,0.035)' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '900' },
  dayTitleToday: { color: colors.cyan },
  todayBadge: { color: colors.cyan, fontSize: 7, fontWeight: '900', letterSpacing: 0.7, borderWidth: 1, borderColor: 'rgba(103,232,249,0.24)', borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 4 },
  dayCount: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  clearDay: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center', borderRadius: radii.medium, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, paddingVertical: spacing.lg },
  scheduleCard: { gap: spacing.md },
  inactiveCard: { opacity: 0.58 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  scheduleHeading: { flex: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  typeBadge: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  typeBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  statusBadge: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeInactive: { borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  statusBadgeText: { color: colors.textSecondary, fontSize: 8, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  statusBadgeTextInactive: { color: colors.textMuted },
  courseName: { marginTop: spacing.md, color: colors.text, fontSize: 16, fontWeight: '900' },
  courseMeta: { marginTop: 4, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  infoItem: { width: '48%', flexGrow: 1, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, padding: spacing.md },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  infoValue: { marginTop: 7, color: colors.textSecondary, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  notes: { color: colors.textSecondary, fontSize: 10, lineHeight: 16, fontWeight: '600', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.02)', padding: spacing.md },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  durationText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  iconActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  emptyState: { minHeight: 190, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 14, fontWeight: '900' },
  emptyCopy: { maxWidth: 260, marginTop: 6, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.46 },
});
