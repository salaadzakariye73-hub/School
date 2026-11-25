import type { StudentStatus } from '../models/Student.js';
import { normalizeDateCell, type ParsedStudentInputRow } from './spreadsheet.js';

export interface ClassroomLookup {
  _id: string;
  name: string;
  academicYear: string;
}

export type BulkRowValidationStatus = 'valid' | 'duplicate' | 'invalid';

export interface ValidatedStudentImportRow extends ParsedStudentInputRow {
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  matchedClassId: string | null;
  matchedClassName: string;
  academicYear: string;
  normalizedGender: 'Male' | 'Female' | null;
  normalizedStatus: StudentStatus;
}

export interface ValidationSummary {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  warnings: number;
}

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeClassKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeGenderValue(raw: string): 'Male' | 'Female' | null {
  const val = raw.trim().toLowerCase();
  if (val === 'male' || val === 'm' || val === 'boy' || val === 'lab') return 'Male';
  if (val === 'female' || val === 'f' || val === 'girl' || val === 'dheddig') return 'Female';
  return null;
}

export function normalizeStatusValue(raw: string): StudentStatus | null {
  const val = raw.trim().toLowerCase();
  if (!val || val === 'active' || val === 'firfircoon') return 'Active';
  if (val === 'inactive' || val === 'aan firfircoonayn') return 'Inactive';
  if (val === 'graduated' || val === 'qalin jabiyay') return 'Graduated';
  if (val === 'transferred' || val === 'la wareejiyay') return 'Transferred';
  return null;
}

export function isValidPhoneNumber(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (!/^[+\d\s\-().]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function isValidYmdDate(ymd: string): boolean {
  if (!YMD_REGEX.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validateStudentImportRows(options: {
  rows: ParsedStudentInputRow[];
  classrooms: ClassroomLookup[];
  existingStudentIds: Set<string>;
  defaultAcademicYear: string;
  autoGenerateMissingId?: boolean;
}): { rows: ValidatedStudentImportRow[]; summary: ValidationSummary } {
  const {
    rows,
    classrooms,
    existingStudentIds,
    defaultAcademicYear,
    autoGenerateMissingId = false,
  } = options;

  // Build normalized classroom lookup preferring defaultAcademicYear
  const classLookup = new Map<string, ClassroomLookup>();
  for (const cls of classrooms) {
    const key = normalizeClassKey(cls.name);
    const prev = classLookup.get(key);
    if (!prev || cls.academicYear === defaultAcademicYear) {
      classLookup.set(key, cls);
    }
  }

  // Case-insensitive set of existing IDs
  const existingIdsLower = new Set<string>();
  let maxAutoSeq = 0;
  const currentYear = new Date().getFullYear();
  const autoIdPrefix = `STU-${currentYear}-`;

  for (const id of existingStudentIds) {
    const clean = id.trim();
    existingIdsLower.add(clean.toLowerCase());
    if (clean.toUpperCase().startsWith(autoIdPrefix)) {
      const suffix = Number(clean.slice(autoIdPrefix.length));
      if (Number.isInteger(suffix) && suffix > maxAutoSeq) {
        maxAutoSeq = suffix;
      }
    }
  }

  // Track duplicates within the uploaded batch
  const seenInBatch = new Map<string, number>();
  const todayYmd = new Date().toISOString().slice(0, 10);

  // Pre-scan explicit IDs so auto-generated IDs never collide with explicit ones in the same sheet
  for (const r of rows) {
    const cleanId = (r.studentId || '').trim();
    if (cleanId.toUpperCase().startsWith(autoIdPrefix)) {
      const suffix = Number(cleanId.slice(autoIdPrefix.length));
      if (Number.isInteger(suffix) && suffix > maxAutoSeq) {
        maxAutoSeq = suffix;
      }
    }
  }

  const validatedRows: ValidatedStudentImportRow[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx];
    const errors: string[] = [];
    const warnings: string[] = [];

    let studentId = (raw.studentId || '').trim();
    const fullName = (raw.fullName || '').trim();
    const rawGender = (raw.gender || '').trim();
    const className = (raw.className || '').trim();
    const parentName = (raw.parentName || '').trim();
    const parentPhone = (raw.parentPhone || '').trim();
    const address = (raw.address || '').trim();
    const rawDob = normalizeDateCell(raw.dateOfBirth || '');
    const rawAdmission = normalizeDateCell(raw.admissionDate || '');
    const rawStatus = (raw.status || '').trim();

    if (!studentId) {
      if (autoGenerateMissingId) {
        maxAutoSeq += 1;
        studentId = `${autoIdPrefix}${String(maxAutoSeq).padStart(3, '0')}`;
        warnings.push(`Auto-generated admission number: ${studentId}`);
      } else {
        errors.push('Missing student admission number');
      }
    }

    if (!fullName) {
      errors.push('Missing student full name');
    }

    const normalizedGender = normalizeGenderValue(rawGender);
    if (!rawGender) {
      errors.push('Missing gender (use Male or Female)');
    } else if (!normalizedGender) {
      errors.push(`Invalid gender "${rawGender}" (use Male or Female)`);
    }

    let matchedClass: ClassroomLookup | undefined;
    if (!className) {
      errors.push('Missing class / grade');
    } else {
      matchedClass = classLookup.get(normalizeClassKey(className));
      if (!matchedClass) {
        errors.push(`Class "${className}" not found in school classes`);
      }
    }

    if (!parentName) {
      errors.push('Missing guardian name');
    }

    if (!parentPhone) {
      errors.push('Missing guardian phone number');
    } else if (!isValidPhoneNumber(parentPhone)) {
      errors.push(`Invalid phone number "${parentPhone}"`);
    }

    let dateOfBirth = rawDob;
    if (!dateOfBirth) {
      dateOfBirth = '2010-01-01';
      warnings.push('Date of birth was blank; defaulted to 2010-01-01');
    } else if (!isValidYmdDate(dateOfBirth)) {
      errors.push(`Invalid date of birth "${raw.dateOfBirth}" (expected YYYY-MM-DD)`);
    }

    let admissionDate = rawAdmission;
    if (!admissionDate) {
      admissionDate = todayYmd;
      warnings.push(`Enrollment date was blank; defaulted to ${todayYmd}`);
    } else if (!isValidYmdDate(admissionDate)) {
      errors.push(`Invalid enrollment date "${raw.admissionDate}" (expected YYYY-MM-DD)`);
    }

    const normalizedStatus = normalizeStatusValue(rawStatus);
    if (!normalizedStatus) {
      errors.push(`Invalid status "${rawStatus}" (use Active, Inactive, Graduated, or Transferred)`);
    } else if (!rawStatus) {
      warnings.push('Student status was blank; defaulted to Active');
    }

    let isDuplicate = false;
    if (studentId) {
      const idKey = studentId.toLowerCase();
      if (existingIdsLower.has(idKey)) {
        isDuplicate = true;
        errors.push(`Admission number "${studentId}" already exists in database`);
      } else if (seenInBatch.has(idKey)) {
        isDuplicate = true;
        errors.push(
          `Duplicate admission number "${studentId}" in file (first seen on row ${seenInBatch.get(idKey)})`
        );
      } else {
        seenInBatch.set(idKey, raw.rowNumber || idx + 2);
      }
    }

    let rowStatus: BulkRowValidationStatus = 'valid';
    if (isDuplicate) {
      rowStatus = 'duplicate';
      duplicateCount++;
    } else if (errors.length > 0) {
      rowStatus = 'invalid';
      invalidCount++;
    } else {
      validCount++;
    }

    if (warnings.length > 0) {
      warningCount++;
    }

    validatedRows.push({
      rowNumber: raw.rowNumber || idx + 2,
      studentId,
      fullName,
      gender: normalizedGender || rawGender,
      className: matchedClass ? matchedClass.name : className,
      parentName,
      parentPhone,
      address,
      dateOfBirth,
      admissionDate,
      status: normalizedStatus || rawStatus || 'Active',
      rowStatus,
      errors,
      warnings,
      matchedClassId: matchedClass ? matchedClass._id : null,
      matchedClassName: matchedClass ? matchedClass.name : className,
      academicYear: matchedClass?.academicYear || defaultAcademicYear,
      normalizedGender,
      normalizedStatus: normalizedStatus || 'Active',
    });
  }

  return {
    rows: validatedRows,
    summary: {
      total: validatedRows.length,
      valid: validCount,
      duplicates: duplicateCount,
      invalid: invalidCount,
      warnings: warningCount,
    },
  };
}
