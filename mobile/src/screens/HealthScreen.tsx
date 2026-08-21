import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage } from '../lib/api';
import { localDateKey } from '../lib/date';
import { healthApi, type HealthAlert, type HealthLog, type HealthLogInput, type HealthSnapshot } from '../lib/wellbeing-api';
import { colors, radii, spacing } from '../theme';

const METRICS = [
  { key: 'hydration_ml', label: 'Hidrasi', suffix: 'ml', icon: 'water-outline', tone: colors.cyan, target: 2000 },
  { key: 'caffeine_mg', label: 'Kafein', suffix: 'mg', icon: 'cafe-outline', tone: colors.amber, target: 400 },
  { key: 'screen_time_minutes', label: 'Screen time', suffix: 'mnt', icon: 'phone-portrait-outline', tone: colors.purple, target: 480 },
  { key: 'sleep_hours', label: 'Tidur', suffix: 'jam', icon: 'moon-outline', tone: colors.pink, target: 8 },
] as const;

type QuickAction = 'water' | 'coffee' | 'sleep' | 'screen';

interface EditValues {
  logDate: string;
  hydration: string;
  caffeine: string;
  screenTime: string;
  sleep: string;
}

const EMPTY_EDIT_VALUES: EditValues = {
  logDate: '',
  hydration: '',
  caffeine: '',
  screenTime: '',
  sleep: '',
};

export function HealthScreen() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickBusy, setQuickBusy] = useState<QuickAction | null>(null);
  const [sleepInput, setSleepInput] = useState('');
  const [screenInput, setScreenInput] = useState('');
  const [editingLog, setEditingLog] = useState<HealthLog | null>(null);
  const [editValues, setEditValues] = useState<EditValues>(EMPTY_EDIT_VALUES);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (fromRefresh = false) => {
    if (fromRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [nextSnapshot, nextLogs] = await Promise.all([
        healthApi.getSnapshot(),
        healthApi.getLogs(30),
      ]);
      setSnapshot(nextSnapshot);
      setLogs(nextLogs);
    } catch (error) {
      Alert.alert('Kesehatan belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const history = useMemo(() => [...logs].reverse(), [logs]);

  const quickLog = async (action: QuickAction, values: Omit<HealthLogInput, 'log_date'>) => {
    setQuickBusy(action);
    try {
      await healthApi.log({ log_date: localDateKey(), ...values });
      if (action === 'sleep') setSleepInput('');
      if (action === 'screen') setScreenInput('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (error) {
      Alert.alert('Catatan belum disimpan', getApiErrorMessage(error));
    } finally {
      setQuickBusy(null);
    }
  };

  const saveSleep = () => {
    const sleep = parseBoundedNumber(sleepInput, 0, 24);
    if (sleep === null) {
      Alert.alert('Durasi tidur belum valid', 'Masukkan angka antara 0 dan 24 jam.');
      return;
    }
    void quickLog('sleep', { sleep_hours: sleep });
  };

  const saveScreenTime = () => {
    const minutes = parseBoundedInteger(screenInput, 0, 1440);
    if (minutes === null) {
      Alert.alert('Screen time belum valid', 'Masukkan menit antara 0 dan 1440.');
      return;
    }
    void quickLog('screen', { screen_time_minutes: minutes });
  };

  const openEdit = (log: HealthLog) => {
    setEditingLog(log);
    setEditValues({
      logDate: log.log_date.slice(0, 10),
      hydration: String(log.hydration_ml),
      caffeine: String(log.caffeine_mg),
      screenTime: String(log.screen_time_minutes),
      sleep: String(log.sleep_hours),
    });
  };

  const closeEdit = () => {
    setEditingLog(null);
    setEditValues(EMPTY_EDIT_VALUES);
  };

  const updateEditValue = (key: keyof EditValues, value: string) => {
    setEditValues((current) => ({ ...current, [key]: value }));
  };

  const saveEdit = async () => {
    if (!editingLog) return;
    const hydration = parseBoundedInteger(editValues.hydration, 0, 10_000);
    const caffeine = parseBoundedInteger(editValues.caffeine, 0, 2_000);
    const screenTime = parseBoundedInteger(editValues.screenTime, 0, 1_440);
    const sleep = parseBoundedNumber(editValues.sleep, 0, 24);

    if (!isDateKey(editValues.logDate) || hydration === null || caffeine === null || screenTime === null || sleep === null) {
      Alert.alert(
        'Data belum valid',
        'Periksa tanggal, hidrasi 0–10.000 ml, kafein 0–2.000 mg, screen time 0–1.440 menit, dan tidur 0–24 jam.',
      );
      return;
    }

    setSavingEdit(true);
    try {
      await healthApi.updateLog(editingLog.id, {
        log_date: editValues.logDate,
        hydration_ml: hydration,
        caffeine_mg: caffeine,
        screen_time_minutes: screenTime,
        sleep_hours: sleep,
      });
      closeEdit();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (error) {
      Alert.alert('Catatan belum diperbarui', getApiErrorMessage(error));
    } finally {
      setSavingEdit(false);
    }
  };

  const requestDelete = (log: HealthLog) => {
    Alert.alert('Hapus catatan kesehatan?', `Catatan ${formatDate(log.log_date)} akan dihapus permanen.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          setDeletingId(log.id);
          void healthApi.deleteLog(log.id)
            .then(async () => {
              if (editingLog?.id === log.id) closeEdit();
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            })
            .catch((error: unknown) => Alert.alert('Catatan belum dihapus', getApiErrorMessage(error)))
            .finally(() => setDeletingId(null));
        },
      },
    ]);
  };

  return (
    <Screen
      eyebrow="WELLNESS GUARD"
      title="Kesehatan"
      refreshing={refreshing}
      onRefresh={() => void load(true)}
    >
      {loading && !snapshot ? (
        <Surface>
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Membaca kondisi hari ini…</Text>
          </View>
        </Surface>
      ) : null}

      {snapshot ? (
        <View style={styles.metricsGrid}>
          {METRICS.map((metric) => (
            <MetricCard
              key={metric.key}
              icon={metric.icon}
              label={metric.label}
              value={snapshot[metric.key]}
              suffix={metric.suffix}
              tone={metric.tone}
              target={metric.target}
              reverseRisk={metric.key === 'caffeine_mg' || metric.key === 'screen_time_minutes'}
            />
          ))}
        </View>
      ) : null}

      {snapshot?.alerts.length ? (
        <Surface>
          <View style={styles.sectionHeaderCompact}>
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.amber} />
            <Text style={styles.sectionTitle}>Perlu diperhatikan</Text>
          </View>
          <View style={styles.alertList}>
            {snapshot.alerts.map((alert) => <HealthAlertRow key={`${alert.category}-${alert.message}`} alert={alert} />)}
          </View>
        </Surface>
      ) : snapshot ? (
        <Surface>
          <View style={styles.allGoodRow}>
            <View style={styles.allGoodIcon}><Ionicons name="checkmark" size={20} color={colors.black} /></View>
            <View style={styles.allGoodCopy}>
              <Text style={styles.allGoodTitle}>Semua indikator aman</Text>
              <Text style={styles.allGoodText}>Pertahankan ritme sehat hari ini.</Text>
            </View>
          </View>
        </Surface>
      ) : null}

      <View style={styles.sectionHeaderOutside}>
        <View>
          <Text style={styles.sectionEyebrow}>QUICK LOG</Text>
          <Text style={styles.sectionTitle}>Catat kondisi hari ini</Text>
        </View>
        <Text style={styles.sectionMeta}>{formatDate(localDateKey())}</Text>
      </View>

      <View style={styles.quickRow}>
        <QuickButton
          icon="water-outline"
          label="+250 ml air"
          tone={colors.cyan}
          busy={quickBusy === 'water'}
          disabled={quickBusy !== null}
          onPress={() => void quickLog('water', { hydration_ml: 250, accumulate: true })}
        />
        <QuickButton
          icon="cafe-outline"
          label="+80 mg kopi"
          tone={colors.amber}
          busy={quickBusy === 'coffee'}
          disabled={quickBusy !== null}
          onPress={() => void quickLog('coffee', { caffeine_mg: 80, accumulate: true })}
        />
      </View>

      <Surface>
        <View style={styles.quickInputRow}>
          <View style={styles.quickInputCopy}>
            <Text style={styles.quickInputTitle}>Tidur tadi malam</Text>
            <Text style={styles.quickInputHint}>Jam, boleh desimal</Text>
          </View>
          <TextInput
            accessibilityLabel="Durasi tidur dalam jam"
            value={sleepInput}
            onChangeText={setSleepInput}
            keyboardType="decimal-pad"
            placeholder="7.5"
            placeholderTextColor={colors.textMuted}
            style={styles.compactInput}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Simpan durasi tidur" disabled={quickBusy !== null} onPress={saveSleep} style={({ pressed }) => [styles.compactSave, pressed && styles.pressed, quickBusy !== null && styles.disabled]}>
            {quickBusy === 'sleep' ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="checkmark" size={18} color={colors.black} />}
          </Pressable>
        </View>
        <View style={styles.separator} />
        <View style={styles.quickInputRow}>
          <View style={styles.quickInputCopy}>
            <Text style={styles.quickInputTitle}>Screen time</Text>
            <Text style={styles.quickInputHint}>Total menit hari ini</Text>
          </View>
          <TextInput
            accessibilityLabel="Screen time dalam menit"
            value={screenInput}
            onChangeText={setScreenInput}
            keyboardType="number-pad"
            placeholder="360"
            placeholderTextColor={colors.textMuted}
            style={styles.compactInput}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Simpan screen time" disabled={quickBusy !== null} onPress={saveScreenTime} style={({ pressed }) => [styles.compactSave, pressed && styles.pressed, quickBusy !== null && styles.disabled]}>
            {quickBusy === 'screen' ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="checkmark" size={18} color={colors.black} />}
          </Pressable>
        </View>
      </Surface>

      {editingLog ? (
        <Surface>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>EDIT HISTORY</Text>
              <Text style={styles.sectionTitle}>Perbarui catatan</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Tutup editor" onPress={closeEdit} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <EditField label="Tanggal · YYYY-MM-DD" value={editValues.logDate} onChangeText={(value) => updateEditValue('logDate', value)} keyboardType="default" />
          <View style={styles.editGrid}>
            <EditField label="Hidrasi (ml)" value={editValues.hydration} onChangeText={(value) => updateEditValue('hydration', value)} />
            <EditField label="Kafein (mg)" value={editValues.caffeine} onChangeText={(value) => updateEditValue('caffeine', value)} />
            <EditField label="Screen (menit)" value={editValues.screenTime} onChangeText={(value) => updateEditValue('screenTime', value)} />
            <EditField label="Tidur (jam)" value={editValues.sleep} onChangeText={(value) => updateEditValue('sleep', value)} keyboardType="decimal-pad" />
          </View>
          <Pressable accessibilityRole="button" onPress={() => void saveEdit()} disabled={savingEdit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, savingEdit && styles.disabled]}>
            {savingEdit ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryButtonText}>Simpan perubahan</Text>}
          </Pressable>
        </Surface>
      ) : null}

      <View style={styles.sectionHeaderOutside}>
        <View>
          <Text style={styles.sectionEyebrow}>30 HARI</Text>
          <Text style={styles.sectionTitle}>Riwayat kesehatan</Text>
        </View>
        <Text style={styles.sectionMeta}>{history.length} catatan</Text>
      </View>

      {history.length ? history.map((log) => (
        <HistoryCard
          key={log.id}
          log={log}
          deleting={deletingId === log.id}
          onEdit={() => openEdit(log)}
          onDelete={() => requestDelete(log)}
        />
      )) : !loading ? (
        <Surface>
          <View style={styles.emptyState}>
            <Ionicons name="heart-outline" size={34} color={colors.pink} />
            <Text style={styles.emptyTitle}>Belum ada riwayat</Text>
            <Text style={styles.emptyText}>Gunakan quick log untuk membuat catatan kesehatan hari ini.</Text>
          </View>
        </Surface>
      ) : null}
    </Screen>
  );
}

function MetricCard({
  icon,
  label,
  value,
  suffix,
  tone,
  target,
  reverseRisk,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  suffix: string;
  tone: string;
  target: number;
  reverseRisk: boolean;
}) {
  const ratio = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const status = reverseRisk ? (value > target ? 'Tinggi' : 'Aman') : (value >= target ? 'Target' : `${ratio}%`);
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, { backgroundColor: `${tone}14` }]}><Ionicons name={icon} size={18} color={tone} /></View>
        <Text style={[styles.metricStatus, { color: reverseRisk && value > target ? colors.rose : tone }]}>{status}</Text>
      </View>
      <Text style={styles.metricName}>{label}</Text>
      <Text style={styles.metricNumber}>{formatNumber(value)} <Text style={styles.metricSuffix}>{suffix}</Text></Text>
    </View>
  );
}

function HealthAlertRow({ alert }: { alert: HealthAlert }) {
  const tone = alert.type === 'danger' ? colors.rose : alert.type === 'warning' ? colors.amber : colors.cyan;
  return (
    <View style={[styles.alertRow, { borderColor: `${tone}28`, backgroundColor: `${tone}0D` }]}>
      <Ionicons name={alert.type === 'info' ? 'information-circle-outline' : 'alert-circle-outline'} size={18} color={tone} />
      <View style={styles.alertCopy}>
        <Text style={[styles.alertCategory, { color: tone }]}>{alert.category.toUpperCase()}</Text>
        <Text style={styles.alertMessage}>{alert.message}</Text>
      </View>
    </View>
  );
}

function QuickButton({
  icon,
  label,
  tone,
  busy,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.quickButton, { borderColor: `${tone}28`, backgroundColor: `${tone}0D` }, pressed && styles.pressed, disabled && styles.disabled]}>
      {busy ? <ActivityIndicator color={tone} /> : <Ionicons name={icon} size={20} color={tone} />}
      <Text style={[styles.quickButtonText, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  keyboardType = 'number-pad',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={colors.textMuted}
        style={styles.editInput}
      />
    </View>
  );
}

function HistoryCard({
  log,
  deleting,
  onEdit,
  onDelete,
}: {
  log: HealthLog;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Surface>
      <View style={styles.historyHeader}>
        <View style={styles.historyDateIcon}><Ionicons name="calendar-outline" size={17} color={colors.cyan} /></View>
        <View style={styles.historyDateCopy}>
          <Text style={styles.historyDate}>{formatDate(log.log_date)}</Text>
          <Text style={styles.historyDateKey}>{log.log_date.slice(0, 10)}</Text>
        </View>
        <View style={styles.historyActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit catatan ${formatDate(log.log_date)}`} onPress={onEdit} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <Ionicons name="create-outline" size={19} color={colors.cyan} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Hapus catatan ${formatDate(log.log_date)}`} onPress={onDelete} disabled={deleting} hitSlop={8} style={({ pressed }) => [pressed && styles.pressed, deleting && styles.disabled]}>
            {deleting ? <ActivityIndicator size="small" color={colors.rose} /> : <Ionicons name="trash-outline" size={19} color={colors.rose} />}
          </Pressable>
        </View>
      </View>
      <View style={styles.historyMetrics}>
        <HistoryMetric icon="water-outline" value={`${log.hydration_ml} ml`} tone={colors.cyan} />
        <HistoryMetric icon="cafe-outline" value={`${log.caffeine_mg} mg`} tone={colors.amber} />
        <HistoryMetric icon="phone-portrait-outline" value={`${log.screen_time_minutes} mnt`} tone={colors.purple} />
        <HistoryMetric icon="moon-outline" value={`${formatNumber(log.sleep_hours)} jam`} tone={colors.pink} />
      </View>
    </Surface>
  );
}

function HistoryMetric({ icon, value, tone }: { icon: keyof typeof Ionicons.glyphMap; value: string; tone: string }) {
  return (
    <View style={styles.historyMetric}>
      <Ionicons name={icon} size={14} color={tone} />
      <Text style={styles.historyMetricText}>{value}</Text>
    </View>
  );
}

function parseBoundedNumber(value: string, min: number, max: number): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseBoundedInteger(value: string, min: number, max: number): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function isDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value.slice(0, 10);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(year, month - 1, day));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
}

const styles = StyleSheet.create({
  loadingState: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricCard: { minWidth: 145, flexBasis: '46%', flexGrow: 1, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricIcon: { width: 36, height: 36, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center' },
  metricStatus: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  metricName: { marginTop: spacing.md, color: colors.textMuted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  metricNumber: { marginTop: 5, color: colors.text, fontSize: 21, fontWeight: '900' },
  metricSuffix: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  sectionHeaderCompact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  sectionHeaderOutside: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: 2 },
  sectionEyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: '800' },
  sectionMeta: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  alertList: { gap: spacing.sm },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderWidth: 1, borderRadius: radii.medium, padding: spacing.md },
  alertCopy: { flex: 1 },
  alertCategory: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  alertMessage: { marginTop: 5, color: colors.textSecondary, fontSize: 10, lineHeight: 16, fontWeight: '600' },
  allGoodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  allGoodIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.emerald },
  allGoodCopy: { flex: 1 },
  allGoodTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  allGoodText: { marginTop: 4, color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: spacing.md },
  quickButton: { minHeight: 66, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.large },
  quickButtonText: { fontSize: 11, fontWeight: '900' },
  quickInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickInputCopy: { flex: 1 },
  quickInputTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  quickInputHint: { marginTop: 4, color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  compactInput: { width: 68, height: 42, borderRadius: radii.small, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, color: colors.text, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  compactSave: { width: 42, height: 42, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  separator: { height: 1, marginVertical: spacing.lg, backgroundColor: colors.border },
  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  editField: { minWidth: 135, flexGrow: 1, flexBasis: '42%', gap: 7, marginBottom: spacing.md },
  editLabel: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  editInput: { minHeight: 46, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, color: colors.text, paddingHorizontal: spacing.md, fontSize: 12, fontWeight: '700' },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.white },
  primaryButtonText: { color: colors.black, fontSize: 12, fontWeight: '900' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  historyDateIcon: { width: 38, height: 38, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,211,238,0.08)' },
  historyDateCopy: { flex: 1 },
  historyDate: { color: colors.text, fontSize: 13, fontWeight: '800' },
  historyDateKey: { marginTop: 4, color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  historyActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  historyMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  historyMetric: { minWidth: 120, flexGrow: 1, flexBasis: '42%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.small, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.md, paddingVertical: 10 },
  historyMetricText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  emptyState: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyText: { marginTop: 6, color: colors.textMuted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.48 },
});
