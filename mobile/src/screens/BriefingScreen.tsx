import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage } from '../lib/api';
import { productivityApi } from '../lib/productivity-api';
import { colors, radii, spacing } from '../theme';
import type { AIBriefing } from '../types/productivity';

export function BriefingScreen() {
  const [briefing, setBriefing] = useState<AIBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      setBriefing(await productivityApi.briefing.today());
    } catch (error) {
      Alert.alert('Briefing belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const generate = async () => {
    setGenerating(true);
    try {
      const nextBriefing = await productivityApi.briefing.generate();
      setBriefing(nextBriefing);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Briefing belum berhasil dibuat', getApiErrorMessage(error, 'Coba lagi beberapa saat lagi.'));
    } finally {
      setGenerating(false);
    }
  };

  const headerAction = briefing ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Perbarui briefing"
      disabled={generating}
      onPress={() => void generate()}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed, generating && styles.disabled]}
    >
      {generating ? <ActivityIndicator size="small" color={colors.cyan} /> : <Ionicons name="refresh" size={18} color={colors.cyan} />}
    </Pressable>
  ) : undefined;

  return (
    <Screen
      eyebrow="RINGKASAN AI"
      title="Briefing hari ini"
      action={headerAction}
      refreshing={refreshing}
      onRefresh={() => void load(true)}
    >
      {loading ? <LoadingBriefing /> : briefing ? (
        <BriefingContent briefing={briefing} />
      ) : (
        <EmptyBriefing generating={generating} onGenerate={() => void generate()} />
      )}
    </Screen>
  );
}

function LoadingBriefing() {
  return (
    <Surface>
      <View style={styles.loading}>
        <ActivityIndicator color={colors.cyan} size="large" />
        <Text style={styles.loadingTitle}>Membaca konteks harian</Text>
        <Text style={styles.loadingCopy}>Tugas, jadwal, dan indikator beban sedang disiapkan.</Text>
      </View>
    </Surface>
  );
}

function EmptyBriefing({ generating, onGenerate }: { generating: boolean; onGenerate: () => void }) {
  return (
    <Surface>
      <View style={styles.empty}>
        <View style={styles.emptyIcon}><Ionicons name="sparkles" size={29} color={colors.purple} /></View>
        <Text style={styles.emptyTitle}>Susun prioritas hari ini</Text>
        <Text style={styles.emptyCopy}>ORVYN akan merangkum beban kuliah, deadline, jadwal, dan kondisi harian menjadi langkah yang bisa langsung dikerjakan.</Text>
        <Pressable
          accessibilityRole="button"
          disabled={generating}
          onPress={onGenerate}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, generating && styles.disabled]}
        >
          {generating ? <ActivityIndicator size="small" color={colors.black} /> : <Ionicons name="sparkles" size={17} color={colors.black} />}
          <Text style={styles.primaryButtonText}>{generating ? 'Menyusun briefing…' : 'Buat briefing'}</Text>
        </Pressable>
      </View>
    </Surface>
  );
}

function BriefingContent({ briefing }: { briefing: AIBriefing }) {
  const context = briefing.context;
  const risk = briefing.health_metrics?.burnout_risk ?? 'low';
  const workload = briefing.health_metrics?.workload_balance ?? 'balanced';
  const stress = clampMetric(briefing.health_metrics?.stress_level);
  const cognitiveLoad = clampMetric(briefing.health_metrics?.cognitive_load);
  const date = formatBriefingDate(briefing.briefing_date);
  const paragraphs = briefing.summary_content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);

  const timeline = useMemo(() => [
    ...(context?.today_schedule ?? []).map((item) => ({
      key: `schedule-${item.start ?? 'today'}-${item.label}`,
      time: item.start && item.end ? `${item.start}–${item.end}` : 'Hari ini',
      title: item.label,
      meta: blockLabel(item.type),
    })),
    ...(context?.academic_deadlines ?? []).map((item) => ({
      key: `academic-${item.course}-${item.title}`,
      time: formatDeadline(item.deadline),
      title: item.title,
      meta: `${item.course} · ${item.type}`,
    })),
    ...(context?.upcoming_deadlines ?? []).map((item) => ({
      key: `task-${item.title}-${item.deadline ?? 'soon'}`,
      time: formatDeadline(item.deadline),
      title: item.title,
      meta: 'Deadline tugas',
    })),
  ].slice(0, 6), [context]);

  return (
    <>
      <Surface>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}><Ionicons name="clipboard-outline" size={18} color={colors.cyan} /></View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionEyebrow}>WORKLOAD REVIEW</Text>
            <Text style={styles.sectionMeta}>{date}</Text>
          </View>
        </View>

        <View style={styles.summaryCopy}>
          {(paragraphs.length > 0 ? paragraphs : ['Belum ada ringkasan tertulis untuk briefing ini.']).map((paragraph, index) => (
            <Text key={`${index}-${paragraph.slice(0, 12)}`} style={styles.summaryParagraph}>{paragraph}</Text>
          ))}
        </View>

        {context ? (
          <View style={styles.chips}>
            <InfoChip label={`${context.tasks_count} tugas aktif`} />
            <InfoChip label={`${context.overdue_count} terlambat`} tone={context.overdue_count > 0 ? 'danger' : 'default'} />
            <InfoChip label={`${context.completion_rate}% selesai`} />
            <InfoChip label={context.health_today ? `${context.health_today.sleep_hours} jam tidur` : 'Belum ada log kesehatan'} />
          </View>
        ) : null}
      </Surface>

      <View style={styles.twoColumns}>
        <MetricCard icon="flame-outline" label="Risiko burnout" value={riskLabel(risk)} tone={riskTone(risk)} />
        <MetricCard icon="scale-outline" label="Beban kerja" value={workloadLabel(workload)} tone={workload === 'overloaded' ? colors.rose : colors.emerald} />
      </View>

      <Surface>
        <View style={styles.sectionHeaderCompact}>
          <Ionicons name="pulse-outline" size={19} color={colors.pink} />
          <Text style={styles.cardTitle}>Indikator beban</Text>
        </View>
        <MetricBar label="Stres" value={stress} color={stress >= 70 ? colors.rose : colors.amber} />
        <MetricBar label="Beban kognitif" value={cognitiveLoad} color={colors.purple} />
      </Surface>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Rencana tindakan</Text>
        <Text style={styles.listHint}>{briefing.recommended_adjustments.length} rekomendasi</Text>
      </View>
      <Surface>
        {briefing.recommended_adjustments.length > 0 ? briefing.recommended_adjustments.map((adjustment, index) => (
          <View key={`${index}-${adjustment}`} style={[styles.actionRow, index > 0 && styles.rowDivider]}>
            <View style={styles.actionIndex}><Text style={styles.actionIndexText}>{index + 1}</Text></View>
            <Text style={styles.actionText}>{adjustment}</Text>
          </View>
        )) : <Text style={styles.emptyInline}>Belum ada penyesuaian khusus untuk hari ini.</Text>}
      </Surface>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Timeline terdekat</Text>
        <Text style={styles.listHint}>Jadwal & deadline</Text>
      </View>
      <Surface>
        {timeline.length > 0 ? timeline.map((item, index) => (
          <View key={item.key} style={[styles.timelineRow, index > 0 && styles.rowDivider]}>
            <View style={styles.timelineTime}><Ionicons name="time-outline" size={13} color={colors.textMuted} /><Text style={styles.timelineTimeText}>{item.time}</Text></View>
            <View style={styles.timelineCopy}>
              <Text numberOfLines={2} style={styles.timelineTitle}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.timelineMeta}>{item.meta}</Text>
            </View>
          </View>
        )) : <Text style={styles.emptyInline}>Belum ada jadwal atau deadline terdekat.</Text>}
      </Surface>

      {context ? (
        <View style={styles.twoColumns}>
          <MetricCard icon="water-outline" label="Hidrasi" value={`${context.health_today?.hydration_ml ?? 0} ml`} tone={colors.cyan} />
          <MetricCard icon="wallet-outline" label="Pengeluaran bulan" value={`Rp ${Math.round(context.monthly_spend).toLocaleString('id-ID')}`} tone={colors.emerald} />
        </View>
      ) : null}
    </>
  );
}

function InfoChip({ label, tone = 'default' }: { label: string; tone?: 'default' | 'danger' }) {
  return <View style={[styles.infoChip, tone === 'danger' && styles.infoChipDanger]}><Text style={[styles.infoChipText, tone === 'danger' && styles.infoChipDangerText]}>{label}</Text></View>;
}

function MetricCard({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: string }) {
  return (
    <View style={styles.metricCard}>
      <Ionicons name={icon} size={19} color={tone} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  const width = `${value}%` as `${number}%`;
  return (
    <View style={styles.metricBarBlock}>
      <View style={styles.metricBarHeader}><Text style={styles.metricBarLabel}>{label}</Text><Text style={styles.metricBarValue}>{value}/100</Text></View>
      <View style={styles.metricTrack}><View style={[styles.metricFill, { width, backgroundColor: color }]} /></View>
    </View>
  );
}

function clampMetric(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function formatBriefingDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function formatDeadline(value: string | null): string {
  if (!value) return 'Segera';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Segera';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function blockLabel(type: string): string {
  return ({ task: 'Tugas', break: 'Istirahat', class: 'Kelas', personal: 'Pribadi', study: 'Belajar' } as Record<string, string>)[type] ?? type;
}

function riskLabel(risk: 'low' | 'medium' | 'high'): string {
  return risk === 'high' ? 'Tinggi' : risk === 'medium' ? 'Sedang' : 'Rendah';
}

function riskTone(risk: 'low' | 'medium' | 'high'): string {
  return risk === 'high' ? colors.rose : risk === 'medium' ? colors.amber : colors.emerald;
}

function workloadLabel(workload: 'underloaded' | 'balanced' | 'overloaded'): string {
  return workload === 'overloaded' ? 'Berlebih' : workload === 'underloaded' ? 'Longgar' : 'Seimbang';
}

const styles = StyleSheet.create({
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: 'rgba(103,232,249,0.24)', backgroundColor: 'rgba(34,211,238,0.08)' },
  loading: { minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  loadingTitle: { marginTop: spacing.lg, color: colors.text, fontSize: 15, fontWeight: '800' },
  loadingCopy: { marginTop: 6, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  empty: { minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  emptyIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 32, borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)', backgroundColor: 'rgba(167,139,250,0.09)' },
  emptyTitle: { marginTop: spacing.xl, color: colors.text, fontSize: 19, fontWeight: '900' },
  emptyCopy: { maxWidth: 310, marginTop: spacing.sm, color: colors.textSecondary, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  primaryButton: { minHeight: 48, minWidth: 180, marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.medium, backgroundColor: colors.white, paddingHorizontal: spacing.lg },
  primaryButtonText: { color: colors.black, fontSize: 12, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionHeaderCompact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: 'rgba(34,211,238,0.08)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.18)' },
  sectionCopy: { flex: 1 },
  sectionEyebrow: { color: colors.text, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  sectionMeta: { marginTop: 4, color: colors.textMuted, fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  summaryCopy: { marginTop: spacing.lg, gap: spacing.md },
  summaryParagraph: { color: colors.textSecondary, fontSize: 13, lineHeight: 21, fontWeight: '600' },
  chips: { marginTop: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  infoChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
  infoChipDanger: { borderColor: 'rgba(251,113,133,0.25)', backgroundColor: 'rgba(251,113,133,0.08)' },
  infoChipText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  infoChipDangerText: { color: colors.rose },
  twoColumns: { flexDirection: 'row', gap: spacing.md },
  metricCard: { flex: 1, minWidth: 0, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  metricLabel: { marginTop: spacing.md, color: colors.textMuted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  metricValue: { marginTop: 5, color: colors.text, fontSize: 15, fontWeight: '900' },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  metricBarBlock: { marginTop: spacing.md },
  metricBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricBarLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  metricBarValue: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  metricTrack: { height: 7, marginTop: spacing.sm, overflow: 'hidden', borderRadius: radii.pill, backgroundColor: colors.black },
  metricFill: { height: '100%', borderRadius: radii.pill },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  listTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  listHint: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  actionIndex: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(103,232,249,0.1)' },
  actionIndexText: { color: colors.cyan, fontSize: 10, fontWeight: '900' },
  actionText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.lg },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  timelineTime: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  timelineTimeText: { flex: 1, color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  timelineCopy: { flex: 1 },
  timelineTitle: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  timelineMeta: { marginTop: 4, color: colors.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  emptyInline: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', paddingVertical: spacing.xl },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});
