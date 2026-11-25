import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, type UserRole } from '../models/User.js';
import { Student } from '../models/Student.js';
import { Teacher } from '../models/Teacher.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { connectDB, getLastDbError, isDbConfigured, isDbConnected, requireDb } from '../db.js';
import { authenticateJWT, signToken, type AuthRequest } from '../middleware/auth.js';
import { asOptionalString, asString, escapeRegex } from '../utils/sanitize.js';

const router = Router();
const VALID_ROLES: UserRole[] = ['admin', 'teacher', 'student', 'parent', 'accountant'];

router.get('/status', async (_req, res) => {
  const configured = isDbConfigured();
  if (!configured) {
    res.json({
      dbConfigured: false,
      dbConnected: false,
      dbError: 'MONGODB_URI is not configured.',
      needsSetup: false,
    });
    return;
  }

  let connected = isDbConnected();
  if (!connected) {
    connected = await connectDB();
  }

  if (!connected) {
    res.json({
      dbConfigured: true,
      dbConnected: false,
      dbError: getLastDbError() || 'Failed to connect to MongoDB Atlas.',
      needsSetup: false,
    });
    return;
  }

  const userCount = await User.countDocuments();
  res.json({
    dbConfigured: true,
    dbConnected: true,
    dbError: null,
    needsSetup: userCount === 0,
  });
});

router.post('/setup', requireDb, async (req, res) => {
  try {
    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      res.status(403).json({
        error: 'Initial admin setup is locked because an account already exists.',
      });
      return;
    }

    const schoolName = asString(req.body?.schoolName);
    const name = asString(req.body?.name);
    const username = asOptionalString(req.body?.username)?.toLowerCase();
    const email = asString(req.body?.email).toLowerCase();
    const password = asString(req.body?.password);

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const adminUser = await User.create({
      name,
      username: username || undefined,
      email,
      passwordHash,
      role: 'admin',
      active: true,
    });

    const settings = await getOrCreateSettings();
    if (schoolName) {
      settings.schoolName = schoolName;
      await settings.save();
    }

    const token = signToken(adminUser);
    res.status(201).json({
      token,
      user: {
        _id: adminUser._id,
        name: adminUser.name,
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role,
        teacherRef: adminUser.teacherRef,
        studentRef: adminUser.studentRef,
      },
      settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete admin setup.';
    res.status(500).json({ error: message });
  }
});

router.post('/login', requireDb, async (req, res) => {
  try {
    const rawIdentifier = asString(req.body?.identifier) || asString(req.body?.email) || asString(req.body?.username);
    const identifier = rawIdentifier.toLowerCase();
    const password = asString(req.body?.password);
    const expectedRole = asOptionalString(req.body?.expectedRole) as UserRole | undefined;

    if (!identifier || !password) {
      res.status(400).json({ error: 'Username / Email / Student ID and password are required.' });
      return;
    }

    let user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    // Also allow student login by Student.studentId if linked via studentRef
    if (!user) {
      const matchedStudent = await Student.findOne({
        studentId: new RegExp(`^${escapeRegex(rawIdentifier)}$`, 'i'),
      }).select('_id');
      if (matchedStudent) {
        user = await User.findOne({ studentRef: matchedStudent._id });
      }
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (expectedRole && VALID_ROLES.includes(expectedRole) && user.role !== expectedRole) {
      res.status(403).json({
        error: `This account does not belong to the selected ${expectedRole} portal. Please select the correct login tab.`,
      });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Your account has been deactivated by the School Admin.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const settings = await getOrCreateSettings();
    const token = signToken(user);

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        teacherRef: user.teacherRef,
        studentRef: user.studentRef,
        childrenRefs: user.childrenRefs || [],
      },
      settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed.';
    res.status(500).json({ error: message });
  }
});

router.get('/me', requireDb, authenticateJWT, async (req: AuthRequest, res) => {
  const settings = await getOrCreateSettings();
  res.json({
    user: req.user,
    settings,
  });
});

router.get('/profile', requireDb, authenticateJWT, async (req: AuthRequest, res) => {
  try {
    let teacherProfile = null;
    if (req.user?.role === 'teacher') {
      teacherProfile = req.user.teacherRef
        ? await Teacher.findById(req.user.teacherRef).populate('assignedClasses', 'name academicYear').lean()
        : await Teacher.findOne({ email: (req.user.email || '').toLowerCase() })
            .populate('assignedClasses', 'name academicYear')
            .lean();
    }

    res.json({
      user: req.user,
      teacherProfile,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load profile.';
    res.status(500).json({ error: message });
  }
});

router.put('/profile', requireDb, authenticateJWT, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'student' || req.user?.role === 'parent') {
      res.status(403).json({ error: 'Students and parents can change their password, but profile records are managed by the School Admin.' });
      return;
    }

    const user = await User.findById(req.user?._id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const name = asString(req.body?.name);
    const email = asOptionalString(req.body?.email)?.toLowerCase();
    const username = asOptionalString(req.body?.username)?.toLowerCase();
    const phone = asOptionalString(req.body?.phone);

    if (!name) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }

    if (email && email !== user.email) {
      const dup = await User.findOne({ email, _id: { $ne: user._id } });
      if (dup) {
        res.status(409).json({ error: 'Email is already in use by another account.' });
        return;
      }
      user.email = email;
    }

    if (username && username !== user.username) {
      const dup = await User.findOne({ username, _id: { $ne: user._id } });
      if (dup) {
        res.status(409).json({ error: 'Username is already in use by another account.' });
        return;
      }
      user.username = username;
    }

    user.name = name;
    await user.save();

    let teacherProfile = null;
    if (user.role === 'teacher') {
      const teacher = user.teacherRef
        ? await Teacher.findById(user.teacherRef)
        : await Teacher.findOne({ email: (user.email || '').toLowerCase() });
      if (teacher) {
        teacher.fullName = name;
        if (email) teacher.email = email;
        if (phone) teacher.phone = phone;
        await teacher.save();
        teacherProfile = await Teacher.findById(teacher._id)
          .populate('assignedClasses', 'name academicYear')
          .lean();
      }
    }

    res.json({
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        teacherRef: user.teacherRef,
        studentRef: user.studentRef,
      },
      teacherProfile,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update profile.';
    res.status(500).json({ error: message });
  }
});

router.post('/change-password', requireDb, authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const currentPassword = asString(req.body?.currentPassword);
    const newPassword = asString(req.body?.newPassword);

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Current password and a new password (min 6 chars) are required.' });
      return;
    }

    const user = await User.findById(req.user?._id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password updated successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to change password.';
    res.status(500).json({ error: message });
  }
});

export default router;
