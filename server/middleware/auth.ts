import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { User, type IUser, type UserRole } from '../models/User.js';
import { Teacher } from '../models/Teacher.js';
import { Classroom } from '../models/Classroom.js';

export interface AuthRequest extends Request {
  user?: IUser;
}

interface JwtPayload {
  userId: string;
  role: UserRole;
}

export function signToken(user: IUser): string {
  return jwt.sign(
    { userId: String(user._id), role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export async function authenticateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user || !user.active) {
      res.status(401).json({ error: 'Account is disabled or no longer exists.' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token. Please sign in again.' });
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

export async function getTeacherAssignedClassIds(user: IUser): Promise<string[]> {
  if (user.role !== 'teacher') {
    return [];
  }

  const teacher = user.teacherRef
    ? await Teacher.findById(user.teacherRef)
    : user.email
    ? await Teacher.findOne({ email: user.email.toLowerCase() })
    : null;

  const classIdSet = new Set<string>();

  if (teacher) {
    for (const cid of teacher.assignedClasses) {
      classIdSet.add(String(cid));
    }
    const homeroomClasses = await Classroom.find({ classTeacherId: teacher._id }).select('_id');
    for (const cls of homeroomClasses) {
      classIdSet.add(String(cls._id));
    }
  }

  return Array.from(classIdSet);
}
