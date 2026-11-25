import { Router } from 'express';
import {
  Announcement,
  type AnnouncementCategory,
  type AnnouncementTarget,
} from '../models/Announcement.js';
import { Student } from '../models/Student.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asOptionalString, asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT);

const VALID_TARGETS: AnnouncementTarget[] = [
  'all',
  'student',
  'teacher',
  'parent',
  'accountant',
  'class',
];
const VALID_CATEGORIES: AnnouncementCategory[] = ['Notice', 'Holiday', 'Exam', 'Update'];

router.get('/', async (req: AuthRequest, res) => {
  try {
    const role = req.user?.role;
    let filter: Record<string, unknown> = {};

    if (role === 'admin') {
      filter = {};
    } else if (role === 'teacher' && req.user) {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      filter = {
        $or: [
          { targetRole: { $in: ['all', 'teacher'] } },
          { targetRole: 'class', targetClassId: { $in: assignedIds } },
        ],
      };
    } else if (role === 'student' && req.user) {
      const stu = req.user.studentRef
        ? await Student.findById(req.user.studentRef).select('classId').lean()
        : null;
      filter = {
        $or: [
          { targetRole: { $in: ['all', 'student'] } },
          ...(stu ? [{ targetRole: 'class', targetClassId: stu.classId }] : []),
        ],
      };
    } else if (role === 'parent' && req.user) {
      const childIds = Array.isArray(req.user.childrenRefs) ? req.user.childrenRefs : [];
      const children = await Student.find({ _id: { $in: childIds } }).select('classId').lean();
      const classIds = children.map((c) => c.classId);
      filter = {
        $or: [
          { targetRole: { $in: ['all', 'parent'] } },
          ...(classIds.length > 0 ? [{ targetRole: 'class', targetClassId: { $in: classIds } }] : []),
        ],
      };
    } else {
      filter = { targetRole: { $in: ['all', role].filter(Boolean) } };
    }

    const announcements = await Announcement.find(filter)
      .populate('targetClassId', 'name')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json(announcements);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load announcements.';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireRoles('admin'), async (req: AuthRequest, res) => {
  try {
    const title = asString(req.body?.title);
    const content = asString(req.body?.content);
    const rawCategory = asString(req.body?.category, 'Notice') as AnnouncementCategory;
    const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'Notice';
    const rawTarget = asString(req.body?.targetRole, 'all') as AnnouncementTarget;
    const targetRole = VALID_TARGETS.includes(rawTarget) ? rawTarget : 'all';
    const targetClassId = asOptionalString(req.body?.targetClassId);
    const eventDate = asString(req.body?.eventDate);

    if (!title || !content) {
      res.status(400).json({ error: 'Announcement title and content are required.' });
      return;
    }

    if (targetRole === 'class' && !isValidObjectId(targetClassId)) {
      res.status(400).json({ error: 'Please select a target class.' });
      return;
    }

    const created = await Announcement.create({
      title,
      content,
      category,
      targetRole,
      targetClassId: targetRole === 'class' && targetClassId ? targetClassId : null,
      eventDate,
      authorName: req.user?.name || 'School Admin',
      createdBy: req.user?._id,
    });

    const populated = await Announcement.findById(created._id).populate('targetClassId', 'name');
    res.status(201).json(populated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create announcement.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid announcement ID.' });
      return;
    }

    const deleted = await Announcement.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    res.json({ message: 'Announcement deleted.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete announcement.';
    res.status(500).json({ error: message });
  }
});

export default router;
