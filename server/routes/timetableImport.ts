import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Timetable, type SchoolDay } from '../models/Timetable.js';
import { Classroom } from '../models/Classroom.js';
import { Teacher } from '../models/Teacher.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asString } from '../utils/sanitize.js';
import { MAX_IMPORT_ROWS } from '../utils/spreadsheet.js';
import {
  buildTimetableTemplateBuffer,
  parseTimetableSpreadsheetBuffer,
  type ParsedTimetableInputRow,
} from '../utils/timetableSpreadsheet.js';
import {
  ALLOWED_TIMETABLE_DAYS,
  validateTimetableImportRows,
  type ExistingTimetableSlotLookup,
  type TimetableClassLookup,
  type TimetableTeacherLookup,
  type ValidatedTimetableImportRow,
} from '../utils/timetableImportValidator.js';

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

function sanitizeIncomingRows(rawRows: unknown): ParsedTimetableInputRow[] {
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
      className: asString(obj.className),
      dayOfWeek: asString(obj.dayOfWeek),
      periodNumber: asString(obj.periodNumber),
      startTime: asString(obj.startTime),
      endTime: asString(obj.endTime),
      subject: asString(obj.subject),
      teacher: asString(obj.teacher),
      room: asString(obj.room),
    };
  });
}

async function loadTimetableValidationContext(): Promise<{
  classes: TimetableClassLookup[];
  teachers: TimetableTeacherLookup[];
  existingSlots: ExistingTimetableSlotLookup[];
  defaultAcademicYear: string;
}> {
  const [settings, classDocs, teacherDocs, slotDocs] = await Promise.all([
    getOrCreateSettings(),
    Classroom.find({}, 'name academicYear subjects').sort({ name: 1 }).lean(),
    Teacher.find({}, 'teacherId fullName').sort({ fullName: 1 }).lean(),
    Timetable.find(
      { dayOfWeek: { $in: ALLOWED_TIMETABLE_DAYS } },
      'classId dayOfWeek periodNumber teacherId startTime endTime'
    ).lean(),
  ]);

  return {
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
    existingSlots: slotDocs.map((s) => ({
      _id: String(s._id),
      classId: String(s.classId),
      dayOfWeek: s.dayOfWeek as SchoolDay,
      periodNumber: s.periodNumber,
      teacherId: s.teacherId ? String(s.teacherId) : null,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    defaultAcademicYear: settings.academicYear,
  };
}

router.get('/template', async (_req, res) => {
  try {
    const [settings, classDocs, teacherDocs] = await Promise.all([
      getOrCreateSettings(),
      Classroom.find({}, 'name academicYear').sort({ name: 1 }).lean(),
      Teacher.find({}, 'teacherId fullName').sort({ fullName: 1 }).limit(10).lean(),
    ]);

    const currentClasses = classDocs
      .filter((c) => c.academicYear === settings.academicYear)
      .map((c) => c.name);
    const exampleClasses = currentClasses.length > 0 ? currentClasses : classDocs.map((c) => c.name);

    const buffer = await buildTimetableTemplateBuffer({
      exampleClasses,
      exampleTeachers: teacherDocs.map((t) => ({ teacherId: t.teacherId, fullName: t.fullName })),
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="dugsiga-timetable-import-template.xlsx"'
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

    const parsed = await parseTimetableSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const ctx = await loadTimetableValidationContext();

    const validation = validateTimetableImportRows({
      rows: parsed.rows,
      classes: ctx.classes,
      teachers: ctx.teachers,
      existingSlots: ctx.existingSlots,
      defaultAcademicYear: ctx.defaultAcademicYear,
    });

    res.json({
      fileName: req.file.originalname,
      headersDetected: parsed.headers,
      rows: validation.rows,
      summary: validation.summary,
      availableClasses: ctx.classes.map((c) => ({
        _id: c._id,
        name: c.name,
        academicYear: c.academicYear,
      })),
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
    const ctx = await loadTimetableValidationContext();

    const validation = validateTimetableImportRows({
      rows,
      classes: ctx.classes,
      teachers: ctx.teachers,
      existingSlots: ctx.existingSlots,
      defaultAcademicYear: ctx.defaultAcademicYear,
    });

    res.json({
      rows: validation.rows,
      summary: validation.summary,
      availableClasses: ctx.classes.map((c) => ({
        _id: c._id,
        name: c.name,
        academicYear: c.academicYear,
      })),
      availableTeachers: ctx.teachers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to validate timetable rows.';
    res.status(400).json({ error: message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const incomingRows = sanitizeIncomingRows(req.body?.rows);
    if (incomingRows.length === 0) {
      res.status(400).json({ error: 'No timetable records provided for import.' });
      return;
    }

    const ctx = await loadTimetableValidationContext();
    const validation = validateTimetableImportRows({
      rows: incomingRows,
      classes: ctx.classes,
      teachers: ctx.teachers,
      existingSlots: ctx.existingSlots,
      defaultAcademicYear: ctx.defaultAcademicYear,
    });

    const validRows: ValidatedTimetableImportRow[] = [];
    const rejectedRows: ValidatedTimetableImportRow[] = [];

    for (const row of validation.rows) {
      if (row.rowStatus === 'valid' && row.matchedClassId && row.normalizedDay) {
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
        classId: new mongoose.Types.ObjectId(row.matchedClassId!),
        dayOfWeek: row.normalizedDay!,
        periodNumber: row.numericPeriod,
        startTime: row.startTime,
        endTime: row.endTime,
        subject: row.subject,
        teacherId: row.matchedTeacherId
          ? new mongoose.Types.ObjectId(row.matchedTeacherId)
          : null,
        room: row.room,
      }));

      let transactionUnsupported = false;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const inserted = await Timetable.insertMany(docs, { session, ordered: true });
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
          const inserted = await Timetable.insertMany(docs, { ordered: false });
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
                      classId?: unknown;
                      dayOfWeek?: string;
                      periodNumber?: number;
                    }>;
                  }
                ).insertedDocs
              : [];
          importedCount = insertedDocs.length;
          const insertedKeys = new Set(
            insertedDocs.map((d) => `${String(d.classId)}::${d.dayOfWeek}::${d.periodNumber}`)
          );
          for (const row of validRows) {
            const key = `${row.matchedClassId}::${row.normalizedDay}::${row.numericPeriod}`;
            if (!insertedKeys.has(key)) {
              failedCount++;
              duplicateCount++;
              rejectedRows.push({
                ...row,
                rowStatus: 'duplicate',
                errors: [...row.errors, 'Concurrent duplicate timetable slot detected during save'],
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
        error: 'Duplicate timetable slot detected during import. Please re-validate and retry.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import timetable slots.';
    res.status(500).json({ error: message });
  }
});

export default router;
