import ExcelJS from 'exceljs';
import {
  extractSpreadsheetGrid,
  MAX_IMPORT_ROWS,
  normalizeDateCell,
  normalizeTimeCell,
} from './spreadsheet.js';

export const EXAM_TIMETABLE_TEMPLATE_COLUMNS = [
  'Examination Name',
  'Class / Grade',
  'Examination Date',
  'Subject',
  'Start Time',
  'End Time',
  'Invigilating Teacher',
  'Examination Room',
  'Additional Notes',
] as const;

export interface ParsedExamScheduleInputRow {
  rowNumber: number;
  examinationName: string;
  className: string;
  examDate: string;
  subject: string;
  startTime: string;
  endTime: string;
  invigilator: string;
  room: string;
  notes: string;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Record<string, keyof Omit<ParsedExamScheduleInputRow, 'rowNumber'>> = {
  examinationname: 'examinationName',
  examname: 'examinationName',
  examination: 'examinationName',
  exam: 'examinationName',
  magacaimtixaanka: 'examinationName',

  classgrade: 'className',
  classname: 'className',
  class: 'className',
  grade: 'className',
  fasalka: 'className',

  examinationdate: 'examDate',
  examdate: 'examDate',
  date: 'examDate',
  taariikhdaiimtixaanka: 'examDate',
  taariikhdai: 'examDate',
  taariikhda: 'examDate',

  subject: 'subject',
  subjectmaaddada: 'subject',
  maaddada: 'subject',

  starttime: 'startTime',
  start: 'startTime',
  waqtigabilowga: 'startTime',

  endtime: 'endTime',
  end: 'endTime',
  waqtigadhammaadka: 'endTime',

  invigilatingteacher: 'invigilator',
  invigilator: 'invigilator',
  teacher: 'invigilator',
  macallinkawaardiyaha: 'invigilator',
  macallinkawaardiyahaah: 'invigilator',
  macallinka: 'invigilator',

  examinationroom: 'room',
  examroom: 'room',
  room: 'room',
  qolkaimtixaanka: 'room',
  qolka: 'room',

  additionalnotes: 'notes',
  notes: 'notes',
  note: 'notes',
  faahfaahin: 'notes',
};

export async function buildExamTimetableTemplateBuffer(options: {
  examinations: Array<{ name: string; academicYear: string; term: string; startDate: string; endDate: string }>;
  classes: Array<{ name: string; subjects: string[] }>;
  teachers: Array<{ teacherId: string; fullName: string }>;
}): Promise<Buffer> {
  const { examinations, classes, teachers } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dugsiga SMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Exam Timetable', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const colWidths = [24, 16, 16, 20, 13, 13, 24, 18, 24];
  sheet.columns = EXAM_TIMETABLE_TEMPLATE_COLUMNS.map((header, idx) => ({
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

  const ex = examinations[0];
  const exName = ex?.name || 'Midterm Examination';
  const d1 = ex?.startDate || new Date().toISOString().slice(0, 10);
  const d2 = ex?.endDate && ex.endDate >= d1 ? ex.endDate : d1;
  const cls1 = classes[0]?.name || 'Grade 8A';
  const sub1 = classes[0]?.subjects?.[0] || 'Mathematics';
  const sub2 = classes[0]?.subjects?.[1] || 'English';
  const tch1 = teachers[0]?.fullName || 'Teacher Ahmed';
  const tch2 = teachers[1]?.fullName || tch1;

  const sampleRows = [
    [exName, cls1, d1, sub1, '08:00', '10:00', tch1, 'Room 101', 'Morning Session'],
    [exName, cls1, d2, sub2, '08:00', '10:00', tch2, 'Room 101', ''],
  ];

  for (const rowValues of sampleRows) {
    const added = sheet.addRow(rowValues);
    added.height = 20;
    added.eachCell((cell, colNum) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      if (colNum === 3 || colNum === 5 || colNum === 6) {
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

  sheet.getColumn(3).numFmt = '@';
  sheet.getColumn(5).numFmt = '@';
  sheet.getColumn(6).numFmt = '@';

  const guideSheet = workbook.addWorksheet('Instructions & Reference');
  guideSheet.columns = [
    { header: 'Field / Reference', key: 'field', width: 26 },
    { header: 'English Instructions', key: 'en', width: 58 },
    { header: 'Tilmaamaha Af-Soomaaliga', key: 'so', width: 58 },
  ];
  guideSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
  });

  const examListText =
    examinations.length > 0
      ? examinations.map((e) => `${e.name} (${e.startDate} to ${e.endDate})`).join('; ')
      : 'Create an examination first using Create New Examination';
  const classListText =
    classes.length > 0 ? classes.map((c) => c.name).join(', ') : 'Create classes first';
  const teacherListText =
    teachers.length > 0
      ? teachers.map((t) => `${t.fullName} (${t.teacherId})`).join(', ')
      : 'Add teachers first';

  const instructions: Array<[string, string, string]> = [
    [
      'Examination Name',
      `Must match an existing examination: ${examListText}`,
      `Waa inuu la mid noqdaa imtixaan jira: ${examListText}`,
    ],
    [
      'Class / Grade',
      `Must match an existing class: ${classListText}`,
      `Waa inuu la mid noqdaa fasal jira: ${classListText}`,
    ],
    [
      'Examination Date',
      'YYYY-MM-DD format within the selected examination start and end dates. Day of week is calculated automatically.',
      'Qaabka YYYY-MM-DD oo ku jira muddada imtixaanka. Maalinta todobaadka si otomaatig ah ayaa loo xisaabiyaa.',
    ],
    [
      'Subject',
      'Must match a subject assigned to that class.',
      'Waa inay tahay maaddo u qoran fasalkaas.',
    ],
    [
      'Start Time & End Time',
      'Required 24-hour HH:MM format (minimum duration 15 minutes). Duration is calculated automatically.',
      'Qaabka 24-saac HH:MM (ugu yaraan 15 daqiiqo). Muddada si otomaatig ah ayaa loo xisaabiyaa.',
    ],
    [
      'Invigilating Teacher',
      `Required Teacher full name or ID: ${teacherListText}`,
      `Macallinka waardiyaha (magac ama aqoonsi): ${teacherListText}`,
    ],
    [
      'Examination Room',
      'Required room name/number. Room, class, and teacher conflicts are automatically prevented.',
      'Qolka imtixaanka (waa khasab). Isku-dhaca qolka, fasalka, iyo macallinka si otomaatig ah ayaa loo hubiyaa.',
    ],
  ];

  for (const item of instructions) {
    guideSheet.addRow(item);
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function parseExamTimetableSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ headers: string[]; rows: ParsedExamScheduleInputRow[] }> {
  const grid = await extractSpreadsheetGrid(
    buffer,
    fileName,
    EXAM_TIMETABLE_TEMPLATE_COLUMNS.length
  );

  if (grid.length < 2) {
    throw new Error(
      'The uploaded file must include a header row and at least one examination schedule row.'
    );
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const columnMap: Array<keyof Omit<ParsedExamScheduleInputRow, 'rowNumber'> | null> =
    rawHeaders.map((h) => {
      if (!h || FORBIDDEN_KEYS.has(h.toLowerCase())) return null;
      return HEADER_ALIASES[normalizeHeaderKey(h)] ?? null;
    });

  if (columnMap.filter(Boolean).length < 4) {
    throw new Error(
      'Could not recognize examination timetable columns. Please use the official Excel template headings.'
    );
  }

  const dataRows = grid.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per upload.`);
  }

  const parsedRows: ParsedExamScheduleInputRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (!cells.some((c) => c.trim() !== '')) continue;

    const record: ParsedExamScheduleInputRow = {
      rowNumber: i + 2,
      examinationName: '',
      className: '',
      examDate: '',
      subject: '',
      startTime: '',
      endTime: '',
      invigilator: '',
      room: '',
      notes: '',
    };

    for (let c = 0; c < columnMap.length; c++) {
      const targetKey = columnMap[c];
      if (!targetKey || FORBIDDEN_KEYS.has(targetKey)) continue;
      const val = (cells[c] ?? '').trim();
      if (targetKey === 'examDate') {
        record.examDate = normalizeDateCell(val);
      } else if (targetKey === 'startTime' || targetKey === 'endTime') {
        record[targetKey] = normalizeTimeCell(val);
      } else {
        record[targetKey] = val;
      }
    }

    parsedRows.push(record);
  }

  return {
    headers: rawHeaders.filter(Boolean),
    rows: parsedRows,
  };
}
