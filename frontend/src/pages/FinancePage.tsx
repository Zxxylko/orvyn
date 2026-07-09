import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { format } from 'date-fns';
import {
  Calendar,
  CheckCircle2,
  Coffee,
  DollarSign,
  Edit2,
  Eye,
  Home,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SkeletonPulse } from '@/components/ui/UXSkeletons';
import { useFinance } from '@/hooks/useFinance';
import type { ExpenseCategory, LivingExpense } from '@/types/telu';

type CategoryFilter = ExpenseCategory | 'all';

const CATEGORY_META: Record<ExpenseCategory, { label: string; helper: string; icon: LucideIcon; tone: string }> = {
  rent: {
    label: 'Kost',
    helper: 'Sewa kamar',
    icon: Home,
    tone: 'border-indigo-300/20 bg-indigo-300/10 text-indigo-200',
  },
  food: {
    label: 'Makan',
    helper: 'Warteg, kantin, gofood',
    icon: Utensils,
    tone: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
  },
  laundry: {
    label: 'Laundry',
    helper: 'Cuci, sabun, kebutuhan kost',
    icon: DollarSign,
    tone: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200',
  },
  coffee: {
    label: 'Kopi',
    helper: 'Cafe, nongkrong, minuman',
    icon: Coffee,
    tone: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
  },
  developer_sub: {
    label: 'Dev tools',
    helper: 'Copilot, VPS, domain, SaaS',
    icon: Laptop,
    tone: 'border-blue-300/20 bg-blue-300/10 text-blue-200',
  },
  other: {
    label: 'Lainnya',
    helper: 'Transport, print, kebutuhan lain',
    icon: Wallet,
    tone: 'border-slate-300/20 bg-slate-300/10 text-slate-200',
  },
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_META) as Array<[ExpenseCategory, (typeof CATEGORY_META)[ExpenseCategory]]>;

export function FinancePage() {
  const { expenses, summary, loading, updateBudget, logExpense, updateExpense, deleteExpense, refreshFinance } = useFinance();
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<LivingExpense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<LivingExpense | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<LivingExpense | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayDate());
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [submittingBudget, setSubmittingBudget] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const progressPercent = summary && summary.monthly_limit > 0
    ? Math.min(100, Math.round((summary.total_spend / summary.monthly_limit) * 100))
    : 0;
  const filteredExpenses = useMemo(
    () => filterExpenses(expenses, searchQuery, categoryFilter),
    [categoryFilter, expenses, searchQuery]
  );
  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((total, expense) => total + Number(expense.amount), 0),
    [filteredExpenses]
  );

  const resetForm = () => {
    setAmount('');
    setCategory('food');
    setDescription('');
    setExpenseDate(todayDate());
    setEditingExpense(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (expense: LivingExpense) => {
    setEditingExpense(expense);
    setAmount(String(Number(expense.amount)));
    setCategory(expense.category);
    setDescription(expense.description ?? '');
    setExpenseDate(toDateInputValue(expense.expense_date));
    setShowForm(true);
    setViewingExpense(null);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

  const handleExpenseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) return;

    setSubmittingExpense(true);
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          amount: parsedAmount,
          category,
          description: description.trim() || null,
          expense_date: expenseDate,
        });
      } else {
        await logExpense({
          amount: parsedAmount,
          category,
          description: description.trim() || undefined,
          expense_date: expenseDate,
        });
      }
      closeForm();
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleBudgetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedLimit = parseFloat(budgetLimit);
    if (Number.isNaN(parsedLimit) || parsedLimit < 100000) return;

    setSubmittingBudget(true);
    try {
      await updateBudget(parsedLimit);
      setEditingBudget(false);
    } finally {
      setSubmittingBudget(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;

    setDeletingExpense(true);
    try {
      await deleteExpense(deleteCandidate.id);
      setDeleteCandidate(null);
      if (viewingExpense?.id === deleteCandidate.id) {
        setViewingExpense(null);
      }
    } finally {
      setDeletingExpense(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <section className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-300/10 text-blue-200">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Finance CRUD</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Uang Bulanan Bandung</h1>
              <p className="mt-1 text-sm font-medium text-slate-400">
                Tambah, lihat, edit, dan hapus transaksi harian dengan budget bulanan yang bisa diubah.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => refreshFinance()}
              className="focus-ring interactive-surface inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.09] hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="focus-ring interactive-surface inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-slate-100"
            >
              <Plus className="h-4 w-4" />
              Tambah Transaksi
            </button>
          </div>
        </div>
      </section>

      {loading && !summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SkeletonPulse className="h-36 rounded-2xl" />
          <SkeletonPulse className="h-36 rounded-2xl" />
          <SkeletonPulse className="h-36 rounded-2xl" />
        </div>
      ) : summary ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard
            label="Pengeluaran bulan ini"
            value={formatIDR(summary.total_spend)}
            helper={`${progressPercent}% dari budget terpakai`}
            accent="text-white"
          >
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-950">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progressPercent > 80 ? 'bg-rose-400' : progressPercent > 50 ? 'bg-amber-400' : 'bg-blue-400'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </SummaryCard>

          <SummaryCard
            label="Sisa budget"
            value={formatIDR(summary.remaining_budget)}
            helper={`Limit: ${formatIDR(summary.monthly_limit)}`}
            accent="text-emerald-300"
          >
            <button
              type="button"
              onClick={() => {
                setBudgetLimit(String(Math.round(summary.monthly_limit)));
                setEditingBudget((value) => !value);
              }}
              className="focus-ring interactive-surface mt-4 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/[0.09]"
            >
              {editingBudget ? 'Tutup' : 'Ubah budget'}
            </button>
            {editingBudget && (
              <form onSubmit={handleBudgetSubmit} className="mt-3 rounded-xl border border-white/10 bg-slate-950/45 p-3">
                <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Budget bulanan baru
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="100000"
                    value={budgetLimit}
                    onChange={(event) => setBudgetLimit(event.target.value)}
                    className="focus-ring min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs font-semibold text-white outline-none"
                    placeholder="2500000"
                  />
                  <button
                    type="submit"
                    disabled={submittingBudget}
                    className="focus-ring interactive-surface rounded-xl bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan'}
                  </button>
                </div>
              </form>
            )}
          </SummaryCard>

          <SummaryCard
            label="Tools coding / SaaS"
            value={formatIDR(summary.categories.developer_sub)}
            helper="Copilot, VPS, domain, hosting, dan tools dev."
            accent="text-blue-300"
          />
        </section>
      ) : null}

      {summary && (
        <section className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Kategori bulan ini</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Sebaran pengeluaran</h2>
            </div>
            <p className="text-xs font-semibold text-slate-500">Klik filter di ledger untuk membaca transaksi tertentu.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {CATEGORY_OPTIONS.map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategoryFilter(key)}
                  className={`focus-ring interactive-surface rounded-xl border p-3 text-left transition ${meta.tone} ${
                    categoryFilter === key ? 'ring-1 ring-white/25' : ''
                  }`}
                >
                  <Icon className="mb-2 h-4 w-4" />
                  <p className="text-xs font-bold text-white">{meta.label}</p>
                  <p className="mt-1 text-sm font-black text-white">{formatIDR(summary.categories[key])}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {showForm && (
        <ExpenseForm
          editing={editingExpense}
          amount={amount}
          category={category}
          description={description}
          expenseDate={expenseDate}
          submitting={submittingExpense}
          onAmount={setAmount}
          onCategory={setCategory}
          onDescription={setDescription}
          onExpenseDate={setExpenseDate}
          onCancel={closeForm}
          onSubmit={handleExpenseSubmit}
        />
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.45fr_0.85fr]">
        <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
          <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Read / Update / Delete</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Ledger transaksi</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {filteredExpenses.length} transaksi ditampilkan, total {formatIDR(filteredTotal)}.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_180px] xl:w-[520px]">
              <label className="relative block">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari deskripsi atau kategori..."
                  className="focus-ring w-full rounded-xl border border-white/10 bg-slate-950/50 py-2.5 pl-9 pr-3 text-xs font-semibold text-white outline-none placeholder:text-slate-600"
                />
              </label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
                className="focus-ring rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs font-semibold text-white outline-none"
              >
                <option value="all">Semua kategori</option>
                {CATEGORY_OPTIONS.map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <SkeletonPulse className="h-20 rounded-xl" />
              <SkeletonPulse className="h-20 rounded-xl" />
              <SkeletonPulse className="h-20 rounded-xl" />
            </div>
          ) : expenses.length === 0 ? (
            <EmptyTransactions onCreate={openCreateForm} />
          ) : filteredExpenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-300">Tidak ada transaksi yang cocok.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                }}
                className="focus-ring interactive-surface mt-4 rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.09]"
              >
                Reset filter
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              {filteredExpenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  onView={() => setViewingExpense(expense)}
                  onEdit={() => openEditForm(expense)}
                  onDelete={() => setDeleteCandidate(expense)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <CheckCircle2 className="h-4 w-4 text-blue-300" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Saran Keuangan</h3>
            </div>
            {summary && summary.insights.length > 0 ? (
              <div className="space-y-3">
                {summary.insights.map((insight) => (
                  <div key={insight} className="flex gap-3 rounded-xl border border-white/5 bg-slate-950/50 p-3.5">
                    <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                    <p className="text-xs font-medium leading-relaxed text-slate-300">{insight}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-medium text-slate-500">Belum ada ringkasan keuangan.</p>
            )}
          </div>

          <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">CRUD checklist</p>
            <div className="mt-4 space-y-3">
              <CrudStep label="Create" detail="Tambah transaksi dari tombol utama atau empty state." done />
              <CrudStep label="Read" detail="Cari, filter, dan buka detail transaksi." done />
              <CrudStep label="Update" detail="Edit nominal, kategori, deskripsi, dan tanggal." done />
              <CrudStep label="Delete" detail="Hapus transaksi melalui dialog konfirmasi." done />
            </div>
          </div>
        </aside>
      </section>

      {viewingExpense && (
        <ExpenseDetailModal
          expense={viewingExpense}
          onClose={() => setViewingExpense(null)}
          onEdit={() => openEditForm(viewingExpense)}
          onDelete={() => setDeleteCandidate(viewingExpense)}
        />
      )}

      {deleteCandidate && (
        <DeleteExpenseDialog
          expense={deleteCandidate}
          deleting={deletingExpense}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  accent,
  children,
}: {
  label: string;
  value: string;
  helper: string;
  accent: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="reactive-card rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black leading-none ${accent}`}>{value}</p>
      <p className="mt-3 text-xs font-medium text-slate-500">{helper}</p>
      {children}
    </div>
  );
}

function ExpenseForm({
  editing,
  amount,
  category,
  description,
  expenseDate,
  submitting,
  onAmount,
  onCategory,
  onDescription,
  onExpenseDate,
  onCancel,
  onSubmit,
}: {
  editing: LivingExpense | null;
  amount: string;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  submitting: boolean;
  onAmount: (value: string) => void;
  onCategory: (value: ExpenseCategory) => void;
  onDescription: (value: string) => void;
  onExpenseDate: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="reactive-card rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
            {editing ? 'Update transaksi' : 'Create transaksi'}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
            {editing ? 'Edit data pengeluaran' : 'Tambah pengeluaran baru'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring interactive-surface inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-400 hover:text-white"
          aria-label="Tutup form transaksi"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Nominal (IDR)">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(event) => onAmount(event.target.value)}
            placeholder="25000"
            required
            className="finance-input"
          />
        </Field>
        <Field label="Kategori">
          <select
            value={category}
            onChange={(event) => onCategory(event.target.value as ExpenseCategory)}
            className="finance-input"
          >
            {CATEGORY_OPTIONS.map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label} - {meta.helper}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Deskripsi">
          <input
            type="text"
            value={description}
            onChange={(event) => onDescription(event.target.value)}
            placeholder="Nasi padang, Copilot, laundry"
            className="finance-input"
          />
        </Field>
        <Field label="Tanggal">
          <input
            type="date"
            value={expenseDate}
            onChange={(event) => onExpenseDate(event.target.value)}
            required
            className="finance-input"
          />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring interactive-surface rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/[0.09]"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="focus-ring interactive-surface inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {editing ? 'Update' : 'Simpan'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ExpenseRow({
  expense,
  onView,
  onEdit,
  onDelete,
}: {
  expense: LivingExpense;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[expense.category];
  const Icon = meta.icon;

  return (
    <div className="grid grid-cols-1 gap-4 border-b border-white/10 bg-slate-950/25 p-4 transition last:border-b-0 hover:bg-white/[0.04] md:grid-cols-[1fr_auto] md:items-center">
      <button type="button" onClick={onView} className="group flex min-w-0 items-center gap-3 text-left">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${meta.tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white group-hover:text-blue-200">
            {expense.description || meta.label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
            <span>{meta.label}</span>
            <span>/</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(expense.expense_date)}
            </span>
          </div>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
        <span className="text-sm font-black text-white">{formatIDR(Number(expense.amount))}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onView}
            className="finance-row-button hover:text-cyan-200"
            aria-label="Lihat detail transaksi"
          >
            <Eye className="h-4 w-4" />
            Detail
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="finance-row-button hover:text-blue-200"
            aria-label="Edit transaksi"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="finance-row-button hover:text-rose-200"
            aria-label="Hapus transaksi"
          >
            <Trash2 className="h-4 w-4" />
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyTransactions({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-12 text-center">
      <Wallet className="mx-auto mb-3 h-10 w-10 text-slate-600" />
      <h3 className="text-sm font-bold text-white">Belum ada transaksi</h3>
      <p className="mt-1 text-xs font-medium text-slate-500">
        Mulai dari makan, kopi, kost, laundry, atau subscription developer.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="focus-ring interactive-surface mt-5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-slate-100"
      >
        Catat pengeluaran pertama
      </button>
    </div>
  );
}

function ExpenseDetailModal({
  expense,
  onClose,
  onEdit,
  onDelete,
}: {
  expense: LivingExpense;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[expense.category];
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${meta.tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Detail transaksi</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{expense.description || meta.label}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring interactive-surface inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-400 hover:text-white"
            aria-label="Tutup detail transaksi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3">
          <DetailLine label="Nominal" value={formatIDR(Number(expense.amount))} />
          <DetailLine label="Kategori" value={`${meta.label} - ${meta.helper}`} />
          <DetailLine label="Tanggal" value={formatDate(expense.expense_date)} />
          <DetailLine label="Deskripsi" value={expense.description || '-'} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-slate-100"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-2.5 text-xs font-bold text-rose-100 hover:bg-rose-300/15"
          >
            <Trash2 className="h-4 w-4" />
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function DeleteExpenseDialog({
  expense,
  deleting,
  onCancel,
  onConfirm,
}: {
  expense: LivingExpense;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-300/10 text-rose-200">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Delete transaksi</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Hapus permanen?</h3>
          </div>
        </div>
        <p className="text-sm font-medium leading-relaxed text-slate-400">
          Transaksi “{expense.description || CATEGORY_META[expense.category].label}” sebesar {formatIDR(Number(expense.amount))} akan dihapus dari ledger.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring interactive-surface rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/[0.09]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="focus-ring interactive-surface inline-flex items-center justify-center gap-2 rounded-xl bg-rose-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function CrudStep({ label, detail, done }: { label: string; detail: string; done: boolean }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/5 bg-slate-950/35 p-3">
      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${done ? 'text-emerald-300' : 'text-slate-500'}`} />
      <div>
        <p className="text-xs font-bold text-white">{label}</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function filterExpenses(expenses: LivingExpense[], query: string, category: CategoryFilter) {
  const normalizedQuery = query.trim().toLowerCase();

  return expenses.filter((expense) => {
    const matchesCategory = category === 'all' || expense.category === category;
    const matchesSearch = !normalizedQuery
      || (expense.description ?? '').toLowerCase().includes(normalizedQuery)
      || CATEGORY_META[expense.category].label.toLowerCase().includes(normalizedQuery)
      || expense.category.toLowerCase().includes(normalizedQuery);

    return matchesCategory && matchesSearch;
  });
}

function formatIDR(value: number) {
  return `Rp ${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatDate(value: string) {
  return format(new Date(value), 'd MMM yyyy');
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function toDateInputValue(value: string) {
  return new Date(value).toISOString().split('T')[0];
}
