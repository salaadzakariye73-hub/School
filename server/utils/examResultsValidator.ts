import type { ParsedExamResultInputRow } from './examResultsSpreadsheet.js';

export type ExamResultImportStatus = 'valid' | 'duplicate' | 'invalid';

export interface StudentLookup {
  _id: string;
  studentId: string;
  fullName: string;
  classId: string;
  status: string;
}

export interface ClassroomLookupForResults {
  _id: string;
  name: string;
  academicYear: string;
  subjects: string[];
}

export interface ExaminationLookup {
  _id: string;
  name: string;
  academicYear: string;
  term: string;
}

export interface ExamScheduleLookup {
  examinationId: string;
  classId: string;
  subject: string;
}

export interface ValidatedExamResultRow extends ParsedExamResultInputRow {
  rowStatus: ExamResultImportStatus;
  errors: string[];
  warnings: string[];
  matchedStudentObjectId: string | null;
  matchedClassId: string | null;
  matchedExaminationId: string | null;
  canonicalSubject: string;
  canonicalExamName: string;
  canonicalAcademicYear: string;
  canonicalTerm: string;
  numericTotalMarks: number | null;
  numericMarksObtained: number | null;
}

export interface ExamResultValidationSummary {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  warnings: number;
}

export function validateExamResultImportRows(options: {
  rows: ParsedExamResultInputRow[];
  students: StudentLookup[];
  classrooms: ClassroomLookupForResults[];
  examinations: ExaminationLookup[];
  schedules: ExamScheduleLookup[];
  existingResultKeys: Set<string>; // `${examNameLower}::${classId}::${subjectLower}::${studentObjectId}`
  teacherScope?: {
    isTeacher: boolean;
    assignedClassIds: Set<string>;
    assignedSubjectsLower: Set<string>;
  };
}): { rows: ValidatedExamResultRow[]; summary: ExamResultValidationSummary } {
  const {
    rows,
    students,
    classrooms,
    examinations,
    schedules,
    existingResultKeys,
    teacherScope,
  } = options;

  const studentByCode = new Map<string, StudentLookup>();
  for (const st of students) {
    studentByCode.set(st.studentId.trim().toLowerCase(), st);
  }

  const classById = new Map<string, ClassroomLookupForResults>();
  const classesByName = new Map<string, ClassroomLookupForResults[]>();
  for (const cls of classrooms) {
    classById.set(cls._id, cls);
    const key = cls.name.trim().toLowerCase().replace(/\s+/g, ' ');
    const list = classesByName.get(key) || [];
    list.push(cls);
    classesByName.set(key, list);
  }

  // Group scheduled subjects by `${examinationId}::${classId}`
  const scheduledSubjectsByExamClass = new Map<string, Set<string>>();
  const scheduledSubjectsByExam = new Map<string, number>();
  for (const sc of schedules) {
    const k = `${sc.examinationId}::${sc.classId}`;
    const set = scheduledSubjectsByExamClass.get(k) || new Set<string>();
    set.add(sc.subject.trim().toLowerCase());
    scheduledSubjectsByExamClass.set(k, set);
    scheduledSubjectsByExam.set(
      sc.examinationId,
      (scheduledSubjectsByExam.get(sc.examinationId) || 0) + 1
    );
  }

  const seenInFile = new Map<string, number>();
  const validatedRows: ValidatedExamResultRow[] = [];

  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentCode = (raw.studentId || '').trim();
    const studentNameInput = (raw.studentName || '').trim();
    const classNameInput = (raw.className || '').trim();
    const academicYearInput = (raw.academicYear || '').trim();
    const termInput = (raw.term || '').trim();
    const examNameInput = (raw.examName || '').trim();
    const subjectInput = (raw.subject || '').trim();
    const totalRaw = (raw.totalMarks || '').trim();
    const obtainedRaw = (raw.marksObtained || '').trim();

    // 1. Validate Student exists
    const matchedStudent = studentCode ? studentByCode.get(studentCode.toLowerCase()) : undefined;
    if (!studentCode) {
      errors.push('Missing Student Admission Number.');
    } else if (!matchedStudent) {
      errors.push(`Student "${studentCode}" does not exist in database.`);
    } else if (
      studentNameInput &&
      matchedStudent.fullName.trim().toLowerCase() !== studentNameInput.toLowerCase()
    ) {
      warnings.push(
        `Student name differs from record ("${matchedStudent.fullName}"). Database record will be used.`
      );
    }

    // 2. Validate Class exists and student belongs to it
    let matchedClass: ClassroomLookupForResults | undefined;
    if (!classNameInput) {
      errors.push('Missing Class.');
    } else {
      const candidates =
        classesByName.get(classNameInput.toLowerCase().replace(/\s+/g, ' ')) || [];
      if (candidates.length === 0) {
        errors.push(`Class "${classNameInput}" does not exist.`);
      } else {
        matchedClass =
          (academicYearInput
            ? candidates.find((c) => c.academicYear === academicYearInput)
            : undefined) ||
          (matchedStudent ? candidates.find((c) => c._id === matchedStudent.classId) : undefined) ||
          candidates[0];

        if (matchedStudent && matchedClass && matchedStudent.classId !== matchedClass._id) {
          const actualClass = classById.get(matchedStudent.classId);
          errors.push(
            `Student "${studentCode}" belongs to "${actualClass?.name || 'another class'}", not "${classNameInput}".`
          );
        }
      }
    }

    // 3. Validate Examination exists
    let matchedExam: ExaminationLookup | undefined;
    if (!examNameInput) {
      errors.push('Missing Examination Name.');
    } else {
      const nameMatches = examinations.filter(
        (ex) => ex.name.trim().toLowerCase() === examNameInput.toLowerCase()
      );
      if (nameMatches.length === 0) {
        errors.push(
          `Examination "${examNameInput}" does not exist. Create the examination in Examination Management first.`
        );
      } else {
        let filtered = nameMatches;
        if (academicYearInput) {
          const yearMatches = filtered.filter(
            (ex) => ex.academicYear.trim().toLowerCase() === academicYearInput.toLowerCase()
          );
          if (yearMatches.length === 0) {
            errors.push(
              `Examination "${examNameInput}" does not match Academic Year "${academicYearInput}".`
            );
          } else {
            filtered = yearMatches;
          }
        }
        if (termInput && filtered.length > 0) {
          const termMatches = filtered.filter(
            (ex) => ex.term.trim().toLowerCase() === termInput.toLowerCase()
          );
          if (termMatches.length === 0) {
            errors.push(
              `Examination "${examNameInput}" does not match Term "${termInput}".`
            );
          } else {
            filtered = termMatches;
          }
        }
        if (errors.every((e) => !e.includes('Academic Year') && !e.includes('Term'))) {
          matchedExam = filtered[0];
        }
      }
    }

    // 4. Validate Subject exists in class AND is connected to the Examination Timetable
    let canonicalSubject = subjectInput;
    if (!subjectInput) {
      errors.push('Missing Subject.');
    } else if (matchedClass) {
      if (matchedClass.subjects.length > 0) {
        const classSub = matchedClass.subjects.find(
          (s) => s.trim().toLowerCase() === subjectInput.toLowerCase()
        );
        if (!classSub) {
          errors.push(`Subject "${subjectInput}" does not exist in class "${matchedClass.name}".`);
        } else {
          canonicalSubject = classSub;
        }
      }

      if (matchedExam) {
        const classExamKey = `${matchedExam._id}::${matchedClass._id}`;
        const scheduledSet = scheduledSubjectsByExamClass.get(classExamKey);
        if (!scheduledSet || !scheduledSet.has(subjectInput.toLowerCase())) {
          errors.push(
            `Subject "${subjectInput}" is not scheduled for "${matchedClass.name}" under "${matchedExam.name}" in the Examination Timetable.`
          );
        }
      }
    }

    // 5. Teacher permissions check
    if (teacherScope?.isTeacher && matchedClass) {
      if (!teacherScope.assignedClassIds.has(matchedClass._id)) {
        errors.push(`You are not assigned to class "${matchedClass.name}".`);
      }
      if (
        teacherScope.assignedSubjectsLower.size > 0 &&
        subjectInput &&
        !teacherScope.assignedSubjectsLower.has(subjectInput.toLowerCase())
      ) {
        errors.push(`You are not authorized to import results for subject "${subjectInput}".`);
      }
    }

    // 6. Numeric Marks validation
    const totalNum = totalRaw !== '' ? Number(totalRaw) : NaN;
    const obtainedNum = obtainedRaw !== '' ? Number(obtainedRaw) : NaN;

    if (!totalRaw || !Number.isFinite(totalNum) || totalNum <= 0) {
      errors.push('Total Marks must be a positive number.');
    }
    if (obtainedRaw === '' || !Number.isFinite(obtainedNum)) {
      errors.push('Marks Obtained must be a valid number.');
    } else {
      if (obtainedNum < 0) {
        errors.push('Marks Obtained cannot be negative.');
      }
      if (Number.isFinite(totalNum) && totalNum > 0 && obtainedNum > totalNum) {
        errors.push(`Marks Obtained (${obtainedNum}) exceeds Total Marks (${totalNum}).`);
      }
    }

    // 7. Duplicate detection (in-file and existing database records)
    let isDuplicate = false;
    if (matchedStudent && matchedClass && matchedExam && canonicalSubject) {
      const compositeKey = `${matchedExam.name.trim().toLowerCase()}::${matchedClass._id}::${canonicalSubject.trim().toLowerCase()}::${matchedStudent._id}`;
      if (existingResultKeys.has(compositeKey)) {
        isDuplicate = true;
        errors.push(
          `Duplicate result: marks already exist for "${matchedStudent.studentId}" in "${matchedExam.name}" (${canonicalSubject}).`
        );
      } else if (seenInFile.has(compositeKey)) {
        isDuplicate = true;
        errors.push(
          `Duplicate result row in file (first seen on row ${seenInFile.get(compositeKey)}).`
        );
      } else {
        seenInFile.set(compositeKey, raw.rowNumber || i + 2);
      }
    }

    let rowStatus: ExamResultImportStatus = 'valid';
    if (isDuplicate) {
      rowStatus = 'duplicate';
      duplicateCount++;
    } else if (errors.length > 0) {
      rowStatus = 'invalid';
      invalidCount++;
    } else {
      validCount++;
    }

    if (warnings.length > 0) warningCount++;

    validatedRows.push({
      rowNumber: raw.rowNumber || i + 2,
      studentId: matchedStudent ? matchedStudent.studentId : studentCode,
      studentName: matchedStudent ? matchedStudent.fullName : studentNameInput,
      className: matchedClass ? matchedClass.name : classNameInput,
      academicYear: matchedExam?.academicYear || matchedClass?.academicYear || academicYearInput,
      term: matchedExam?.term || termInput,
      examName: matchedExam?.name || examNameInput,
      subject: canonicalSubject,
      totalMarks: totalRaw,
      marksObtained: obtainedRaw,
      rowStatus,
      errors,
      warnings,
      matchedStudentObjectId: matchedStudent ? matchedStudent._id : null,
      matchedClassId: matchedClass ? matchedClass._id : null,
      matchedExaminationId: matchedExam ? matchedExam._id : null,
      canonicalSubject,
      canonicalExamName: matchedExam?.name || examNameInput,
      canonicalAcademicYear:
        matchedExam?.academicYear || matchedClass?.academicYear || academicYearInput,
      canonicalTerm: matchedExam?.term || termInput,
      numericTotalMarks: Number.isFinite(totalNum) ? totalNum : null,
      numericMarksObtained: Number.isFinite(obtainedNum) ? obtainedNum : null,
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
