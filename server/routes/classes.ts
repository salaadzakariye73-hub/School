import { Router } from 'express';
import { Classroom } from '../models/Classroom.js';
import { Student } from '../models/Student.js';
import { Teacher } from '../models/Teacher.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asNumber, asOptionalString, asString, asStringArray, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'teacher', 'accountant'));

router.get('/', async (req: AuthRequest, res) => {
  try {
    let filter: Record<string, unknown> = {};

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      filter = { _id: { $in: assignedIds } };
    }

    const classes = await Classroom.find(filter)
      .populate('classTeacherId', 'teacherId fullName phone email')
      .sort({ name: 1 })
      .lean();

    const studentCounts = await Student.aggregate([
      { $match: { status: 'Active' } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>();
    for (const row of studentCounts) {
      countMap.set(String(row._id), row.count);
    }

    const enriched = classes.map((cls) => ({
      ...cls,
      studentCount: countMap.get(String(cls._id)) || 0,
    }));

    res.json(enriched);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load classes.';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireRoles('admin'), async (req, res) => {
  try {
    const name = asString(req.body?.name);
    const academicYear = asString(req.body?.academicYear);
    const classTeacherId = asOptionalString(req.body?.classTeacherId);
    const subjects = asStringArray(req.body?.subjects);
    const tuitionFee = asNumber(req.body?.tuitionFee, 0);

    if (!name || !academicYear) {
      res.status(400).json({ error: 'Class name and academic year are required.' });
      return;
    }
    if (tuitionFee < 0) {
      res.status(400).json({ error: 'Tuition fee cannot be negative.' });
      return;
    }

    let validTeacherId: string | null = null;
    if (classTeacherId) {
      if (!isValidObjectId(classTeacherId)) {
        res.status(400).json({ error: 'Invalid class teacher ID.' });
        return;
      }
      const teacher = await Teacher.findById(classTeacherId);
      if (!teacher) {
        res.status(404).json({ error: 'Selected teacher not found.' });
        return;
      }
      validTeacherId = String(teacher._id);
    }

    const created = await Classroom.create({
      name,
      academicYear,
      classTeacherId: validTeacherId,
      subjects,
      tuitionFee,
    });

    const populated = await Classroom.findById(created._id)
      .populate('classTeacherId', 'teacherId fullName phone email')
      .lean();

    res.status(201).json({ ...populated, studentCount: 0 });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ error: 'A class with this name already exists for this academic year.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create class.';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid class ID.' });
      return;
    }

    const classroom = await Classroom.findById(id);
    if (!classroom) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    const name = asString(req.body?.name);
    const academicYear = asString(req.body?.academicYear);
    const classTeacherId = req.body?.classTeacherId;
    const subjects = req.body?.subjects !== undefined ? asStringArray(req.body.subjects) : classroom.subjects;
    const tuitionFee = req.body?.tuitionFee !== undefined ? asNumber(req.body.tuitionFee, 0) : classroom.tuitionFee;

    if (!name || !academicYear) {
      res.status(400).json({ error: 'Class name and academic year are required.' });
      return;
    }
    if (tuitionFee < 0) {
      res.status(400).json({ error: 'Tuition fee cannot be negative.' });
      return;
    }

    classroom.name = name;
    classroom.academicYear = academicYear;
    classroom.subjects = subjects;
    classroom.tuitionFee = tuitionFee;

    if (!classTeacherId) {
      classroom.classTeacherId = null;
    } else if (typeof classTeacherId === 'string' && isValidObjectId(classTeacherId)) {
      classroom.classTeacherId = classTeacherId as unknown as typeof classroom.classTeacherId;
    }

    await classroom.save();

    const studentCount = await Student.countDocuments({ classId: classroom._id, status: 'Active' });
    const populated = await Classroom.findById(classroom._id)
      .populate('classTeacherId', 'teacherId fullName phone email')
      .lean();

    res.json({ ...populated, studentCount });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ error: 'A class with this name already exists for this academic year.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to update class.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid class ID.' });
      return;
    }

    const studentCount = await Student.countDocuments({ classId: id });
    if (studentCount > 0) {
      res.status(400).json({
        error: `Cannot delete this class because ${studentCount} student(s) are assigned to it. Reassign or remove the students first.`,
      });
      return;
    }

    const deleted = await Classroom.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    await Teacher.updateMany(
      { assignedClasses: deleted._id },
      { $pull: { assignedClasses: deleted._id } }
    );

    res.json({ message: 'Class deleted successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete class.';
    res.status(500).json({ error: message });
  }
});

export default router;
