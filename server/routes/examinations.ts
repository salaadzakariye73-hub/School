import { Router } from 'express';
import mongoose from 'mongoose';
import { Examination, type ExaminationStatus } from '../models/Examination.js';
import { ExamSchedule } from '../models/ExamSchedule.js';
import { Classroom } from '../models/Classroom.js';
import { Teacher } from '../models/Teacher.js';
import { Student } from '../models/Student.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asNumber, asString, isValidObjectId } from '../utils/sanitize.js';
import {
  computeInclusiveDays,
  isValidYmd,
  validateExamScheduleBatch,
  type ExistingScheduleSnapshot,
  type ScheduleInputRow,
} from '../utils/examScheduleValidator.js';

const router = Router();
router.use(requireDb, authenticateJWT);

const ALLOWED_EXAM_STATUSES: ExaminationStatus[] = ['Upcoming', 'Ongoing', 'Completed'];

async function loadScheduleValidationContext(excludeExaminationId?: string) {
  const [classes, teachers, otherSchedules] = await Promise.all([
    Classroom.find({}, 'name subjects academicYear').lean(),
    Teacher.find({}, 'fullName teacherId status').lean(),
    ExamSchedule.find(
      excludeExaminationId ? { examinationId: { $ne: excludeExaminationId } } : {}
    )
      .populate('examinationId', 'name')
      .populate('classId', 'name')
      .populate('invigilatorId', 'fullName')
      .lean(),
  ]);

  const classMap = new Map<string, { _id: string; name: string; subjects: string[] }>();
  for (const c of classes) {
    classMap.set(String(c._id), {
      _id: String(c._id),
      name: c.name,
      subjects: c.subjects || [],
    });
  }

  const teacherMap = new Map<string, { _id: string; fullName: string }>();
  for (const t of teachers) {
    teacherMap.set(String(t._id), {
      _id: String(t._id),
      fullName: t.fullName,
    });
  }

  const otherExamSchedules: ExistingScheduleSnapshot[] = otherSchedules.map((sc) => {
    const ex = sc.examinationId as unknown as { _id?: string; name?: string } | null;
    const cls = sc.classId as unknown as { _id?: string; name?: string } | null;
    const inv = sc.invigilatorId as unknown as { _id?: string; fullName?: string } | null;
    return {
      _id: String(sc._id),
      examinationId: String(ex?._id || sc.examinationId),
      examinationName: ex?.name || 'Other Exam',
      classId: String(cls?._id || sc.classId),
      className: cls?.name || 'Class',
      examDate: sc.examDate,
      startTime: sc.startTime,
      endTime: sc.endTime,
      subject: sc.subject,
      invigilatorId: String(inv?._id || sc.invigilatorId),
      invigilatorName: inv?.fullName || 'Teacher',
      room: sc.room,
    };
  });

  return { classMap, teacherMap, otherExamSchedules };
}

// List examinations & Examination Management Dashboard stats
router.get('/', requireRoles('admin', 'teacher', 'student'), async (_req: AuthRequest, res) => {
  try {
    const [examinations, allSchedules] = await Promise.all([
      Examination.find().sort({ startDate: -1, createdAt: -1 }).lean(),
      ExamSchedule.find({}, 'examinationId classId subject invigilatorId').lean(),
    ]);

    const classSet = new Set<string>();
    const subjectSet = new Set<string>();
    const invigilatorSet = new Set<string>();
    const scheduleCountByExam = new Map<string, number>();

    for (const sc of allSchedules) {
      classSet.add(String(sc.classId));
      subjectSet.add(sc.subject.trim().toLowerCase());
      invigilatorSet.add(String(sc.invigilatorId));
      const exId = String(sc.examinationId);
      scheduleCountByExam.set(exId, (scheduleCountByExam.get(exId) || 0) + 1);
    }

    const enrichedExams = examinations.map((ex) => ({
      ...ex,
      scheduleCount: scheduleCountByExam.get(String(ex._id)) || 0,
    }));

    const dashboard = {
      totalExaminations: examinations.length,
      upcomingExaminations: examinations.filter((e) => e.status === 'Upcoming').length,
      ongoingExaminations: examinations.filter((e) => e.status === 'Ongoing').length,
      completedExaminations: examinations.filter((e) => e.status === 'Completed').length,
      totalScheduledClasses: classSet.size,
      totalScheduledSubjects: subjectSet.size,
      totalAssignedInvigilators: invigilatorSet.size,
    };

    res.json({ examinations: enrichedExams, dashboard });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load examinations.';
    res.status(500).json({ error: message });
  }
});

// Get timetable schedules with role-based scoping and filters
router.get('/schedules', requireRoles('admin', 'teacher', 'student'), async (req: AuthRequest, res) => {
  try {
    const examinationId = asString(req.query?.examinationId);
    const classId = asString(req.query?.classId);
    const subject = asString(req.query?.subject);
    const teacherId = asString(req.query?.teacherId);
    const examDate = asString(req.query?.examDate);

    const filter: Record<string, unknown> = {};
    if (examinationId && isValidObjectId(examinationId)) {
      filter.examinationId = examinationId;
    }
    if (subject) {
      filter.subject = subject;
    }
    if (examDate && isValidYmd(examDate)) {
      filter.examDate = examDate;
    }

    if (req.user?.role === 'student') {
      let student = req.user.studentRef
        ? await Student.findById(req.user.studentRef).lean()
        : null;
      if (!student && req.user.username) {
        student = await Student.findOne({
          studentId: new RegExp(`^${req.user.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        }).lean();
      }
      if (!student) {
        res.json([]);
        return;
      }
      filter.classId = student.classId;
    } else if (req.user?.role === 'teacher') {
      const assignedClassIds = await getTeacherAssignedClassIds(req.user);
      const teacherDoc = req.user.teacherRef
        ? await Teacher.findById(req.user.teacherRef).lean()
        : req.user.email
        ? await Teacher.findOne({ email: req.user.email.toLowerCase() }).lean()
        : null;

      const orFilters: Array<Record<string, unknown>> = [];
      if (teacherDoc) {
        orFilters.push({ invigilatorId: teacherDoc._id });
      }
      if (assignedClassIds.length > 0) {
        orFilters.push({ classId: { $in: assignedClassIds } });
      }
      if (orFilters.length === 0) {
        res.json([]);
        return;
      }
      filter.$or = orFilters;
      if (classId && isValidObjectId(classId)) {
        filter.classId = classId;
      }
      if (teacherId && isValidObjectId(teacherId)) {
        filter.invigilatorId = teacherId;
      }
    } else {
      if (classId && isValidObjectId(classId)) {
        filter.classId = classId;
      }
      if (teacherId && isValidObjectId(teacherId)) {
        filter.invigilatorId = teacherId;
      }
    }

    const schedules = await ExamSchedule.find(filter)
      .populate('examinationId', 'name academicYear term startDate endDate status')
      .populate('classId', 'name academicYear')
      .populate('invigilatorId', 'teacherId fullName phone')
      .sort({ examDate: 1, startTime: 1 })
      .lean();

    res.json(schedules);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load examination timetable.';
    res.status(500).json({ error: message });
  }
});

// Create New Examination (Admin only)
router.post('/', requireRoles('admin'), async (req: AuthRequest, res) => {
  try {
    const name = asString(req.body?.name);
    const academicYear = asString(req.body?.academicYear);
    const term = asString(req.body?.term);
    const startDate = asString(req.body?.startDate);
    const endDate = asString(req.body?.endDate);
    const description = asString(req.body?.description);
    const status = ALLOWED_EXAM_STATUSES.includes(req.body?.status)
      ? (req.body.status as ExaminationStatus)
      : 'Upcoming';

    if (!name || !academicYear || !term || !isValidYmd(startDate) || !isValidYmd(endDate)) {
      res.status(400).json({
        error: 'Examination name, academic year, term, and valid start/end dates are required.',
      });
      return;
    }

    if (endDate < startDate) {
      res.status(400).json({ error: 'Examination end date cannot be before start date.' });
      return;
    }

    const computedDays = computeInclusiveDays(startDate, endDate);
    const totalDays = Math.max(1, Math.round(asNumber(req.body?.totalDays, computedDays)));

    const created = await Examination.create({
      name,
      academicYear,
      term,
      startDate,
      endDate,
      totalDays,
      description,
      status,
      createdBy: req.user?._id || null,
    });

    res.status(201).json(created);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({
        error: 'An examination with this name already exists for this academic year and term.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create examination.';
    res.status(500).json({ error: message });
  }
});

// Update Examination (Admin only)
router.put('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid examination ID.' });
      return;
    }

    const exam = await Examination.findById(id);
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const name = asString(req.body?.name);
    const academicYear = asString(req.body?.academicYear);
    const term = asString(req.body?.term);
    const startDate = asString(req.body?.startDate);
    const endDate = asString(req.body?.endDate);
    const description = asString(req.body?.description);
    const status = ALLOWED_EXAM_STATUSES.includes(req.body?.status)
      ? (req.body.status as ExaminationStatus)
      : exam.status;

    if (!name || !academicYear || !term || !isValidYmd(startDate) || !isValidYmd(endDate)) {
      res.status(400).json({
        error: 'Examination name, academic year, term, and valid start/end dates are required.',
      });
      return;
    }

    if (endDate < startDate) {
      res.status(400).json({ error: 'Examination end date cannot be before start date.' });
      return;
    }

    // Check existing schedules remain inside the updated date range
    const outOfRange = await ExamSchedule.findOne({
      examinationId: exam._id,
      $or: [{ examDate: { $lt: startDate } }, { examDate: { $gt: endDate } }],
    }).lean();
    if (outOfRange) {
      res.status(400).json({
        error: `Cannot shrink date range: timetable row on ${outOfRange.examDate} (${outOfRange.subject}) would fall outside the examination period.`,
      });
      return;
    }

    const computedDays = computeInclusiveDays(startDate, endDate);
    const totalDays = Math.max(1, Math.round(asNumber(req.body?.totalDays, computedDays)));

    exam.name = name;
    exam.academicYear = academicYear;
    exam.term = term;
    exam.startDate = startDate;
    exam.endDate = endDate;
    exam.totalDays = totalDays;
    exam.description = description;
    exam.status = status;

    await exam.save();
    res.json(exam);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({
        error: 'An examination with this name already exists for this academic year and term.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to update examination.';
    res.status(500).json({ error: message });
  }
});

// Delete Examination & its timetable rows (Admin only)
router.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid examination ID.' });
      return;
    }

    const deleted = await Examination.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    await ExamSchedule.deleteMany({ examinationId: id });
    res.json({ message: 'Examination and its timetable schedules deleted.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete examination.';
    res.status(500).json({ error: message });
  }
});

function sanitizeScheduleInputRows(rawRows: unknown): ScheduleInputRow[] {
  if (!Array.isArray(rawRows)) return [];
  return rawRows.map((item) => {
    const r = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      _id: isValidObjectId(r._id) ? String(r._id) : undefined,
      classId: asString(r.classId),
      examDate: asString(r.examDate),
      subject: asString(r.subject),
      startTime: asString(r.startTime),
      endTime: asString(r.endTime),
      invigilatorId: asString(r.invigilatorId),
      room: asString(r.room),
      notes: asString(r.notes),
    };
  });
}

// Validate candidate timetable rows without saving (live conflict check)
router.post('/:id/schedules/validate', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid examination ID.' });
      return;
    }

    const exam = await Examination.findById(id).lean();
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const rows = sanitizeScheduleInputRows(req.body?.rows);
    const ctx = await loadScheduleValidationContext(id);

    const result = validateExamScheduleBatch({
      examination: {
        _id: String(exam._id),
        name: exam.name,
        startDate: exam.startDate,
        endDate: exam.endDate,
      },
      rows,
      classMap: ctx.classMap,
      teacherMap: ctx.teacherMap,
      otherExamSchedules: ctx.otherExamSchedules,
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to validate timetable rows.';
    res.status(500).json({ error: message });
  }
});

// Save complete timetable for an Examination (Admin only)
router.put('/:id/schedules', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid examination ID.' });
      return;
    }

    const exam = await Examination.findById(id).lean();
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const rows = sanitizeScheduleInputRows(req.body?.rows);
    const ctx = await loadScheduleValidationContext(id);

    const validation = validateExamScheduleBatch({
      examination: {
        _id: String(exam._id),
        name: exam.name,
        startDate: exam.startDate,
        endDate: exam.endDate,
      },
      rows,
      classMap: ctx.classMap,
      teacherMap: ctx.teacherMap,
      otherExamSchedules: ctx.otherExamSchedules,
    });

    if (!validation.valid) {
      res.status(400).json({
        error: 'Timetable validation failed. Please resolve the highlighted conflicts.',
        rowErrors: validation.rowErrors,
      });
      return;
    }

    const docsToInsert = validation.normalizedRows.map((nr) => ({
      examinationId: new mongoose.Types.ObjectId(id),
      classId: new mongoose.Types.ObjectId(nr.classId),
      subject: nr.subject,
      examDate: nr.examDate,
      dayOfWeek: nr.dayOfWeek,
      startTime: nr.startTime,
      endTime: nr.endTime,
      durationMinutes: nr.durationMinutes,
      invigilatorId: new mongoose.Types.ObjectId(nr.invigilatorId),
      room: nr.room,
      notes: nr.notes,
    }));

    let txUnsupported = false;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ExamSchedule.deleteMany({ examinationId: id }, { session });
        if (docsToInsert.length > 0) {
          await ExamSchedule.insertMany(docsToInsert, { session, ordered: true });
        }
      });
    } catch (txErr: unknown) {
      const msg = txErr instanceof Error ? txErr.message : '';
      const code =
        typeof txErr === 'object' && txErr !== null && 'code' in txErr
          ? Number((txErr as { code: unknown }).code)
          : 0;
      if (code === 20 || msg.includes('Transaction numbers are only allowed')) {
        txUnsupported = true;
      } else {
        throw txErr;
      }
    } finally {
      await session.endSession();
    }

    if (txUnsupported) {
      await ExamSchedule.deleteMany({ examinationId: id });
      if (docsToInsert.length > 0) {
        await ExamSchedule.insertMany(docsToInsert, { ordered: true });
      }
    }

    const savedSchedules = await ExamSchedule.find({ examinationId: id })
      .populate('examinationId', 'name academicYear term startDate endDate status')
      .populate('classId', 'name academicYear')
      .populate('invigilatorId', 'teacherId fullName phone')
      .sort({ examDate: 1, startTime: 1 })
      .lean();

    res.json({
      message: 'Examination timetable saved successfully.',
      schedules: savedSchedules,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save examination timetable.';
    res.status(500).json({ error: message });
  }
});

// Delete single timetable row (Admin only)
router.delete('/schedules/:scheduleId', requireRoles('admin'), async (req, res) => {
  try {
    const scheduleId = req.params.scheduleId;
    if (!isValidObjectId(scheduleId)) {
      res.status(400).json({ error: 'Invalid timetable row ID.' });
      return;
    }

    const deleted = await ExamSchedule.findByIdAndDelete(scheduleId);
    if (!deleted) {
      res.status(404).json({ error: 'Timetable row not found.' });
      return;
    }

    res.json({ message: 'Timetable row deleted.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete timetable row.';
    res.status(500).json({ error: message });
  }
});

export default router;
