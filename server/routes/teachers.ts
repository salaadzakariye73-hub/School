import { Router } from 'express';
import { Teacher } from '../models/Teacher.js';
import { Classroom } from '../models/Classroom.js';
import { User } from '../models/User.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asString, asStringArray, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT);

router.get('/', requireRoles('admin', 'teacher'), async (_req, res) => {
  try {
    const teachers = await Teacher.find()
      .populate('assignedClasses', 'name academicYear')
      .sort({ fullName: 1 });
    res.json(teachers);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load teachers.';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireRoles('admin'), async (req, res) => {
  try {
    const teacherId = asString(req.body?.teacherId);
    const fullName = asString(req.body?.fullName);
    const phone = asString(req.body?.phone);
    const email = asString(req.body?.email).toLowerCase();
    const assignedSubjects = asStringArray(req.body?.assignedSubjects);
    const rawClassIds = Array.isArray(req.body?.assignedClasses) ? req.body.assignedClasses : [];
    const assignedClasses = rawClassIds.filter((id: unknown) => isValidObjectId(id));
    const status = req.body?.status === 'Inactive' ? 'Inactive' : 'Active';
    const rawPhoto = asString(req.body?.photoUrl);
    const photoUrl =
      rawPhoto.startsWith('data:image/') || rawPhoto.startsWith('https://') ? rawPhoto : '';

    if (!teacherId || !fullName || !phone || !email) {
      res.status(400).json({ error: 'Teacher ID, full name, phone, and email are required.' });
      return;
    }

    const created = await Teacher.create({
      teacherId,
      fullName,
      phone,
      email,
      assignedSubjects,
      assignedClasses,
      status,
      photoUrl,
    });

    const populated = await Teacher.findById(created._id).populate('assignedClasses', 'name academicYear');
    res.status(201).json(populated);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ error: 'A teacher with this Teacher ID already exists.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to add teacher.';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid teacher ID.' });
      return;
    }

    const teacher = await Teacher.findById(id);
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }

    const teacherId = asString(req.body?.teacherId);
    const fullName = asString(req.body?.fullName);
    const phone = asString(req.body?.phone);
    const email = asString(req.body?.email).toLowerCase();
    const assignedSubjects = asStringArray(req.body?.assignedSubjects);
    const rawClassIds = Array.isArray(req.body?.assignedClasses) ? req.body.assignedClasses : [];
    const assignedClasses = rawClassIds.filter((cid: unknown) => isValidObjectId(cid));
    const status = req.body?.status === 'Inactive' ? 'Inactive' : 'Active';
    const rawPhoto = req.body?.photoUrl !== undefined ? asString(req.body.photoUrl) : teacher.photoUrl || '';
    const photoUrl =
      rawPhoto.startsWith('data:image/') || rawPhoto.startsWith('https://') ? rawPhoto : '';

    if (!teacherId || !fullName || !phone || !email) {
      res.status(400).json({ error: 'Teacher ID, full name, phone, and email are required.' });
      return;
    }

    teacher.teacherId = teacherId;
    teacher.fullName = fullName;
    teacher.phone = phone;
    teacher.email = email;
    teacher.assignedSubjects = assignedSubjects;
    teacher.assignedClasses = assignedClasses;
    teacher.status = status;
    teacher.photoUrl = photoUrl;

    await teacher.save();
    const populated = await Teacher.findById(teacher._id).populate('assignedClasses', 'name academicYear');
    res.json(populated);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ error: 'A teacher with this Teacher ID already exists.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to update teacher.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid teacher ID.' });
      return;
    }

    const deleted = await Teacher.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }

    await Promise.all([
      Classroom.updateMany({ classTeacherId: deleted._id }, { $set: { classTeacherId: null } }),
      User.updateMany({ teacherRef: deleted._id }, { $set: { teacherRef: null } }),
    ]);
    res.json({ message: 'Teacher removed successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove teacher.';
    res.status(500).json({ error: message });
  }
});

export default router;
