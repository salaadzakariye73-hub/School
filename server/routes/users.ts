import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, type UserRole } from '../models/User.js';
import { Teacher } from '../models/Teacher.js';
import { Student } from '../models/Student.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles, type AuthRequest } from '../middleware/auth.js';
import { asBoolean, asOptionalString, asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin'));

const ALLOWED_ROLES: UserRole[] = ['admin', 'teacher', 'student', 'parent', 'accountant'];

router.get('/', async (_req, res) => {
  try {
    const users = await User.find()
      .select('-passwordHash')
      .populate({
        path: 'teacherRef',
        select: 'teacherId fullName assignedClasses',
        populate: { path: 'assignedClasses', select: 'name' },
      })
      .populate({
        path: 'studentRef',
        select: 'studentId fullName classId',
        populate: { path: 'classId', select: 'name' },
      })
      .populate({
        path: 'childrenRefs',
        select: 'studentId fullName classId',
        populate: { path: 'classId', select: 'name' },
      })
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load user accounts.';
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = asString(req.body?.name);
    const username = asOptionalString(req.body?.username)?.toLowerCase();
    const email = asOptionalString(req.body?.email)?.toLowerCase();
    const password = asString(req.body?.password);
    const role = asString(req.body?.role) as UserRole;
    const teacherRef = asOptionalString(req.body?.teacherRef);
    const studentRef = asOptionalString(req.body?.studentRef);
    const studentClassId = asOptionalString(req.body?.studentClassId);
    const rawChildrenRefs = Array.isArray(req.body?.childrenRefs)
      ? req.body.childrenRefs.filter((id: unknown) => isValidObjectId(id))
      : [];
    const rawTeacherClasses = Array.isArray(req.body?.teacherAssignedClasses)
      ? req.body.teacherAssignedClasses.filter((id: unknown) => isValidObjectId(id))
      : null;

    if (!name || !password || (!username && !email)) {
      res.status(400).json({ error: 'Full name, password, and either username/Student ID or email are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!ALLOWED_ROLES.includes(role)) {
      res.status(400).json({ error: 'Invalid user role.' });
      return;
    }

    if (email) {
      const existsEmail = await User.findOne({ email });
      if (existsEmail) {
        res.status(409).json({ error: 'A user with this email already exists.' });
        return;
      }
    }

    let resolvedUsername = username;
    let validTeacherId: string | null = null;
    let validStudentId: string | null = null;

    if (role === 'teacher' && teacherRef) {
      if (!isValidObjectId(teacherRef)) {
        res.status(400).json({ error: 'Invalid teacher reference.' });
        return;
      }
      const teacher = await Teacher.findById(teacherRef);
      if (!teacher) {
        res.status(404).json({ error: 'Referenced teacher not found.' });
        return;
      }
      validTeacherId = String(teacher._id);
      if (rawTeacherClasses) {
        teacher.assignedClasses = rawTeacherClasses;
        await teacher.save();
      }
    }

    if (role === 'student' && studentRef) {
      if (!isValidObjectId(studentRef)) {
        res.status(400).json({ error: 'Invalid student reference.' });
        return;
      }
      const student = await Student.findById(studentRef);
      if (!student) {
        res.status(404).json({ error: 'Referenced student not found.' });
        return;
      }
      validStudentId = String(student._id);
      if (!resolvedUsername) {
        resolvedUsername = student.studentId.toLowerCase();
      }
      if (studentClassId && isValidObjectId(studentClassId)) {
        student.classId = studentClassId as unknown as typeof student.classId;
        await student.save();
      }
    }

    if (resolvedUsername) {
      const existsUsername = await User.findOne({ username: resolvedUsername });
      if (existsUsername) {
        res.status(409).json({ error: 'A user with this username / Student ID already exists.' });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await User.create({
      name,
      username: resolvedUsername || undefined,
      email: email || undefined,
      passwordHash,
      role,
      teacherRef: validTeacherId,
      studentRef: validStudentId,
      childrenRefs: role === 'parent' ? rawChildrenRefs : [],
      active: true,
    });

    const populated = await User.findById(created._id)
      .select('-passwordHash')
      .populate({
        path: 'teacherRef',
        select: 'teacherId fullName assignedClasses',
        populate: { path: 'assignedClasses', select: 'name' },
      })
      .populate({
        path: 'studentRef',
        select: 'studentId fullName classId',
        populate: { path: 'classId', select: 'name' },
      })
      .populate({
        path: 'childrenRefs',
        select: 'studentId fullName classId',
        populate: { path: 'classId', select: 'name' },
      });

    res.status(201).json(populated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create user.';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const name = asOptionalString(req.body?.name);
    const username = req.body?.username !== undefined ? asOptionalString(req.body.username)?.toLowerCase() : user.username;
    const email = req.body?.email !== undefined ? asOptionalString(req.body.email)?.toLowerCase() : user.email;
    const role = asOptionalString(req.body?.role) as UserRole | undefined;
    const active = req.body?.active !== undefined ? asBoolean(req.body.active, user.active) : user.active;
    const newPassword = asOptionalString(req.body?.password);
    const teacherRef = req.body?.teacherRef;
    const studentRef = req.body?.studentRef;
    const studentClassId = asOptionalString(req.body?.studentClassId);
    const rawChildrenRefs = Array.isArray(req.body?.childrenRefs)
      ? req.body.childrenRefs.filter((cid: unknown) => isValidObjectId(cid))
      : null;
    const rawTeacherClasses = Array.isArray(req.body?.teacherAssignedClasses)
      ? req.body.teacherAssignedClasses.filter((cid: unknown) => isValidObjectId(cid))
      : null;

    if (String(user._id) === String(req.user?._id) && !active) {
      res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
      return;
    }

    if (!username && !email) {
      res.status(400).json({ error: 'User must have either a username/Student ID or an email.' });
      return;
    }

    if (email && email !== user.email) {
      const dup = await User.findOne({ email, _id: { $ne: user._id } });
      if (dup) {
        res.status(409).json({ error: 'Email is already in use.' });
        return;
      }
    }

    if (username && username !== user.username) {
      const dup = await User.findOne({ username, _id: { $ne: user._id } });
      if (dup) {
        res.status(409).json({ error: 'Username / Student ID is already in use.' });
        return;
      }
    }

    if (name) user.name = name;
    user.username = username || undefined;
    user.email = email || undefined;

    if (role) {
      if (!ALLOWED_ROLES.includes(role)) {
        res.status(400).json({ error: 'Invalid role.' });
        return;
      }
      if (String(user._id) === String(req.user?._id) && role !== 'admin') {
        res.status(400).json({ error: 'You cannot demote your own admin account.' });
        return;
      }
      user.role = role;
    }

    user.active = active;

    if (user.role === 'teacher') {
      user.studentRef = null;
      user.childrenRefs = [];
      if (teacherRef === null || teacherRef === '') {
        user.teacherRef = null;
      } else if (typeof teacherRef === 'string' && isValidObjectId(teacherRef)) {
        user.teacherRef = teacherRef as unknown as typeof user.teacherRef;
      }
      if (user.teacherRef && rawTeacherClasses) {
        await Teacher.findByIdAndUpdate(user.teacherRef, {
          $set: { assignedClasses: rawTeacherClasses },
        });
      }
    } else if (user.role === 'student') {
      user.teacherRef = null;
      user.childrenRefs = [];
      if (studentRef === null || studentRef === '') {
        user.studentRef = null;
      } else if (typeof studentRef === 'string' && isValidObjectId(studentRef)) {
        user.studentRef = studentRef as unknown as typeof user.studentRef;
      }
      if (user.studentRef && studentClassId && isValidObjectId(studentClassId)) {
        await Student.findByIdAndUpdate(user.studentRef, {
          $set: { classId: studentClassId },
        });
      }
    } else if (user.role === 'parent') {
      user.teacherRef = null;
      user.studentRef = null;
      if (rawChildrenRefs) {
        user.childrenRefs = rawChildrenRefs;
      }
    } else {
      user.teacherRef = null;
      user.studentRef = null;
      user.childrenRefs = [];
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      user.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    await user.save();

    const updated = await User.findById(user._id)
      .select('-passwordHash')
      .populate({
        path: 'teacherRef',
        select: 'teacherId fullName assignedClasses',
        populate: { path: 'assignedClasses', select: 'name' },
      })
      .populate({
        path: 'studentRef',
        select: 'studentId fullName classId',
        populate: { path: 'classId', select: 'name' },
      })
      .populate({
        path: 'childrenRefs',
        select: 'studentId fullName classId',
        populate: { path: 'classId', select: 'name' },
      });

    res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update user.';
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    if (String(id) === String(req.user?._id)) {
      res.status(400).json({ error: 'You cannot delete your own account.' });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', active: true });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot delete the last active School Admin.' });
        return;
      }
    }

    await User.findByIdAndDelete(id);
    res.json({ message: 'User deleted successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete user.';
    res.status(500).json({ error: message });
  }
});

export default router;
