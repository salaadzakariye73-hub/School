import {
  computeDayOfWeek,
  isValidYmd,
  parseTimeMinutes,
  type ExistingScheduleSnapshot,
} from './examScheduleValidator.js';
import type { BulkRowValidationStatus, ValidationSummary } from './studentImportValidator.js';
import type { ParsedExamScheduleInputRow } from './examScheduleSpreadsheet.js';
import { normalizeDateCell, normalizeTimeCell } from './spreadsheet.js';

export interface ExamLookupItem {
  _id: string;
  name: string;
  academicYear: string;
  term: string;
  startDate: string;
  endDate: string;
}

export interface ExamClassLookup {
  _id: string;
  name: string;
  academicYear: string;
  subjects: string[];
}

export interface ExamTeacherLookup {
  _id: string;
  teacherId: string;
  fullName: string;
}

export interface ValidatedExamScheduleImportRow extends ParsedExamScheduleInputRow {
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  matchedExaminationId: string | null;
  matchedExaminationName: string;
  matchedClassId: string | null;
  matchedClassName: string;
  dayOfWeek: string;
  durationMinutes: number;
  matchedInvigilatorId: string | null;
  matchedInvigilatorName: string;
}

function normalizeKey(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function validateExamScheduleImportRows(options: {
  rows: ParsedExamScheduleInputRow[];
  examinations: ExamLookupItem[];
  classes: ExamClassLookup[];
  teachers: ExamTeacherLookup[];
  existingSchedules: ExistingScheduleSnapshot[];
  defaultAcademicYear: string;
  fallbackExaminationId?: string;
}): { rows: ValidatedExamScheduleImportRow[]; summary: ValidationSummary } {
  const {
    rows,
    examinations,
    classes,
    teachers,
    existingSchedules,
    defaultAcademicYear,
    fallbackExaminationId,
  } = options;

  const examById = new Map<string, ExamLookupItem>();
  const examsByName = new Map<string, ExamLookupItem[]>();
  for (const ex of examinations) {
    examById.set(ex._id, ex);
    const key = normalizeKey(ex.name);
    const list = examsByName.get(key) || [];
    list.push(ex);
    examsByName.set(key, list);
  }
  const fallbackExam = fallbackExaminationId ? examById.get(fallbackExaminationId) || null : null;

  const classesByName = new Map<string, ExamClassLookup[]>();
  for (const c of classes) {
    const key = normalizeKey(c.name);
    const list = classesByName.get(key) || [];
    list.push(c);
    classesByName.set(key, list);
  }

  const teacherByIdOrName = new Map<string, ExamTeacherLookup>();
  for (const t of teachers) {
    teacherByIdOrName.set(normalizeKey(t.teacherId), t);
    teacherByIdOrName.set(normalizeKey(t.fullName), t);
  }

  // Track existing DB unique subjects per exam+class
  const existingExamSubjectSet = new Set<string>();
  for (const sc of existingSchedules) {
    existingExamSubjectSet.add(
      `${sc.examinationId}::${sc.classId}::${sc.subject.trim().toLowerCase()}`
    );
  }

  interface CandidateRowMeta {
    rowIdx: number;
    rowNumber: number;
    examinationId: string;
    examinationName: string;
    classId: string;
    className: string;
    subject: string;
    examDate: string;
    startTime: string;
    endTime: string;
    startMin: number;
    endMin: number;
    invigilatorId: string;
    invigilatorName: string;
    room: string;
  }

  const draftResults: ValidatedExamScheduleImportRow[] = [];
  const rowDupFlags: boolean[] = [];
  const validForCrossCheck: CandidateRowMeta[] = [];
  const seenExamSubjectInBatch = new Map<string, number>();

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx];
    const rowNumber = raw.rowNumber || idx + 2;
    const errors: string[] = [];
    const warnings: string[] = [];

    let examNameRaw = (raw.examinationName || '').trim();
    const classNameRaw = (raw.className || '').trim();
    const examDate = normalizeDateCell((raw.examDate || '').trim());
    let subject = (raw.subject || '').trim();
    const startTime = normalizeTimeCell((raw.startTime || '').trim());
    const endTime = normalizeTimeCell((raw.endTime || '').trim());
    const invigilatorRaw = (raw.invigilator || '').trim();
    const room = (raw.room || '').trim();
    const notes = (raw.notes || '').trim();

    // 1. Examination resolution
    let matchedExam: ExamLookupItem | null = null;
    if (!examNameRaw) {
      if (fallbackExam) {
        matchedExam = fallbackExam;
        examNameRaw = fallbackExam.name;
        warnings.push(`Examination Name was blank; matched selected "${fallbackExam.name}"`);
      } else {
        errors.push('Missing Examination Name');
      }
    } else {
      const candidates = examsByName.get(normalizeKey(examNameRaw)) || [];
      if (candidates.length === 0) {
        errors.push(`Examination "${examNameRaw}" not found. Create it first in Examination Management`);
      } else if (candidates.length === 1) {
        matchedExam = candidates[0];
      } else {
        matchedExam =
          candidates.find((e) => e.academicYear === defaultAcademicYear) || candidates[0];
        warnings.push(
          `Multiple examinations named "${examNameRaw}" found; matched ${matchedExam.academicYear} (${matchedExam.term})`
        );
      }
    }

    // 2. Class resolution
    let matchedClass: ExamClassLookup | null = null;
    if (!classNameRaw) {
      errors.push('Missing Class / Grade');
    } else {
      const candidates = classesByName.get(normalizeKey(classNameRaw)) || [];
      if (candidates.length === 0) {
        errors.push(`Class "${classNameRaw}" not found in database`);
      } else if (candidates.length === 1) {
        matchedClass = candidates[0];
      } else {
        const targetYear = matchedExam?.academicYear || defaultAcademicYear;
        matchedClass = candidates.find((c) => c.academicYear === targetYear) || candidates[0];
      }
    }

    // 3. Date & weekday
    const dayOfWeek = computeDayOfWeek(examDate);
    if (!isValidYmd(examDate)) {
      errors.push('Valid Examination Date (YYYY-MM-DD) is required');
    } else if (
      matchedExam &&
      (examDate < matchedExam.startDate || examDate > matchedExam.endDate)
    ) {
      errors.push(
        `Date ${examDate} is outside "${matchedExam.name}" period (${matchedExam.startDate} to ${matchedExam.endDate})`
      );
    }

    // 4. Subject check
    if (!subject) {
      errors.push('Missing Subject');
    } else if (matchedClass && matchedClass.subjects.length > 0) {
      const canonical = matchedClass.subjects.find(
        (s) => s.trim().toLowerCase() === subject.toLowerCase()
      );
      if (!canonical) {
        errors.push(`Subject "${subject}" is not assigned to class "${matchedClass.name}"`);
      } else {
        subject = canonical;
      }
    }

    // 5. Start / End Time & duration
    const startMin = parseTimeMinutes(startTime);
    const endMin = parseTimeMinutes(endTime);
    let durationMinutes = 0;
    if (startMin === null || endMin === null) {
      errors.push('Valid Start Time and End Time (HH:MM) are required');
    } else if (endMin <= startMin) {
      errors.push('End Time must be after Start Time');
    } else {
      durationMinutes = endMin - startMin;
      if (durationMinutes < 15) {
        errors.push('Examination duration must be at least 15 minutes');
      }
    }

    // 6. Invigilating Teacher
    let matchedTeacher: ExamTeacherLookup | null = null;
    if (!invigilatorRaw) {
      errors.push('Missing Invigilating Teacher');
    } else {
      matchedTeacher = teacherByIdOrName.get(normalizeKey(invigilatorRaw)) || null;
      if (!matchedTeacher) {
        errors.push(`Invigilating Teacher "${invigilatorRaw}" not found in Teachers list`);
      }
    }

    // 7. Room
    if (!room) {
      errors.push('Missing Examination Room');
    }

    // 8. Duplicate (examinationId + classId + subject)
    let isDuplicate = false;
    if (matchedExam && matchedClass && subject) {
      const subjKey = `${matchedExam._id}::${matchedClass._id}::${subject.toLowerCase()}`;
      if (existingExamSubjectSet.has(subjKey)) {
        isDuplicate = true;
        errors.push(
          `Subject "${subject}" is already scheduled for ${matchedClass.name} in "${matchedExam.name}"`
        );
      } else if (seenExamSubjectInBatch.has(subjKey)) {
        isDuplicate = true;
        errors.push(
          `Duplicate subject "${subject}" for ${matchedClass.name} in "${matchedExam.name}" (first seen at row ${seenExamSubjectInBatch.get(subjKey)})`
        );
      } else {
        seenExamSubjectInBatch.set(subjKey, rowNumber);
      }
    }

    if (
      errors.length === 0 &&
      matchedExam &&
      matchedClass &&
      matchedTeacher &&
      startMin !== null &&
      endMin !== null
    ) {
      validForCrossCheck.push({
        rowIdx: idx,
        rowNumber,
        examinationId: matchedExam._id,
        examinationName: matchedExam.name,
        classId: matchedClass._id,
        className: matchedClass.name,
        subject,
        examDate,
        startTime,
        endTime,
        startMin,
        endMin,
        invigilatorId: matchedTeacher._id,
        invigilatorName: matchedTeacher.fullName,
        room,
      });
    }

    rowDupFlags.push(isDuplicate);
    draftResults.push({
      rowNumber,
      examinationName: matchedExam ? matchedExam.name : examNameRaw,
      className: matchedClass ? matchedClass.name : classNameRaw,
      examDate,
      subject,
      startTime,
      endTime,
      invigilator: matchedTeacher ? matchedTeacher.fullName : invigilatorRaw,
      room,
      notes,
      rowStatus: 'valid',
      errors,
      warnings,
      matchedExaminationId: matchedExam ? matchedExam._id : null,
      matchedExaminationName: matchedExam ? matchedExam.name : '',
      matchedClassId: matchedClass ? matchedClass._id : null,
      matchedClassName: matchedClass ? matchedClass.name : '',
      dayOfWeek,
      durationMinutes,
      matchedInvigilatorId: matchedTeacher ? matchedTeacher._id : null,
      matchedInvigilatorName: matchedTeacher ? matchedTeacher.fullName : '',
    });
  }

  // Conflict cross-check within uploaded batch & against existing DB schedules
  for (let i = 0; i < validForCrossCheck.length; i++) {
    const a = validForCrossCheck[i];
    for (let j = i + 1; j < validForCrossCheck.length; j++) {
      const b = validForCrossCheck[j];
      if (a.examDate !== b.examDate || !overlaps(a.startMin, a.endMin, b.startMin, b.endMin)) {
        continue;
      }
      if (a.classId === b.classId) {
        draftResults[a.rowIdx].errors.push(
          `Class "${a.className}" has a time conflict with "${b.subject}" (${b.startTime}-${b.endTime}) at row ${b.rowNumber}`
        );
        draftResults[b.rowIdx].errors.push(
          `Class "${b.className}" has a time conflict with "${a.subject}" (${a.startTime}-${a.endTime}) at row ${a.rowNumber}`
        );
      }
      if (a.invigilatorId === b.invigilatorId) {
        draftResults[a.rowIdx].errors.push(
          `Invigilator "${a.invigilatorName}" is double-booked in "${b.room}" (${b.startTime}-${b.endTime}) at row ${b.rowNumber}`
        );
        draftResults[b.rowIdx].errors.push(
          `Invigilator "${a.invigilatorName}" is double-booked in "${a.room}" (${a.startTime}-${a.endTime}) at row ${a.rowNumber}`
        );
      }
      if (a.room.toLowerCase() === b.room.toLowerCase()) {
        draftResults[a.rowIdx].errors.push(
          `Room "${a.room}" is already booked for ${b.className} (${b.startTime}-${b.endTime}) at row ${b.rowNumber}`
        );
        draftResults[b.rowIdx].errors.push(
          `Room "${a.room}" is already booked for ${a.className} (${a.startTime}-${a.endTime}) at row ${a.rowNumber}`
        );
      }
    }

    for (const ext of existingSchedules) {
      if (ext.examDate !== a.examDate) continue;
      const extStart = parseTimeMinutes(ext.startTime);
      const extEnd = parseTimeMinutes(ext.endTime);
      if (extStart === null || extEnd === null) continue;
      if (!overlaps(a.startMin, a.endMin, extStart, extEnd)) continue;

      if (ext.classId === a.classId) {
        draftResults[a.rowIdx].errors.push(
          `Class "${a.className}" already has "${ext.examinationName}" (${ext.subject}, ${ext.startTime}-${ext.endTime}) on ${ext.examDate}`
        );
      }
      if (ext.invigilatorId === a.invigilatorId) {
        draftResults[a.rowIdx].errors.push(
          `Invigilator "${a.invigilatorName}" is already assigned to "${ext.examinationName}" in ${ext.room} (${ext.startTime}-${ext.endTime})`
        );
      }
      if (ext.room.toLowerCase() === a.room.toLowerCase()) {
        draftResults[a.rowIdx].errors.push(
          `Room "${a.room}" is already booked for "${ext.examinationName}" (${ext.className}, ${ext.startTime}-${ext.endTime})`
        );
      }
    }
  }

  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (let i = 0; i < draftResults.length; i++) {
    const row = draftResults[i];
    row.errors = Array.from(new Set(row.errors));
    row.warnings = Array.from(new Set(row.warnings));

    if (row.errors.length > 0) {
      row.rowStatus = rowDupFlags[i] ? 'duplicate' : 'invalid';
    } else {
      row.rowStatus = 'valid';
    }

    if (row.rowStatus === 'valid') validCount++;
    else if (row.rowStatus === 'duplicate') duplicateCount++;
    else invalidCount++;
    if (row.warnings.length > 0) warningCount++;
  }

  return {
    rows: draftResults,
    summary: {
      total: draftResults.length,
      valid: validCount,
      duplicates: duplicateCount,
      invalid: invalidCount,
      warnings: warningCount,
    },
  };
}
