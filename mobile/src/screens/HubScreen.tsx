import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { habitApi } from '../lib/api';
import { productivityApi } from '../lib/productivity-api';
import { pushNotificationApi } from '../lib/push-api';
import { academicTaskApi, campusScheduleApi } from '../lib/student-api';
import { financeApi, healthApi, whatsappApi } from '../lib/wellbeing-api';
import { colors, radii, spacing } from '../theme';
import type { HubStackParamList } from '../types';

type HubScreenProps = NativeStackScreenProps<HubStackParamList, 'HubHome'>;
type HubRoute = Exclude<keyof HubStackParamList, 'HubHome'>;

interface ModuleBadge {
  label: string;
  tone: string;
}

const modules: Array<{
  route: HubRoute;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  tone: string;
}> = [
  { route: 'Briefing', icon: 'sparkles-outline', title: 'Briefing AI', description: 'Prioritas dan kondisi hari ini', tone: colors.purple },
  { route: 'Academic', icon: 'school-outline', title: 'Akademik', description: 'Tugas kuliah dan deadline', tone: colors.cyan },
  { route: 'Campus', icon: 'business-outline', title: 'Kampus', description: 'Kelas, ruang, dan persiapan', tone: colors.amber },
  { route: 'Finance', icon: 'wallet-outline', title: 'Keuangan', description: 'Budget dan biaya hidup', tone: colors.emerald },
  { route: 'Health', icon: 'heart-outline', title: 'Kesehatan', description: 'Tidur, air, layar, kafein', tone: colors.rose },
  { route: 'Habits', icon: 'repeat-outline', title: 'Habit', description: 'Rutinitas dan streak harian', tone: colors.pink },
  { route: 'PushNotifications', icon: 'notifications-outline', title: 'Notifikasi', description: 'Reminder langsung di perangkat', tone: colors.cyan },
  { route: 'WhatsApp', icon: 'logo-whatsapp', title: 'WhatsApp', description: 'Assistant, Ollama, dan reminder', tone: colors.emerald },
];

export function HubScreen({ navigation }: HubScreenProps) {
  const [moduleBadges, setModuleBadges] = useState<Partial<Record<HubRoute, ModuleBadge>>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);

    const results = await Promise.allSettled([
      productivityApi.briefing.today(),
      academicTaskApi.list(),
      campusScheduleApi.list({ active: true }),
      financeApi.getSummary(),
      healthApi.getSnapshot(),
      habitApi.list(),
      pushNotificationApi.getState(),
      whatsappApi.getState(),
    ]);
    const unavailable: ModuleBadge = { label: 'Tidak tersedia', tone: colors.rose };
    const nextBadges: Partial<Record<HubRoute, ModuleBadge>> = {};

    if (results[0].status === 'fulfilled') {
      nextBadges.Briefing = results[0].value
        ? { label: 'Siap dibaca', tone: colors.purple }
        : { label: 'Belum dibuat', tone: colors.amber };
    } else nextBadges.Briefing = unavailable;

    if (results[1].status === 'fulfilled') {
      const active = results[1].value.data.data.filter((task) => task.status !== 'completed');
      const overdue = active.filter((task) => task.deadline && new Date(task.deadline).getTime() < Date.now()).length;
      nextBadges.Academic = overdue > 0
        ? { label: `${overdue} terlambat`, tone: colors.rose }
        : { label: `${active.length} aktif`, tone: colors.cyan };
    } else nextBadges.Academic = unavailable;

    if (results[2].status === 'fulfilled') {
      const active = results[2].value.data.data.filter((schedule) => schedule.is_active);
      const today = new Date().getDay() || 7;
      const todayCount = active.filter((schedule) => schedule.day_of_week === today).length;
      nextBadges.Campus = { label: todayCount > 0 ? `${todayCount} kelas` : `${active.length} jadwal`, tone: todayCount > 0 ? colors.amber : colors.textSecondary };
    } else nextBadges.Campus = unavailable;

    if (results[3].status === 'fulfilled') {
      nextBadges.Finance = { label: `Sisa ${formatRupiahCompact(results[3].value.remaining_budget)}`, tone: results[3].value.remaining_budget < 0 ? colors.rose : colors.emerald };
    } else nextBadges.Finance = unavailable;

    if (results[4].status === 'fulfilled') {
      const alerts = results[4].value.alerts.length;
      nextBadges.Health = alerts > 0
        ? { label: `${alerts} perhatian`, tone: colors.rose }
        : { label: 'Kondisi aman', tone: colors.emerald };
    } else nextBadges.Health = unavailable;

    if (results[5].status === 'fulfilled') {
      const active = results[5].value.data.data.filter((habit) => habit.is_active);
      const checked = active.filter((habit) => habit.checked_in_today).length;
      nextBadges.Habits = { label: `${checked}/${active.length} selesai`, tone: active.length > 0 && checked === active.length ? colors.emerald : colors.pink };
    } else nextBadges.Habits = unavailable;

    if (results[6].status === 'fulfilled') {
      const { provider, devices, settings } = results[6].value;
      const activeDevices = devices.filter((device) => device.enabled && !device.has_error).length;
      nextBadges.PushNotifications = provider.ready && settings.enabled
        ? { label: `${activeDevices} perangkat`, tone: colors.cyan }
        : { label: activeDevices > 0 ? 'Reminder nonaktif' : 'Perlu izin', tone: colors.amber };
    } else nextBadges.PushNotifications = unavailable;

    if (results[7].status === 'fulfilled') {
      const { service, ai, settings } = results[7].value;
      nextBadges.WhatsApp = service.connected
        ? { label: `${settings.enabled ? 'Reminder aktif' : 'WA terhubung'}${ai.online ? ' + AI' : ''}`, tone: ai.online ? colors.emerald : colors.amber }
        : service.online
          ? { label: 'Menunggu koneksi', tone: colors.amber }
          : { label: 'Service offline', tone: colors.rose };
    } else nextBadges.WhatsApp = unavailable;

    setModuleBadges(nextBadges);
    setSyncedCount(results.filter((result) => result.status === 'fulfilled').length);
    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const allSynced = syncedCount === modules.length;
  const backendOffline = !initialLoading && syncedCount === 0;
  const syncTone = initialLoading ? colors.cyan : allSynced ? colors.emerald : backendOffline ? colors.rose : colors.amber;
  const syncLabel = initialLoading
    ? 'MENYINKRONKAN MODUL'
    : allSynced
      ? `${modules.length} MODUL TERSINKRON`
      : backendOffline
        ? 'BACKEND BELUM TERJANGKAU'
        : `${syncedCount}/${modules.length} MODUL TERSINKRON`;

  return (
    <Screen eyebrow="STUDENT OS" title="Student Hub" refreshing={refreshing} onRefresh={() => void load(true)}>
      <Surface>
        <View style={styles.heroHeader}>
          <View style={styles.heroIcon}><Ionicons name="apps" size={21} color={colors.cyan} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Semua kebutuhan kuliah</Text>
            <Text style={styles.heroText}>Ringkasan setiap modul diperbarui dari akun dan API ORVYN yang sama.</Text>
          </View>
        </View>
        <View style={styles.syncRow}>
          {initialLoading ? <ActivityIndicator size={8} color={syncTone} /> : <View style={[styles.syncDot, { backgroundColor: syncTone }]} />}
          <Text style={[styles.syncText, { color: syncTone }]}>{syncLabel}</Text>
        </View>
      </Surface>

      {!initialLoading && !allSynced ? (
        <View style={[styles.notice, backendOffline && styles.noticeOffline]}>
          <Ionicons name={backendOffline ? 'cloud-offline-outline' : 'warning-outline'} size={16} color={backendOffline ? colors.rose : colors.amber} />
          <Text style={styles.noticeText}>{backendOffline ? 'Server belum dapat dijangkau. Pastikan HP dan backend berada di jaringan yang sama.' : 'Sebagian ringkasan belum tersedia. Modul yang berhasil tetap dapat digunakan.'}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Modul mahasiswa</Text>
        <Text style={styles.sectionCount}>{modules.length} fitur</Text>
      </View>

      <View style={styles.grid}>
        {modules.map((module) => {
          const badge = moduleBadges[module.route] ?? { label: 'Memuat…', tone: colors.textMuted };
          return (
            <Pressable
              key={module.route}
              accessibilityRole="button"
              accessibilityLabel={`Buka ${module.title}, ${badge.label}`}
              onPress={() => navigation.navigate(module.route)}
              style={({ pressed }) => [styles.moduleCard, pressed && styles.pressed]}
            >
              <View style={styles.moduleTop}>
                <View style={[styles.moduleIcon, { borderColor: `${module.tone}33`, backgroundColor: `${module.tone}12` }]}>
                  <Ionicons name={module.icon} size={21} color={module.tone} />
                </View>
                <View style={[styles.moduleBadge, { borderColor: `${badge.tone}2E`, backgroundColor: `${badge.tone}10` }]}>
                  <View style={[styles.moduleBadgeDot, { backgroundColor: badge.tone }]} />
                  <Text numberOfLines={1} style={[styles.moduleBadgeText, { color: badge.tone }]}>{badge.label}</Text>
                </View>
              </View>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              <Text style={styles.moduleDescription}>{module.description}</Text>
              <View style={styles.openRow}>
                <Text style={[styles.openText, { color: module.tone }]}>BUKA</Text>
                <Ionicons name="arrow-forward" size={13} color={module.tone} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function formatRupiahCompact(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= 1_000_000) return `${sign}Rp${trimDecimal(absolute / 1_000_000)}jt`;
  if (absolute >= 1_000) return `${sign}Rp${trimDecimal(absolute / 1_000)}rb`;
  return `${sign}Rp${Math.round(absolute).toLocaleString('id-ID')}`;
}

function trimDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const styles = StyleSheet.create({
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(103,232,249,0.2)', backgroundColor: 'rgba(34,211,238,0.08)' },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  heroText: { marginTop: 5, color: colors.textSecondary, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  syncRow: { minHeight: 31, marginTop: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: colors.border },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncText: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  notice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(252,211,77,0.22)', backgroundColor: 'rgba(252,211,77,0.06)', paddingHorizontal: spacing.md },
  noticeOffline: { borderColor: 'rgba(251,113,133,0.22)', backgroundColor: 'rgba(251,113,133,0.06)' },
  noticeText: { flex: 1, color: colors.textSecondary, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionCount: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  moduleCard: { flexBasis: '46%', flexGrow: 1, minWidth: 0, minHeight: 190, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  moduleTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  moduleIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1 },
  moduleBadge: { minWidth: 0, maxWidth: '62%', minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 8 },
  moduleBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  moduleBadgeText: { flexShrink: 1, fontSize: 7, fontWeight: '900', letterSpacing: 0.3 },
  moduleTitle: { marginTop: spacing.md, color: colors.text, fontSize: 14, fontWeight: '900' },
  moduleDescription: { minHeight: 32, marginTop: 4, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  openRow: { marginTop: 'auto', paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  openText: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
