import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Teacher } from '../models/Teacher.js';
import { Classroom } from '../models/Classroom.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asBoolean, asString } from '../utils/sanitize.js';
import { MAX_IMPORT_ROWS } from '../utils/spreadsheet.js';
import {
  buildTeacherTemplateBuffer,
  parseTeacherSpreadsheetBuffer,
  type ParsedTeacherInputRow,
} from '../utils/classTeacherSpreadsheet.js';
import {
  validateTeacherImportRows,
  type ClassKeyLookup,
  type TeacherLookup,
  type ValidatedTeacherImportRow,
} from '../utils/classTeacherImportValidator.js';

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

function sanitizeIncomingRows(rawRows: unknown): ParsedTeacherInputRow[] {
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
      teacherId: asString(obj.teacherId),
      fullName: asString(obj.fullName),
      phone: asString(obj.phone),
      email: asString(obj.email),
      subjectsText: asString(obj.subjectsText),
      classesText: asString(obj.classesText),
      status: asString(obj.status),
    };
  });
}

async function loadTeacherValidationContext(): Promise<{
  existingTeachers: TeacherLookup[];
  classrooms: ClassKeyLookup[];
  defaultAcademicYear: string;
}> {
  const [settings, teacherDocs, classDocs] = await Promise.all([
    getOrCreateSettings(),
    Teacher.find({}, 'teacherId fullName email').lean(),
    Classroom.find({}, 'name academicYear').sort({ name: 1 }).lean(),
  ]);

  return {
    existingTeachers: teacherDocs.map((t) => ({
      _id: String(t._id),
      teacherId: t.teacherId,
      fullName: t.fullName,
      email: t.email,
    })),
    classrooms: classDocs.map((c) => ({
      _id: String(c._id),
      name: c.name,
      academicYear: c.academicYear,
    })),
    defaultAcademicYear: settings.academicYear,
  };
}

router.get('/template', async (_req, res) => {
  try {
    const [settings, classDocs] = await Promise.all([
      getOrCreateSettings(),
      Classroom.find({}, 'name academicYear').sort({ name: 1 }).lean(),
    ]);

    const currentClasses = classDocs
      .filter((c) => c.academicYear === settings.academicYear)
      .map((c) => c.name);
    const exampleClasses = currentClasses.length > 0 ? currentClasses : classDocs.map((c) => c.name);

    const buffer = await buildTeacherTemplateBuffer(exampleClasses);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="dugsiga-teacher-import-template.xlsx"'
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

    const autoGenerateMissingId =
      req.body?.autoGenerateMissingId === 'true' || req.body?.autoGenerateMissingId === true;

    const parsed = await parseTeacherSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const ctx = await loadTeacherValidationContext();

    const validation = validateTeacherImportRows({
      rows: parsed.rows,
      existingTeachers: ctx.existingTeachers,
      classrooms: ctx.classrooms,
      defaultAcademicYear: ctx.defaultAcademicYear,
      autoGenerateMissingId,
    });

    res.json({
      fileName: req.file.originalname,
      headersDetected: parsed.headers,
      rows: validation.rows,
      summary: validation.summary,
      availableClasses: ctx.classrooms,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process spreadsheet.';
    res.status(400).json({ error: message });
  }
});

router.post('/validate', async (req, res) => {
  try {
    const rows = sanitizeIncomingRows(req.body?.rows);
    const autoGenerateMissingId = asBoolean(req.body?.autoGenerateMissingId, false);
    const ctx = await loadTeacherValidationContext();

    const validation = validateTeacherImportRows({
      rows,
      existingTeachers: ctx.existingTeachers,
      classrooms: ctx.classrooms,
      defaultAcademicYear: ctx.defaultAcademicYear,
      autoGenerateMissingId,
    });

    res.json({
      rows: validation.rows,
      summary: validation.summary,
      availableClasses: ctx.classrooms,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to validate teacher rows.';
    res.status(400).json({ error: message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const incomingRows = sanitizeIncomingRows(req.body?.rows);
    if (incomingRows.length === 0) {
      res.status(400).json({ error: 'No teacher records provided for import.' });
      return;
    }

    const autoGenerateMissingId = asBoolean(req.body?.autoGenerateMissingId, false);
    const ctx = await loadTeacherValidationContext();

    const validation = validateTeacherImportRows({
      rows: incomingRows,
      existingTeachers: ctx.existingTeachers,
      classrooms: ctx.classrooms,
      defaultAcademicYear: ctx.defaultAcademicYear,
      autoGenerateMissingId,
    });

    const validRows: ValidatedTeacherImportRow[] = [];
    const rejectedRows: ValidatedTeacherImportRow[] = [];

    for (const row of validation.rows) {
      if (row.rowStatus === 'valid') {
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
        teacherId: row.teacherId,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        assignedSubjects: row.parsedSubjects,
        assignedClasses: row.matchedClassIds.map((cid) => new mongoose.Types.ObjectId(cid)),
        status: row.normalizedStatus,
        photoUrl: '',
      }));

      let transactionUnsupported = false;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const inserted = await Teacher.insertMany(docs, { session, ordered: true });
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
          const inserted = await Teacher.insertMany(docs, { ordered: false });
          importedCount = inserted.length;
        } catch (bulkErr: unknown) {
          const insertedDocs =
            typeof bulkErr === 'object' &&
            bulkErr !== null &&
            'insertedDocs' in bulkErr &&
            Array.isArray((bulkErr as { insertedDocs: unknown[] }).insertedDocs)
              ? (bulkErr as { insertedDocs: Array<{ teacherId?: string }> }).insertedDocs
              : [];
          importedCount = insertedDocs.length;
          const insertedIdSet = new Set(insertedDocs.map((d) => String(d.teacherId || '')));
          for (const row of validRows) {
            if (!insertedIdSet.has(row.teacherId)) {
              failedCount++;
              duplicateCount++;
              rejectedRows.push({
                ...row,
                rowStatus: 'duplicate',
                errors: [...row.errors, 'Concurrent duplicate Teacher ID detected during save'],
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
        error: 'Duplicate Teacher ID detected during import. Please re-validate and retry.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import teachers.';
    res.status(500).json({ error: message });
  }
});

export default router;
