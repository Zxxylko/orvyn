import { Ionicons } from '@expo/vector-icons';
import { type NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { NetworkStatusBadge } from '../components/NetworkStatus';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { TaskRow } from '../components/TaskRow';
import { useAuth } from '../contexts/AuthContext';
import { useNetworkStatus } from '../contexts/NetworkContext';
import { analyticsApi, getApiErrorMessage, habitApi, taskApi } from '../lib/api';
import { isCachedApiResponse } from '../lib/api-cache';
import { greetingForNow, localDateKey } from '../lib/date';
import { productivityApi } from '../lib/productivity-api';
import { campusScheduleApi } from '../lib/student-api';
import type { CampusSchedule } from '../lib/student-types';
import { colors, radii, spacing } from '../theme';
import type { AnalyticsSnapshot, Habit, RootTabParamList, Task } from '../types';
import type { TimeBlock } from '../types/productivity';

type PulseView = 'attention' | 'progress' | 'load';
type SyncState = 'syncing' | 'online' | 'partial' | 'offline';

export function DashboardScreen() {
  const { user } = useAuth();
  const { status: networkStatus } = useNetworkStatus();
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [campusSchedules, setCampusSchedules] = useState<CampusSchedule[]>([]);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('syncing');
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [view, setView] = useState<PulseView>('attention');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setRefreshing(true);
      setSyncState('syncing');
    }

    const today = localDateKey();
    const results = await Promise.allSettled([
      taskApi.list(),
      analyticsApi.snapshot(),
      habitApi.list(),
      productivityApi.timeBlocks.list({ start_date: today, end_date: today }),
      campusScheduleApi.list({ day_of_week: new Date().getDay(), active: true }),
    ]);

    if (results[0].status === 'fulfilled') setTasks(results[0].value.data.data);
    if (results[1].status === 'fulfilled') setSnapshot(results[1].value.data.data);
    if (results[2].status === 'fulfilled') setHabits(results[2].value.data.data);
    if (results[3].status === 'fulfilled') setTimeBlocks(results[3].value);
    if (results[4].status === 'fulfilled') setCampusSchedules(results[4].value.data.data);

    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const cachedResponseCount = [
      results[0].status === 'fulfilled' && isCachedApiResponse(results[0].value),
      results[1].status === 'fulfilled' && isCachedApiResponse(results[1].value),
      results[2].status === 'fulfilled' && isCachedApiResponse(results[2].value),
      results[4].status === 'fulfilled' && isCachedApiResponse(results[4].value),
    ].filter(Boolean).length;
    setUsingCachedData(cachedResponseCount > 0);

    setSyncState(
      networkStatus === 'offline'
      || cachedResponseCount === 4
        ? 'offline'
        : cachedResponseCount > 0
          ? 'partial'
        : successCount === results.length
          ? 'online'
          : successCount === 0
            ? 'offline'
            : 'partial',
    );

    if (!quiet && successCount === 0) {
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      Alert.alert('Beranda belum dapat disinkronkan', getApiErrorMessage(failure?.reason));
    }

    setInitialLoading(false);
    setRefreshing(false);
  }, [networkStatus]);

  useFocusEffect(useCallback(() => {
    void load(true);
  }, [load]));

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === 'completed'), [tasks]);
  const countableTasks = useMemo(() => tasks.filter((task) => task.status !== 'cancelled'), [tasks]);
  const activeHabits = useMemo(() => habits.filter((habit) => habit.is_active), [habits]);
  const overdueTasks = useMemo(() => activeTasks.filter((task) => task.deadline && new Date(task.deadline).getTime() < Date.now()), [activeTasks]);
  const workloadMinutes = activeTasks.reduce((total, task) => total + (task.duration_minutes || 0), 0);
  const completionRate = countableTasks.length > 0 ? Math.round((completedTasks.length / countableTasks.length) * 100) : 0;
  const checkedHabits = activeHabits.filter((habit) => habit.checked_in_today).length;

  const visibleTasks = useMemo(() => {
    const byDeadline = (a: Task, b: Task) => {
      const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    };

    if (view === 'attention') return [...activeTasks].sort(byDeadline).slice(0, 3);
    if (view === 'progress') return [...activeTasks].sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress') || byDeadline(a, b)).slice(0, 3);
    return [...activeTasks].sort((a, b) => b.duration_minutes - a.duration_minutes).slice(0, 3);
  }, [activeTasks, view]);

  const nextBlock = useMemo(() => timeBlocks
    .filter((block) => new Date(block.end_time).getTime() > Date.now())
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null, [timeBlocks]);

  const nextClass = useMemo(() => campusSchedules
    .filter((schedule) => schedule.is_active && campusClockToDate(schedule.end_time).getTime() > Date.now())
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0] ?? null, [campusSchedules]);

  const changeView = (nextView: PulseView) => {
    void Haptics.selectionAsync();
    setView(nextView);
  };

  const toggleTask = async (task: Task) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await taskApi.update(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' });
      await load(true);
    } catch (error) {
      Alert.alert('Tugas belum berubah', getApiErrorMessage(error));
    }
  };

  const insight = overdueTasks.length > 0
    ? `${overdueTasks.length} tugas melewati deadline. Pulihkan satu per satu.`
    : activeTasks.length > 0
      ? 'Tidak ada tugas terlambat. Pertahankan ritme fokusmu.'
      : 'Semua tugas aktif sudah bersih. Waktunya merencanakan langkah berikutnya.';

  const agendaCount = Number(Boolean(nextBlock)) + Number(Boolean(nextClass));

  if (initialLoading) {
    return (
      <Screen
        eyebrow={`${greetingForNow()}, ${user?.name.split(' ')[0] ?? 'Student'}`}
        title="Beranda Mahasiswa"
        action={<NetworkStatusBadge />}
      >
        <Surface>
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingTitle}>Menyusun harimu…</Text>
            <Text style={styles.loadingCopy}>Menarik tugas, agenda, kebiasaan, dan analitik terbaru.</Text>
          </View>
        </Surface>
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow={`${greetingForNow()}, ${user?.name.split(' ')[0] ?? 'Student'}`}
      title="Beranda Mahasiswa"
      refreshing={refreshing}
      onRefresh={() => void load()}
      action={<NetworkStatusBadge />}
    >
      {syncState !== 'online' ? (
        <View style={[styles.syncNotice, syncState === 'offline' && styles.syncNoticeOffline]}>
          <Ionicons name={syncState === 'offline' ? 'cloud-offline-outline' : 'warning-outline'} size={16} color={syncState === 'offline' ? colors.rose : colors.amber} />
          <Text style={styles.syncNoticeText}>
            {syncState === 'offline'
              ? usingCachedData
                ? 'Server belum terjangkau. Data tersimpan terakhir tetap ditampilkan.'
                : 'Server belum terjangkau. Sambungkan internet lalu tarik ke bawah.'
              : usingCachedData
                ? 'Sebagian data berasal dari simpanan terakhir. Tarik ke bawah untuk menyinkronkan.'
                : 'Sebagian layanan belum tersinkron. Tarik ke bawah untuk mencoba lagi.'}
          </Text>
        </View>
      ) : null}

      <Surface>
        <View style={styles.pulseHeader}>
          <View style={styles.pulseCopy}>
            <Text style={styles.eyebrow}>PULSE HARI INI</Text>
            <Text style={styles.pulseTitle}>Kondisi belajarmu</Text>
            <Text style={styles.pulseInsight}>{insight}</Text>
          </View>
          <View style={styles.scoreOrb}>
            <Text style={styles.scoreValue}>{snapshot?.flow_state_score ?? 0}</Text>
            <Text style={styles.scoreLabel}>FLOW</Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricButton icon="alert-circle-outline" label="Perhatian" value={String(overdueTasks.length)} detail="terlambat" selected={view === 'attention'} onPress={() => changeView('attention')} />
          <MetricButton icon="trending-up-outline" label="Progres" value={`${completionRate}%`} detail={`${completedTasks.length} selesai`} selected={view === 'progress'} onPress={() => changeView('progress')} />
          <MetricButton icon="time-outline" label="Beban" value={workloadMinutes >= 60 ? `${Math.round(workloadMinutes / 60)}j` : `${workloadMinutes}m`} detail={`${activeTasks.length} aktif`} selected={view === 'load'} onPress={() => changeView('load')} />
        </View>

        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>PENYELESAIAN SEMUA TUGAS</Text>
          <Text style={styles.progressValue}>{completionRate}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${completionRate}%` }]} />
        </View>
      </Surface>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>RITME HARI INI</Text>
          <Text style={styles.sectionTitle}>Agenda berikutnya</Text>
        </View>
        <Text style={styles.sectionCount}>{agendaCount}</Text>
      </View>

      {agendaCount > 0 ? (
        <View style={styles.agendaGrid}>
          {nextBlock ? (
            <AgendaCard
              icon="calendar-outline"
              eyebrow="TIME BLOCK"
              title={nextBlock.label}
              detail={`${formatDateClock(nextBlock.start_time)}–${formatDateClock(nextBlock.end_time)}`}
              tone={colors.purple}
              onPress={() => navigation.navigate('Jadwal', { screen: 'Agenda' })}
            />
          ) : null}
          {nextClass ? (
            <AgendaCard
              icon="school-outline"
              eyebrow="KELAS KAMPUS"
              title={nextClass.course_name}
              detail={`${nextClass.start_time.slice(0, 5)}–${nextClass.end_time.slice(0, 5)} · ${[nextClass.building, nextClass.room].filter(Boolean).join(' ') || 'Lokasi belum diisi'}`}
              tone={colors.cyan}
              onPress={() => navigation.navigate('Hub', { screen: 'Campus' })}
            />
          ) : null}
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Buka jadwal dan susun agenda" onPress={() => navigation.navigate('Jadwal', { screen: 'Agenda' })} style={({ pressed }) => [styles.clearAgenda, pressed && styles.pressed]}>
          <View style={styles.clearAgendaIcon}><Ionicons name="cafe-outline" size={22} color={colors.emerald} /></View>
          <View style={styles.clearAgendaCopy}>
            <Text style={styles.clearAgendaTitle}>Belum ada agenda berikutnya</Text>
            <Text style={styles.clearAgendaText}>Hari masih longgar. Susun time block agar fokus lebih terarah.</Text>
          </View>
          <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
        </Pressable>
      )}

      <View style={styles.actionGrid}>
        <ActionCard icon="add-circle-outline" label="Tambah tugas" tone={colors.cyan} onPress={() => navigation.navigate('Tugas')} />
        <ActionCard icon="timer-outline" label="Mulai fokus" tone={colors.purple} onPress={() => navigation.navigate('Jadwal', { screen: 'Focus' })} />
        <ActionCard icon="sparkles-outline" label="Briefing AI" tone={colors.pink} onPress={() => navigation.navigate('Hub', { screen: 'Briefing' })} />
        <ActionCard icon="logo-whatsapp" label="Reminder WA" tone={colors.emerald} onPress={() => navigation.navigate('Hub', { screen: 'WhatsApp' })} />
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>{view === 'attention' ? 'ANTRIAN TERDEKAT' : view === 'progress' ? 'PENGGERAK PROGRES' : 'PORSI TERBESAR'}</Text>
          <Text style={styles.sectionTitle}>Prioritas berikutnya</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Lihat semua tugas" onPress={() => navigation.navigate('Tugas')} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.seeAll}>LIHAT SEMUA</Text>
        </Pressable>
      </View>

      <Surface>
        {visibleTasks.length > 0 ? visibleTasks.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={(item) => void toggleTask(item)} compact />
        )) : (
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Tugas')} style={({ pressed }) => [styles.emptyState, pressed && styles.pressed]}>
            <Ionicons name="checkmark-circle-outline" size={30} color={colors.emerald} />
            <Text style={styles.emptyTitle}>Area ini sudah bersih</Text>
            <Text style={styles.emptyCopy}>Ketuk untuk menambahkan tugas berikutnya.</Text>
          </Pressable>
        )}
      </Surface>

      <View style={styles.quickGrid}>
        <QuickCard icon="flame-outline" value={`${snapshot?.current_streak ?? 0} hari`} label="Streak fokus" tone={colors.pink} />
        <QuickCard icon="timer-outline" value={`${snapshot?.focus_minutes_this_week ?? 0}m`} label="Fokus pekan ini" tone={colors.cyan} />
        <QuickCard icon="repeat-outline" value={`${checkedHabits}/${activeHabits.length}`} label="Habit hari ini" tone={colors.emerald} />
        <QuickCard icon="battery-half-outline" value={snapshot?.burnout_level ?? 'low'} label="Risiko burnout" tone={snapshot?.burnout_level === 'high' ? colors.rose : colors.amber} />
      </View>
    </Screen>
  );
}

function MetricButton({ icon, label, value, detail, selected, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${label}: ${value}, ${detail}`} style={({ pressed }) => [styles.metric, selected && styles.metricSelected, pressed && styles.pressed]}>
      <View style={styles.metricTop}>
        <Ionicons name={icon} size={17} color={selected ? colors.cyan : colors.textMuted} />
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </Pressable>
  );
}

function AgendaCard({ icon, eyebrow, title, detail, tone, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  detail: string;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${eyebrow}: ${title}, ${detail}`} onPress={onPress} style={({ pressed }) => [styles.agendaCard, pressed && styles.pressed]}>
      <View style={[styles.agendaIcon, { backgroundColor: `${tone}12`, borderColor: `${tone}2E` }]}><Ionicons name={icon} size={19} color={tone} /></View>
      <View style={styles.agendaCopy}>
        <Text style={[styles.agendaEyebrow, { color: tone }]}>{eyebrow}</Text>
        <Text numberOfLines={1} style={styles.agendaTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.agendaDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function ActionCard({ icon, label, tone, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; tone: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
      <View style={[styles.actionIcon, { backgroundColor: `${tone}12` }]}><Ionicons name={icon} size={18} color={tone} /></View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function QuickCard({ icon, value, label, tone }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; tone: string }) {
  return (
    <View style={styles.quickCard}>
      <Ionicons name={icon} size={18} color={tone} />
      <Text style={styles.quickValue}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  );
}

function campusClockToDate(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function formatDateClock(value: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

const styles = StyleSheet.create({
  syncNotice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(252,211,77,0.22)', backgroundColor: 'rgba(252,211,77,0.06)', paddingHorizontal: spacing.md },
  syncNoticeOffline: { borderColor: 'rgba(251,113,133,0.22)', backgroundColor: 'rgba(251,113,133,0.06)' },
  syncNoticeText: { flex: 1, color: colors.textSecondary, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  loadingState: { minHeight: 230, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  loadingTitle: { marginTop: spacing.lg, color: colors.text, fontSize: 16, fontWeight: '900' },
  loadingCopy: { marginTop: 6, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', fontWeight: '600' },
  pulseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  pulseCopy: { flex: 1 },
  eyebrow: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  pulseTitle: { marginTop: 7, color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  pulseInsight: { marginTop: 7, color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  scoreOrb: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(103,232,249,0.26)', backgroundColor: 'rgba(34,211,238,0.08)' },
  scoreValue: { color: colors.text, fontSize: 23, fontWeight: '900' },
  scoreLabel: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  metricGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  metric: { flex: 1, minHeight: 108, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, padding: spacing.md },
  metricSelected: { borderColor: 'rgba(103,232,249,0.52)', backgroundColor: 'rgba(34,211,238,0.09)' },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  metricLabel: { marginTop: 15, color: colors.textSecondary, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  metricDetail: { marginTop: 4, color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  progressLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  progressValue: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  progressTrack: { height: 7, marginTop: spacing.sm, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: colors.black },
  progressFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.cyanStrong },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionEyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  sectionTitle: { marginTop: 5, color: colors.text, fontSize: 18, fontWeight: '800' },
  sectionCount: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  seeAll: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 1.1, paddingVertical: 8 },
  agendaGrid: { gap: spacing.sm },
  agendaCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  agendaIcon: { width: 44, height: 44, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  agendaCopy: { flex: 1, minWidth: 0 },
  agendaEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  agendaTitle: { marginTop: 5, color: colors.text, fontSize: 14, fontWeight: '900' },
  agendaDetail: { marginTop: 4, color: colors.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '600' },
  clearAgenda: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  clearAgendaIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: 'rgba(110,231,183,0.08)' },
  clearAgendaCopy: { flex: 1 },
  clearAgendaTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  clearAgendaText: { marginTop: 4, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '600' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionCard: { flexBasis: '47%', flexGrow: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.md },
  actionIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  actionLabel: { flex: 1, color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  emptyState: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.sm, color: colors.text, fontSize: 15, fontWeight: '800' },
  emptyCopy: { marginTop: 5, color: colors.textMuted, fontSize: 11 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickCard: { flexBasis: '47%', flexGrow: 1, minHeight: 112, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  quickValue: { marginTop: spacing.md, color: colors.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  quickLabel: { marginTop: 4, color: colors.textMuted, fontSize: 10, fontWeight: '700' },
});
