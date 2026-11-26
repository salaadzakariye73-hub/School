import { Router } from 'express';
import { Student } from '../models/Student.js';
import { Attendance } from '../models/Attendance.js';
import { ExamResult } from '../models/ExamResult.js';
import { FeePayment } from '../models/FeePayment.js';
import { Homework } from '../models/Homework.js';
import { Announcement } from '../models/Announcement.js';
import { Classroom } from '../models/Classroom.js';
import { Timetable } from '../models/Timetable.js';
import '../models/Examination.js';
import { ExamSchedule } from '../models/ExamSchedule.js';
import { getOrCreateSettings, type IGradeRule } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles, type AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('parent'));

function resolveGrade(percentage: number, scale: IGradeRule[]): IGradeRule {
  const sorted = [...scale].sort((a, b) => b.minPercent - a.minPercent);
  return (
    sorted.find((rule) => percentage >= rule.minPercent) ||
    sorted[sorted.length - 1] || {
      grade: 'F',
      minPercent: 0,
      remarkEn: 'Fail',
      remarkSo: 'Dhacay',
    }
  );
}

router.get('/overview', async (req: AuthRequest, res) => {
  try {
    const childIds = Array.isArray(req.user?.childrenRefs) ? req.user.childrenRefs : [];
    const settings = await getOrCreateSettings();

    if (childIds.length === 0) {
      const announcements = await Announcement.find({
        targetRole: { $in: ['all', 'parent'] },
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      res.json({
        settings,
        children: [],
        announcements,
      });
      return;
    }

    const childrenDocs = await Student.find({ _id: { $in: childIds } }).sort({ fullName: 1 }).lean();
    const classIds = Array.from(new Set(childrenDocs.map((c) => String(c.classId))));

    const [classrooms, announcements] = await Promise.all([
      Classroom.find({ _id: { $in: classIds } })
        .populate('classTeacherId', 'fullName phone email')
        .lean(),
      Announcement.find({
        $or: [
          { targetRole: { $in: ['all', 'parent'] } },
          { targetRole: 'class', targetClassId: { $in: classIds } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
    ]);

    const classMap = new Map(classrooms.map((c) => [String(c._id), c]));

    const children = await Promise.all(
      childrenDocs.map(async (student) => {
        const classroom = classMap.get(String(student.classId)) || null;

        const [attendanceDocs, examDocs, payments, homeworkList, timetableSlots, examSchedules] =
          await Promise.all([
            Attendance.find({ 'records.studentId': student._id }).sort({ date: -1 }).lean(),
            ExamResult.find({ classId: student.classId }).sort({ examName: 1, subject: 1 }).lean(),
            FeePayment.find({ studentId: student._id }).sort({ paymentDate: -1 }).lean(),
            Homework.find({ classId: student.classId }).sort({ dueDate: -1, createdAt: -1 }).lean(),
            Timetable.find({ classId: student.classId })
              .populate('teacherId', 'fullName')
              .sort({ periodNumber: 1 })
              .lean(),
            ExamSchedule.find({ classId: student.classId })
              .populate('examinationId', 'name academicYear term startDate endDate status')
              .populate('invigilatorId', 'teacherId fullName')
              .sort({ examDate: 1, startTime: 1 })
              .lean(),
          ]);

        const attendanceSummary = { Present: 0, Absent: 0, Late: 0, Excused: 0, total: 0, rate: 0 };
        const attendanceRecords: Array<{ date: string; status: string; note: string }> = [];
        for (const doc of attendanceDocs) {
          const rec = doc.records.find((r) => String(r.studentId) === String(student._id));
          if (rec) {
            attendanceSummary[rec.status] += 1;
            attendanceSummary.total += 1;
            attendanceRecords.push({ date: doc.date, status: rec.status, note: rec.note || '' });
          }
        }
        attendanceSummary.rate =
          attendanceSummary.total > 0
            ? Math.round(
                ((attendanceSummary.Present + attendanceSummary.Late) / attendanceSummary.total) *
                  1000
              ) / 10
            : 0;

        const examGroups = new Map<
          string,
          Array<{
            subject: string;
            score: number;
            maxMarks: number;
            percentage: number;
            grade: string;
            remarkEn: string;
            remarkSo: string;
          }>
        >();
        for (const doc of examDocs) {
          const mark = doc.marks.find((m) => String(m.studentId) === String(student._id));
          if (!mark) continue;
          const pct = doc.maxMarks > 0 ? Math.round((mark.score / doc.maxMarks) * 1000) / 10 : 0;
          const gradeInfo = resolveGrade(pct, settings.gradingScale);
          const list = examGroups.get(doc.examName) || [];
          list.push({
            subject: doc.subject,
            score: mark.score,
            maxMarks: doc.maxMarks,
            percentage: pct,
            grade: gradeInfo.grade,
            remarkEn: gradeInfo.remarkEn,
            remarkSo: gradeInfo.remarkSo,
          });
          examGroups.set(doc.examName, list);
        }

        const reportCards = Array.from(examGroups.entries()).map(([examName, subjects]) => {
          const totalScore = subjects.reduce((sum, s) => sum + s.score, 0);
          const totalPossible = subjects.reduce((sum, s) => sum + s.maxMarks, 0);
          const average = subjects.length > 0 ? Math.round((totalScore / subjects.length) * 10) / 10 : 0;
          const percentage = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0;
          const overallGrade = resolveGrade(percentage, settings.gradingScale);
          return {
            examName,
            subjects,
            summary: {
              totalScore,
              totalPossible,
              average,
              percentage,
              grade: overallGrade.grade,
              remarkEn: overallGrade.remarkEn,
              remarkSo: overallGrade.remarkSo,
            },
          };
        });

        const totalFee =
          student.customFeeOverride !== null && student.customFeeOverride !== undefined
            ? student.customFeeOverride
            : classroom?.tuitionFee || 0;
        const paidAmount = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
        const remainingBalance = Math.max(0, Math.round((totalFee - paidAmount) * 100) / 100);
        const feeStatus =
          totalFee <= 0 || remainingBalance === 0
            ? 'Paid'
            : paidAmount > 0
            ? 'Partial'
            : 'Unpaid';

        return {
          student,
          classroom,
          attendanceSummary,
          attendanceRecords,
          reportCards,
          feeSummary: {
            totalFee,
            paidAmount,
            remainingBalance,
            feeStatus,
            payments,
          },
          homework: homeworkList,
          timetable: timetableSlots,
          examSchedules,
        };
      })
    );

    res.json({
      settings,
      children,
      announcements,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load parent portal.';
    res.status(500).json({ error: message });
  }
});

export default router;
