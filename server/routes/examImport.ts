import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Examination } from '../models/Examination.js';
import { ExamSchedule } from '../models/ExamSchedule.js';
import { ExamResult } from '../models/ExamResult.js';
import { Student } from '../models/Student.js';
import { Classroom } from '../models/Classroom.js';
import { Teacher } from '../models/Teacher.js';
import { requireDb } from '../db.js';
import {
  authenticateJWT,
  getTeacherAssignedClassIds,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.js';
import { asString, isValidObjectId } from '../utils/sanitize.js';
import { MAX_IMPORT_ROWS } from '../utils/spreadsheet.js';
import {
  buildExamResultsTemplateBuffer,
  parseExamResultsSpreadsheetBuffer,
  type ExamTemplateSampleRow,
  type ParsedExamResultInputRow,
} from '../utils/examResultsSpreadsheet.js';
import {
  validateExamResultImportRows,
  type ValidatedExamResultRow,
} from '../utils/examResultsValidator.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin', 'teacher'));

const ALLOWED_EXT_REGEX = /\.(xlsx|xls|csv)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXT_REGEX.test(file.originalname || '')) {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

function handleSingleUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File size exceeds the 10 MB limit.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Invalid file upload.';
    res.status(400).json({ error: msg });
  });
}

function sanitizeIncomingRows(rawRows: unknown): ParsedExamResultInputRow[] {
  if (!Array.isArray(rawRows)) {
    throw new Error('Rows array is required.');
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per request.`);
  }

  return rawRows.map((item, idx) => {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const rowNumber =
      typeof obj.rowNumber === 'number' && Number.isInteger(obj.rowNumber) && obj.rowNumber > 0
        ? obj.rowNumber
        : idx + 2;
    return {
      rowNumber,
      studentId: asString(obj.studentId),
      studentName: asString(obj.studentName),
      className: asString(obj.className),
      academicYear: asString(obj.academicYear),
      term: asString(obj.term),
      examName: asString(obj.examName),
      subject: asString(obj.subject),
      totalMarks: asString(obj.totalMarks),
      marksObtained: asString(obj.marksObtained),
    };
  });
}

async function loadResultsValidationContext(req: AuthRequest) {
  const [students, classrooms, examinations, schedules, existingResults] = await Promise.all([
    Student.find({}, 'studentId fullName classId status').lean(),
    Classroom.find({}, 'name academicYear subjects').lean(),
    Examination.find({}, 'name academicYear term').lean(),
    ExamSchedule.find({}, 'examinationId classId subject').lean(),
    ExamResult.find({}, 'examName classId subject marks').lean(),
  ]);

  const existingResultKeys = new Set<string>();
  for (const resDoc of existingResults) {
    const prefix = `${resDoc.examName.trim().toLowerCase()}::${String(resDoc.classId)}::${resDoc.subject.trim().toLowerCase()}`;
    for (const m of resDoc.marks) {
      existingResultKeys.add(`${prefix}::${String(m.studentId)}`);
    }
  }

  let teacherScope:
    | {
        isTeacher: boolean;
        assignedClassIds: Set<string>;
        assignedSubjectsLower: Set<string>;
      }
    | undefined;

  if (req.user?.role === 'teacher') {
    const assignedIds = await getTeacherAssignedClassIds(req.user);
    const teacherDoc = req.user.teacherRef
      ? await Teacher.findById(req.user.teacherRef).lean()
      : req.user.email
      ? await Teacher.findOne({ email: req.user.email.toLowerCase() }).lean()
      : null;

    teacherScope = {
      isTeacher: true,
      assignedClassIds: new Set(assignedIds),
      assignedSubjectsLower: new Set(
        (teacherDoc?.assignedSubjects || []).map((s) => s.trim().toLowerCase()).filter(Boolean)
      ),
    };
  }

  return {
    students: students.map((s) => ({
      _id: String(s._id),
      studentId: s.studentId,
      fullName: s.fullName,
      classId: String(s.classId),
      status: s.status,
    })),
    classrooms: classrooms.map((c) => ({
      _id: String(c._id),
      name: c.name,
      academicYear: c.academicYear,
      subjects: c.subjects || [],
    })),
    examinations: examinations.map((e) => ({
      _id: String(e._id),
      name: e.name,
      academicYear: e.academicYear,
      term: e.term,
    })),
    schedules: schedules.map((sc) => ({
      examinationId: String(sc.examinationId),
      classId: String(sc.classId),
      subject: sc.subject,
    })),
    existingResultKeys,
    teacherScope,
  };
}

router.get('/template', async (req: AuthRequest, res) => {
  try {
    const examinationId = asString(req.query?.examinationId);
    const classId = asString(req.query?.classId);
    const subjectFilter = asString(req.query?.subject);

    const ctx = await loadResultsValidationContext(req);
    const examById = new Map(ctx.examinations.map((e) => [e._id, e]));
    const classById = new Map(ctx.classrooms.map((c) => [c._id, c]));

    let targetSchedules = ctx.schedules.filter((sc) => {
      if (examinationId && isValidObjectId(examinationId) && sc.examinationId !== examinationId) {
        return false;
      }
      if (classId && isValidObjectId(classId) && sc.classId !== classId) {
        return false;
      }
      if (subjectFilter && sc.subject.toLowerCase() !== subjectFilter.toLowerCase()) {
        return false;
      }
      if (ctx.teacherScope?.isTeacher) {
        if (!ctx.teacherScope.assignedClassIds.has(sc.classId)) return false;
        if (
          ctx.teacherScope.assignedSubjectsLower.size > 0 &&
          !ctx.teacherScope.assignedSubjectsLower.has(sc.subject.toLowerCase())
        ) {
          return false;
        }
      }
      return true;
    });

    if (targetSchedules.length === 0 && !examinationId && !classId) {
      targetSchedules = ctx.schedules;
    }

    const samples: ExamTemplateSampleRow[] = [];
    if (targetSchedules.length > 0) {
      const primarySched = targetSchedules[0];
      const exam = examById.get(primarySched.examinationId);
      const cls = classById.get(primarySched.classId);
      const classStudents = ctx.students
        .filter((s) => s.classId === primarySched.classId && s.status === 'Active')
        .slice(0, 15);

      if (classStudents.length > 0 && exam && cls) {
        for (const st of classStudents) {
          samples.push({
            studentId: st.studentId,
            studentName: st.fullName,
            className: cls.name,
            academicYear: exam.academicYear,
            term: exam.term,
            examName: exam.name,
            subject: primarySched.subject,
            totalMarks: 100,
            marksObtained: 85,
          });
        }
      }
    }

    const scheduleOverview = ctx.schedules
      .map((sc) => ({
        examName: examById.get(sc.examinationId)?.name || '',
        className: classById.get(sc.classId)?.name || '',
        subject: sc.subject,
      }))
      .filter((item) => item.examName && item.className);

    const buffer = await buildExamResultsTemplateBuffer({
      samples,
      examinations: ctx.examinations,
      schedules: scheduleOverview,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="dugsiga-exam-results-template.xlsx"'
    );
    res.send(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate results template.';
    res.status(500).json({ error: message });
  }
});

router.post('/upload', handleSingleUpload, async (req: AuthRequest, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Please select a .xlsx, .xls, or .csv file.' });
      return;
    }

    const parsed = await parseExamResultsSpreadsheetBuffer(
      req.file.buffer,
      req.file.originalname
    );
    const ctx = await loadResultsValidationContext(req);

    const validation = validateExamResultImportRows({
      rows: parsed.rows,
      students: ctx.students,
      classrooms: ctx.classrooms,
      examinations: ctx.examinations,
      schedules: ctx.schedules,
      existingResultKeys: ctx.existingResultKeys,
      teacherScope: ctx.teacherScope,
    });

    res.json({
      fileName: req.file.originalname,
      headersDetected: parsed.headers,
      rows: validation.rows,
      summary: validation.summary,
      examinations: ctx.examinations,
      classrooms: ctx.classrooms.map((c) => ({
        _id: c._id,
        name: c.name,
        subjects: c.subjects,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse results file.';
    res.status(400).json({ error: message });
  }
});

router.post('/validate', async (req: AuthRequest, res) => {
  try {
    const rows = sanitizeIncomingRows(req.body?.rows);
    const ctx = await loadResultsValidationContext(req);

    const validation = validateExamResultImportRows({
      rows,
      students: ctx.students,
      classrooms: ctx.classrooms,
      examinations: ctx.examinations,
      schedules: ctx.schedules,
      existingResultKeys: ctx.existingResultKeys,
      teacherScope: ctx.teacherScope,
    });

    res.json({
      rows: validation.rows,
      summary: validation.summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to validate result rows.';
    res.status(400).json({ error: message });
  }
});

router.post('/commit', async (req: AuthRequest, res) => {
  try {
    const incomingRows = sanitizeIncomingRows(req.body?.rows);
    if (incomingRows.length === 0) {
      res.status(400).json({ error: 'No examination result rows provided.' });
      return;
    }

    const ctx = await loadResultsValidationContext(req);
    const validation = validateExamResultImportRows({
      rows: incomingRows,
      students: ctx.students,
      classrooms: ctx.classrooms,
      examinations: ctx.examinations,
      schedules: ctx.schedules,
      existingResultKeys: ctx.existingResultKeys,
      teacherScope: ctx.teacherScope,
    });

    const validRows: ValidatedExamResultRow[] = [];
    const rejectedRows: ValidatedExamResultRow[] = [];

    for (const row of validation.rows) {
      if (
        row.rowStatus === 'valid' &&
        row.matchedStudentObjectId &&
        row.matchedClassId &&
        row.matchedExaminationId &&
        row.numericTotalMarks !== null &&
        row.numericMarksObtained !== null
      ) {
        validRows.push(row);
      } else {
        rejectedRows.push(row);
      }
    }

    // Group valid rows by (examName, classId, subject) so chunked imports merge cleanly into ExamResult
    const groups = new Map<
      string,
      {
        examinationId: string;
        examName: string;
        academicYear: string;
        term: string;
        classId: string;
        subject: string;
        maxMarks: number;
        entries: Array<{ studentId: string; score: number; row: ValidatedExamResultRow }>;
      }
    >();

    for (const row of validRows) {
      const key = `${row.canonicalExamName}::${row.matchedClassId}::${row.canonicalSubject}`;
      const existingGroup = groups.get(key);
      if (existingGroup) {
        existingGroup.entries.push({
          studentId: row.matchedStudentObjectId!,
          score: row.numericMarksObtained!,
          row,
        });
      } else {
        groups.set(key, {
          examinationId: row.matchedExaminationId!,
          examName: row.canonicalExamName,
          academicYear: row.canonicalAcademicYear,
          term: row.canonicalTerm,
          classId: row.matchedClassId!,
          subject: row.canonicalSubject,
          maxMarks: row.numericTotalMarks!,
          entries: [
            {
              studentId: row.matchedStudentObjectId!,
              score: row.numericMarksObtained!,
              row,
            },
          ],
        });
      }
    }

    let importedCount = 0;
    let duplicateCount = validation.summary.duplicates;
    let failedCount = 0;

    for (const group of groups.values()) {
      const existingDoc = await ExamResult.findOne({
        examName: group.examName,
        classId: group.classId,
        subject: group.subject,
      });

      if (existingDoc) {
        const existingStudentIds = new Set(existingDoc.marks.map((m) => String(m.studentId)));
        let addedInGroup = 0;
        for (const entry of group.entries) {
          if (existingStudentIds.has(entry.studentId)) {
            duplicateCount++;
            rejectedRows.push({
              ...entry.row,
              rowStatus: 'duplicate',
              errors: [...entry.row.errors, 'Result already saved in database for this student.'],
            });
          } else {
            existingDoc.marks.push({
              studentId: new mongoose.Types.ObjectId(entry.studentId),
              score: entry.score,
            });
            existingStudentIds.add(entry.studentId);
            addedInGroup++;
          }
        }
        if (addedInGroup > 0) {
          if (!existingDoc.examinationId) {
            existingDoc.examinationId = new mongoose.Types.ObjectId(group.examinationId);
          }
          if (!existingDoc.term && group.term) {
            existingDoc.term = group.term;
          }
          await existingDoc.save();
          importedCount += addedInGroup;
        }
      } else {
        try {
          await ExamResult.create({
            examinationId: new mongoose.Types.ObjectId(group.examinationId),
            examName: group.examName,
            academicYear: group.academicYear,
            term: group.term,
            classId: new mongoose.Types.ObjectId(group.classId),
            subject: group.subject,
            maxMarks: group.maxMarks,
            marks: group.entries.map((e) => ({
              studentId: new mongoose.Types.ObjectId(e.studentId),
              score: e.score,
            })),
            recordedBy: req.user?._id,
          });
          importedCount += group.entries.length;
        } catch (err) {
          failedCount += group.entries.length;
          const msg = err instanceof Error ? err.message : 'Database save error';
          for (const e of group.entries) {
            rejectedRows.push({
              ...e.row,
              rowStatus: 'invalid',
              errors: [...e.row.errors, msg],
            });
          }
        }
      }
    }

    res.json({
      totalProcessed: validation.summary.total,
      importedCount,
      duplicateCount,
      invalidCount: validation.summary.invalid,
      failedCount,
      rejectedRows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import examination results.';
    res.status(500).json({ error: message });
  }
});

export default router;
