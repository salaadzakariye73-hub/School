import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Examination } from '../models/Examination.js';
import { ExamSchedule } from '../models/ExamSchedule.js';
import { Classroom } from '../models/Classroom.js';
import { Teacher } from '../models/Teacher.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asString, isValidObjectId } from '../utils/sanitize.js';
import { MAX_IMPORT_ROWS } from '../utils/spreadsheet.js';
import type { ExistingScheduleSnapshot } from '../utils/examScheduleValidator.js';
import {
  buildExamTimetableTemplateBuffer,
  parseExamTimetableSpreadsheetBuffer,
  type ParsedExamScheduleInputRow,
} from '../utils/examScheduleSpreadsheet.js';
import {
  validateExamScheduleImportRows,
  type ExamClassLookup,
  type ExamLookupItem,
  type ExamTeacherLookup,
  type ValidatedExamScheduleImportRow,
} from '../utils/examScheduleImportValidator.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin'));

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

function sanitizeIncomingRows(rawRows: unknown): ParsedExamScheduleInputRow[] {
  if (!Array.isArray(rawRows)) {
    throw new Error('Rows array is required.');
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per request.`);
  }

  return rawRows.map((item, idx) => {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const rowNum =
      typeof obj.rowNumber === 'number' && Number.isInteger(obj.rowNumber) && obj.rowNumber > 0
        ? obj.rowNumber
        : idx + 2;
    return {
      rowNumber: rowNum,
      examinationName: asString(obj.examinationName),
      className: asString(obj.className),
      examDate: asString(obj.examDate),
      subject: asString(obj.subject),
      startTime: asString(obj.startTime),
      endTime: asString(obj.endTime),
      invigilator: asString(obj.invigilator),
      room: asString(obj.room),
      notes: asString(obj.notes),
    };
  });
}

async function loadExamScheduleValidationContext(): Promise<{
  examinations: ExamLookupItem[];
  classes: ExamClassLookup[];
  teachers: ExamTeacherLookup[];
  existingSchedules: ExistingScheduleSnapshot[];
  defaultAcademicYear: string;
}> {
  const [settings, examDocs, classDocs, teacherDocs, scheduleDocs] = await Promise.all([
    getOrCreateSettings(),
    Examination.find({}, 'name academicYear term startDate endDate')
      .sort({ startDate: -1 })
      .lean(),
    Classroom.find({}, 'name academicYear subjects').sort({ name: 1 }).lean(),
    Teacher.find({}, 'teacherId fullName').sort({ fullName: 1 }).lean(),
    ExamSchedule.find()
      .populate('examinationId', 'name')
      .populate('classId', 'name')
      .populate('invigilatorId', 'fullName')
      .lean(),
  ]);

  const existingSchedules: ExistingScheduleSnapshot[] = scheduleDocs.map((sc) => {
    const ex = sc.examinationId as unknown as { _id?: string; name?: string } | null;
    const cls = sc.classId as unknown as { _id?: string; name?: string } | null;
    const inv = sc.invigilatorId as unknown as { _id?: string; fullName?: string } | null;
    return {
      _id: String(sc._id),
      examinationId: String(ex?._id || sc.examinationId),
      examinationName: ex?.name || 'Examination',
      classId: String(cls?._id || sc.classId),
      className: cls?.name || 'Class',
      examDate: sc.examDate,
      startTime: sc.startTime,
      endTime: sc.endTime,
      subject: sc.subject,
      invigilatorId: String(inv?._id || sc.invigilatorId),
      invigilatorName: inv?.fullName || 'Teacher',
      room: sc.room,
    };
  });

  return {
    examinations: examDocs.map((e) => ({
      _id: String(e._id),
      name: e.name,
      academicYear: e.academicYear,
      term: e.term,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
    classes: classDocs.map((c) => ({
      _id: String(c._id),
      name: c.name,
      academicYear: c.academicYear,
      subjects: c.subjects || [],
    })),
    teachers: teacherDocs.map((t) => ({
      _id: String(t._id),
      teacherId: t.teacherId,
      fullName: t.fullName,
    })),
    existingSchedules,
    defaultAcademicYear: settings.academicYear,
  };
}

router.get('/template', async (req, res) => {
  try {
    const examinationId = asString(req.query?.examinationId);
    const ctx = await loadExamScheduleValidationContext();

    const orderedExams =
      examinationId && isValidObjectId(examinationId)
        ? [
            ...ctx.examinations.filter((e) => e._id === examinationId),
            ...ctx.examinations.filter((e) => e._id !== examinationId),
          ]
        : ctx.examinations;

    const buffer = await buildExamTimetableTemplateBuffer({
      examinations: orderedExams,
      classes: ctx.classes.map((c) => ({ name: c.name, subjects: c.subjects })),
      teachers: ctx.teachers,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="dugsiga-exam-timetable-template.xlsx"'
    );
    res.send(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate Excel template.';
    res.status(500).json({ error: message });
  }
});

router.post('/upload', handleSingleUpload, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Please select an Excel (.xlsx, .xls) or CSV (.csv) file.' });
      return;
    }

    const fallbackExaminationId = isValidObjectId(req.body?.fallbackExaminationId)
      ? asString(req.body.fallbackExaminationId)
      : undefined;

    const parsed = await parseExamTimetableSpreadsheetBuffer(
      req.file.buffer,
      req.file.originalname
    );
    const ctx = await loadExamScheduleValidationContext();

    const validation = validateExamScheduleImportRows({
      rows: parsed.rows,
      examinations: ctx.examinations,
      classes: ctx.classes,
      teachers: ctx.teachers,
      existingSchedules: ctx.existingSchedules,
      defaultAcademicYear: ctx.defaultAcademicYear,
      fallbackExaminationId,
    });

    res.json({
      fileName: req.file.originalname,
      headersDetected: parsed.headers,
      rows: validation.rows,
      summary: validation.summary,
      examinations: ctx.examinations,
      availableClasses: ctx.classes,
      availableTeachers: ctx.teachers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process spreadsheet.';
    res.status(400).json({ error: message });
  }
});

router.post('/validate', async (req, res) => {
  try {
    const rows = sanitizeIncomingRows(req.body?.rows);
    const fallbackExaminationId = isValidObjectId(req.body?.fallbackExaminationId)
      ? asString(req.body.fallbackExaminationId)
      : undefined;

    const ctx = await loadExamScheduleValidationContext();
    const validation = validateExamScheduleImportRows({
      rows,
      examinations: ctx.examinations,
      classes: ctx.classes,
      teachers: ctx.teachers,
      existingSchedules: ctx.existingSchedules,
      defaultAcademicYear: ctx.defaultAcademicYear,
      fallbackExaminationId,
    });

    res.json({
      rows: validation.rows,
      summary: validation.summary,
      examinations: ctx.examinations,
      availableClasses: ctx.classes,
      availableTeachers: ctx.teachers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to validate examination timetable rows.';
    res.status(400).json({ error: message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const incomingRows = sanitizeIncomingRows(req.body?.rows);
    if (incomingRows.length === 0) {
      res.status(400).json({ error: 'No examination timetable rows provided for import.' });
      return;
    }

    const fallbackExaminationId = isValidObjectId(req.body?.fallbackExaminationId)
      ? asString(req.body.fallbackExaminationId)
      : undefined;

    const ctx = await loadExamScheduleValidationContext();
    const validation = validateExamScheduleImportRows({
      rows: incomingRows,
      examinations: ctx.examinations,
      classes: ctx.classes,
      teachers: ctx.teachers,
      existingSchedules: ctx.existingSchedules,
      defaultAcademicYear: ctx.defaultAcademicYear,
      fallbackExaminationId,
    });

    const validRows: ValidatedExamScheduleImportRow[] = [];
    const rejectedRows: ValidatedExamScheduleImportRow[] = [];

    for (const row of validation.rows) {
      if (
        row.rowStatus === 'valid' &&
        row.matchedExaminationId &&
        row.matchedClassId &&
        row.matchedInvigilatorId
      ) {
        validRows.push(row);
      } else {
        rejectedRows.push(row);
      }
    }

    let importedCount = 0;
    let failedCount = 0;
    let duplicateCount = validation.summary.duplicates;
    const invalidCount = validation.summary.invalid;

    if (validRows.length > 0) {
      const docs = validRows.map((row) => ({
        examinationId: new mongoose.Types.ObjectId(row.matchedExaminationId!),
        classId: new mongoose.Types.ObjectId(row.matchedClassId!),
        subject: row.subject,
        examDate: row.examDate,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        durationMinutes: row.durationMinutes,
        invigilatorId: new mongoose.Types.ObjectId(row.matchedInvigilatorId!),
        room: row.room,
        notes: row.notes,
      }));

      let transactionUnsupported = false;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const inserted = await ExamSchedule.insertMany(docs, { session, ordered: true });
          importedCount = inserted.length;
        });
      } catch (txErr: unknown) {
        const msg = txErr instanceof Error ? txErr.message : '';
        const code =
          typeof txErr === 'object' && txErr !== null && 'code' in txErr
            ? Number((txErr as { code: unknown }).code)
            : 0;
        if (code === 20 || msg.includes('Transaction numbers are only allowed')) {
          transactionUnsupported = true;
        } else {
          throw txErr;
        }
      } finally {
        await session.endSession();
      }

      if (transactionUnsupported) {
        try {
          const inserted = await ExamSchedule.insertMany(docs, { ordered: false });
          importedCount = inserted.length;
        } catch (bulkErr: unknown) {
          const insertedDocs =
            typeof bulkErr === 'object' &&
            bulkErr !== null &&
            'insertedDocs' in bulkErr &&
            Array.isArray((bulkErr as { insertedDocs: unknown[] }).insertedDocs)
              ? (
                  bulkErr as {
                    insertedDocs: Array<{
                      examinationId?: unknown;
                      classId?: unknown;
                      subject?: string;
                    }>;
                  }
                ).insertedDocs
              : [];
          importedCount = insertedDocs.length;
          const insertedKeys = new Set(
            insertedDocs.map(
              (d) =>
                `${String(d.examinationId)}::${String(d.classId)}::${String(d.subject || '').toLowerCase()}`
            )
          );
          for (const row of validRows) {
            const key = `${row.matchedExaminationId}::${row.matchedClassId}::${row.subject.toLowerCase()}`;
            if (!insertedKeys.has(key)) {
              failedCount++;
              duplicateCount++;
              rejectedRows.push({
                ...row,
                rowStatus: 'duplicate',
                errors: [
                  ...row.errors,
                  'Concurrent duplicate examination schedule detected during save',
                ],
              });
            }
          }
        }
      }
    }

    res.json({
      totalProcessed: validation.summary.total,
      importedCount,
      duplicateCount,
      invalidCount,
      failedCount,
      rejectedRows,
    });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({
        error: 'Duplicate examination schedule detected during import. Please re-validate and retry.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import examination timetable.';
    res.status(500).json({ error: message });
  }
});

export default router;
