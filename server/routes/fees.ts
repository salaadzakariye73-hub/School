import { Router } from 'express';
import { FeePayment, type PaymentMethod } from '../models/FeePayment.js';
import { Student } from '../models/Student.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles, type AuthRequest } from '../middleware/auth.js';
import { asNumber, asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'accountant'));

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'EVC Plus', 'Zaad', 'Sahal', 'Bank Transfer'];

router.get('/summary', async (req, res) => {
  try {
    const classId = asString(req.query?.classId);
    const statusFilter = asString(req.query?.status);

    const studentFilter: Record<string, unknown> = { status: 'Active' };
    if (classId && isValidObjectId(classId)) {
      studentFilter.classId = classId;
    }

    const [students, paymentsAgg] = await Promise.all([
      Student.find(studentFilter)
        .populate('classId', 'name tuitionFee academicYear')
        .sort({ fullName: 1 })
        .lean(),
      FeePayment.aggregate([
        { $group: { _id: '$studentId', paidAmount: { $sum: '$amount' }, lastPaymentDate: { $max: '$paymentDate' } } },
      ]),
    ]);

    const paidMap = new Map<string, { paidAmount: number; lastPaymentDate: string }>();
    for (const row of paymentsAgg) {
      paidMap.set(String(row._id), {
        paidAmount: row.paidAmount,
        lastPaymentDate: row.lastPaymentDate,
      });
    }

    let summaryRows = students.map((student) => {
      const cls = student.classId as unknown as { _id?: unknown; name?: string; tuitionFee?: number } | null;
      const totalFee =
        student.customFeeOverride !== null && student.customFeeOverride !== undefined
          ? student.customFeeOverride
          : cls?.tuitionFee || 0;
      const paymentInfo = paidMap.get(String(student._id));
      const paidAmount = paymentInfo?.paidAmount || 0;
      const remainingBalance = Math.max(0, Math.round((totalFee - paidAmount) * 100) / 100);

      let feeStatus: 'Paid' | 'Partial' | 'Unpaid' = 'Unpaid';
      if (totalFee <= 0 || remainingBalance === 0) {
        feeStatus = 'Paid';
      } else if (paidAmount > 0) {
        feeStatus = 'Partial';
      }

      return {
        studentId: String(student._id),
        studentCode: student.studentId,
        fullName: student.fullName,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
        classId: String(cls?._id || student.classId),
        className: cls?.name || '-',
        totalFee,
        paidAmount: Math.round(paidAmount * 100) / 100,
        remainingBalance,
        feeStatus,
        lastPaymentDate: paymentInfo?.lastPaymentDate || null,
      };
    });

    if (statusFilter === 'Unpaid') {
      summaryRows = summaryRows.filter((r) => r.remainingBalance > 0);
    } else if (statusFilter === 'Paid') {
      summaryRows = summaryRows.filter((r) => r.remainingBalance === 0);
    }

    const totals = summaryRows.reduce(
      (acc, r) => {
        acc.totalExpected += r.totalFee;
        acc.totalCollected += r.paidAmount;
        acc.totalOutstanding += r.remainingBalance;
        return acc;
      },
      { totalExpected: 0, totalCollected: 0, totalOutstanding: 0 }
    );

    res.json({
      totals,
      students: summaryRows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load fee summary.';
    res.status(500).json({ error: message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const studentId = asString(req.query?.studentId);
    const classId = asString(req.query?.classId);

    const filter: Record<string, unknown> = {};
    if (studentId && isValidObjectId(studentId)) filter.studentId = studentId;
    if (classId && isValidObjectId(classId)) filter.classId = classId;

    const payments = await FeePayment.find(filter)
      .populate('studentId', 'studentId fullName parentName parentPhone')
      .populate('classId', 'name tuitionFee')
      .sort({ paymentDate: -1, createdAt: -1 });

    res.json(payments);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load payment history.';
    res.status(500).json({ error: message });
  }
});

router.post('/payments', async (req: AuthRequest, res) => {
  try {
    const studentId = asString(req.body?.studentId);
    const amount = asNumber(req.body?.amount, 0);
    const paymentDate = asString(req.body?.paymentDate);
    const paymentMethod = PAYMENT_METHODS.includes(req.body?.paymentMethod)
      ? (req.body.paymentMethod as PaymentMethod)
      : 'Cash';
    const notes = asString(req.body?.notes);

    if (!isValidObjectId(studentId) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      res.status(400).json({ error: 'Valid student, positive amount, and payment date (YYYY-MM-DD) are required.' });
      return;
    }

    const student = await Student.findById(studentId).populate('classId', 'name tuitionFee academicYear');
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const year = paymentDate.slice(0, 4);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const count = await FeePayment.countDocuments();
    const receiptNumber = `RCP-${year}-${String(count + 1).padStart(4, '0')}-${randomSuffix}`;

    const created = await FeePayment.create({
      receiptNumber,
      studentId: student._id,
      classId: student.classId?._id || student.classId,
      academicYear: student.academicYear,
      amount: Math.round(amount * 100) / 100,
      paymentDate,
      paymentMethod,
      notes,
      recordedBy: req.user?._id,
      recordedByName: req.user?.name || 'Staff',
    });

    const populated = await FeePayment.findById(created._id)
      .populate('studentId', 'studentId fullName parentName parentPhone customFeeOverride')
      .populate('classId', 'name tuitionFee');

    res.status(201).json(populated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record payment.';
    res.status(500).json({ error: message });
  }
});

router.delete('/payments/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid payment ID.' });
      return;
    }

    const deleted = await FeePayment.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }

    res.json({ message: 'Payment deleted successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete payment.';
    res.status(500).json({ error: message });
  }
});

export default router;
