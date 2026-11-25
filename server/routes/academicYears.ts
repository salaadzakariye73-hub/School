import { Router } from 'express';
import { AcademicYear, type ITerm } from '../models/AcademicYear.js';
import { Student } from '../models/Student.js';
import { Classroom } from '../models/Classroom.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asBoolean, asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT);

router.get('/', requireRoles('admin', 'teacher', 'accountant'), async (_req, res) => {
  try {
    const years = await AcademicYear.find().sort({ isCurrent: -1, name: -1 }).lean();
    res.json(years);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load academic years.';
    res.status(500).json({ error: message });
  }
});

router.post('/', requireRoles('admin'), async (req, res) => {
  try {
    const name = asString(req.body?.name);
    const isCurrent = asBoolean(req.body?.isCurrent, false);
    const rawTerms = Array.isArray(req.body?.terms) ? req.body.terms : [];

    if (!name) {
      res.status(400).json({ error: 'Academic year name is required (e.g. 2026-2027).' });
      return;
    }

    const terms: ITerm[] = rawTerms
      .map((item: Record<string, unknown>) => ({
        name: asString(item?.name),
        startDate: asString(item?.startDate),
        endDate: asString(item?.endDate),
        isCurrent: asBoolean(item?.isCurrent, false),
      }))
      .filter((t: ITerm) => Boolean(t.name));

    if (isCurrent) {
      await AcademicYear.updateMany({}, { $set: { isCurrent: false } });
      const settings = await getOrCreateSettings();
      settings.academicYear = name;
      await settings.save();
    }

    const created = await AcademicYear.create({
      name,
      isCurrent,
      status: 'Active',
      terms,
    });

    res.status(201).json(created);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ error: 'This academic year already exists.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create academic year.';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid academic year ID.' });
      return;
    }

    const year = await AcademicYear.findById(id);
    if (!year) {
      res.status(404).json({ error: 'Academic year not found.' });
      return;
    }

    const name = asString(req.body?.name, year.name);
    const isCurrent = req.body?.isCurrent !== undefined ? asBoolean(req.body.isCurrent, year.isCurrent) : year.isCurrent;
    const status = req.body?.status === 'Archived' ? 'Archived' : 'Active';

    if (Array.isArray(req.body?.terms)) {
      year.terms = req.body.terms
        .map((item: Record<string, unknown>) => ({
          name: asString(item?.name),
          startDate: asString(item?.startDate),
          endDate: asString(item?.endDate),
          isCurrent: asBoolean(item?.isCurrent, false),
        }))
        .filter((t: ITerm) => Boolean(t.name));
    }

    if (isCurrent) {
      await AcademicYear.updateMany({ _id: { $ne: year._id } }, { $set: { isCurrent: false } });
      const settings = await getOrCreateSettings();
      settings.academicYear = name;
      await settings.save();
    }

    year.name = name;
    year.isCurrent = isCurrent;
    year.status = status;
    await year.save();

    res.json(year);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update academic year.';
    res.status(500).json({ error: message });
  }
});

router.post('/promote', requireRoles('admin'), async (req, res) => {
  try {
    const fromClassId = asString(req.body?.fromClassId);
    const toClassId = asString(req.body?.toClassId);
    const toAcademicYear = asString(req.body?.toAcademicYear);
    const rawStudentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
    const studentIds = rawStudentIds.filter((id: unknown) => isValidObjectId(id));

    if (!isValidObjectId(fromClassId) || !isValidObjectId(toClassId) || !toAcademicYear || studentIds.length === 0) {
      res.status(400).json({
        error: 'Source class, destination class, target academic year, and at least one student are required.',
      });
      return;
    }

    const [fromClass, toClass] = await Promise.all([
      Classroom.findById(fromClassId).lean(),
      Classroom.findById(toClassId).lean(),
    ]);

    if (!fromClass || !toClass) {
      res.status(404).json({ error: 'Selected class not found.' });
      return;
    }

    const promotedAt = new Date().toISOString().slice(0, 10);
    const students = await Student.find({ _id: { $in: studentIds }, classId: fromClassId });

    let promotedCount = 0;
    for (const student of students) {
      student.promotionHistory.push({
        fromYear: student.academicYear,
        fromClassName: fromClass.name,
        toYear: toAcademicYear,
        toClassName: toClass.name,
        promotedAt,
      });
      student.classId = toClass._id as unknown as typeof student.classId;
      student.academicYear = toAcademicYear;
      await student.save();
      promotedCount += 1;
    }

    res.json({
      promotedCount,
      message: `${promotedCount} student(s) promoted to ${toClass.name} (${toAcademicYear}).`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to promote students.';
    res.status(500).json({ error: message });
  }
});

export default router;
