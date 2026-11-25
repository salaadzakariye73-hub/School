import { Router } from 'express';
import { Expense, type ExpenseCategory } from '../models/Expense.js';
import { FeePayment, type PaymentMethod } from '../models/FeePayment.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles, type AuthRequest } from '../middleware/auth.js';
import { asNumber, asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'accountant'));

const CATEGORIES: ExpenseCategory[] = ['Salaries', 'Utilities', 'Supplies', 'Maintenance', 'Rent', 'Other'];
const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'EVC Plus', 'Zaad', 'Sahal', 'Bank Transfer'];

router.get('/', async (_req, res) => {
  try {
    const [expenses, feeAgg] = await Promise.all([
      Expense.find().sort({ expenseDate: -1, createdAt: -1 }).lean(),
      FeePayment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const totalCollectedFees = Math.round((feeAgg[0]?.total || 0) * 100) / 100;
    const totalExpenses = Math.round(expenses.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
    const remainingBalance = Math.round((totalCollectedFees - totalExpenses) * 100) / 100;

    res.json({
      summary: {
        totalCollectedFees,
        totalExpenses,
        remainingBalance,
      },
      expenses,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load expenses.';
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const title = asString(req.body?.title);
    const category = CATEGORIES.includes(req.body?.category)
      ? (req.body.category as ExpenseCategory)
      : 'Other';
    const amount = asNumber(req.body?.amount, 0);
    const expenseDate = asString(req.body?.expenseDate);
    const paymentMethod = PAYMENT_METHODS.includes(req.body?.paymentMethod)
      ? (req.body.paymentMethod as PaymentMethod)
      : 'Cash';
    const notes = asString(req.body?.notes);

    if (!title || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      res.status(400).json({ error: 'Title, positive amount, and expense date (YYYY-MM-DD) are required.' });
      return;
    }

    const created = await Expense.create({
      title,
      category,
      amount: Math.round(amount * 100) / 100,
      expenseDate,
      paymentMethod,
      notes,
      recordedBy: req.user?._id,
      recordedByName: req.user?.name || 'Staff',
    });

    res.status(201).json(created);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record expense.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid expense ID.' });
      return;
    }

    const deleted = await Expense.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }

    res.json({ message: 'Expense deleted.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete expense.';
    res.status(500).json({ error: message });
  }
});

export default router;
