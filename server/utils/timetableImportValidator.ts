import type { SchoolDay } from '../models/Timetable.js';
import type { BulkRowValidationStatus, ValidationSummary } from './studentImportValidator.js';
import type { ParsedTimetableInputRow } from './timetableSpreadsheet.js';
import { normalizeTimeCell } from './spreadsheet.js';

export const ALLOWED_TIMETABLE_DAYS: SchoolDay[] = [
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
];

const DAY_ALIASES: Record<string, SchoolDay> = {
  saturday: 'Saturday',
  sat: 'Saturday',
  sabti: 'Saturday',

  sunday: 'Sunday',
  sun: 'Sunday',
  axad: 'Sunday',

  monday: 'Monday',
  mon: 'Monday',
  isniin: 'Monday',

  tuesday: 'Tuesday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  talaado: 'Tuesday',

  wednesday: 'Wednesday',
  wed: 'Wednesday',
  arbaco: 'Wednesday',
};

const EXCLUDED_DAY_NAMES = new Set(['thursday', 'thu', 'thur', 'khamiis', 'friday', 'fri', 'jimce']);
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface TimetableClassLookup {
  _id: string;
  name: string;
  academicYear: string;
  subjects: string[];
}

export interface TimetableTeacherLookup {
  _id: string;
  teacherId: string;
  fullName: string;
}

export interface ExistingTimetableSlotLookup {
  _id: string;
  classId: string;
  dayOfWeek: SchoolDay;
  periodNumber: number;
  teacherId: string | null;
  startTime: string;
  endTime: string;
}

export interface ValidatedTimetableImportRow extends ParsedTimetableInputRow {
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  matchedClassId: string | null;
  matchedClassName: string;
  normalizedDay: SchoolDay | null;
  numericPeriod: number;
  matchedTeacherId: string | null;
  matchedTeacherName: string;
}

function normalizeKey(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function normalizeSchoolDay(raw: string): {
  day: SchoolDay | null;
  excludedThursdayOrFriday: boolean;
} {
  const clean = normalizeKey(raw);
  if (!clean) return { day: null, excludedThursdayOrFriday: false };
  if (EXCLUDED_DAY_NAMES.has(clean)) {
    return { day: null, excludedThursdayOrFriday: true };
  }
  return { day: DAY_ALIASES[clean] ?? null, excludedThursdayOrFriday: false };
}

export function validateTimetableImportRows(options: {
  rows: ParsedTimetableInputRow[];
  classes: TimetableClassLookup[];
  teachers: TimetableTeacherLookup[];
  existingSlots: ExistingTimetableSlotLookup[];
  defaultAcademicYear: string;
}): { rows: ValidatedTimetableImportRow[]; summary: ValidationSummary } {
  const { rows, classes, teachers, existingSlots, defaultAcademicYear } = options;

  const classByName = new Map<string, TimetableClassLookup[]>();
  for (const c of classes) {
    const key = normalizeKey(c.name);
    const list = classByName.get(key) || [];
    list.push(c);
    classByName.set(key, list);
  }

  const teacherByIdOrName = new Map<string, TimetableTeacherLookup>();
  for (const t of teachers) {
    teacherByIdOrName.set(normalizeKey(t.teacherId), t);
    teacherByIdOrName.set(normalizeKey(t.fullName), t);
  }

  const existingSlotSet = new Set<string>();
  const existingTeacherSlotSet = new Set<string>();
  for (const s of existingSlots) {
    existingSlotSet.add(`${s.classId}::${s.dayOfWeek}::${s.periodNumber}`);
    if (s.teacherId) {
      existingTeacherSlotSet.add(`${s.teacherId}::${s.dayOfWeek}::${s.periodNumber}`);
    }
  }

  const seenInBatch = new Map<string, number>();
  const seenTeacherBatch = new Map<string, number>();
  const validatedRows: ValidatedTimetableImportRow[] = [];

  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx];
    const rowNumber = raw.rowNumber || idx + 2;
    const errors: string[] = [];
    const warnings: string[] = [];

    const className = (raw.className || '').trim();
    const dayRaw = (raw.dayOfWeek || '').trim();
    const periodRaw = (raw.periodNumber || '').trim();
    const startTime = normalizeTimeCell(raw.startTime || '');
    const endTime = normalizeTimeCell(raw.endTime || '');
    let subject = (raw.subject || '').trim();
    const teacherRaw = (raw.teacher || '').trim();
    const room = (raw.room || '').trim();

    // 1. Class lookup
    let matchedClass: TimetableClassLookup | null = null;
    if (!className) {
      errors.push('Missing Class / Grade');
    } else {
      const candidates = classByName.get(normalizeKey(className)) || [];
      if (candidates.length === 0) {
        errors.push(`Class "${className}" does not exist in the database`);
      } else if (candidates.length === 1) {
        matchedClass = candidates[0];
      } else {
        matchedClass =
          candidates.find((c) => c.academicYear === defaultAcademicYear) || candidates[0];
        warnings.push(
          `Multiple classes named "${className}" found; matched ${matchedClass.academicYear}`
        );
      }
    }

    // 2. Day of week (5 days only: Saturday to Wednesday; Thursday excluded)
    const { day: normalizedDay, excludedThursdayOrFriday } = normalizeSchoolDay(dayRaw);
    if (!dayRaw) {
      errors.push('Missing Day of Week');
    } else if (excludedThursdayOrFriday) {
      errors.push(
        `Day "${dayRaw}" is excluded. Timetable only supports 5 school days (Saturday to Wednesday)`
      );
    } else if (!normalizedDay) {
      errors.push(
        `Invalid day "${dayRaw}". Allowed: Saturday, Sunday, Monday, Tuesday, Wednesday`
      );
    }

    // 3. Period Number (1..10)
    const numericPeriod = Number(periodRaw);
    if (!periodRaw || !Number.isInteger(numericPeriod) || numericPeriod < 1 || numericPeriod > 10) {
      errors.push('Period Number must be a whole number between 1 and 10');
    }

    // 4. Start & End Time
    const validStart = TIME_REGEX.test(startTime);
    const validEnd = TIME_REGEX.test(endTime);
    if (!validStart) {
      errors.push('Valid Start Time (HH:MM, e.g. 08:00) is required');
    }
    if (!validEnd) {
      errors.push('Valid End Time (HH:MM, e.g. 08:45) is required');
    }
    if (validStart && validEnd && toMinutes(endTime) <= toMinutes(startTime)) {
      errors.push('End Time must be after Start Time');
    }

    // 5. Subject
    if (!subject) {
      errors.push('Missing Subject');
    } else if (matchedClass && matchedClass.subjects.length > 0) {
      const canonical = matchedClass.subjects.find(
        (s) => s.trim().toLowerCase() === subject.toLowerCase()
      );
      if (canonical) {
        subject = canonical;
      } else {
        warnings.push(`Subject "${subject}" is not listed in ${matchedClass.name}'s subjects`);
      }
    }

    // 6. Teacher (optional)
    let matchedTeacher: TimetableTeacherLookup | null = null;
    if (teacherRaw) {
      matchedTeacher = teacherByIdOrName.get(normalizeKey(teacherRaw)) || null;
      if (!matchedTeacher) {
        errors.push(`Teacher "${teacherRaw}" not found in Teachers list`);
      }
    }

    // 7. Duplicate slot check (classId + dayOfWeek + periodNumber)
    let isDuplicate = false;
    if (matchedClass && normalizedDay && Number.isInteger(numericPeriod) && numericPeriod >= 1 && numericPeriod <= 10) {
      const slotKey = `${matchedClass._id}::${normalizedDay}::${numericPeriod}`;
      if (existingSlotSet.has(slotKey)) {
        isDuplicate = true;
        errors.push(
          `Timetable already has Period ${numericPeriod} on ${normalizedDay} for ${matchedClass.name}`
        );
      } else if (seenInBatch.has(slotKey)) {
        isDuplicate = true;
        errors.push(
          `Duplicate Period ${numericPeriod} on ${normalizedDay} for ${matchedClass.name} (first seen at row ${seenInBatch.get(slotKey)})`
        );
      } else {
        seenInBatch.set(slotKey, rowNumber);
      }

      if (matchedTeacher) {
        const tKey = `${matchedTeacher._id}::${normalizedDay}::${numericPeriod}`;
        if (existingTeacherSlotSet.has(tKey)) {
          warnings.push(
            `Teacher ${matchedTeacher.fullName} is already scheduled on ${normalizedDay} Period ${numericPeriod}`
          );
        } else if (seenTeacherBatch.has(tKey)) {
          warnings.push(
            `Teacher ${matchedTeacher.fullName} is also assigned in row ${seenTeacherBatch.get(tKey)} on ${normalizedDay} Period ${numericPeriod}`
          );
        } else {
          seenTeacherBatch.set(tKey, rowNumber);
        }
      }
    }

    let rowStatus: BulkRowValidationStatus = 'valid';
    if (errors.length > 0) {
      rowStatus = isDuplicate ? 'duplicate' : 'invalid';
    }

    if (rowStatus === 'valid') validCount++;
    else if (rowStatus === 'duplicate') duplicateCount++;
    else invalidCount++;
    if (warnings.length > 0) warningCount++;

    validatedRows.push({
      rowNumber,
      className: matchedClass ? matchedClass.name : className,
      dayOfWeek: normalizedDay || dayRaw,
      periodNumber: periodRaw,
      startTime,
      endTime,
      subject,
      teacher: matchedTeacher ? matchedTeacher.fullName : teacherRaw,
      room,
      rowStatus,
      errors,
      warnings,
      matchedClassId: matchedClass ? matchedClass._id : null,
      matchedClassName: matchedClass ? matchedClass.name : '',
      normalizedDay,
      numericPeriod: Number.isInteger(numericPeriod) ? numericPeriod : 0,
      matchedTeacherId: matchedTeacher ? matchedTeacher._id : null,
      matchedTeacherName: matchedTeacher ? matchedTeacher.fullName : '',
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
