import { Router } from 'express';
import { ExamResult } from '../models/ExamResult.js';
import { Examination } from '../models/Examination.js';
import { ExamSchedule } from '../models/ExamSchedule.js';
import { Teacher } from '../models/Teacher.js';
import { Student } from '../models/Student.js';
import { Classroom } from '../models/Classroom.js';
import { getOrCreateSettings, type IGradeRule } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asNumber, asString, isValidObjectId } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'teacher'));

function resolveGrade(percentage: number, scale: IGradeRule[]): IGradeRule {
  const sorted = [...scale].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((rule) => percentage >= rule.minPercent) || sorted[sorted.length - 1] || {
    grade: 'F',
    minPercent: 0,
    remarkEn: 'Fail',
    remarkSo: 'Dhacay',
  };
}

router.get('/names', async (req: AuthRequest, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      filter.classId = { $in: assignedIds };
    }
    const [resultNames, scheduledExams] = await Promise.all([
      ExamResult.distinct('examName', filter),
      Examination.find({}, 'name').lean(),
    ]);
    const merged = new Set<string>([
      ...resultNames.map((n) => String(n)),
      ...scheduledExams.map((e) => String(e.name)),
    ]);
    res.json(Array.from(merged).sort());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load exam names.';
    res.status(500).json({ error: message });
  }
});

router.get('/marks', async (req: AuthRequest, res) => {
  try {
    const examName = asString(req.query?.examName);
    const classId = asString(req.query?.classId);
    const subject = asString(req.query?.subject);

    if (!examName || !isValidObjectId(classId) || !subject) {
      res.status(400).json({ error: 'Exam name, valid classId, and subject are required.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(classId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    const students = await Student.find({ classId, status: 'Active' })
      .select('studentId fullName')
      .sort({ fullName: 1 })
      .lean();

    const examDoc = await ExamResult.findOne({ examName, classId, subject }).lean();
    const scoreMap = new Map<string, number>();
    if (examDoc) {
      for (const m of examDoc.marks) {
        scoreMap.set(String(m.studentId), m.score);
      }
    }

    const rows = students.map((s) => ({
      studentId: String(s._id),
      studentCode: s.studentId,
      fullName: s.fullName,
      score: scoreMap.has(String(s._id)) ? scoreMap.get(String(s._id))! : '',
    }));

    res.json({
      examName,
      classId,
      subject,
      maxMarks: examDoc?.maxMarks || 100,
      alreadySaved: Boolean(examDoc),
      rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load marks.';
    res.status(500).json({ error: message });
  }
});

router.put('/marks', async (req: AuthRequest, res) => {
  try {
    const examName = asString(req.body?.examName);
    const classId = asString(req.body?.classId);
    const subject = asString(req.body?.subject);
    const maxMarks = Math.max(1, asNumber(req.body?.maxMarks, 100));
    const rawMarks = Array.isArray(req.body?.marks) ? req.body.marks : [];

    if (!examName || !isValidObjectId(classId) || !subject) {
      res.status(400).json({ error: 'Exam name, classId, and subject are required.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(classId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
      const teacherDoc = req.user.teacherRef
        ? await Teacher.findById(req.user.teacherRef).lean()
        : req.user.email
        ? await Teacher.findOne({ email: req.user.email.toLowerCase() }).lean()
        : null;
      if (teacherDoc && teacherDoc.assignedSubjects.length > 0) {
        const allowedSub = teacherDoc.assignedSubjects.some(
          (s) => s.trim().toLowerCase() === subject.toLowerCase()
        );
        if (!allowedSub) {
          res.status(403).json({ error: 'You are not authorized to enter marks for this subject.' });
          return;
        }
      }
    }

    const classroom = await Classroom.findById(classId);
    if (!classroom) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    // Connect to Examination & ExamSchedule when Examination exists
    const linkedExam = await Examination.findOne({
      name: examName,
      academicYear: classroom.academicYear,
    }).lean() || await Examination.findOne({ name: examName }).lean();

    if (linkedExam) {
      const classSchedules = await ExamSchedule.find({
        examinationId: linkedExam._id,
        classId,
      }).lean();
      if (classSchedules.length > 0) {
        const isScheduled = classSchedules.some(
          (sc) => sc.subject.trim().toLowerCase() === subject.toLowerCase()
        );
        if (!isScheduled) {
          res.status(400).json({
            error: `Subject "${subject}" is not scheduled for ${classroom.name} under "${linkedExam.name}".`,
          });
          return;
        }
      }
    }

    const cleanedMarks: Array<{ studentId: string; score: number }> = [];
    for (const item of rawMarks) {
      const sid = asString(item?.studentId);
      if (!isValidObjectId(sid)) continue;
      if (item?.score === '' || item?.score === null || item?.score === undefined) continue;
      const score = asNumber(item.score, -1);
      if (score < 0 || score > maxMarks) {
        res.status(400).json({ error: `Scores must be between 0 and ${maxMarks}.` });
        return;
      }
      cleanedMarks.push({ studentId: sid, score });
    }

    const saved = await ExamResult.findOneAndUpdate(
      { examName, classId, subject },
      {
        examinationId: linkedExam?._id || null,
        examName,
        academicYear: linkedExam?.academicYear || classroom.academicYear,
        term: linkedExam?.term || '',
        classId,
        subject,
        maxMarks,
        marks: cleanedMarks,
        recordedBy: req.user?._id,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json(saved);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save marks.';
    res.status(500).json({ error: message });
  }
});

router.get('/results', async (req: AuthRequest, res) => {
  try {
    const examName = asString(req.query?.examName);
    const classId = asString(req.query?.classId);

    if (!examName || !isValidObjectId(classId)) {
      res.status(400).json({ error: 'Exam name and valid classId are required.' });
      return;
    }

    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(classId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
    }

    const [classroom, students, examDocs, settings] = await Promise.all([
      Classroom.findById(classId).lean(),
      Student.find({ classId, status: 'Active' }).sort({ fullName: 1 }).lean(),
      ExamResult.find({ examName, classId }).sort({ subject: 1 }).lean(),
      getOrCreateSettings(),
    ]);

    if (!classroom) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }

    const subjects = examDocs.map((d) => ({
      subject: d.subject,
      maxMarks: d.maxMarks,
    }));

    const results = students.map((student) => {
      const subjectScores: Record<string, { score: number; maxMarks: number } | null> = {};
      let totalScore = 0;
      let totalPossible = 0;
      let subjectCount = 0;

      for (const doc of examDocs) {
        const found = doc.marks.find((m) => String(m.studentId) === String(student._id));
        if (found) {
          subjectScores[doc.subject] = { score: found.score, maxMarks: doc.maxMarks };
          totalScore += found.score;
          totalPossible += doc.maxMarks;
          subjectCount += 1;
        } else {
          subjectScores[doc.subject] = null;
        }
      }

      const average = subjectCount > 0 ? Math.round((totalScore / subjectCount) * 10) / 10 : 0;
      const percentage = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0;
      const gradeInfo = resolveGrade(percentage, settings.gradingScale);

      return {
        studentId: String(student._id),
        studentCode: student.studentId,
        fullName: student.fullName,
        subjectScores,
        totalScore,
        totalPossible,
        average,
        percentage,
        grade: subjectCount > 0 ? gradeInfo.grade : '-',
        remarkEn: subjectCount > 0 ? gradeInfo.remarkEn : '-',
        remarkSo: subjectCount > 0 ? gradeInfo.remarkSo : '-',
        subjectCount,
      };
    });

    results.sort((a, b) => b.percentage - a.percentage || b.totalScore - a.totalScore);
    const ranked = results.map((r, idx) => ({
      ...r,
      rank: r.subjectCount > 0 ? idx + 1 : null,
    }));

    res.json({
      examName,
      className: classroom.name,
      academicYear: classroom.academicYear,
      subjects,
      results: ranked,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to calculate exam results.';
    res.status(500).json({ error: message });
  }
});

router.get('/report-card/:studentId', async (req: AuthRequest, res) => {
  try {
    const studentId = req.params.studentId;
    const examName = asString(req.query?.examName);

    if (!isValidObjectId(studentId) || !examName) {
      res.status(400).json({ error: 'Valid studentId and examName are required.' });
      return;
    }

    const student = await Student.findById(studentId).populate('classId', 'name academicYear').lean();
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const classIdStr = String(student.classId?._id || student.classId);
    if (req.user?.role === 'teacher') {
      const assignedIds = await getTeacherAssignedClassIds(req.user);
      if (!assignedIds.includes(classIdStr)) {
        res.status(403).json({ error: 'You are not assigned to this student class.' });
        return;
      }
    }

    const [examDocs, settings] = await Promise.all([
      ExamResult.find({ examName, classId: classIdStr }).sort({ subject: 1 }).lean(),
      getOrCreateSettings(),
    ]);

    const subjects = examDocs.map((doc) => {
      const mark = doc.marks.find((m) => String(m.studentId) === String(student._id));
      const score = mark ? mark.score : 0;
      const hasMark = Boolean(mark);
      const pct = hasMark && doc.maxMarks > 0 ? Math.round((score / doc.maxMarks) * 1000) / 10 : 0;
      const gradeInfo = resolveGrade(pct, settings.gradingScale);
      return {
        subject: doc.subject,
        score: hasMark ? score : null,
        maxMarks: doc.maxMarks,
        percentage: hasMark ? pct : null,
        grade: hasMark ? gradeInfo.grade : '-',
        remarkEn: hasMark ? gradeInfo.remarkEn : '-',
        remarkSo: hasMark ? gradeInfo.remarkSo : '-',
      };
    });

    const scored = subjects.filter((s) => s.score !== null);
    const totalScore = scored.reduce((sum, s) => sum + (s.score || 0), 0);
    const totalPossible = scored.reduce((sum, s) => sum + s.maxMarks, 0);
    const average = scored.length > 0 ? Math.round((totalScore / scored.length) * 10) / 10 : 0;
    const percentage = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0;
    const overallGrade = resolveGrade(percentage, settings.gradingScale);

    res.json({
      student,
      examName,
      subjects,
      summary: {
        totalScore,
        totalPossible,
        average,
        percentage,
        grade: scored.length > 0 ? overallGrade.grade : '-',
        remarkEn: scored.length > 0 ? overallGrade.remarkEn : '-',
        remarkSo: scored.length > 0 ? overallGrade.remarkSo : '-',
      },
      settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load report card.';
    res.status(500).json({ error: message });
  }
});

router.delete('/', requireRoles('admin'), async (req, res) => {
  try {
    const examName = asString(req.query?.examName);
    const classId = asString(req.query?.classId);
    const subject = asString(req.query?.subject);

    if (!examName || !isValidObjectId(classId)) {
      res.status(400).json({ error: 'Exam name and classId are required.' });
      return;
    }

    const filter: Record<string, unknown> = { examName, classId };
    if (subject) filter.subject = subject;

    await ExamResult.deleteMany(filter);
    res.json({ message: 'Examination records removed.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete examination records.';
    res.status(500).json({ error: message });
  }
});

export default router;
