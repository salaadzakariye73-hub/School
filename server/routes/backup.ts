import { Router } from 'express';
import { SchoolSettings } from '../models/SchoolSettings.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { Classroom } from '../models/Classroom.js';
import { Teacher } from '../models/Teacher.js';
import { Student } from '../models/Student.js';
import { Attendance } from '../models/Attendance.js';
import { ExamResult } from '../models/ExamResult.js';
import { FeePayment } from '../models/FeePayment.js';
import { Expense } from '../models/Expense.js';
import { Timetable } from '../models/Timetable.js';
import { Homework } from '../models/Homework.js';
import { Announcement } from '../models/Announcement.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin'));

router.get('/export', async (_req, res) => {
  try {
    const [
      settings,
      academicYears,
      classrooms,
      teachers,
      students,
      attendance,
      examResults,
      feePayments,
      expenses,
      timetables,
      homework,
      announcements,
    ] = await Promise.all([
      SchoolSettings.find().lean(),
      AcademicYear.find().lean(),
      Classroom.find().lean(),
      Teacher.find().lean(),
      Student.find().lean(),
      Attendance.find().lean(),
      ExamResult.find().lean(),
      FeePayment.find().lean(),
      Expense.find().lean(),
      Timetable.find().lean(),
      Homework.find().lean(),
      Announcement.find().lean(),
    ]);

    res.json({
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      collections: {
        settings,
        academicYears,
        classrooms,
        teachers,
        students,
        attendance,
        examResults,
        feePayments,
        expenses,
        timetables,
        homework,
        announcements,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create backup.';
    res.status(500).json({ error: message });
  }
});

router.post('/restore', async (req, res) => {
  try {
    if (req.body?.confirmOverwrite !== true) {
      res.status(400).json({
        error: 'Restore requires explicit confirmation before replacing existing school data.',
      });
      return;
    }

    const backup = req.body?.backup;
    if (!backup || typeof backup !== 'object' || !backup.collections || typeof backup.collections !== 'object') {
      res.status(400).json({ error: 'Invalid backup file format.' });
      return;
    }

    const c = backup.collections as Record<string, unknown>;
    const requiredKeys = ['classrooms', 'teachers', 'students'];
    for (const k of requiredKeys) {
      if (!Array.isArray(c[k])) {
        res.status(400).json({ error: `Backup file is missing valid "${k}" collection.` });
        return;
      }
    }

    // Replace domain collections cleanly while keeping User accounts intact so Admin never locks out
    await Promise.all([
      SchoolSettings.deleteMany({}),
      AcademicYear.deleteMany({}),
      Classroom.deleteMany({}),
      Teacher.deleteMany({}),
      Student.deleteMany({}),
      Attendance.deleteMany({}),
      ExamResult.deleteMany({}),
      FeePayment.deleteMany({}),
      Expense.deleteMany({}),
      Timetable.deleteMany({}),
      Homework.deleteMany({}),
      Announcement.deleteMany({}),
    ]);

    if (Array.isArray(c.settings) && c.settings.length > 0) await SchoolSettings.insertMany(c.settings);
    if (Array.isArray(c.academicYears) && c.academicYears.length > 0) await AcademicYear.insertMany(c.academicYears);
    if (Array.isArray(c.classrooms) && c.classrooms.length > 0) await Classroom.insertMany(c.classrooms);
    if (Array.isArray(c.teachers) && c.teachers.length > 0) await Teacher.insertMany(c.teachers);
    if (Array.isArray(c.students) && c.students.length > 0) await Student.insertMany(c.students);
    if (Array.isArray(c.attendance) && c.attendance.length > 0) await Attendance.insertMany(c.attendance);
    if (Array.isArray(c.examResults) && c.examResults.length > 0) await ExamResult.insertMany(c.examResults);
    if (Array.isArray(c.feePayments) && c.feePayments.length > 0) await FeePayment.insertMany(c.feePayments);
    if (Array.isArray(c.expenses) && c.expenses.length > 0) await Expense.insertMany(c.expenses);
    if (Array.isArray(c.timetables) && c.timetables.length > 0) await Timetable.insertMany(c.timetables);
    if (Array.isArray(c.homework) && c.homework.length > 0) await Homework.insertMany(c.homework);
    if (Array.isArray(c.announcements) && c.announcements.length > 0) await Announcement.insertMany(c.announcements);

    res.json({
      message: 'School backup restored successfully.',
      restoredCounts: {
        students: Array.isArray(c.students) ? c.students.length : 0,
        teachers: Array.isArray(c.teachers) ? c.teachers.length : 0,
        classrooms: Array.isArray(c.classrooms) ? c.classrooms.length : 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to restore backup.';
    res.status(500).json({ error: message });
  }
});

export default router;
