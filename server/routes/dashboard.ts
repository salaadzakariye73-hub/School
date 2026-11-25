import { Router } from 'express';
import { Student } from '../models/Student.js';
import { Teacher } from '../models/Teacher.js';
import { Classroom } from '../models/Classroom.js';
import { Attendance } from '../models/Attendance.js';
import { FeePayment } from '../models/FeePayment.js';
import { Expense } from '../models/Expense.js';
import { requireDb } from '../db.js';
import { authenticateJWT, getTeacherAssignedClassIds, requireRoles, type AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'teacher', 'accountant'));

router.get('/', async (req: AuthRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const role = req.user?.role;

    const studentFilter: Record<string, unknown> = { status: 'Active' };
    const classFilter: Record<string, unknown> = {};
    const attendanceFilter: Record<string, unknown> = { date: today };

    if (role === 'teacher' && req.user) {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      studentFilter.classId = { $in: assignedIds };
      classFilter._id = { $in: assignedIds };
      attendanceFilter.classId = { $in: assignedIds };
    }

    const [totalStudents, totalTeachers, totalClasses, todayAttendanceDocs] = await Promise.all([
      Student.countDocuments(studentFilter),
      Teacher.countDocuments({ status: 'Active' }),
      Classroom.countDocuments(classFilter),
      Attendance.find(attendanceFilter).lean(),
    ]);

    let todayPresent = 0;
    let todayMarked = 0;
    for (const doc of todayAttendanceDocs) {
      for (const rec of doc.records) {
        todayMarked += 1;
        if (rec.status === 'Present' || rec.status === 'Late') {
          todayPresent += 1;
        }
      }
    }
    const todayAttendanceRate =
      todayMarked > 0 ? Math.round((todayPresent / todayMarked) * 1000) / 10 : 0;

    // 7-day attendance trend
    const recentDates: string[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      recentDates.push(d.toISOString().slice(0, 10));
    }

    const trendQuery: Record<string, unknown> = { date: { $in: recentDates } };
    if (role === 'teacher' && classFilter._id) {
      trendQuery.classId = classFilter._id;
    }
    const recentDocs = await Attendance.find(trendQuery).lean();

    const attendanceTrend = recentDates.map((dateStr) => {
      const docs = recentDocs.filter((d) => d.date === dateStr);
      let present = 0;
      let total = 0;
      for (const d of docs) {
        for (const r of d.records) {
          total += 1;
          if (r.status === 'Present' || r.status === 'Late') present += 1;
        }
      }
      return {
        date: dateStr,
        label: dateStr.slice(5),
        present,
        total,
        rate: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });

    let totalFeesCollected = 0;
    let outstandingFees = 0;
    let totalExpenses = 0;
    let netBalance = 0;
    let feeByClass: Array<{ className: string; collected: number; outstanding: number }> = [];

    if (role === 'admin' || role === 'accountant') {
      const [activeStudents, payments, expenses] = await Promise.all([
        Student.find({ status: 'Active' }).populate('classId', 'name tuitionFee').lean(),
        FeePayment.find().lean(),
        Expense.find().lean(),
      ]);

      totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

      const paidByStudent = new Map<string, number>();
      for (const p of payments) {
        const sid = String(p.studentId);
        paidByStudent.set(sid, (paidByStudent.get(sid) || 0) + p.amount);
        totalFeesCollected += p.amount;
      }

      netBalance = totalFeesCollected - totalExpenses;

      const classMap = new Map<string, { className: string; collected: number; outstanding: number }>();
      for (const s of activeStudents) {
        const cls = s.classId as unknown as { _id?: unknown; name?: string; tuitionFee?: number } | null;
        const cName = cls?.name || 'Unassigned';
        const cKey = String(cls?._id || cName);
        const totalFee =
          s.customFeeOverride !== null && s.customFeeOverride !== undefined
            ? s.customFeeOverride
            : cls?.tuitionFee || 0;
        const paid = paidByStudent.get(String(s._id)) || 0;
        const bal = Math.max(0, totalFee - paid);
        outstandingFees += bal;

        const existing = classMap.get(cKey) || { className: cName, collected: 0, outstanding: 0 };
        existing.collected += paid;
        existing.outstanding += bal;
        classMap.set(cKey, existing);
      }

      feeByClass = Array.from(classMap.values()).sort((a, b) => a.className.localeCompare(b.className));
    }

    res.json({
      totalStudents,
      totalTeachers,
      totalClasses,
      todayAttendanceRate,
      todayPresent,
      todayMarked,
      totalFeesCollected: Math.round(totalFeesCollected * 100) / 100,
      outstandingFees: Math.round(outstandingFees * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100,
      attendanceTrend,
      feeByClass,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard metrics.';
    res.status(500).json({ error: message });
  }
});

export default router;
