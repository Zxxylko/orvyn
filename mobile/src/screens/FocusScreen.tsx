import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage, taskApi } from '../lib/api';
import { productivityApi } from '../lib/productivity-api';
import { colors, radii, spacing } from '../theme';
import type { Task } from '../types';
import type { FocusLog } from '../types/productivity';

type TimerMode = 'focus' | 'break';

interface PendingFocusLog {
  plannedSeconds: number;
  actualSeconds: number;
  completed: boolean;
  startedAt: number;
  endedAt: number;
}

const BREAK_SECONDS = 5 * 60;
const DURATION_OPTIONS = [15, 25, 45] as const;

export function FocusScreen() {
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [mode, setMode] = useState<TimerMode>('focus');
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [pendingLog, setPendingLog] = useState<PendingFocusLog | null>(null);
  const [rating, setRating] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<FocusLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const endAtRef = useRef<number | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const plannedSecondsRef = useRef(25 * 60);
  const modeRef = useRef<TimerMode>('focus');
  const completingRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    else setLoadingHistory(true);
    try {
      const [nextLogs, taskResponse] = await Promise.all([
        productivityApi.focus.list(7),
        taskApi.list({ active: true }),
      ]);
      setLogs(nextLogs);
      setTasks(taskResponse.data.data.filter((task) => task.status !== 'completed' && task.status !== 'cancelled'));
    } catch (error) {
      Alert.alert('Data fokus belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const clearSessionRefs = useCallback(() => {
    endAtRef.current = null;
    sessionStartedAtRef.current = null;
    plannedSecondsRef.current = focusMinutes * 60;
  }, [focusMinutes]);

  const completeCountdown = useCallback(() => {
    if (completingRef.current) return;
    completingRef.current = true;
    const expectedEnd = endAtRef.current ?? Date.now();
    endAtRef.current = null;
    setIsRunning(false);

    if (modeRef.current === 'break') {
      modeRef.current = 'focus';
      setMode('focus');
      setRemainingSeconds(focusMinutes * 60);
      clearSessionRefs();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const plannedSeconds = plannedSecondsRef.current;
      const startedAt = sessionStartedAtRef.current ?? expectedEnd - plannedSeconds * 1000;
      setRemainingSeconds(0);
      setPendingLog({ plannedSeconds, actualSeconds: plannedSeconds, completed: true, startedAt, endedAt: expectedEnd });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    completingRef.current = false;
  }, [clearSessionRefs, focusMinutes]);

  const syncClock = useCallback(() => {
    const endAt = endAtRef.current;
    if (endAt === null) return;
    const nextRemaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    setRemainingSeconds(nextRemaining);
    if (nextRemaining === 0) completeCountdown();
  }, [completeCountdown]);

  useEffect(() => {
    if (!isRunning) return undefined;
    syncClock();
    const timer = setInterval(syncClock, 500);
    return () => clearInterval(timer);
  }, [isRunning, syncClock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') syncClock();
    });
    return () => subscription.remove();
  }, [syncClock]);

  const selectDuration = (minutes: number) => {
    if (isRunning || sessionStartedAtRef.current !== null || mode !== 'focus') return;
    setFocusMinutes(minutes);
    plannedSecondsRef.current = minutes * 60;
    setRemainingSeconds(minutes * 60);
    void Haptics.selectionAsync();
  };

  const toggleTimer = () => {
    if (pendingLog) return;
    if (isRunning) {
      const endAt = endAtRef.current;
      if (endAt !== null) setRemainingSeconds(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
      endAtRef.current = null;
      setIsRunning(false);
      void Haptics.selectionAsync();
      return;
    }

    if (remainingSeconds <= 0) return;
    if (mode === 'focus' && sessionStartedAtRef.current === null) {
      sessionStartedAtRef.current = Date.now();
      plannedSecondsRef.current = focusMinutes * 60;
    }
    endAtRef.current = Date.now() + remainingSeconds * 1000;
    setIsRunning(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const resetFocus = (confirm = true) => {
    const elapsed = mode === 'focus' ? plannedSecondsRef.current - remainingSeconds : 0;
    const reset = () => {
      endAtRef.current = null;
      setIsRunning(false);
      setPendingLog(null);
      setRating(4);
      modeRef.current = 'focus';
      setMode('focus');
      setRemainingSeconds(focusMinutes * 60);
      clearSessionRefs();
    };

    if (confirm && (elapsed >= 60 || pendingLog)) {
      Alert.alert('Reset sesi fokus?', 'Waktu yang belum disimpan akan hilang.', [
        { text: 'Batal', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: reset },
      ]);
    } else reset();
  };

  const finishEarly = () => {
    if (mode === 'break') {
      skipBreak();
      return;
    }

    const currentRemaining = endAtRef.current === null
      ? remainingSeconds
      : Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
    const actualSeconds = Math.max(0, plannedSecondsRef.current - currentRemaining);
    endAtRef.current = null;
    setIsRunning(false);
    setRemainingSeconds(currentRemaining);

    if (actualSeconds < 60) {
      Alert.alert('Sesi masih terlalu singkat', 'Lanjutkan hingga minimal satu menit agar sesi dapat dicatat.', [
        { text: 'Lanjutkan', style: 'cancel' },
        { text: 'Buang sesi', style: 'destructive', onPress: () => resetFocus(false) },
      ]);
      return;
    }

    setPendingLog({
      plannedSeconds: plannedSecondsRef.current,
      actualSeconds,
      completed: false,
      startedAt: sessionStartedAtRef.current ?? Date.now() - actualSeconds * 1000,
      endedAt: Date.now(),
    });
  };

  const skipBreak = () => {
    endAtRef.current = null;
    setIsRunning(false);
    modeRef.current = 'focus';
    setMode('focus');
    setRemainingSeconds(focusMinutes * 60);
    clearSessionRefs();
  };

  const submitLog = async () => {
    if (!pendingLog) return;
    setSubmitting(true);
    try {
      await productivityApi.focus.log({
        task_id: selectedTaskId || null,
        planned_minutes: Math.max(1, Math.round(pendingLog.plannedSeconds / 60)),
        actual_minutes: Math.max(1, Math.ceil(pendingLog.actualSeconds / 60)),
        focus_rating: rating,
        completed: pendingLog.completed,
        session_type: focusMinutes >= 45 ? 'deep_work' : 'pomodoro',
        started_at: new Date(pendingLog.startedAt).toISOString(),
        ended_at: new Date(pendingLog.endedAt).toISOString(),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingLog(null);
      setRating(4);
      modeRef.current = 'break';
      setMode('break');
      setRemainingSeconds(BREAK_SECONDS);
      clearSessionRefs();
      const nextLogs = await productivityApi.focus.list(7);
      setLogs(nextLogs);
    } catch (error) {
      Alert.alert('Sesi belum tersimpan', getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const totalSeconds = mode === 'break' ? BREAK_SECONDS : plannedSecondsRef.current;
  const progress = Math.max(0, Math.min(100, ((totalSeconds - remainingSeconds) / totalSeconds) * 100));
  const progressWidth = `${progress}%` as `${number}%`;
  const weeklyMinutes = useMemo(() => logs.reduce((total, log) => total + (log.completed ? log.actual_minutes : 0), 0), [logs]);
  const averageRating = useMemo(() => logs.length > 0 ? logs.reduce((total, log) => total + log.focus_rating, 0) / logs.length : 0, [logs]);

  const resetAction = (
    <Pressable accessibilityRole="button" accessibilityLabel="Reset timer" onPress={() => resetFocus()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
      <Ionicons name="refresh" size={18} color={colors.textSecondary} />
    </Pressable>
  );

  return (
    <Screen eyebrow="DEEP WORK" title="Focus" action={resetAction} refreshing={refreshing} onRefresh={() => void load(true)}>
      <View style={styles.summaryRow}>
        <SummaryCard icon="timer-outline" label="7 hari" value={`${weeklyMinutes}m`} tone={colors.purple} />
        <SummaryCard icon="star-outline" label="Rata-rata flow" value={averageRating > 0 ? averageRating.toFixed(1) : '—'} tone={colors.amber} />
        <SummaryCard icon="flame-outline" label="Sesi" value={`${logs.length}`} tone={colors.pink} />
      </View>

      {pendingLog ? (
        <RatingPanel
          pending={pendingLog}
          rating={rating}
          taskTitle={selectedTask?.title}
          submitting={submitting}
          onRating={setRating}
          onSubmit={() => void submitLog()}
          onDiscard={() => resetFocus()}
        />
      ) : (
        <Surface>
          <View style={styles.timerHeader}>
            <View style={[styles.modeBadge, mode === 'break' && styles.modeBadgeBreak]}>
              <Ionicons name={mode === 'focus' ? 'flash' : 'leaf'} size={13} color={mode === 'focus' ? colors.purple : colors.emerald} />
              <Text style={[styles.modeText, mode === 'break' && styles.modeTextBreak]}>{mode === 'focus' ? 'SESI FOKUS' : 'ISTIRAHAT'}</Text>
            </View>
            <Text style={styles.timerStatus}>{isRunning ? 'Berjalan' : sessionStartedAtRef.current ? 'Dijeda' : 'Siap'}</Text>
          </View>

          <View accessibilityRole="timer" accessibilityLabel={`${Math.floor(remainingSeconds / 60)} menit ${remainingSeconds % 60} detik tersisa`} style={[styles.timerOrb, mode === 'break' && styles.timerOrbBreak]}>
            <Text style={styles.timerValue}>{formatTimer(remainingSeconds)}</Text>
            <Text style={styles.timerCaption}>{mode === 'focus' ? selectedTask?.title ?? 'Fokus tanpa tugas' : 'Tarik napas dan pulihkan energi'}</Text>
          </View>

          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: progressWidth, backgroundColor: mode === 'focus' ? colors.purple : colors.emerald }]} /></View>

          {mode === 'focus' && sessionStartedAtRef.current === null ? (
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((minutes) => (
                <Pressable key={minutes} accessibilityRole="button" accessibilityState={{ selected: focusMinutes === minutes }} onPress={() => selectDuration(minutes)} style={({ pressed }) => [styles.durationChip, focusMinutes === minutes && styles.durationChipSelected, pressed && styles.pressed]}>
                  <Text style={[styles.durationText, focusMinutes === minutes && styles.durationTextSelected]}>{minutes} min</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.timerControls}>
            <Pressable accessibilityRole="button" accessibilityLabel={isRunning ? 'Jeda timer' : 'Mulai timer'} onPress={toggleTimer} style={({ pressed }) => [styles.mainControl, mode === 'break' && styles.mainControlBreak, pressed && styles.pressed]}>
              <Ionicons name={isRunning ? 'pause' : 'play'} size={28} color={colors.black} style={!isRunning ? styles.playIcon : undefined} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={mode === 'break' ? 'Lewati istirahat' : 'Akhiri sesi'} onPress={finishEarly} style={({ pressed }) => [styles.finishButton, pressed && styles.pressed]}>
              <Ionicons name={mode === 'break' ? 'play-skip-forward' : 'stop'} size={17} color={colors.textSecondary} />
              <Text style={styles.finishText}>{mode === 'break' ? 'Lewati' : 'Akhiri'}</Text>
            </Pressable>
          </View>
        </Surface>
      )}

      {mode === 'focus' && !pendingLog ? (
        <>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Tautkan tugas</Text>
            <Text style={styles.listHint}>{sessionStartedAtRef.current ? 'Dikunci saat sesi berjalan' : 'Opsional'}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskRow}>
            <FocusTaskChip label="Tanpa tugas" selected={!selectedTaskId} disabled={sessionStartedAtRef.current !== null} onPress={() => setSelectedTaskId('')} />
            {tasks.map((task) => <FocusTaskChip key={task.id} label={task.title} selected={selectedTaskId === task.id} disabled={sessionStartedAtRef.current !== null} onPress={() => setSelectedTaskId(task.id)} />)}
          </ScrollView>
        </>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Riwayat 7 hari</Text>
        <Text style={styles.listHint}>Sesi terbaru</Text>
      </View>
      <Surface>
        {loadingHistory ? (
          <View style={styles.loading}><ActivityIndicator color={colors.purple} /><Text style={styles.loadingText}>Memuat sesi…</Text></View>
        ) : logs.length > 0 ? logs.slice(0, 6).map((log, index) => <FocusLogRow key={log.id} log={log} divider={index > 0} />) : (
          <View style={styles.empty}>
            <Ionicons name="timer-outline" size={30} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Belum ada sesi tercatat</Text>
            <Text style={styles.emptyCopy}>Mulai timer dan simpan rating setelah fokus minimal satu menit.</Text>
          </View>
        )}
      </Surface>
    </Screen>
  );
}

function RatingPanel({ pending, rating, taskTitle, submitting, onRating, onSubmit, onDiscard }: {
  pending: PendingFocusLog;
  rating: number;
  taskTitle?: string;
  submitting: boolean;
  onRating: (value: number) => void;
  onSubmit: () => void;
  onDiscard: () => void;
}) {
  return (
    <Surface>
      <View style={styles.ratingPanel}>
        <View style={styles.ratingIcon}><Ionicons name="flame" size={28} color={colors.pink} /></View>
        <Text style={styles.ratingTitle}>{pending.completed ? 'Target fokus tercapai' : 'Sesi siap disimpan'}</Text>
        <Text style={styles.ratingCopy}>{Math.max(1, Math.ceil(pending.actualSeconds / 60))} menit{taskTitle ? ` untuk “${taskTitle}”` : ''}. Seberapa dalam fokusmu?</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Rating ${value}`} accessibilityState={{ selected: rating === value }} onPress={() => { onRating(value); void Haptics.selectionAsync(); }} style={({ pressed }) => [styles.starButton, pressed && styles.pressed]}>
              <Ionicons name={value <= rating ? 'star' : 'star-outline'} size={28} color={value <= rating ? colors.amber : colors.textMuted} />
            </Pressable>
          ))}
        </View>
        <Text style={styles.ratingLabel}>{ratingLabel(rating)}</Text>
        <Pressable accessibilityRole="button" disabled={submitting} onPress={onSubmit} style={({ pressed }) => [styles.saveRatingButton, pressed && styles.pressed, submitting && styles.disabled]}>
          {submitting ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="save-outline" size={17} color={colors.black} />}
          <Text style={styles.saveRatingText}>{submitting ? 'Menyimpan…' : 'Simpan & istirahat'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={submitting} onPress={onDiscard} style={({ pressed }) => [styles.discardButton, pressed && styles.pressed, submitting && styles.disabled]}><Text style={styles.discardText}>Buang sesi</Text></Pressable>
      </View>
    </Surface>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: string }) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons name={icon} size={17} color={tone} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FocusTaskChip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.taskChip, selected && styles.taskChipSelected, pressed && styles.pressed, disabled && styles.taskChipDisabled]}>
      {selected ? <Ionicons name="checkmark-circle" size={15} color={colors.purple} /> : null}
      <Text numberOfLines={1} style={[styles.taskChipText, selected && styles.taskChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function FocusLogRow({ log, divider }: { log: FocusLog; divider: boolean }) {
  const date = new Date(log.started_at);
  return (
    <View style={[styles.logRow, divider && styles.rowDivider]}>
      <View style={[styles.logIcon, !log.completed && styles.logIconPartial]}><Ionicons name={log.completed ? 'checkmark' : 'pause'} size={15} color={log.completed ? colors.black : colors.amber} /></View>
      <View style={styles.logCopy}>
        <Text numberOfLines={1} style={styles.logTitle}>{log.task?.title ?? (log.session_type === 'deep_work' ? 'Deep work' : 'Sesi fokus')}</Text>
        <Text style={styles.logMeta}>{formatLogDate(date)} · {log.actual_minutes}/{log.planned_minutes} menit</Text>
      </View>
      <View style={styles.logRating}><Ionicons name="star" size={12} color={colors.amber} /><Text style={styles.logRatingText}>{log.focus_rating}</Text></View>
    </View>
  );
}

function formatTimer(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatLogDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return 'Baru saja';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(value);
}

function ratingLabel(value: number): string {
  return ['Terdistraksi', 'Fokus rendah', 'Stabil', 'Flow tinggi', 'Sangat mendalam'][value - 1] ?? 'Stabil';
}

const styles = StyleSheet.create({
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, minWidth: 0, minHeight: 92, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  summaryValue: { marginTop: 5, color: colors.text, fontSize: 16, fontWeight: '900' },
  summaryLabel: { marginTop: 3, color: colors.textMuted, fontSize: 7, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  timerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeBadge: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(167,139,250,0.24)', backgroundColor: 'rgba(167,139,250,0.08)' },
  modeBadgeBreak: { borderColor: 'rgba(110,231,183,0.24)', backgroundColor: 'rgba(110,231,183,0.08)' },
  modeText: { color: colors.purple, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  modeTextBreak: { color: colors.emerald },
  timerStatus: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  timerOrb: { width: 226, height: 226, marginTop: spacing.xl, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 113, borderWidth: 2, borderColor: 'rgba(167,139,250,0.34)', backgroundColor: 'rgba(167,139,250,0.055)' },
  timerOrbBreak: { borderColor: 'rgba(110,231,183,0.34)', backgroundColor: 'rgba(110,231,183,0.055)' },
  timerValue: { color: colors.text, fontSize: 50, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerCaption: { maxWidth: 170, marginTop: spacing.sm, color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
  progressTrack: { height: 7, marginTop: spacing.xl, overflow: 'hidden', borderRadius: radii.pill, backgroundColor: colors.black },
  progressFill: { height: '100%', borderRadius: radii.pill },
  durationRow: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  durationChip: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  durationChipSelected: { borderColor: 'rgba(167,139,250,0.34)', backgroundColor: 'rgba(167,139,250,0.1)' },
  durationText: { color: colors.textMuted, fontSize: 9, fontWeight: '900' },
  durationTextSelected: { color: colors.purple },
  timerControls: { marginTop: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mainControl: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 34, backgroundColor: colors.purple },
  mainControlBreak: { backgroundColor: colors.emerald },
  playIcon: { marginLeft: 4 },
  finishButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  finishText: { color: colors.textSecondary, fontSize: 9, fontWeight: '900' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  listHint: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  taskRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  taskChip: { maxWidth: 220, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  taskChipSelected: { borderColor: 'rgba(167,139,250,0.34)', backgroundColor: 'rgba(167,139,250,0.09)' },
  taskChipDisabled: { opacity: 0.55 },
  taskChipText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  taskChipTextSelected: { color: colors.purple },
  ratingPanel: { minHeight: 390, alignItems: 'center', justifyContent: 'center' },
  ratingIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30, borderWidth: 1, borderColor: 'rgba(244,114,182,0.25)', backgroundColor: 'rgba(244,114,182,0.09)' },
  ratingTitle: { marginTop: spacing.lg, color: colors.text, fontSize: 19, fontWeight: '900' },
  ratingCopy: { maxWidth: 290, marginTop: spacing.sm, color: colors.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  stars: { marginTop: spacing.xl, flexDirection: 'row', gap: 2 },
  starButton: { padding: 3 },
  ratingLabel: { marginTop: spacing.sm, color: colors.amber, fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  saveRatingButton: { width: '100%', minHeight: 48, marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.white },
  saveRatingText: { color: colors.black, fontSize: 11, fontWeight: '900' },
  discardButton: { minHeight: 40, marginTop: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  discardText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 13, fontWeight: '900' },
  emptyCopy: { marginTop: 5, color: colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  logRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowDivider: { marginTop: spacing.sm, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  logIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.emerald },
  logIconPartial: { borderWidth: 1, borderColor: 'rgba(252,211,77,0.24)', backgroundColor: 'rgba(252,211,77,0.08)' },
  logCopy: { flex: 1 },
  logTitle: { color: colors.text, fontSize: 11, fontWeight: '900' },
  logMeta: { marginTop: 4, color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  logRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logRatingText: { color: colors.amber, fontSize: 10, fontWeight: '900' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.48 },
});
