import { Router } from 'express';
import { Timetable, type SchoolDay } from '../models/Timetable.js';
import { Student } from '../models/Student.js';
import { Teacher } from '../models/Teacher.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asNumber, asOptionalString, asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT);

const VALID_DAYS: SchoolDay[] = [
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
];

router.get('/', async (req: AuthRequest, res) => {
  try {
    const classId = asString(req.query?.classId);
    const filter: Record<string, unknown> = {
      dayOfWeek: { $in: VALID_DAYS },
    };

    if (req.user?.role === 'student') {
      const stu = req.user.studentRef
        ? await Student.findById(req.user.studentRef).select('classId').lean()
        : null;
      if (!stu) {
        res.json([]);
        return;
      }
      filter.classId = stu.classId;
    } else if (req.user?.role === 'parent') {
      const childIds = Array.isArray(req.user.childrenRefs) ? req.user.childrenRefs : [];
      const children = await Student.find({ _id: { $in: childIds } }).select('classId').lean();
      const allowedClassIds = children.map((c) => String(c.classId));
      if (classId && allowedClassIds.includes(classId)) {
        filter.classId = classId;
      } else {
        filter.classId = { $in: allowedClassIds };
      }
    } else if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      const teacher = req.user.teacherRef
        ? await Teacher.findById(req.user.teacherRef).select('_id').lean()
        : req.user.email
        ? await Teacher.findOne({ email: req.user.email.toLowerCase() }).select('_id').lean()
        : null;

      if (classId && isValidObjectId(classId)) {
        if (!assignedIds.includes(classId)) {
          filter.$and = [{ classId }, ...(teacher ? [{ teacherId: teacher._id }] : [{ _id: null }])];
        } else {
          filter.classId = classId;
        }
      } else {
        const orConds: Array<Record<string, unknown>> = [{ classId: { $in: assignedIds } }];
        if (teacher) orConds.push({ teacherId: teacher._id });
        filter.$or = orConds;
      }
    } else if (classId && isValidObjectId(classId)) {
      filter.classId = classId;
    }

    const slots = await Timetable.find(filter)
      .populate('classId', 'name academicYear')
      .populate('teacherId', 'teacherId fullName')
      .sort({ periodNumber: 1, startTime: 1 })
      .lean();

    res.json(slots);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load timetable.';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireRoles('admin'), async (req, res) => {
  try {
    const classId = asString(req.body?.classId);
    const dayOfWeek = asString(req.body?.dayOfWeek) as SchoolDay;
    const periodNumber = asNumber(req.body?.periodNumber, 1);
    const startTime = asString(req.body?.startTime);
    const endTime = asString(req.body?.endTime);
    const subject = asString(req.body?.subject);
    const teacherId = asOptionalString(req.body?.teacherId);
    const room = asString(req.body?.room);

    if (!isValidObjectId(classId) || !VALID_DAYS.includes(dayOfWeek) || !startTime || !endTime || !subject) {
      res.status(400).json({ error: 'Class, day, period times, and subject are required.' });
      return;
    }

    const validTeacherId = teacherId && isValidObjectId(teacherId) ? teacherId : null;

    const saved = await Timetable.findOneAndUpdate(
      { classId, dayOfWeek, periodNumber },
      {
        classId,
        dayOfWeek,
        periodNumber,
        startTime,
        endTime,
        subject,
        teacherId: validTeacherId,
        room,
      },
      { upsert: true, new: true, runValidators: true }
    )
      .populate('classId', 'name academicYear')
      .populate('teacherId', 'teacherId fullName');

    res.status(201).json(saved);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save timetable slot.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid timetable slot ID.' });
      return;
    }

    await Timetable.findByIdAndDelete(id);
    res.json({ message: 'Timetable slot deleted.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete timetable slot.';
    res.status(500).json({ error: message });
  }
});

export default router;
