<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LivingExpense;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LivingExpenseController extends Controller
{
    /**
     * List recent expenses.
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'limit' => 'sometimes|integer|min:1|max:100',
        ]);

        $limit = $validated['limit'] ?? 50;
        $expenses = Auth::user()->livingExpenses()
            ->orderBy('expense_date', 'desc')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $expenses,
        ]);
    }

    /**
     * Store new expense record.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|min:1',
            'category' => 'required|string|in:rent,food,laundry,coffee,developer_sub,other',
            'description' => 'nullable|string|max:255',
            'expense_date' => 'required|date',
        ]);

        $expense = Auth::user()->livingExpenses()->create($validated);

        return response()->json([
            'data' => $expense,
            'message' => 'Expense logged successfully.',
        ], 201);
    }

    /**
     * Show one expense record.
     */
    public function show(LivingExpense $expense)
    {
        if ($expense->user_id !== Auth::id()) {
            abort(403, 'Unauthorized action.');
        }

        return response()->json([
            'data' => $expense,
        ]);
    }

    /**
     * Update expense record.
     */
    public function update(Request $request, LivingExpense $expense)
    {
        if ($expense->user_id !== Auth::id()) {
            abort(403, 'Unauthorized action.');
        }

        $validated = $request->validate([
            'amount' => 'sometimes|required|numeric|min:1',
            'category' => 'sometimes|required|string|in:rent,food,laundry,coffee,developer_sub,other',
            'description' => 'nullable|string|max:255',
            'expense_date' => 'sometimes|required|date',
        ]);

        $expense->update($validated);

        return response()->json([
            'data' => $expense,
            'message' => 'Expense record updated successfully.',
        ]);
    }

    /**
     * Delete expense record.
     */
    public function destroy(LivingExpense $expense)
    {
        if ($expense->user_id !== Auth::id()) {
            abort(403);
        }

        $expense->delete();

        return response()->json([
            'message' => 'Expense record deleted.',
        ]);
    }

    /**
     * Get monthly financial summaries & budgeting insights.
     */
    public function summary()
    {
        $user = Auth::user();
        $startOfMonth = Carbon::now()->startOfMonth();
        $endOfMonth = Carbon::now()->endOfMonth();

        // Query current month expenses
        $expenses = $user->livingExpenses()
            ->whereBetween('expense_date', [$startOfMonth, $endOfMonth])
            ->get();

        $totalSpend = (float) $expenses->sum('amount');

        // Dynamic category aggregation
        $categories = ['rent' => 0.0, 'food' => 0.0, 'laundry' => 0.0, 'coffee' => 0.0, 'developer_sub' => 0.0, 'other' => 0.0];
        foreach ($expenses as $exp) {
            if (array_key_exists($exp->category, $categories)) {
                $categories[$exp->category] += (float) $exp->amount;
            }
        }

        // Student standard Tel-U cost ceiling baseline (Rp 2.500.000 / month), user-adjustable.
        $monthlyLimit = (float) data_get($user->preferences, 'finance.monthly_limit', 2500000);
        $remaining = max(0, $monthlyLimit - $totalSpend);

        // Auto-generate AI insights based on Bandung living conditions
        $insights = [];

        if ($totalSpend > $monthlyLimit) {
            $insights[] = 'Anggaran bulanan Anda telah melampaui Rp '.number_format($monthlyLimit, 0, ',', '.').'. Kurangi pengeluaran non-essential segera.';
        } elseif ($totalSpend > $monthlyLimit * 0.8) {
            $insights[] = 'Pengeluaran Anda hampir mencapai batas 80% anggaran bulanan. Waktunya berhemat.';
        }

        if ($totalSpend > 0) {
            if ($categories['coffee'] > $totalSpend * 0.15) {
                $insights[] = 'Pengeluaran kopi/nongkrong Anda cukup tinggi bulan ini ('.round(($categories['coffee'] / $totalSpend) * 100).'% dari total pengeluaran). Coba seduh kopi sendiri di kost untuk menghemat.';
            }

            if ($categories['food'] < $totalSpend * 0.20 && $categories['food'] > 0) {
                $insights[] = 'Porsi anggaran makan Anda sangat kecil. Pastikan Anda makan dengan porsi bergizi seimbang di Warteg sekitar Sukabirus.';
            }
        }

        if ($categories['developer_sub'] > 300000) {
            $insights[] = 'Tagihan tool/SaaS coding Anda mencapai Rp '.number_format($categories['developer_sub'], 0, ',', '.').'. Pastikan semua subscription (GitHub Copilot, dsb.) aktif digunakan.';
        }

        if (empty($insights)) {
            $insights[] = 'Pengeluaran Anda sangat rapi dan terkontrol bulan ini. Pertahankan ritme finansial ini.';
        }

        return response()->json([
            'data' => [
                'total_spend' => $totalSpend,
                'monthly_limit' => $monthlyLimit,
                'remaining_budget' => $remaining,
                'categories' => $categories,
                'insights' => $insights,
            ],
        ]);
    }

    /**
     * Update user monthly budget limit.
     */
    public function updateBudget(Request $request)
    {
        $validated = $request->validate([
            'monthly_limit' => 'required|numeric|min:100000|max:100000000',
        ]);

        $user = Auth::user();
        $preferences = $user->preferences ?? [];
        data_set($preferences, 'finance.monthly_limit', (float) $validated['monthly_limit']);
        $user->forceFill(['preferences' => $preferences])->save();

        return response()->json([
            'data' => [
                'monthly_limit' => (float) $validated['monthly_limit'],
            ],
            'message' => 'Monthly budget updated successfully.',
        ]);
    }
}
