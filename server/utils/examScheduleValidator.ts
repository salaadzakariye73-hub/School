const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidYmd(ymd: string): boolean {
  if (!YMD_REGEX.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function computeDayOfWeek(ymd: string): string {
  if (!isValidYmd(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAYS[dt.getUTCDay()];
}

export function parseTimeMinutes(hhmm: string): number | null {
  const m = hhmm.trim().match(TIME_REGEX);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function computeInclusiveDays(startDate: string, endDate: string): number {
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) return 1;
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const sMs = Date.UTC(sy, sm - 1, sd);
  const eMs = Date.UTC(ey, em - 1, ed);
  if (eMs < sMs) return 0;
  return Math.floor((eMs - sMs) / 86400000) + 1;
}

export interface ScheduleInputRow {
  _id?: string;
  classId: string;
  examDate: string;
  subject: string;
  startTime: string;
  endTime: string;
  invigilatorId: string;
  room: string;
  notes?: string;
}

export interface ScheduleValidationResult {
  valid: boolean;
  rowErrors: Array<{
    index: number;
    errors: string[];
  }>;
  normalizedRows: Array<{
    _id?: string;
    classId: string;
    examDate: string;
    dayOfWeek: string;
    subject: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    invigilatorId: string;
    room: string;
    notes: string;
  }>;
}

export interface ExistingScheduleSnapshot {
  _id: string;
  examinationId: string;
  examinationName: string;
  classId: string;
  className: string;
  examDate: string;
  startTime: string;
  endTime: string;
  subject: string;
  invigilatorId: string;
  invigilatorName: string;
  room: string;
}

export function validateExamScheduleBatch(options: {
  examination: {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  rows: ScheduleInputRow[];
  classMap: Map<string, { _id: string; name: string; subjects: string[] }>;
  teacherMap: Map<string, { _id: string; fullName: string }>;
  otherExamSchedules: ExistingScheduleSnapshot[];
}): ScheduleValidationResult {
  const { examination, rows, classMap, teacherMap, otherExamSchedules } = options;

  const rowErrors: Array<{ index: number; errors: string[] }> = [];
  const normalizedRows: ScheduleValidationResult['normalizedRows'] = [];

  interface NormalizedCheckRow {
    idx: number;
    classId: string;
    className: string;
    subject: string;
    examDate: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    startMin: number;
    endMin: number;
    durationMinutes: number;
    invigilatorId: string;
    teacherName: string;
    room: string;
    notes: string;
  }

  const parsedForCrossCheck: NormalizedCheckRow[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const errors: string[] = [];

    const classId = (r.classId || '').trim();
    const cls = classMap.get(classId);
    if (!cls) {
      errors.push('Selected class does not exist.');
    }

    const rawSubject = (r.subject || '').trim();
    let canonicalSubject = rawSubject;
    if (!rawSubject) {
      errors.push('Subject is required.');
    } else if (cls && cls.subjects.length > 0) {
      const matchedSub = cls.subjects.find(
        (s) => s.trim().toLowerCase() === rawSubject.toLowerCase()
      );
      if (!matchedSub) {
        errors.push(`Subject "${rawSubject}" is not assigned to class "${cls.name}".`);
      } else {
        canonicalSubject = matchedSub;
      }
    }

    const examDate = (r.examDate || '').trim();
    const dayOfWeek = computeDayOfWeek(examDate);
    if (!isValidYmd(examDate)) {
      errors.push('Valid examination date (YYYY-MM-DD) is required.');
    } else if (examDate < examination.startDate || examDate > examination.endDate) {
      errors.push(
        `Date ${examDate} is outside "${examination.name}" period (${examination.startDate} to ${examination.endDate}).`
      );
    }

    const startTime = (r.startTime || '').trim();
    const endTime = (r.endTime || '').trim();
    const startMin = parseTimeMinutes(startTime);
    const endMin = parseTimeMinutes(endTime);
    let durationMinutes = 0;

    if (startMin === null || endMin === null) {
      errors.push('Valid start time and end time (HH:MM) are required.');
    } else if (endMin <= startMin) {
      errors.push('End time must be after start time.');
    } else {
      durationMinutes = endMin - startMin;
      if (durationMinutes < 15) {
        errors.push('Examination duration must be at least 15 minutes.');
      }
    }

    const invigilatorId = (r.invigilatorId || '').trim();
    const teacher = teacherMap.get(invigilatorId);
    if (!teacher) {
      errors.push('Valid invigilating teacher is required.');
    }

    const room = (r.room || '').trim();
    if (!room) {
      errors.push('Examination room is required.');
    }

    if (errors.length === 0 && cls && teacher && startMin !== null && endMin !== null) {
      parsedForCrossCheck.push({
        idx,
        classId,
        className: cls.name,
        subject: canonicalSubject,
        examDate,
        dayOfWeek,
        startTime,
        endTime,
        startMin,
        endMin,
        durationMinutes,
        invigilatorId,
        teacherName: teacher.fullName,
        room,
        notes: (r.notes || '').trim(),
      });
    }

    rowErrors.push({ index: idx, errors });
    normalizedRows.push({
      ...(r._id ? { _id: r._id } : {}),
      classId,
      examDate,
      dayOfWeek,
      subject: canonicalSubject,
      startTime,
      endTime,
      durationMinutes,
      invigilatorId,
      room,
      notes: (r.notes || '').trim(),
    });
  }

  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart < bEnd && bStart < aEnd;

  // Cross-check within batch
  for (let i = 0; i < parsedForCrossCheck.length; i++) {
    const a = parsedForCrossCheck[i];
    for (let j = i + 1; j < parsedForCrossCheck.length; j++) {
      const b = parsedForCrossCheck[j];

      if (
        a.classId === b.classId &&
        a.subject.toLowerCase() === b.subject.toLowerCase()
      ) {
        rowErrors[a.idx].errors.push(
          `Duplicate subject "${a.subject}" for ${a.className} in row ${b.idx + 1}.`
        );
        rowErrors[b.idx].errors.push(
          `Duplicate subject "${b.subject}" for ${b.className} in row ${a.idx + 1}.`
        );
      }

      if (a.examDate === b.examDate && overlaps(a.startMin, a.endMin, b.startMin, b.endMin)) {
        if (a.classId === b.classId) {
          rowErrors[a.idx].errors.push(
            `Class "${a.className}" has a time conflict with "${b.subject}" (${b.startTime}-${b.endTime}) in row ${b.idx + 1}.`
          );
          rowErrors[b.idx].errors.push(
            `Class "${b.className}" has a time conflict with "${a.subject}" (${a.startTime}-${a.endTime}) in row ${a.idx + 1}.`
          );
        }
        if (a.invigilatorId === b.invigilatorId) {
          rowErrors[a.idx].errors.push(
            `Invigilator "${a.teacherName}" is double-booked in "${b.room}" (${b.startTime}-${b.endTime}) in row ${b.idx + 1}.`
          );
          rowErrors[b.idx].errors.push(
            `Invigilator "${b.teacherName}" is double-booked in "${a.room}" (${a.startTime}-${a.endTime}) in row ${a.idx + 1}.`
          );
        }
        if (a.room.toLowerCase() === b.room.toLowerCase()) {
          rowErrors[a.idx].errors.push(
            `Room "${a.room}" is already booked for ${b.className} (${b.startTime}-${b.endTime}) in row ${b.idx + 1}.`
          );
          rowErrors[b.idx].errors.push(
            `Room "${b.room}" is already booked for ${a.className} (${a.startTime}-${a.endTime}) in row ${a.idx + 1}.`
          );
        }
      }
    }

    // Cross-check against schedules from other examinations on the same date/time
    for (const ext of otherExamSchedules) {
      if (ext.examDate !== a.examDate) continue;
      const extStart = parseTimeMinutes(ext.startTime);
      const extEnd = parseTimeMinutes(ext.endTime);
      if (extStart === null || extEnd === null) continue;
      if (!overlaps(a.startMin, a.endMin, extStart, extEnd)) continue;

      if (ext.classId === a.classId) {
        rowErrors[a.idx].errors.push(
          `Class "${a.className}" already has "${ext.examinationName}" (${ext.subject}, ${ext.startTime}-${ext.endTime}) on ${ext.examDate}.`
        );
      }
      if (ext.invigilatorId === a.invigilatorId) {
        rowErrors[a.idx].errors.push(
          `Invigilator "${a.teacherName}" is already assigned to "${ext.examinationName}" in ${ext.room} (${ext.startTime}-${ext.endTime}).`
        );
      }
      if (ext.room.toLowerCase() === a.room.toLowerCase()) {
        rowErrors[a.idx].errors.push(
          `Room "${a.room}" is already booked for "${ext.examinationName}" (${ext.className}, ${ext.startTime}-${ext.endTime}).`
        );
      }
    }
  }

  // Deduplicate error strings per row
  let valid = true;
  for (const item of rowErrors) {
    item.errors = Array.from(new Set(item.errors));
    if (item.errors.length > 0) valid = false;
  }

  return { valid, rowErrors, normalizedRows };
}
