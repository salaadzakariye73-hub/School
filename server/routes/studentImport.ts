import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Student } from '../models/Student.js';
import { Classroom } from '../models/Classroom.js';
import { getOrCreateSettings } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asBoolean, asString } from '../utils/sanitize.js';
import {
  buildStudentTemplateBuffer,
  MAX_IMPORT_ROWS,
  parseSpreadsheetBuffer,
  type ParsedStudentInputRow,
} from '../utils/spreadsheet.js';
import {
  validateStudentImportRows,
  type ClassroomLookup,
  type ValidatedStudentImportRow,
} from '../utils/studentImportValidator.js';

const router = Router();
router.use(requireDb, authenticateJWT, requireRoles('admin'));

const ALLOWED_EXT_REGEX = /\.(xlsx|xls|csv)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
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

function sanitizeIncomingRows(rawRows: unknown): ParsedStudentInputRow[] {
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
      studentId: asString(obj.studentId),
      fullName: asString(obj.fullName),
      gender: asString(obj.gender),
      className: asString(obj.className),
      parentName: asString(obj.parentName),
      parentPhone: asString(obj.parentPhone),
      address: asString(obj.address),
      dateOfBirth: asString(obj.dateOfBirth),
      admissionDate: asString(obj.admissionDate),
      status: asString(obj.status),
    };
  });
}

async function loadValidationContext(): Promise<{
  classrooms: ClassroomLookup[];
  existingIds: Set<string>;
  defaultAcademicYear: string;
}> {
  const [settings, classroomDocs, existingStudents] = await Promise.all([
    getOrCreateSettings(),
    Classroom.find({}, 'name academicYear').sort({ name: 1 }).lean(),
    Student.find({}, 'studentId').lean(),
  ]);

  const classrooms: ClassroomLookup[] = classroomDocs.map((c) => ({
    _id: String(c._id),
    name: c.name,
    academicYear: c.academicYear,
  }));

  const existingIds = new Set<string>(existingStudents.map((s) => String(s.studentId).trim()));

  return {
    classrooms,
    existingIds,
    defaultAcademicYear: settings.academicYear,
  };
}

router.get('/template', async (_req, res) => {
  try {
    const [settings, classroomDocs] = await Promise.all([
      getOrCreateSettings(),
      Classroom.find({}, 'name academicYear').sort({ name: 1 }).lean(),
    ]);

    const currentClasses = classroomDocs
      .filter((c) => c.academicYear === settings.academicYear)
      .map((c) => c.name);
    const fallbackClasses = classroomDocs.map((c) => c.name);
    const exampleClasses = currentClasses.length > 0 ? currentClasses : fallbackClasses;

    const buffer = await buildStudentTemplateBuffer(exampleClasses, settings.academicYear);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="dugsiga-student-import-template.xlsx"'
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

    const parsed = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const ctx = await loadValidationContext();

    const validation = validateStudentImportRows({
      rows: parsed.rows,
      classrooms: ctx.classrooms,
      existingStudentIds: ctx.existingIds,
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
    const ctx = await loadValidationContext();

    const validation = validateStudentImportRows({
      rows,
      classrooms: ctx.classrooms,
      existingStudentIds: ctx.existingIds,
      defaultAcademicYear: ctx.defaultAcademicYear,
      autoGenerateMissingId,
    });

    res.json({
      rows: validation.rows,
      summary: validation.summary,
      availableClasses: ctx.classrooms,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to validate student rows.';
    res.status(400).json({ error: message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const incomingRows = sanitizeIncomingRows(req.body?.rows);
    if (incomingRows.length === 0) {
      res.status(400).json({ error: 'No student records provided for import.' });
      return;
    }

    const autoGenerateMissingId = asBoolean(req.body?.autoGenerateMissingId, false);
    const ctx = await loadValidationContext();

    const validation = validateStudentImportRows({
      rows: incomingRows,
      classrooms: ctx.classrooms,
      existingStudentIds: ctx.existingIds,
      defaultAcademicYear: ctx.defaultAcademicYear,
      autoGenerateMissingId,
    });

    const validRows: ValidatedStudentImportRow[] = [];
    const rejectedRows: ValidatedStudentImportRow[] = [];

    for (const row of validation.rows) {
      if (row.rowStatus === 'valid' && row.matchedClassId && row.normalizedGender) {
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
        studentId: row.studentId,
        fullName: row.fullName,
        gender: row.normalizedGender as 'Male' | 'Female',
        dateOfBirth: row.dateOfBirth,
        parentName: row.parentName,
        parentPhone: row.parentPhone,
        address: row.address,
        classId: new mongoose.Types.ObjectId(row.matchedClassId!),
        academicYear: row.academicYear,
        admissionDate: row.admissionDate,
        status: row.normalizedStatus,
        customFeeOverride: null,
        photoUrl: '',
        promotionHistory: [],
      }));

      // Attempt atomic MongoDB transaction when supported (replica sets / Atlas); fall back cleanly on standalone
      let transactionUnsupported = false;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const inserted = await Student.insertMany(docs, { session, ordered: true });
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
          const inserted = await Student.insertMany(docs, { ordered: false });
          importedCount = inserted.length;
        } catch (bulkErr: unknown) {
          const insertedDocs =
            typeof bulkErr === 'object' &&
            bulkErr !== null &&
            'insertedDocs' in bulkErr &&
            Array.isArray((bulkErr as { insertedDocs: unknown[] }).insertedDocs)
              ? (bulkErr as { insertedDocs: Array<{ studentId?: string }> }).insertedDocs
              : [];
          importedCount = insertedDocs.length;
          const insertedIdSet = new Set(insertedDocs.map((d) => String(d.studentId || '')));
          for (const row of validRows) {
            if (!insertedIdSet.has(row.studentId)) {
              failedCount++;
              duplicateCount++;
              rejectedRows.push({
                ...row,
                rowStatus: 'duplicate',
                errors: [...row.errors, 'Concurrent duplicate student ID detected during save'],
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
        error: 'Duplicate student admission number detected during import. Please re-validate and retry.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import students.';
    res.status(500).json({ error: message });
  }
});

export default router;
