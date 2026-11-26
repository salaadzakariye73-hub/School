import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Classroom } from '../models/Classroom.js';
import { Teacher } from '../models/Teacher.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asString } from '../utils/sanitize.js';
import { MAX_IMPORT_ROWS } from '../utils/spreadsheet.js';
import {
  buildClassTemplateBuffer,
  parseClassSpreadsheetBuffer,
  type ParsedClassInputRow,
} from '../utils/classTeacherSpreadsheet.js';
import {
  validateClassImportRows,
  type ClassKeyLookup,
  type TeacherLookup,
  type ValidatedClassImportRow,
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

function sanitizeIncomingRows(rawRows: unknown): ParsedClassInputRow[] {
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
      name: asString(obj.name),
      academicYear: asString(obj.academicYear),
      classTeacher: asString(obj.classTeacher),
      subjectsText: asString(obj.subjectsText),
      tuitionFee: asString(obj.tuitionFee),
    };
  });
}

async function loadClassValidationContext(): Promise<{
  teachers: TeacherLookup[];
  existingClasses: ClassKeyLookup[];
  defaultAcademicYear: string;
}> {
  const [settings, teacherDocs, classDocs] = await Promise.all([
    getOrCreateSettings(),
    Teacher.find({}, 'teacherId fullName email').sort({ fullName: 1 }).lean(),
    Classroom.find({}, 'name academicYear').sort({ name: 1 }).lean(),
  ]);

  return {
    teachers: teacherDocs.map((t) => ({
      _id: String(t._id),
      teacherId: t.teacherId,
      fullName: t.fullName,
      email: t.email,
    })),
    existingClasses: classDocs.map((c) => ({
      _id: String(c._id),
      name: c.name,
      academicYear: c.academicYear,
    })),
    defaultAcademicYear: settings.academicYear,
  };
}

router.get('/template', async (_req, res) => {
  try {
    const [settings, teacherDocs] = await Promise.all([
      getOrCreateSettings(),
      Teacher.find({}, 'teacherId fullName').sort({ fullName: 1 }).limit(5).lean(),
    ]);

    const buffer = await buildClassTemplateBuffer(
      settings.academicYear,
      teacherDocs.map((t) => ({ teacherId: t.teacherId, fullName: t.fullName }))
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="dugsiga-class-import-template.xlsx"'
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

    const parsed = await parseClassSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const ctx = await loadClassValidationContext();

    const validation = validateClassImportRows({
      rows: parsed.rows,
      teachers: ctx.teachers,
      existingClasses: ctx.existingClasses,
      defaultAcademicYear: ctx.defaultAcademicYear,
    });

    res.json({
      fileName: req.file.originalname,
      headersDetected: parsed.headers,
      rows: validation.rows,
      summary: validation.summary,
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
    const ctx = await loadClassValidationContext();

    const validation = validateClassImportRows({
      rows,
      teachers: ctx.teachers,
      existingClasses: ctx.existingClasses,
      defaultAcademicYear: ctx.defaultAcademicYear,
    });

    res.json({
      rows: validation.rows,
      summary: validation.summary,
      availableTeachers: ctx.teachers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to validate class rows.';
    res.status(400).json({ error: message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const incomingRows = sanitizeIncomingRows(req.body?.rows);
    if (incomingRows.length === 0) {
      res.status(400).json({ error: 'No class records provided for import.' });
      return;
    }

    const ctx = await loadClassValidationContext();
    const validation = validateClassImportRows({
      rows: incomingRows,
      teachers: ctx.teachers,
      existingClasses: ctx.existingClasses,
      defaultAcademicYear: ctx.defaultAcademicYear,
    });

    const validRows: ValidatedClassImportRow[] = [];
    const rejectedRows: ValidatedClassImportRow[] = [];

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
        name: row.name,
        academicYear: row.academicYear,
        classTeacherId: row.matchedTeacherId
          ? new mongoose.Types.ObjectId(row.matchedTeacherId)
          : null,
        subjects: row.parsedSubjects,
        tuitionFee: row.numericTuitionFee,
      }));

      let transactionUnsupported = false;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const inserted = await Classroom.insertMany(docs, { session, ordered: true });
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
          const inserted = await Classroom.insertMany(docs, { ordered: false });
          importedCount = inserted.length;
        } catch (bulkErr: unknown) {
          const insertedDocs =
            typeof bulkErr === 'object' &&
            bulkErr !== null &&
            'insertedDocs' in bulkErr &&
            Array.isArray((bulkErr as { insertedDocs: unknown[] }).insertedDocs)
              ? (bulkErr as { insertedDocs: Array<{ name?: string; academicYear?: string }> }).insertedDocs
              : [];
          importedCount = insertedDocs.length;
          const insertedPairSet = new Set(
            insertedDocs.map((d) => `${String(d.name || '').toLowerCase()}::${String(d.academicYear || '').toLowerCase()}`)
          );
          for (const row of validRows) {
            const pair = `${row.name.toLowerCase()}::${row.academicYear.toLowerCase()}`;
            if (!insertedPairSet.has(pair)) {
              failedCount++;
              duplicateCount++;
              rejectedRows.push({
                ...row,
                rowStatus: 'duplicate',
                errors: [...row.errors, 'Concurrent duplicate class detected during save'],
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
        error: 'Duplicate class detected during import. Please re-validate and retry.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import classes.';
    res.status(500).json({ error: message });
  }
});

export default router;
