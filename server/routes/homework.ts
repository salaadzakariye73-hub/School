import { Router } from 'express';
import { Homework, type HomeworkStatus } from '../models/Homework.js';
import { Student } from '../models/Student.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT);

const VALID_STATUSES: HomeworkStatus[] = ['Assigned', 'Completed', 'Reviewed'];

router.get('/', async (req: AuthRequest, res) => {
  try {
    const classId = asString(req.query?.classId);
    const filter: Record<string, unknown> = {};

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
      filter.classId = { $in: children.map((c) => c.classId) };
    } else if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (classId && isValidObjectId(classId)) {
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

    const list = await Homework.find(filter)
      .populate('classId', 'name academicYear')
      .sort({ dueDate: -1, createdAt: -1 })
      .lean();

    res.json(list);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load homework.';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireRoles('admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const classId = asString(req.body?.classId);
    const subject = asString(req.body?.subject);
    const title = asString(req.body?.title);
    const description = asString(req.body?.description);
    const dueDate = asString(req.body?.dueDate);

    if (!isValidObjectId(classId) || !subject || !title || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      res.status(400).json({ error: 'Class, subject, title, and due date (YYYY-MM-DD) are required.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(classId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    const created = await Homework.create({
      classId,
      subject,
      title,
      description,
      dueDate,
      status: 'Assigned',
      assignedBy: req.user?._id,
      assignedByName: req.user?.name || 'Teacher',
    });

    const populated = await Homework.findById(created._id).populate('classId', 'name academicYear');
    res.status(201).json(populated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to assign homework.';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', requireRoles('admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid homework ID.' });
      return;
    }

    const hw = await Homework.findById(id);
    if (!hw) {
      res.status(404).json({ error: 'Homework not found.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(String(hw.classId))) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    const title = asString(req.body?.title);
    const subject = asString(req.body?.subject);
    const description = req.body?.description !== undefined ? asString(req.body.description) : hw.description;
    const dueDate = asString(req.body?.dueDate);
    const status = asString(req.body?.status) as HomeworkStatus;

    if (title) hw.title = title;
    if (subject) hw.subject = subject;
    hw.description = description;
    if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) hw.dueDate = dueDate;
    if (VALID_STATUSES.includes(status)) hw.status = status;

    await hw.save();
    const populated = await Homework.findById(hw._id).populate('classId', 'name academicYear');
    res.json(populated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update homework.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', requireRoles('admin', 'teacher'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid homework ID.' });
      return;
    }

    const hw = await Homework.findById(id);
    if (!hw) {
      res.status(404).json({ error: 'Homework not found.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(String(hw.classId))) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    await Homework.findByIdAndDelete(id);
    res.json({ message: 'Homework deleted.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete homework.';
    res.status(500).json({ error: message });
  }
});

export default router;
