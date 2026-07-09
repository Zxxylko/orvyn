import { useState, useEffect, useCallback } from 'react';
import type { LivingExpense, FinanceSummary } from '@/types/telu';
import { financeApi, getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export function useFinance() {
  const [expenses, setExpenses] = useState<LivingExpense[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await financeApi.getSummary();
      setSummary(response.data.data);
    } catch (err: unknown) {
      console.error('Failed to fetch finance summary', err);
    }
  }, []);

  const fetchExpenses = useCallback(async (limit = 50) => {
    try {
      const response = await financeApi.getExpenses({ limit });
      setExpenses(response.data.data);
    } catch (err: unknown) {
      console.error('Failed to fetch expenses list', err);
    }
  }, []);

  const loadAllFinanceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchSummary(), fetchExpenses()]);
    } catch {
      setError('Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, [fetchSummary, fetchExpenses]);

  const logExpense = useCallback(async (data: {
    amount: number;
    category: 'rent' | 'food' | 'laundry' | 'coffee' | 'developer_sub' | 'other';
    description?: string;
    expense_date: string;
  }) => {
    try {
      const response = await financeApi.logExpense(data);
      const newExpense = response.data.data;
      setExpenses((prev) => [newExpense, ...prev]);
      toast.success(response.data.message || 'Expense logged successfully!');
      // Refresh summary
      fetchSummary();
      return newExpense;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to log expense');
      toast.error(msg);
      throw err;
    }
  }, [fetchSummary]);

  const updateBudget = useCallback(async (monthlyLimit: number) => {
    try {
      const response = await financeApi.updateBudget({ monthly_limit: monthlyLimit });
      toast.success(response.data.message || 'Monthly budget updated.');
      await fetchSummary();
      return response.data.data;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to update monthly budget');
      toast.error(msg);
      throw err;
    }
  }, [fetchSummary]);

  const updateExpense = useCallback(async (id: string, data: Partial<{
    amount: number;
    category: 'rent' | 'food' | 'laundry' | 'coffee' | 'developer_sub' | 'other';
    description: string | null;
    expense_date: string;
  }>) => {
    try {
      const response = await financeApi.updateExpense(id, data);
      const updatedExpense = response.data.data;
      setExpenses((prev) => prev.map((exp) => exp.id === id ? updatedExpense : exp));
      toast.success(response.data.message || 'Expense record updated.');
      fetchSummary();
      return updatedExpense;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to update expense');
      toast.error(msg);
      throw err;
    }
  }, [fetchSummary]);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      await financeApi.deleteExpense(id);
      setExpenses((prev) => prev.filter((exp) => exp.id !== id));
      toast.success('Expense deleted.');
      // Refresh summary
      fetchSummary();
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to delete expense');
      toast.error(msg);
      throw err;
    }
  }, [fetchSummary]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAllFinanceData();
    });
  }, [loadAllFinanceData]);

  return {
    expenses,
    summary,
    loading,
    error,
    refreshFinance: loadAllFinanceData,
    updateBudget,
    logExpense,
    updateExpense,
    deleteExpense,
  };
}
