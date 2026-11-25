import ExcelJS from 'exceljs';
import { extractSpreadsheetGrid, MAX_IMPORT_ROWS } from './spreadsheet.js';

export const EXAM_RESULTS_TEMPLATE_COLUMNS = [
  'Student Admission Number',
  'Student Name',
  'Class',
  'Academic Year',
  'Term',
  'Examination Name',
  'Subject',
  'Total Marks',
  'Marks Obtained',
] as const;

export interface ParsedExamResultInputRow {
  rowNumber: number;
  studentId: string;
  studentName: string;
  className: string;
  academicYear: string;
  term: string;
  examName: string;
  subject: string;
  totalMarks: string;
  marksObtained: string;
}

const RESULT_HEADER_ALIASES: Record<string, keyof Omit<ParsedExamResultInputRow, 'rowNumber'>> = {
  studentadmissionnumber: 'studentId',
  admissionnumber: 'studentId',
  admissionno: 'studentId',
  studentid: 'studentId',
  aqoonsigaardayga: 'studentId',

  studentname: 'studentName',
  fullname: 'studentName',
  studentfullname: 'studentName',
  name: 'studentName',
  magacaardayga: 'studentName',
  magacabuuxa: 'studentName',

  class: 'className',
  classgrade: 'className',
  classname: 'className',
  grade: 'className',
  fasalka: 'className',

  academicyear: 'academicYear',
  year: 'academicYear',
  sanaddugsiyeedka: 'academicYear',

  term: 'term',
  semester: 'term',
  xilliga: 'term',

  examinationname: 'examName',
  examname: 'examName',
  examination: 'examName',
  exam: 'examName',
  magacaimtixaanka: 'examName',

  subject: 'subject',
  subjectname: 'subject',
  maaddada: 'subject',

  totalmarks: 'totalMarks',
  maxmarks: 'totalMarks',
  outof: 'totalMarks',
  dhibcahauguhadan: 'totalMarks',
  dhibcahaugubadan: 'totalMarks',

  marksobtained: 'marksObtained',
  score: 'marksObtained',
  marks: 'marksObtained',
  obtainedmarks: 'marksObtained',
  dhibicda: 'marksObtained',
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface ExamTemplateSampleRow {
  studentId: string;
  studentName: string;
  className: string;
  academicYear: string;
  term: string;
  examName: string;
  subject: string;
  totalMarks: number;
  marksObtained: number;
}

export async function buildExamResultsTemplateBuffer(options: {
  samples: ExamTemplateSampleRow[];
  examinations: Array<{ name: string; academicYear: string; term: string }>;
  schedules: Array<{ examName: string; className: string; subject: string }>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dugsiga SMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Exam Results', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const colWidths = [26, 26, 16, 16, 14, 26, 20, 14, 16];
  sheet.columns = EXAM_RESULTS_TEMPLATE_COLUMNS.map((header, idx) => ({
    header,
    key: `col_${idx}`,
    width: colWidths[idx] || 18,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F294A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      bottom: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      left: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      right: { style: 'thin', color: { argb: 'FF1E3A5F' } },
    };
  });

  for (const colIdx of [1, 4]) {
    sheet.getColumn(colIdx).numFmt = '@';
  }

  const rowsToWrite =
    options.samples.length > 0
      ? options.samples
      : [
          {
            studentId: 'STU-2026-101',
            studentName: 'Amina Mohamed Hassan',
            className: 'Grade 8A',
            academicYear: '2026-2027',
            term: 'Term 1',
            examName: 'Midterm Examination',
            subject: 'Mathematics',
            totalMarks: 100,
            marksObtained: 88,
          },
        ];

  for (const s of rowsToWrite) {
    const added = sheet.addRow([
      s.studentId,
      s.studentName,
      s.className,
      s.academicYear,
      s.term,
      s.examName,
      s.subject,
      s.totalMarks,
      s.marksObtained,
    ]);
    added.height = 20;
    added.eachCell((cell, colNumber) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber >= 8 ? 'right' : 'left',
      };
      if (colNumber === 1 || colNumber === 4) {
        cell.numFmt = '@';
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  }

  const guide = workbook.addWorksheet('Scheduled Exams');
  guide.columns = [
    { header: 'Examination Name', key: 'exam', width: 28 },
    { header: 'Academic Year', key: 'year', width: 16 },
    { header: 'Term', key: 'term', width: 14 },
    { header: 'Scheduled Class & Subject', key: 'sched', width: 42 },
  ];
  guide.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
  });

  if (options.schedules.length > 0) {
    for (const sc of options.schedules) {
      const ex = options.examinations.find((e) => e.name === sc.examName);
      guide.addRow([
        sc.examName,
        ex?.academicYear || '',
        ex?.term || '',
        `${sc.className} — ${sc.subject}`,
      ]);
    }
  } else {
    for (const ex of options.examinations) {
      guide.addRow([ex.name, ex.academicYear, ex.term, 'No subjects scheduled yet']);
    }
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function parseExamResultsSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ headers: string[]; rows: ParsedExamResultInputRow[] }> {
  const grid = await extractSpreadsheetGrid(
    buffer,
    fileName,
    EXAM_RESULTS_TEMPLATE_COLUMNS.length
  );

  if (grid.length < 2) {
    throw new Error('The uploaded file must include a header row and at least one result row.');
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const columnMap: Array<keyof Omit<ParsedExamResultInputRow, 'rowNumber'> | null> = rawHeaders.map(
    (h) => {
      if (!h || FORBIDDEN_KEYS.has(h.toLowerCase())) return null;
      return RESULT_HEADER_ALIASES[normalizeHeaderKey(h)] ?? null;
    }
  );

  const recognizedCount = columnMap.filter(Boolean).length;
  if (recognizedCount < 4) {
    throw new Error(
      'Could not recognize examination result columns. Please download and use the official Excel template.'
    );
  }

  const dataRows = grid.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per upload.`);
  }

  const parsedRows: ParsedExamResultInputRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (!cells.some((c) => c.trim() !== '')) continue;

    const record: ParsedExamResultInputRow = {
      rowNumber: i + 2,
      studentId: '',
      studentName: '',
      className: '',
      academicYear: '',
      term: '',
      examName: '',
      subject: '',
      totalMarks: '',
      marksObtained: '',
    };

    for (let c = 0; c < columnMap.length; c++) {
      const targetKey = columnMap[c];
      if (!targetKey || FORBIDDEN_KEYS.has(targetKey)) continue;
      record[targetKey] = (cells[c] ?? '').trim();
    }

    parsedRows.push(record);
  }

  return {
    headers: rawHeaders.filter(Boolean),
    rows: parsedRows,
  };
}
