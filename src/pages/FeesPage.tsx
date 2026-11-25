import React, { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Printer, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { downloadCsv, formatMoney } from '../utils/export';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import type {
  Classroom,
  ExpenseCategory,
  ExpenseItem,
  FeePayment,
  FeeSummaryRow,
  PaymentMethod,
} from '../types';

export function FeesPage() {
  const { user, settings } = useAuth();
  const { tr } = useTheme();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'balances' | 'history' | 'expenses'>('balances');
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [summaryRows, setSummaryRows] = useState<FeeSummaryRow[]>([]);
  const [totals, setTotals] = useState({
    totalExpected: 0,
    totalCollected: 0,
    totalOutstanding: 0,
  });
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expenseSummary, setExpenseSummary] = useState({
    totalCollectedFees: 0,
    totalExpenses: 0,
    remainingBalance: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Payment Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({
    studentId: '',
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash' as PaymentMethod,
    notes: '',
  });

  // Expense Modal
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [savingExp, setSavingExp] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);
  const [expForm, setExpForm] = useState({
    title: '',
    category: 'Utilities' as ExpenseCategory,
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash' as PaymentMethod,
    notes: '',
  });

  // Receipt Modal
  const [receiptPayment, setReceiptPayment] = useState<FeePayment | null>(null);

  // Delete Payment or Expense
  const [deleteTarget, setDeleteTarget] = useState<FeePayment | null>(null);
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<ExpenseItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sumParams = new URLSearchParams();
      if (classFilter) sumParams.set('classId', classFilter);
      if (statusFilter) sumParams.set('status', statusFilter);

      const payParams = new URLSearchParams();
      if (classFilter) payParams.set('classId', classFilter);

      const [classList, sumRes, payRes, expRes] = await Promise.all([
        apiRequest<Classroom[]>('/api/classes'),
        apiRequest<{
          totals: { totalExpected: number; totalCollected: number; totalOutstanding: number };
          students: FeeSummaryRow[];
        }>(`/api/fees/summary?${sumParams.toString()}`),
        apiRequest<FeePayment[]>(`/api/fees/payments?${payParams.toString()}`),
        apiRequest<{
          summary: { totalCollectedFees: number; totalExpenses: number; remainingBalance: number };
          expenses: ExpenseItem[];
        }>('/api/expenses'),
      ]);

      setClasses(classList);
      setTotals(sumRes.totals);
      setSummaryRows(sumRes.students);
      setPayments(payRes);
      setExpenseSummary(expRes.summary);
      setExpenses(expRes.expenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial records.');
    } finally {
      setLoading(false);
    }
  }, [classFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openRecordPayment = (row?: FeeSummaryRow) => {
    setPayError(null);
    setMessage(null);
    setPayForm({
      studentId: row?.studentId || summaryRows[0]?.studentId || '',
      amount: row && row.remainingBalance > 0 ? String(row.remainingBalance) : '',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      notes: '',
    });
    setPayModalOpen(true);
  };

  const openRecordExpense = () => {
    setExpError(null);
    setMessage(null);
    setExpForm({
      title: '',
      category: 'Utilities',
      amount: '',
      expenseDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      notes: '',
    });
    setExpModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    setSavingPay(true);
    try {
      const created = await apiRequest<FeePayment>('/api/fees/payments', {
        method: 'POST',
        body: JSON.stringify({
          studentId: payForm.studentId,
          amount: Number(payForm.amount),
          paymentDate: payForm.paymentDate,
          paymentMethod: payForm.paymentMethod,
          notes: payForm.notes,
        }),
      });
      setPayModalOpen(false);
      setMessage(tr('paymentRecorded'));
      setReceiptPayment(created);
      await loadData();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSavingPay(false);
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpError(null);
    setSavingExp(true);
    try {
      await apiRequest('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          title: expForm.title,
          category: expForm.category,
          amount: Number(expForm.amount),
          expenseDate: expForm.expenseDate,
          paymentMethod: expForm.paymentMethod,
          notes: expForm.notes,
        }),
      });
      setExpModalOpen(false);
      setMessage(tr('expenseRecorded'));
      await loadData();
    } catch (err) {
      setExpError(err instanceof Error ? err.message : 'Failed to record expense.');
    } finally {
      setSavingExp(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/fees/payments/${deleteTarget._id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deleteExpenseTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/expenses/${deleteExpenseTarget._id}`, { method: 'DELETE' });
      setDeleteExpenseTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expense.');
    } finally {
      setDeleting(false);
    }
  };

  const categoryLabel = (cat: ExpenseCategory) => {
    if (cat === 'Salaries') return tr('catSalaries');
    if (cat === 'Utilities') return tr('catUtilities');
    if (cat === 'Supplies') return tr('catSupplies');
    if (cat === 'Maintenance') return tr('catMaintenance');
    if (cat === 'Rent') return tr('catRent');
    return tr('catOther');
  };

  const handleExportExpenses = () => {
    downloadCsv(
      `school-expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      [tr('expenseDate'), tr('expenseTitle'), tr('expenseCategory'), tr('paymentMethod'), tr('expenseAmount'), tr('recordedBy'), tr('notes')],
      expenses.map((ex) => [
        ex.expenseDate,
        ex.title,
        categoryLabel(ex.category),
        ex.paymentMethod,
        ex.amount,
        ex.recordedByName,
        ex.notes || '',
      ])
    );
  };

  const symbol = settings?.currencySymbol || '$';
  const code = settings?.currencyCode || 'USD';

  return (
    <div className="space-y-4">
      {/* Totals Summary */}
      {tab === 'expenses' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{tr('totalFeesCollected')}</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(expenseSummary.totalCollectedFees, symbol, code)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{tr('totalExpenses')}</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {formatMoney(expenseSummary.totalExpenses, symbol, code)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{tr('netBalance')}</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-[#0F294A] dark:text-blue-400">
              {formatMoney(expenseSummary.remainingBalance, symbol, code)}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{tr('totalFee')}</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums">
              {formatMoney(totals.totalExpected, symbol, code)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{tr('totalFeesCollected')}</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(totals.totalCollected, symbol, code)}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">{tr('outstandingFees')}</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {formatMoney(totals.totalOutstanding, symbol, code)}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar & Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('balances')}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'balances'
                ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {tr('feeBalancesTab')}
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'history'
                ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {tr('paymentHistoryTab')}
          </button>
          <button
            type="button"
            onClick={() => setTab('expenses')}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'expenses'
                ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {tr('expensesTab')}
          </button>

          {tab !== 'expenses' && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">{tr('allClasses')}</option>
              {classes.map((cls) => (
                <option key={cls._id} value={cls._id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}

          {tab === 'balances' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">{tr('all')}</option>
              <option value="Unpaid">{tr('unpaidOnly')}</option>
              <option value="Paid">{tr('paid')}</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tab === 'expenses' ? (
            <>
              <button
                type="button"
                onClick={handleExportExpenses}
                disabled={expenses.length === 0}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>{tr('exportCsv')}</span>
              </button>
              <button
                type="button"
                onClick={openRecordExpense}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('recordExpense')}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openRecordPayment()}
              disabled={summaryRows.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('recordPayment')}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 no-print">
          {error}
        </div>
      )}

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 no-print">
          {message}
        </div>
      )}

      {tab === 'balances' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">{tr('studentId')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('classLabel')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('totalFee')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('paidAmount')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('remainingBalance')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('feeStatus')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {tr('loading')}
                    </td>
                  </tr>
                ) : summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {tr('noData')}
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row) => (
                    <tr key={row.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{row.studentCode}</td>
                      <td className="px-4 py-3 font-medium">{row.fullName}</td>
                      <td className="px-4 py-3">{row.className}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatMoney(row.totalFee, symbol, code)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(row.paidAmount, symbol, code)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {formatMoney(row.remainingBalance, symbol, code)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span
                          className={
                            row.feeStatus === 'Paid'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : row.feeStatus === 'Partial'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {row.feeStatus === 'Paid'
                            ? tr('paid')
                            : row.feeStatus === 'Partial'
                            ? tr('partial')
                            : tr('unpaid')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openRecordPayment(row)}
                          className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                        >
                          {tr('recordPayment')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'history' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">{tr('receiptNumber')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('paymentDate')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('classLabel')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('paymentMethod')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('paymentAmount')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('recordedBy')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {tr('noData')}
                    </td>
                  </tr>
                ) : (
                  payments.map((pay) => (
                    <tr key={pay._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">
                        {pay.receiptNumber}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{pay.paymentDate}</td>
                      <td className="px-4 py-3 font-medium">
                        {pay.studentId?.fullName || '-'}
                      </td>
                      <td className="px-4 py-3">{pay.classId?.name || '-'}</td>
                      <td className="px-4 py-3">{pay.paymentMethod}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {formatMoney(pay.amount, symbol, code)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{pay.recordedByName}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReceiptPayment(pay)}
                            className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                            title={tr('printReceipt')}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(pay)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-950/40"
                              title={tr('delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">{tr('expenseDate')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('expenseTitle')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('expenseCategory')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('paymentMethod')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('expenseAmount')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('recordedBy')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      {tr('noData')}
                    </td>
                  </tr>
                ) : (
                  expenses.map((ex) => (
                    <tr key={ex._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{ex.expenseDate}</td>
                      <td className="px-4 py-3 font-medium">
                        <div>{ex.title}</div>
                        {ex.notes && <div className="text-xs text-slate-500">{ex.notes}</div>}
                      </td>
                      <td className="px-4 py-3">{categoryLabel(ex.category)}</td>
                      <td className="px-4 py-3">{ex.paymentMethod}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-red-600 dark:text-red-400">
                        {formatMoney(ex.amount, symbol, code)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{ex.recordedByName}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteExpenseTarget(ex)}
                          className="p-1.5 rounded-md text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-950/40"
                          title={tr('delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={tr('recordPayment')}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {payError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {payError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('fullName')}
            </label>
            <select
              required
              value={payForm.studentId}
              onChange={(e) => setPayForm({ ...payForm, studentId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              {summaryRows.map((r) => (
                <option key={r.studentId} value={r.studentId}>
                  {r.studentCode} — {r.fullName} ({r.className}) [{tr('remainingBalance')}:{' '}
                  {formatMoney(r.remainingBalance, symbol, code)}]
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('paymentAmount')} ({code})
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('paymentDate')}
              </label>
              <input
                type="date"
                required
                value={payForm.paymentDate}
                onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('paymentMethod')}
            </label>
            <select
              value={payForm.paymentMethod}
              onChange={(e) =>
                setPayForm({ ...payForm, paymentMethod: e.target.value as PaymentMethod })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="Cash">Cash</option>
              <option value="EVC Plus">EVC Plus</option>
              <option value="Zaad">Zaad</option>
              <option value="Sahal">Sahal</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('notes')}
            </label>
            <input
              type="text"
              value={payForm.notes}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPayModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={savingPay}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {savingPay ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Expense Modal */}
      <Modal
        open={expModalOpen}
        onClose={() => setExpModalOpen(false)}
        title={tr('recordExpense')}
      >
        <form onSubmit={handleRecordExpense} className="space-y-4">
          {expError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {expError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('expenseTitle')}
            </label>
            <input
              type="text"
              required
              value={expForm.title}
              onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('expenseCategory')}
              </label>
              <select
                value={expForm.category}
                onChange={(e) =>
                  setExpForm({ ...expForm, category: e.target.value as ExpenseCategory })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Salaries">{tr('catSalaries')}</option>
                <option value="Utilities">{tr('catUtilities')}</option>
                <option value="Supplies">{tr('catSupplies')}</option>
                <option value="Maintenance">{tr('catMaintenance')}</option>
                <option value="Rent">{tr('catRent')}</option>
                <option value="Other">{tr('catOther')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('expenseAmount')} ({code})
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('expenseDate')}
              </label>
              <input
                type="date"
                required
                value={expForm.expenseDate}
                onChange={(e) => setExpForm({ ...expForm, expenseDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('paymentMethod')}
              </label>
              <select
                value={expForm.paymentMethod}
                onChange={(e) =>
                  setExpForm({ ...expForm, paymentMethod: e.target.value as PaymentMethod })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Cash">Cash</option>
                <option value="EVC Plus">EVC Plus</option>
                <option value="Zaad">Zaad</option>
                <option value="Sahal">Sahal</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('notes')}
            </label>
            <input
              type="text"
              value={expForm.notes}
              onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setExpModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={savingExp}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {savingExp ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Printable Official Receipt Modal */}
      <Modal
        open={Boolean(receiptPayment)}
        onClose={() => setReceiptPayment(null)}
        title={tr('paymentReceipt')}
        maxWidthClass="max-w-lg"
      >
        {receiptPayment && (
          <div className="space-y-5 print-container">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <SchoolCrest className="w-10 h-10" logoUrl={settings?.schoolLogoUrl} />
                <div>
                  <div className="font-display font-bold text-base">
                    {settings?.schoolName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {settings?.schoolAddress} · {settings?.schoolPhone}
                  </div>
                  <div className="text-xs font-semibold text-[#0F294A] dark:text-blue-400 mt-1">
                    {tr('paymentReceipt')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-xs font-medium no-print"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{tr('printReceipt')}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">{tr('receiptNumber')}</div>
                <div className="font-mono font-semibold">{receiptPayment.receiptNumber}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('paymentDate')}</div>
                <div className="font-mono">{receiptPayment.paymentDate}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('studentId')}</div>
                <div className="font-mono">{receiptPayment.studentId?.studentId}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('fullName')}</div>
                <div className="font-semibold">{receiptPayment.studentId?.fullName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('classLabel')}</div>
                <div>{receiptPayment.classId?.name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('paymentMethod')}</div>
                <div>{receiptPayment.paymentMethod}</div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-sm font-medium">{tr('paymentAmount')}</span>
              <span className="font-mono text-xl font-bold tabular-nums">
                {formatMoney(receiptPayment.amount, symbol, code)}
              </span>
            </div>

            {receiptPayment.notes && (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{tr('notes')}:</span> {receiptPayment.notes}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <span>
                {tr('recordedBy')}: {receiptPayment.recordedByName}
              </span>
              <span>{tr('dateIssued')}: {new Date().toISOString().slice(0, 10)}</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeletePayment()}
        loading={deleting}
      />

      <ConfirmModal
        open={Boolean(deleteExpenseTarget)}
        onClose={() => setDeleteExpenseTarget(null)}
        onConfirm={() => void handleDeleteExpense()}
        loading={deleting}
      />
    </div>
  );
}
