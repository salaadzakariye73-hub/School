import { Router } from 'express';
import { Attendance, type AttendanceStatus } from '../models/Attendance.js';
import { Student } from '../models/Student.js';
import { Classroom } from '../models/Classroom.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'teacher'));

const VALID_STATUSES: AttendanceStatus[] = ['Present', 'Absent', 'Late', 'Excused'];

router.get('/', async (req: AuthRequest, res) => {
  try {
    const classId = asString(req.query?.classId);
    const date = asString(req.query?.date);

    if (!isValidObjectId(classId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Valid classId and date (YYYY-MM-DD) are required.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(classId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    const students = await Student.find({ classId, status: 'Active' })
      .select('studentId fullName gender')
      .sort({ fullName: 1 })
      .lean();

    const doc = await Attendance.findOne({ classId, date }).lean();
    const recordMap = new Map<string, { status: AttendanceStatus; note: string }>();
    if (doc) {
      for (const r of doc.records) {
        recordMap.set(String(r.studentId), { status: r.status, note: r.note || '' });
      }
    }

    const rows = students.map((s) => {
      const existing = recordMap.get(String(s._id));
      return {
        studentId: String(s._id),
        studentCode: s.studentId,
        fullName: s.fullName,
        status: existing?.status || 'Present',
        note: existing?.note || '',
      };
    });

    res.json({
      classId,
      date,
      alreadySaved: Boolean(doc),
      records: rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load attendance.';
    res.status(500).json({ error: message });
  }
});

router.put('/', async (req: AuthRequest, res) => {
  try {
    const classId = asString(req.body?.classId);
    const date = asString(req.body?.date);
    const rawRecords = Array.isArray(req.body?.records) ? req.body.records : [];

    if (!isValidObjectId(classId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Valid classId and date (YYYY-MM-DD) are required.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(classId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    const classroom = await Classroom.findById(classId);
    if (!classroom) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    const cleanedRecords: Array<{ studentId: string; status: AttendanceStatus; note: string }> = [];
    for (const item of rawRecords) {
      const sid = asString(item?.studentId);
      const status = asString(item?.status) as AttendanceStatus;
      const note = asString(item?.note);
      if (isValidObjectId(sid) && VALID_STATUSES.includes(status)) {
        cleanedRecords.push({ studentId: sid, status, note });
      }
    }

    const saved = await Attendance.findOneAndUpdate(
      { classId, date },
      {
        classId,
        date,
        records: cleanedRecords,
        recordedBy: req.user?._id,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json(saved);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save attendance.';
    res.status(500).json({ error: message });
  }
});

router.get('/report', async (req: AuthRequest, res) => {
  try {
    const mode = req.query?.mode === 'daily' ? 'daily' : 'monthly';
    const classId = asString(req.query?.classId);
    const date = asString(req.query?.date);
    const month = asString(req.query?.month);

    const filter: Record<string, unknown> = {};

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (classId) {
        if (!assignedIds.includes(classId)) {
          res.status(403).json({ error: 'You are not assigned to this class.' });
          return;
        }
        filter.classId = classId;
      } else {
        filter.classId = { $in: assignedIds };
      }
    } else if (classId && isValidObjectId(classId)) {
      filter.classId = classId;
    }

    if (mode === 'daily') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required for daily report.' });
        return;
      }
      filter.date = date;
    } else {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        res.status(400).json({ error: 'Valid month (YYYY-MM) is required for monthly report.' });
        return;
      }
      filter.date = { $regex: `^${month}` };
    }

    const attendanceDocs = await Attendance.find(filter)
      .populate('classId', 'name')
      .sort({ date: -1 })
      .lean();

    const studentFilter: Record<string, unknown> = {};
    if (filter.classId) {
      studentFilter.classId = filter.classId;
    }

    const students = await Student.find(studentFilter)
      .populate('classId', 'name')
      .sort({ fullName: 1 })
      .lean();

    const studentStats = new Map<
      string,
      {
        studentId: string;
        studentCode: string;
        fullName: string;
        className: string;
        Present: number;
        Absent: number;
        Late: number;
        Excused: number;
        totalDays: number;
      }
    >();

    for (const s of students) {
      const cls = s.classId as unknown as { name?: string } | null;
      studentStats.set(String(s._id), {
        studentId: String(s._id),
        studentCode: s.studentId,
        fullName: s.fullName,
        className: cls?.name || '-',
        Present: 0,
        Absent: 0,
        Late: 0,
        Excused: 0,
        totalDays: 0,
      });
    }

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalExcused = 0;

    for (const doc of attendanceDocs) {
      for (const rec of doc.records) {
        const entry = studentStats.get(String(rec.studentId));
        if (entry) {
          entry[rec.status] += 1;
          entry.totalDays += 1;
        }
        if (rec.status === 'Present') totalPresent += 1;
        if (rec.status === 'Absent') totalAbsent += 1;
        if (rec.status === 'Late') totalLate += 1;
        if (rec.status === 'Excused') totalExcused += 1;
      }
    }

    const rows = Array.from(studentStats.values()).map((r) => ({
      ...r,
      attendanceRate:
        r.totalDays > 0 ? Math.round(((r.Present + r.Late) / r.totalDays) * 1000) / 10 : 0,
    }));

    const grandTotal = totalPresent + totalAbsent + totalLate + totalExcused;

    res.json({
      mode,
      period: mode === 'daily' ? date : month,
      sessionsCount: attendanceDocs.length,
      summary: {
        Present: totalPresent,
        Absent: totalAbsent,
        Late: totalLate,
        Excused: totalExcused,
        totalMarks: grandTotal,
        overallRate:
          grandTotal > 0 ? Math.round(((totalPresent + totalLate) / grandTotal) * 1000) / 10 : 0,
      },
      rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate attendance report.';
    res.status(500).json({ error: message });
  }
});

export default router;
