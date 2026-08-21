import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Surface } from '../components/Surface';
import { getApiErrorMessage } from '../lib/api';
import { localDateKey } from '../lib/date';
import {
  EXPENSE_CATEGORIES,
  financeApi,
  type ExpenseCategory,
  type FinanceSummary,
  type LivingExpense,
} from '../lib/wellbeing-api';
import { colors, radii, spacing } from '../theme';

const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: keyof typeof Ionicons.glyphMap; tone: string }> = {
  rent: { label: 'Kost', icon: 'home-outline', tone: colors.purple },
  food: { label: 'Makan', icon: 'restaurant-outline', tone: colors.emerald },
  laundry: { label: 'Laundry', icon: 'water-outline', tone: colors.cyan },
  coffee: { label: 'Kopi', icon: 'cafe-outline', tone: colors.amber },
  developer_sub: { label: 'Dev tools', icon: 'code-slash-outline', tone: colors.pink },
  other: { label: 'Lainnya', icon: 'wallet-outline', tone: colors.textSecondary },
};

export function FinanceScreen() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<LivingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<LivingExpense | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(localDateKey());
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const load = useCallback(async (fromRefresh = false) => {
    if (fromRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [nextSummary, nextExpenses] = await Promise.all([
        financeApi.getSummary(),
        financeApi.getExpenses(50),
      ]);
      setSummary(nextSummary);
      setExpenses(nextExpenses);
    } catch (error) {
      Alert.alert('Keuangan belum dapat dimuat', getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const progress = summary && summary.monthly_limit > 0
    ? Math.min(100, Math.round((summary.total_spend / summary.monthly_limit) * 100))
    : 0;

  const largestCategory = useMemo(() => {
    if (!summary) return null;
    return EXPENSE_CATEGORIES.reduce<ExpenseCategory>((largest, current) => (
      summary.categories[current] > summary.categories[largest] ? current : largest
    ), 'rent');
  }, [summary]);

  const resetForm = () => {
    setAmount('');
    setCategory('food');
    setDescription('');
    setExpenseDate(localDateKey());
    setEditingExpense(null);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (expense: LivingExpense) => {
    setEditingExpense(expense);
    setAmount(String(expense.amount));
    setCategory(expense.category);
    setDescription(expense.description ?? '');
    setExpenseDate(expense.expense_date.slice(0, 10));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const submitExpense = async () => {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount || parsedAmount < 1) {
      Alert.alert('Nominal belum valid', 'Masukkan nominal pengeluaran minimal Rp1.');
      return;
    }
    if (!isDateKey(expenseDate)) {
      Alert.alert('Tanggal belum valid', 'Gunakan format YYYY-MM-DD, misalnya 2026-07-17.');
      return;
    }

    setSubmitting(true);
    try {
      const input = {
        amount: parsedAmount,
        category,
        description: description.trim() || null,
        expense_date: expenseDate,
      };
      if (editingExpense) await financeApi.updateExpense(editingExpense.id, input);
      else await financeApi.createExpense(input);

      closeForm();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (error) {
      Alert.alert(
        editingExpense ? 'Transaksi belum diperbarui' : 'Transaksi belum disimpan',
        getApiErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveBudget = async () => {
    const parsedBudget = parseAmount(budgetInput);
    if (!parsedBudget || parsedBudget < 100_000 || parsedBudget > 100_000_000) {
      Alert.alert('Budget belum valid', 'Budget bulanan harus antara Rp100.000 dan Rp100.000.000.');
      return;
    }

    setSavingBudget(true);
    try {
      await financeApi.updateBudget(parsedBudget);
      setBudgetOpen(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (error) {
      Alert.alert('Budget belum disimpan', getApiErrorMessage(error));
    } finally {
      setSavingBudget(false);
    }
  };

  const requestDelete = (expense: LivingExpense) => {
    Alert.alert(
      'Hapus transaksi?',
      `${expense.description || CATEGORY_META[expense.category].label} sebesar ${formatIDR(expense.amount)} akan dihapus.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            setDeletingId(expense.id);
            void financeApi.deleteExpense(expense.id)
              .then(async () => {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await load();
              })
              .catch((error: unknown) => Alert.alert('Transaksi belum dihapus', getApiErrorMessage(error)))
              .finally(() => setDeletingId(null));
          },
        },
      ],
    );
  };

  const headerAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Tambah transaksi"
      onPress={openCreate}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
    >
      <Ionicons name="add" size={22} color={colors.black} />
    </Pressable>
  );

  return (
    <Screen
      eyebrow="FINANCE GUARD"
      title="Uang Bulanan"
      action={headerAction}
      refreshing={refreshing}
      onRefresh={() => void load(true)}
    >
      {loading && !summary ? (
        <Surface>
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Menyiapkan ringkasan bulan ini…</Text>
          </View>
        </Surface>
      ) : null}

      {summary ? (
        <Surface>
          <View style={styles.summaryTop}>
            <View style={styles.summaryCopy}>
              <Text style={styles.eyebrow}>PENGELUARAN BULAN INI</Text>
              <Text style={styles.totalSpend}>{formatIDR(summary.total_spend)}</Text>
              <Text style={styles.summaryHint}>{progress}% dari budget terpakai</Text>
            </View>
            <View style={[styles.progressBadge, progress > 80 && styles.progressBadgeDanger]}>
              <Text style={[styles.progressBadgeText, progress > 80 && styles.progressBadgeTextDanger]}>{progress}%</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[
              styles.progressFill,
              progress > 80 ? styles.progressDanger : progress > 55 ? styles.progressWarning : null,
              { width: `${progress}%` },
            ]} />
          </View>
          <View style={styles.metricRow}>
            <Metric label="Sisa" value={formatIDR(summary.remaining_budget)} tone={colors.emerald} />
            <View style={styles.metricDivider} />
            <Metric label="Limit" value={formatIDR(summary.monthly_limit)} tone={colors.text} />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBudgetInput(String(summary.monthly_limit));
              setBudgetOpen((current) => !current);
            }}
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
          >
            <Ionicons name="options-outline" size={16} color={colors.cyan} />
            <Text style={styles.outlineButtonText}>{budgetOpen ? 'Tutup editor budget' : 'Ubah budget bulanan'}</Text>
          </Pressable>
          {budgetOpen ? (
            <View style={styles.inlineEditor}>
              <Field label="Limit bulanan (Rp)">
                <TextInput
                  accessibilityLabel="Limit budget bulanan"
                  value={budgetInput}
                  onChangeText={setBudgetInput}
                  keyboardType="number-pad"
                  placeholder="2500000"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
              </Field>
              <Pressable
                accessibilityRole="button"
                onPress={() => void saveBudget()}
                disabled={savingBudget}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, savingBudget && styles.disabled]}
              >
                {savingBudget ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryButtonText}>Simpan budget</Text>}
              </Pressable>
            </View>
          ) : null}
        </Surface>
      ) : null}

      {summary ? (
        <Surface>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>KATEGORI</Text>
              <Text style={styles.sectionTitle}>Sebaran bulan ini</Text>
            </View>
            {largestCategory && summary.categories[largestCategory] > 0 ? (
              <Text style={styles.sectionMeta}>Terbesar · {CATEGORY_META[largestCategory].label}</Text>
            ) : null}
          </View>
          <View style={styles.categorySummaryList}>
            {EXPENSE_CATEGORIES.map((item) => (
              <View key={item} style={styles.categorySummaryRow}>
                <View style={[styles.categoryIcon, { backgroundColor: `${CATEGORY_META[item].tone}14` }]}>
                  <Ionicons name={CATEGORY_META[item].icon} size={16} color={CATEGORY_META[item].tone} />
                </View>
                <Text style={styles.categorySummaryLabel}>{CATEGORY_META[item].label}</Text>
                <Text style={styles.categorySummaryValue}>{formatIDR(summary.categories[item])}</Text>
              </View>
            ))}
          </View>
        </Surface>
      ) : null}

      {summary?.insights.length ? (
        <Surface>
          <View style={styles.insightHeader}>
            <Ionicons name="sparkles-outline" size={18} color={colors.purple} />
            <Text style={styles.sectionTitle}>Insight budget</Text>
          </View>
          {summary.insights.map((insight) => (
            <View key={insight} style={styles.insightRow}>
              <View style={styles.insightDot} />
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </Surface>
      ) : null}

      {formOpen ? (
        <Surface>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>{editingExpense ? 'EDIT TRANSAKSI' : 'TRANSAKSI BARU'}</Text>
              <Text style={styles.sectionTitle}>{editingExpense ? 'Perbarui pengeluaran' : 'Catat pengeluaran'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Tutup formulir" onPress={closeForm} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Field label="Nominal (Rp)">
            <TextInput
              accessibilityLabel="Nominal pengeluaran"
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="25000"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </Field>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Kategori</Text>
            <View style={styles.chipWrap}>
              {EXPENSE_CATEGORIES.map((item) => {
                const selected = item === category;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(item)}
                    style={({ pressed }) => [styles.categoryChip, selected && styles.categoryChipSelected, pressed && styles.pressed]}
                  >
                    <Ionicons name={CATEGORY_META[item].icon} size={14} color={selected ? colors.black : CATEGORY_META[item].tone} />
                    <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{CATEGORY_META[item].label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Field label="Deskripsi (opsional)">
            <TextInput
              accessibilityLabel="Deskripsi pengeluaran"
              value={description}
              onChangeText={setDescription}
              maxLength={255}
              placeholder="Contoh: makan siang"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </Field>
          <Field label="Tanggal · YYYY-MM-DD">
            <TextInput
              accessibilityLabel="Tanggal pengeluaran"
              value={expenseDate}
              onChangeText={setExpenseDate}
              maxLength={10}
              placeholder="2026-07-17"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </Field>
          <Pressable
            accessibilityRole="button"
            onPress={() => void submitExpense()}
            disabled={submitting}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, submitting && styles.disabled]}
          >
            {submitting ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryButtonText}>{editingExpense ? 'Simpan perubahan' : 'Tambah transaksi'}</Text>}
          </Pressable>
        </Surface>
      ) : null}

      <View style={styles.sectionHeaderOutside}>
        <View>
          <Text style={styles.sectionEyebrow}>LEDGER</Text>
          <Text style={styles.sectionTitle}>Transaksi terbaru</Text>
        </View>
        <Text style={styles.sectionMeta}>{expenses.length} catatan</Text>
      </View>

      {expenses.length ? expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          deleting={deletingId === expense.id}
          onEdit={() => openEdit(expense)}
          onDelete={() => requestDelete(expense)}
        />
      )) : !loading ? (
        <Surface>
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={32} color={colors.cyan} />
            <Text style={styles.emptyTitle}>Belum ada transaksi</Text>
            <Text style={styles.emptyCopy}>Tekan tombol tambah untuk mencatat pengeluaran pertama.</Text>
          </View>
        </Surface>
      ) : null}
    </Screen>
  );
}

function ExpenseRow({
  expense,
  deleting,
  onEdit,
  onDelete,
}: {
  expense: LivingExpense;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[expense.category];
  return (
    <Surface>
      <View style={styles.expenseRow}>
        <View style={[styles.expenseIcon, { backgroundColor: `${meta.tone}14`, borderColor: `${meta.tone}28` }]}>
          <Ionicons name={meta.icon} size={18} color={meta.tone} />
        </View>
        <View style={styles.expenseCopy}>
          <Text style={styles.expenseTitle}>{expense.description || meta.label}</Text>
          <Text style={styles.expenseMeta}>{meta.label} · {formatDate(expense.expense_date)}</Text>
        </View>
        <Text style={styles.expenseAmount}>{formatIDR(expense.amount)}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${expense.description || meta.label}`} onPress={onEdit} style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={15} color={colors.cyan} />
          <Text style={styles.rowButtonText}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${expense.description || meta.label}`} onPress={onDelete} disabled={deleting} style={({ pressed }) => [styles.rowButton, pressed && styles.pressed, deleting && styles.disabled]}>
          {deleting ? <ActivityIndicator size="small" color={colors.rose} /> : <Ionicons name="trash-outline" size={15} color={colors.rose} />}
          <Text style={[styles.rowButtonText, styles.deleteText]}>Hapus</Text>
        </Pressable>
      </View>
    </Surface>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const dateKey = value.slice(0, 10);
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(year, month - 1, day));
}

const styles = StyleSheet.create({
  headerButton: { width: 44, height: 44, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  loadingState: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryCopy: { flex: 1 },
  eyebrow: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  totalSpend: { marginTop: 7, color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -0.7 },
  summaryHint: { marginTop: 5, color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  progressBadge: { minWidth: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(34,211,238,0.28)', backgroundColor: 'rgba(34,211,238,0.08)' },
  progressBadgeDanger: { borderColor: 'rgba(251,113,133,0.3)', backgroundColor: 'rgba(251,113,133,0.08)' },
  progressBadgeText: { color: colors.cyan, fontSize: 13, fontWeight: '900' },
  progressBadgeTextDanger: { color: colors.rose },
  progressTrack: { height: 7, marginTop: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.black, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.emerald },
  progressWarning: { backgroundColor: colors.amber },
  progressDanger: { backgroundColor: colors.rose },
  metricRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  metric: { flex: 1 },
  metricDivider: { width: 1, height: 35, marginHorizontal: spacing.md, backgroundColor: colors.border },
  metricLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  metricValue: { marginTop: 5, fontSize: 14, fontWeight: '900' },
  outlineButton: { minHeight: 42, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.medium, backgroundColor: colors.surfaceSoft },
  outlineButtonText: { color: colors.cyan, fontSize: 11, fontWeight: '800' },
  inlineEditor: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  sectionHeaderOutside: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: 2 },
  sectionEyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: '800' },
  sectionMeta: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  categorySummaryList: { gap: spacing.md },
  categorySummaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  categoryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  categorySummaryLabel: { flex: 1, color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  categorySummaryValue: { color: colors.text, fontSize: 11, fontWeight: '900' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  insightRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  insightDot: { width: 6, height: 6, marginTop: 6, borderRadius: 3, backgroundColor: colors.purple },
  insightText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  fieldGroup: { gap: 7, marginBottom: spacing.md },
  fieldLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  input: { minHeight: 48, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, color: colors.text, paddingHorizontal: spacing.md, fontSize: 13, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft, paddingHorizontal: 11 },
  categoryChipSelected: { borderColor: colors.white, backgroundColor: colors.white },
  categoryChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  categoryChipTextSelected: { color: colors.black },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.medium, backgroundColor: colors.white, paddingHorizontal: spacing.lg },
  primaryButtonText: { color: colors.black, fontSize: 12, fontWeight: '900' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  expenseIcon: { width: 42, height: 42, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  expenseCopy: { flex: 1 },
  expenseTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  expenseMeta: { marginTop: 5, color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  expenseAmount: { maxWidth: 112, color: colors.text, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  rowButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radii.small, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  rowButtonText: { color: colors.cyan, fontSize: 9, fontWeight: '900' },
  deleteText: { color: colors.rose },
  emptyState: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyCopy: { marginTop: 6, color: colors.textMuted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
