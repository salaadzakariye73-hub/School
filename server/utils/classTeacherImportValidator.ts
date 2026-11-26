import { isValidPhoneNumber, type BulkRowValidationStatus, type ValidationSummary } from './studentImportValidator.js';
import type { ParsedClassInputRow, ParsedTeacherInputRow } from './classTeacherSpreadsheet.js';

export interface TeacherLookup {
  _id: string;
  teacherId: string;
  fullName: string;
  email: string;
}

export interface ClassKeyLookup {
  _id: string;
  name: string;
  academicYear: string;
}

export interface ValidatedClassImportRow extends ParsedClassInputRow {
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  matchedTeacherId: string | null;
  matchedTeacherLabel: string;
  parsedSubjects: string[];
  numericTuitionFee: number;
}

export interface ValidatedTeacherImportRow extends ParsedTeacherInputRow {
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  parsedSubjects: string[];
  matchedClassIds: string[];
  matchedClassNames: string[];
  normalizedStatus: 'Active' | 'Inactive';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeKey(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

function splitListText(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;|]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

export function validateClassImportRows(options: {
  rows: ParsedClassInputRow[];
  teachers: TeacherLookup[];
  existingClasses: ClassKeyLookup[];
  defaultAcademicYear: string;
}): { rows: ValidatedClassImportRow[]; summary: ValidationSummary } {
  const { rows, teachers, existingClasses, defaultAcademicYear } = options;

  const teacherByIdOrName = new Map<string, TeacherLookup>();
  for (const t of teachers) {
    teacherByIdOrName.set(normalizeKey(t.teacherId), t);
    teacherByIdOrName.set(normalizeKey(t.fullName), t);
  }

  const existingPairSet = new Set<string>();
  for (const c of existingClasses) {
    existingPairSet.add(`${normalizeKey(c.name)}::${normalizeKey(c.academicYear)}`);
  }

  const seenInBatch = new Map<string, number>();
  const validatedRows: ValidatedClassImportRow[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx];
    const rowNumber = raw.rowNumber || idx + 2;
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = (raw.name || '').trim();
    let academicYear = (raw.academicYear || '').trim();
    const classTeacher = (raw.classTeacher || '').trim();
    const subjectsText = (raw.subjectsText || '').trim();
    const rawFee = (raw.tuitionFee || '').trim();

    if (!name) {
      errors.push('Missing class name');
    }

    if (!academicYear) {
      academicYear = defaultAcademicYear;
      warnings.push(`Academic year was blank; defaulted to ${defaultAcademicYear}`);
    }

    let matchedTeacher: TeacherLookup | null = null;
    if (classTeacher) {
      matchedTeacher = teacherByIdOrName.get(normalizeKey(classTeacher)) || null;
      if (!matchedTeacher) {
        errors.push(`Teacher "${classTeacher}" not found in Teachers list`);
      }
    }

    const parsedSubjects = splitListText(subjectsText);
    if (parsedSubjects.length === 0) {
      warnings.push('No subjects specified (will save with empty subjects list)');
    }

    let numericTuitionFee = 0;
    if (!rawFee) {
      numericTuitionFee = 0;
      warnings.push('Tuition fee was blank; defaulted to 0');
    } else {
      const parsedNum = Number(rawFee.replace(/,/g, ''));
      if (!Number.isFinite(parsedNum) || parsedNum < 0) {
        errors.push(`Invalid tuition fee "${rawFee}" (must be 0 or greater)`);
      } else {
        numericTuitionFee = Math.round(parsedNum * 100) / 100;
      }
    }

    let isDuplicate = false;
    if (name && academicYear) {
      const pairKey = `${normalizeKey(name)}::${normalizeKey(academicYear)}`;
      if (existingPairSet.has(pairKey)) {
        isDuplicate = true;
        errors.push(`Class "${name}" (${academicYear}) already exists in database`);
      } else if (seenInBatch.has(pairKey)) {
        isDuplicate = true;
        errors.push(
          `Duplicate class "${name}" (${academicYear}) in file (first seen on row ${seenInBatch.get(pairKey)})`
        );
      } else {
        seenInBatch.set(pairKey, rowNumber);
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
      rowNumber,
      name,
      academicYear,
      classTeacher: matchedTeacher ? matchedTeacher.teacherId : classTeacher,
      subjectsText,
      tuitionFee: rawFee ? rawFee : '0',
      rowStatus,
      errors,
      warnings,
      matchedTeacherId: matchedTeacher ? matchedTeacher._id : null,
      matchedTeacherLabel: matchedTeacher
        ? `${matchedTeacher.fullName} (${matchedTeacher.teacherId})`
        : '',
      parsedSubjects,
      numericTuitionFee,
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

export function validateTeacherImportRows(options: {
  rows: ParsedTeacherInputRow[];
  existingTeachers: TeacherLookup[];
  classrooms: ClassKeyLookup[];
  defaultAcademicYear: string;
  autoGenerateMissingId?: boolean;
}): { rows: ValidatedTeacherImportRow[]; summary: ValidationSummary } {
  const {
    rows,
    existingTeachers,
    classrooms,
    defaultAcademicYear,
    autoGenerateMissingId = false,
  } = options;

  const classLookup = new Map<string, ClassKeyLookup>();
  for (const cls of classrooms) {
    const key = normalizeKey(cls.name);
    const prev = classLookup.get(key);
    if (!prev || cls.academicYear === defaultAcademicYear) {
      classLookup.set(key, cls);
    }
  }

  const existingIdsLower = new Set<string>();
  const existingEmailsLower = new Set<string>();
  const autoPrefix = 'TCH-';
  let maxAutoSeq = 0;

  for (const t of existingTeachers) {
    const cleanId = (t.teacherId || '').trim();
    existingIdsLower.add(cleanId.toLowerCase());
    if (t.email) existingEmailsLower.add(t.email.trim().toLowerCase());
    if (cleanId.toUpperCase().startsWith(autoPrefix)) {
      const suffix = Number(cleanId.slice(autoPrefix.length));
      if (Number.isInteger(suffix) && suffix > maxAutoSeq) {
        maxAutoSeq = suffix;
      }
    }
  }

  for (const r of rows) {
    const cleanId = (r.teacherId || '').trim();
    if (cleanId.toUpperCase().startsWith(autoPrefix)) {
      const suffix = Number(cleanId.slice(autoPrefix.length));
      if (Number.isInteger(suffix) && suffix > maxAutoSeq) {
        maxAutoSeq = suffix;
      }
    }
  }

  const seenIdsInBatch = new Map<string, number>();
  const seenEmailsInBatch = new Map<string, number>();
  const validatedRows: ValidatedTeacherImportRow[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx];
    const rowNumber = raw.rowNumber || idx + 2;
    const errors: string[] = [];
    const warnings: string[] = [];

    let teacherId = (raw.teacherId || '').trim();
    const fullName = (raw.fullName || '').trim();
    const phone = (raw.phone || '').trim();
    const email = (raw.email || '').trim().toLowerCase();
    const subjectsText = (raw.subjectsText || '').trim();
    const classesText = (raw.classesText || '').trim();
    const rawStatus = (raw.status || '').trim();

    if (!teacherId) {
      if (autoGenerateMissingId) {
        maxAutoSeq += 1;
        teacherId = `${autoPrefix}${String(maxAutoSeq).padStart(3, '0')}`;
        warnings.push(`Auto-generated Teacher ID: ${teacherId}`);
      } else {
        errors.push('Missing Teacher ID');
      }
    }

    if (!fullName) {
      errors.push('Missing teacher full name');
    }

    if (!phone) {
      errors.push('Missing phone number');
    } else if (!isValidPhoneNumber(phone)) {
      errors.push(`Invalid phone number "${phone}"`);
    }

    if (!email) {
      errors.push('Missing email address');
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push(`Invalid email address "${email}"`);
    } else {
      if (existingEmailsLower.has(email)) {
        warnings.push(`Email "${email}" already belongs to another teacher`);
      } else if (seenEmailsInBatch.has(email)) {
        warnings.push(`Duplicate email "${email}" in file (row ${seenEmailsInBatch.get(email)})`);
      } else {
        seenEmailsInBatch.set(email, rowNumber);
      }
    }

    const parsedSubjects = splitListText(subjectsText);
    if (parsedSubjects.length === 0) {
      warnings.push('No assigned subjects specified');
    }

    const requestedClasses = splitListText(classesText);
    const matchedClassIds: string[] = [];
    const matchedClassNames: string[] = [];
    const missingClasses: string[] = [];

    for (const cName of requestedClasses) {
      const matched = classLookup.get(normalizeKey(cName));
      if (matched) {
        if (!matchedClassIds.includes(matched._id)) {
          matchedClassIds.push(matched._id);
          matchedClassNames.push(matched.name);
        }
      } else {
        missingClasses.push(cName);
      }
    }

    if (missingClasses.length > 0) {
      errors.push(`Class(es) not found: ${missingClasses.join(', ')}`);
    }

    const statusLower = rawStatus.toLowerCase();
    let normalizedStatus: 'Active' | 'Inactive' = 'Active';
    if (!statusLower || statusLower === 'active' || statusLower === 'firfircoon') {
      normalizedStatus = 'Active';
      if (!rawStatus) warnings.push('Status was blank; defaulted to Active');
    } else if (statusLower === 'inactive' || statusLower === 'aan firfircoonayn') {
      normalizedStatus = 'Inactive';
    } else {
      errors.push(`Invalid status "${rawStatus}" (use Active or Inactive)`);
    }

    let isDuplicate = false;
    if (teacherId) {
      const idKey = teacherId.toLowerCase();
      if (existingIdsLower.has(idKey)) {
        isDuplicate = true;
        errors.push(`Teacher ID "${teacherId}" already exists in database`);
      } else if (seenIdsInBatch.has(idKey)) {
        isDuplicate = true;
        errors.push(
          `Duplicate Teacher ID "${teacherId}" in file (first seen on row ${seenIdsInBatch.get(idKey)})`
        );
      } else {
        seenIdsInBatch.set(idKey, rowNumber);
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
      rowNumber,
      teacherId,
      fullName,
      phone,
      email,
      subjectsText,
      classesText: matchedClassNames.length > 0 && missingClasses.length === 0 ? matchedClassNames.join(', ') : classesText,
      status: normalizedStatus,
      rowStatus,
      errors,
      warnings,
      parsedSubjects,
      matchedClassIds,
      matchedClassNames,
      normalizedStatus,
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
