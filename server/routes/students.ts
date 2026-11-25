import { Router } from 'express';
import { Student, type StudentStatus } from '../models/Student.js';
import { Classroom } from '../models/Classroom.js';
import { Attendance } from '../models/Attendance.js';
import { ExamResult } from '../models/ExamResult.js';
import { FeePayment } from '../models/FeePayment.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asNumber, asString, escapeRegex, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'teacher', 'accountant'));

const ALLOWED_STATUSES: StudentStatus[] = ['Active', 'Inactive', 'Graduated', 'Transferred'];

router.get('/', async (req: AuthRequest, res) => {
  try {
    const search = asString(req.query?.search);
    const classId = asString(req.query?.classId);
    const status = asString(req.query?.status);

    const filter: Record<string, unknown> = {};

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (classId) {
        if (!assignedIds.includes(classId)) {
          res.json([]);
          return;
        }
        filter.classId = classId;
      } else {
        filter.classId = { $in: assignedIds };
      }
    } else if (classId && isValidObjectId(classId)) {
      filter.classId = classId;
    }

    if (status && ALLOWED_STATUSES.includes(status as StudentStatus)) {
      filter.status = status;
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { fullName: regex },
        { studentId: regex },
        { parentName: regex },
        { parentPhone: regex },
      ];
    }

    const students = await Student.find(filter)
      .populate('classId', 'name academicYear tuitionFee')
      .sort({ fullName: 1 });

    res.json(students);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load students.';
    res.status(500).json({ error: message });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }

    const student = await Student.findById(id).populate('classId', 'name academicYear tuitionFee subjects');
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      const stuClassId = String(student.classId?._id || student.classId);
      if (!assignedIds.includes(stuClassId)) {
        res.status(403).json({ error: 'You do not have access to this student.' });
        return;
      }
    }

    const attendanceDocs = await Attendance.find({ 'records.studentId': student._id }).lean();
    const attendanceSummary = { Present: 0, Absent: 0, Late: 0, Excused: 0, total: 0 };
    for (const doc of attendanceDocs) {
      const rec = doc.records.find((r) => String(r.studentId) === String(student._id));
      if (rec) {
        attendanceSummary[rec.status] += 1;
        attendanceSummary.total += 1;
      }
    }

    const examDocs = await ExamResult.find({ 'marks.studentId': student._id })
      .sort({ updatedAt: -1 })
      .lean();
    const settings = await getOrCreateSettings();

    const examHistory = examDocs.map((doc) => {
      const entry = doc.marks.find((m) => String(m.studentId) === String(student._id));
      const score = entry ? entry.score : 0;
      const pct = doc.maxMarks > 0 ? Math.round((score / doc.maxMarks) * 1000) / 10 : 0;
      const gradeRule =
        settings.gradingScale.find((g) => pct >= g.minPercent) ||
        settings.gradingScale[settings.gradingScale.length - 1];
      return {
        examName: doc.examName,
        subject: doc.subject,
        score,
        maxMarks: doc.maxMarks,
        percentage: pct,
        grade: gradeRule?.grade || '-',
      };
    });

    let feeSummary = null;
    if (req.user?.role === 'admin' || req.user?.role === 'accountant') {
      const payments = await FeePayment.find({ studentId: student._id }).sort({ paymentDate: -1 }).lean();
      const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
      const populatedClass = student.classId as unknown as { tuitionFee?: number } | null;
      const totalFee =
        student.customFeeOverride !== null && student.customFeeOverride !== undefined
          ? student.customFeeOverride
          : populatedClass?.tuitionFee || 0;
      feeSummary = {
        totalFee,
        paidAmount,
        remainingBalance: Math.max(0, totalFee - paidAmount),
        payments,
      };
    }

    res.json({
      student,
      attendanceSummary,
      examHistory,
      feeSummary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load student profile.';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireRoles('admin'), async (req, res) => {
  try {
    const studentId = asString(req.body?.studentId);
    const fullName = asString(req.body?.fullName);
    const gender = req.body?.gender === 'Female' ? 'Female' : req.body?.gender === 'Male' ? 'Male' : null;
    const dateOfBirth = asString(req.body?.dateOfBirth);
    const parentName = asString(req.body?.parentName);
    const parentPhone = asString(req.body?.parentPhone);
    const address = asString(req.body?.address);
    const classId = asString(req.body?.classId);
    const academicYear = asString(req.body?.academicYear);
    const admissionDate = asString(req.body?.admissionDate);
    const status = ALLOWED_STATUSES.includes(req.body?.status) ? (req.body.status as StudentStatus) : 'Active';
    const customFeeOverride =
      req.body?.customFeeOverride !== null && req.body?.customFeeOverride !== '' && req.body?.customFeeOverride !== undefined
        ? asNumber(req.body.customFeeOverride, 0)
        : null;
    const rawPhoto = asString(req.body?.photoUrl);
    const photoUrl =
      rawPhoto.startsWith('data:image/') || rawPhoto.startsWith('https://') ? rawPhoto : '';

    if (!studentId || !fullName || !gender || !dateOfBirth || !parentName || !parentPhone || !classId || !academicYear || !admissionDate) {
      res.status(400).json({ error: 'All student fields are required.' });
      return;
    }

    if (!isValidObjectId(classId)) {
      res.status(400).json({ error: 'Invalid class selected.' });
      return;
    }

    const classroom = await Classroom.findById(classId);
    if (!classroom) {
      res.status(404).json({ error: 'Selected class does not exist.' });
      return;
    }

    const created = await Student.create({
      studentId,
      fullName,
      gender,
      dateOfBirth,
      parentName,
      parentPhone,
      address,
      classId,
      academicYear,
      admissionDate,
      status,
      customFeeOverride,
      photoUrl,
    });

    const populated = await Student.findById(created._id).populate('classId', 'name academicYear tuitionFee');
    res.status(201).json(populated);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ error: 'A student with this Student ID already exists.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create student.';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }

    const student = await Student.findById(id);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const studentId = asString(req.body?.studentId);
    const fullName = asString(req.body?.fullName);
    const gender = req.body?.gender === 'Female' ? 'Female' : req.body?.gender === 'Male' ? 'Male' : null;
    const dateOfBirth = asString(req.body?.dateOfBirth);
    const parentName = asString(req.body?.parentName);
    const parentPhone = asString(req.body?.parentPhone);
    const address = req.body?.address !== undefined ? asString(req.body?.address) : student.address || '';
    const classId = asString(req.body?.classId);
    const academicYear = asString(req.body?.academicYear);
    const admissionDate = asString(req.body?.admissionDate);
    const status = ALLOWED_STATUSES.includes(req.body?.status) ? (req.body.status as StudentStatus) : student.status;
    const customFeeOverride =
      req.body?.customFeeOverride !== null && req.body?.customFeeOverride !== '' && req.body?.customFeeOverride !== undefined
        ? asNumber(req.body.customFeeOverride, 0)
        : null;
    const rawPhoto = req.body?.photoUrl !== undefined ? asString(req.body.photoUrl) : student.photoUrl || '';
    const photoUrl =
      rawPhoto.startsWith('data:image/') || rawPhoto.startsWith('https://') ? rawPhoto : '';

    if (!studentId || !fullName || !gender || !dateOfBirth || !parentName || !parentPhone || !classId || !academicYear || !admissionDate) {
      res.status(400).json({ error: 'All student fields are required.' });
      return;
    }

    if (!isValidObjectId(classId)) {
      res.status(400).json({ error: 'Invalid class selected.' });
      return;
    }

    student.studentId = studentId;
    student.fullName = fullName;
    student.gender = gender;
    student.dateOfBirth = dateOfBirth;
    student.parentName = parentName;
    student.parentPhone = parentPhone;
    student.address = address;
    student.classId = classId as unknown as typeof student.classId;
    student.academicYear = academicYear;
    student.admissionDate = admissionDate;
    student.status = status;
    student.customFeeOverride = customFeeOverride;
    student.photoUrl = photoUrl;

    await student.save();
    const populated = await Student.findById(student._id).populate('classId', 'name academicYear tuitionFee');
    res.json(populated);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ error: 'A student with this Student ID already exists.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to update student.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }

    const deleted = await Student.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    res.json({ message: 'Student deleted successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete student.';
    res.status(500).json({ error: message });
  }
});

export default router;
