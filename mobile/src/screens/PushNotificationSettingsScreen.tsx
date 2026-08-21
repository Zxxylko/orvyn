import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { type ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage } from '../lib/api';
import {
  type PushFeatureKey,
  type PushNotificationSettings,
  type PushNotificationState,
  pushNotificationApi,
  type PushReminderSchedule,
} from '../lib/push-api';
import { colors, radii, spacing } from '../theme';

const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB' },
  { value: 'Asia/Makassar', label: 'WITA' },
  { value: 'Asia/Jayapura', label: 'WIT' },
] as const;

const DEADLINE_OPTIONS = [
  { value: 10080, label: '7 hari' },
  { value: 2880, label: '2 hari' },
  { value: 1440, label: '1 hari' },
  { value: 720, label: '12 jam' },
  { value: 360, label: '6 jam' },
  { value: 180, label: '3 jam' },
  { value: 60, label: '1 jam' },
  { value: 30, label: '30 menit' },
] as const;

const WEEKDAYS = [
  { value: 1, label: 'Sen' },
  { value: 2, label: 'Sel' },
  { value: 3, label: 'Rab' },
  { value: 4, label: 'Kam' },
  { value: 5, label: 'Jum' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Min' },
] as const;

export function PushNotificationSettingsScreen() {
  const [state, setState] = useState<PushNotificationState | null>(null);
  const [settings, setSettings] = useState<PushNotificationSettings | null>(null);
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    try {
      const [nextState, permissionState] = await Promise.all([
        pushNotificationApi.getState(),
        Notifications.getPermissionsAsync(),
      ]);
      setState(nextState);
      setSettings(nextState.settings);
      setPermission(permissionState.status);
    } catch (error) {
      Alert.alert('Notifikasi belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const updateSchedule = <Key extends keyof PushReminderSchedule>(
    key: Key,
    value: PushReminderSchedule[Key],
  ) => {
    setSettings((current) => current ? {
      ...current,
      reminder_schedule: { ...current.reminder_schedule, [key]: value },
    } : current);
  };

  const toggleFeature = (key: PushFeatureKey) => {
    setSettings((current) => current ? {
      ...current,
      features: { ...current.features, [key]: !current.features[key] },
    } : current);
  };

  const toggleDeadlineLead = (minutes: number) => {
    if (!settings) return;

    const current = settings.reminder_schedule.deadline_lead_minutes;
    if (current.includes(minutes) && current.length === 1) {
      Alert.alert('Reminder diperlukan', 'Pilih minimal satu tahap reminder deadline.');
      return;
    }

    const next = current.includes(minutes)
      ? current.filter((value) => value !== minutes)
      : [...current, minutes];
    updateSchedule('deadline_lead_minutes', next.sort((first, second) => second - first));
  };

  const save = async () => {
    if (!settings) return;
    const invalidTime = Object.entries({
      briefing: settings.reminder_schedule.daily_briefing_time,
      progres: settings.reminder_schedule.progress_checkin_time,
      burnout: settings.reminder_schedule.burnout_checkin_time,
      habit: settings.reminder_schedule.habit_checkin_time,
      review: settings.reminder_schedule.weekly_review_time,
    }).find(([, value]) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value));

    if (invalidTime) {
      Alert.alert('Format waktu belum benar', `Jam ${invalidTime[0]} harus memakai format 24 jam HH:MM.`);
      return;
    }

    setSaving(true);
    try {
      const saved = await pushNotificationApi.update(settings);
      setSettings(saved);
      setState((current) => current ? { ...current, settings: saved } : current);
      Alert.alert('Tersimpan', 'Jadwal notifikasi aplikasi sudah diperbarui.');
    } catch (error) {
      Alert.alert('Belum tersimpan', getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const message = await pushNotificationApi.sendTest();
      Alert.alert('Notifikasi masuk antrean', message);
    } catch (error) {
      Alert.alert('Tes belum dapat dikirim', getApiErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  if (loading || !settings || !state) {
    return (
      <Screen eyebrow="REMINDER" title="Notifikasi Aplikasi">
        <Surface>
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Memuat preferensi perangkat…</Text>
          </View>
        </Surface>
      </Screen>
    );
  }

  const activeDevices = state.devices.filter((device) => device.enabled && !device.has_error);
  const permissionGranted = permission === Notifications.PermissionStatus.GRANTED;

  return (
    <Screen
      eyebrow="REMINDER"
      title="Notifikasi Aplikasi"
      refreshing={refreshing}
      onRefresh={() => void load(true)}
    >
      <Surface>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="notifications" size={23} color={colors.cyan} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Pengingat langsung di HP</Text>
            <Text style={styles.heroText}>Berjalan mandiri dari WhatsApp dan tetap memakai queue serta scheduler ORVYN.</Text>
          </View>
          <StatusPill
            active={permissionGranted && state.provider.ready}
            label={permissionGranted && state.provider.ready ? 'SIAP' : 'PERLU IZIN'}
          />
        </View>
        <View style={styles.statusGrid}>
          <StatusMetric label="Izin sistem" value={permissionGranted ? 'Diizinkan' : 'Belum aktif'} tone={permissionGranted ? colors.emerald : colors.amber} />
          <StatusMetric label="Perangkat" value={`${activeDevices.length} aktif`} tone={activeDevices.length > 0 ? colors.cyan : colors.rose} />
          <StatusMetric label="Provider" value={state.provider.enabled ? 'Online' : 'Nonaktif'} tone={state.provider.enabled ? colors.purple : colors.rose} />
        </View>
      </Surface>

      <Surface>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionEyebrow}>PREFERENSI</Text>
            <Text style={styles.sectionTitle}>Notifikasi otomatis</Text>
          </View>
          <SettingSwitch
            label="Notifikasi aplikasi"
            active={settings.enabled}
            onPress={() => setSettings((current) => current ? { ...current, enabled: !current.enabled } : current)}
          />
        </View>

        <Text style={styles.fieldLabel}>Timezone</Text>
        <View style={styles.segmentRow}>
          {TIMEZONES.map((timezone) => {
            const selected = settings.timezone === timezone.value;
            return (
              <Pressable
                key={timezone.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSettings((current) => current ? { ...current, timezone: timezone.value } : current)}
                style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{timezone.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.timezoneDetail}>{settings.timezone}</Text>
      </Surface>

      <FeatureCard
        icon="sunny-outline"
        title="Briefing harian"
        description="Ringkasan deadline, keterlambatan, dan blok jadwal."
        active={settings.features.daily_briefing}
        onToggle={() => toggleFeature('daily_briefing')}
      >
        <TimeInput label="Jam briefing" value={settings.reminder_schedule.daily_briefing_time} onChangeText={(value) => updateSchedule('daily_briefing_time', value)} />
      </FeatureCard>

      <FeatureCard
        icon="notifications-outline"
        title="Deadline bertahap"
        description="Satu notifikasi unik untuk setiap tahap yang dipilih."
        active={settings.features.deadline_reminders}
        onToggle={() => toggleFeature('deadline_reminders')}
      >
        <View style={styles.deadlineWrap}>
          {DEADLINE_OPTIONS.map((option) => {
            const selected = settings.reminder_schedule.deadline_lead_minutes.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleDeadlineLead(option.value)}
                style={({ pressed }) => [styles.deadlineChip, selected && styles.deadlineChipSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.deadlineText, selected && styles.deadlineTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </FeatureCard>

      <FeatureCard
        icon="chatbubble-ellipses-outline"
        title="Check-in progres"
        description="Menanyakan tugas yang sedang dikerjakan."
        active={settings.features.progress_checkins}
        onToggle={() => toggleFeature('progress_checkins')}
      >
        <TimeInput label="Jam check-in" value={settings.reminder_schedule.progress_checkin_time} onChangeText={(value) => updateSchedule('progress_checkin_time', value)} />
      </FeatureCard>

      <FeatureCard
        icon="shield-outline"
        title="Burnout guard"
        description="Aktif ketika beban tugas atau keterlambatan tinggi."
        active={settings.features.burnout_checkins}
        onToggle={() => toggleFeature('burnout_checkins')}
      >
        <TimeInput label="Jam pemeriksaan" value={settings.reminder_schedule.burnout_checkin_time} onChangeText={(value) => updateSchedule('burnout_checkin_time', value)} />
      </FeatureCard>

      <FeatureCard
        icon="heart-outline"
        title="Habit harian"
        description="Mengingatkan habit yang belum dicatat."
        active={settings.features.habit_health}
        onToggle={() => toggleFeature('habit_health')}
      >
        <TimeInput label="Jam check-in" value={settings.reminder_schedule.habit_checkin_time} onChangeText={(value) => updateSchedule('habit_checkin_time', value)} />
      </FeatureCard>

      <FeatureCard
        icon="navigate-outline"
        title="Berangkat ke kelas"
        description="Dihitung otomatis dari jam kelas, perjalanan, dan waktu persiapan."
        active={settings.features.campus_departure_reminders}
        onToggle={() => toggleFeature('campus_departure_reminders')}
      />

      <FeatureCard
        icon="calendar-outline"
        title="Review mingguan"
        description="Rekap tugas selesai dan menit fokus."
        active={settings.features.weekly_review}
        onToggle={() => toggleFeature('weekly_review')}
      >
        <Text style={styles.fieldLabel}>Hari review</Text>
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((day) => {
            const selected = settings.reminder_schedule.weekly_review_day === day.value;
            return (
              <Pressable
                key={day.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => updateSchedule('weekly_review_day', day.value)}
                style={({ pressed }) => [styles.weekday, selected && styles.weekdaySelected, pressed && styles.pressed]}
              >
                <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>{day.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <TimeInput label="Jam review" value={settings.reminder_schedule.weekly_review_time} onChangeText={(value) => updateSchedule('weekly_review_time', value)} />
      </FeatureCard>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}
        >
          {saving ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="save-outline" size={18} color={colors.black} />}
          <Text style={styles.primaryButtonText}>{saving ? 'MENYIMPAN…' : 'SIMPAN PREFERENSI'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={testing || activeDevices.length === 0}
          onPress={() => void sendTest()}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, (testing || activeDevices.length === 0) && styles.disabled]}
        >
          {testing ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="paper-plane-outline" size={17} color={colors.cyan} />}
          <Text style={styles.secondaryButtonText}>KIRIM TES</Text>
        </Pressable>
      </View>

      {!permissionGranted || activeDevices.length === 0 ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.amber} />
          <Text style={styles.noteText}>Izinkan notifikasi dan gunakan APK/IPA build terbaru. Buka ulang aplikasi saat online agar perangkat didaftarkan.</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  active,
  onToggle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <Surface>
      <View style={styles.featureHeader}>
        <View style={[styles.featureIcon, active && styles.featureIconActive]}>
          <Ionicons name={icon} size={19} color={active ? colors.cyan : colors.textMuted} />
        </View>
        <View style={styles.featureCopy}>
          <Text style={styles.featureTitle}>{title}</Text>
          <Text style={styles.featureDescription}>{description}</Text>
        </View>
        <SettingSwitch label={title} active={active} onPress={onToggle} compact />
      </View>
      {active && children ? <View style={styles.featureBody}>{children}</View> : null}
    </Surface>
  );
}

function SettingSwitch({ label, active, onPress, compact = false }: { label: string; active: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.switchTrack, compact && styles.switchCompact, active && styles.switchTrackActive, pressed && styles.pressed]}
    >
      <View style={[styles.switchThumb, active && styles.switchThumbActive]} />
      {!compact ? <Text style={[styles.switchText, active && styles.switchTextActive]}>{active ? 'AKTIF' : 'NONAKTIF'}</Text> : null}
    </Pressable>
  );
}

function TimeInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.timeRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder="07:00"
        placeholderTextColor={colors.textMuted}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        style={styles.timeInput}
      />
    </View>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.statusMetric}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  const tone = active ? colors.emerald : colors.amber;
  return (
    <View style={[styles.statusPill, { borderColor: `${tone}35`, backgroundColor: `${tone}10` }]}>
      <View style={[styles.statusDot, { backgroundColor: tone }]} />
      <Text style={[styles.statusPillText, { color: tone }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingCard: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(103,232,249,0.22)', backgroundColor: 'rgba(34,211,238,0.08)' },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  heroText: { marginTop: 4, color: colors.textSecondary, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  statusPill: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 8 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  statusGrid: { marginTop: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border },
  statusMetric: { flex: 1, paddingHorizontal: spacing.sm, borderRightWidth: 1, borderRightColor: colors.border },
  statusLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '700' },
  statusValue: { marginTop: 4, fontSize: 10, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionCopy: { flex: 1 },
  sectionEyebrow: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  sectionTitle: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: '900' },
  fieldLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  segmentRow: { marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  segmentSelected: { borderColor: 'rgba(103,232,249,0.38)', backgroundColor: 'rgba(34,211,238,0.10)' },
  segmentText: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  segmentTextSelected: { color: colors.cyan },
  timezoneDetail: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  featureIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.surfaceSoft },
  featureIconActive: { backgroundColor: 'rgba(34,211,238,0.08)' },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  featureDescription: { marginTop: 3, color: colors.textMuted, fontSize: 9, lineHeight: 14, fontWeight: '600' },
  featureBody: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  switchTrack: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, paddingHorizontal: 8 },
  switchCompact: { width: 44, justifyContent: 'flex-start', paddingHorizontal: 4 },
  switchTrackActive: { justifyContent: 'flex-end', borderColor: 'rgba(110,231,183,0.3)', backgroundColor: 'rgba(110,231,183,0.10)' },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.textMuted },
  switchThumbActive: { backgroundColor: colors.emerald },
  switchText: { color: colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  switchTextActive: { color: colors.emerald },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  timeInput: { width: 88, minHeight: 42, textAlign: 'center', borderRadius: radii.small, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, color: colors.text, fontSize: 15, fontWeight: '900' },
  deadlineWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  deadlineChip: { minHeight: 35, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, paddingHorizontal: 12 },
  deadlineChipSelected: { borderColor: 'rgba(103,232,249,0.38)', backgroundColor: 'rgba(34,211,238,0.10)' },
  deadlineText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  deadlineTextSelected: { color: colors.cyan },
  weekdayRow: { marginTop: spacing.sm, marginBottom: spacing.md, flexDirection: 'row', gap: 5 },
  weekday: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, borderWidth: 1, borderColor: colors.border },
  weekdaySelected: { borderColor: 'rgba(167,139,250,0.38)', backgroundColor: 'rgba(167,139,250,0.10)' },
  weekdayText: { color: colors.textMuted, fontSize: 8, fontWeight: '900' },
  weekdayTextSelected: { color: colors.purple },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: { minHeight: 52, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.cyan },
  primaryButtonText: { color: colors.black, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  secondaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(103,232,249,0.28)', backgroundColor: 'rgba(34,211,238,0.06)', paddingHorizontal: spacing.lg },
  secondaryButtonText: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  note: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(252,211,77,0.22)', backgroundColor: 'rgba(252,211,77,0.06)', paddingHorizontal: spacing.md },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: 9, lineHeight: 14, fontWeight: '600' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
});
