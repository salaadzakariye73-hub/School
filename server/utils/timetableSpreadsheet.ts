import ExcelJS from 'exceljs';
import { extractSpreadsheetGrid, MAX_IMPORT_ROWS, normalizeTimeCell } from './spreadsheet.js';

export const TIMETABLE_TEMPLATE_COLUMNS = [
  'Class / Grade',
  'Day of Week',
  'Period Number',
  'Start Time',
  'End Time',
  'Subject',
  'Teacher',
  'Room',
] as const;

export interface ParsedTimetableInputRow {
  rowNumber: number;
  className: string;
  dayOfWeek: string;
  periodNumber: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Record<string, keyof Omit<ParsedTimetableInputRow, 'rowNumber'>> = {
  classgrade: 'className',
  classname: 'className',
  class: 'className',
  grade: 'className',
  fasalka: 'className',
  magacafasalka: 'className',

  dayofweek: 'dayOfWeek',
  day: 'dayOfWeek',
  weekday: 'dayOfWeek',
  maalinta: 'dayOfWeek',

  periodnumber: 'periodNumber',
  period: 'periodNumber',
  periodno: 'periodNumber',
  xilliga: 'periodNumber',

  starttime: 'startTime',
  start: 'startTime',
  fromtime: 'startTime',
  waqtigabilowga: 'startTime',

  endtime: 'endTime',
  end: 'endTime',
  totime: 'endTime',
  waqtigadhammaadka: 'endTime',

  subject: 'subject',
  maaddada: 'subject',

  teacher: 'teacher',
  teachername: 'teacher',
  teacherid: 'teacher',
  macallinka: 'teacher',

  room: 'room',
  classroom: 'room',
  classroomroom: 'room',
  qolkafasalka: 'room',
  qolka: 'room',
};

export async function buildTimetableTemplateBuffer(options: {
  exampleClasses: string[];
  exampleTeachers: Array<{ teacherId: string; fullName: string }>;
}): Promise<Buffer> {
  const { exampleClasses, exampleTeachers } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dugsiga SMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Timetable', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const colWidths = [18, 16, 15, 14, 14, 22, 24, 16];
  sheet.columns = TIMETABLE_TEMPLATE_COLUMNS.map((header, idx) => ({
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

  const cls1 = exampleClasses[0] || 'Grade 7A';
  const tch1 = exampleTeachers[0]?.fullName || '';
  const tch2 = exampleTeachers[1]?.fullName || tch1;

  const sampleRows = [
    [cls1, 'Saturday', '1', '08:00', '08:45', 'Mathematics', tch1, 'Room 101'],
    [cls1, 'Saturday', '2', '08:45', '09:30', 'English', tch2, 'Room 101'],
    [cls1, 'Sunday', '1', '08:00', '08:45', 'Somali', tch1, 'Room 101'],
    [cls1, 'Monday', '1', '08:00', '08:45', 'Science', tch2, 'Room 101'],
    [cls1, 'Tuesday', '1', '08:00', '08:45', 'Arabic', tch1, 'Room 101'],
    [cls1, 'Wednesday', '1', '08:00', '08:45', 'Islamic Studies', tch2, 'Room 101'],
  ];

  for (const rowValues of sampleRows) {
    const added = sheet.addRow(rowValues);
    added.height = 20;
    added.eachCell((cell, colNum) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      if (colNum === 4 || colNum === 5) {
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

  sheet.getColumn(4).numFmt = '@';
  sheet.getColumn(5).numFmt = '@';

  const guideSheet = workbook.addWorksheet('Instructions');
  guideSheet.columns = [
    { header: 'Field / Goobta', key: 'field', width: 24 },
    { header: 'English Instructions', key: 'en', width: 58 },
    { header: 'Tilmaamaha Af-Soomaaliga', key: 'so', width: 58 },
  ];
  guideSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
  });

  const instructions: Array<[string, string, string]> = [
    [
      'Class / Grade',
      `Required. Available classes: ${exampleClasses.length > 0 ? exampleClasses.join(', ') : 'Create classes first'}`,
      `Waa khasab. Fasalada jira: ${exampleClasses.length > 0 ? exampleClasses.join(', ') : 'Marka hore abuur fasalada'}`,
    ],
    [
      'Day of Week (5 Days Only)',
      'Allowed days: Saturday, Sunday, Monday, Tuesday, Wednesday (Thursday is excluded).',
      'Maalmaha la ogol yahay waa 5 maalin oo keliya: Saturday (Sabti), Sunday (Axad), Monday (Isniin), Tuesday (Talaado), Wednesday (Arbaco). Khamiista laguma jiro.',
    ],
    [
      'Period Number',
      'Required integer from 1 to 10.',
      'Waa khasab, lambar u dhexeeya 1 ilaa 10.',
    ],
    [
      'Start Time & End Time',
      'Required 24-hour HH:MM format (e.g. 08:00 and 08:45). End time must be after start time.',
      'Waa khasab, qaabka 24-saac HH:MM (tusaale: 08:00 iyo 08:45).',
    ],
    [
      'Subject',
      'Required subject name.',
      'Magaca maaddada (waa khasab).',
    ],
    [
      'Teacher',
      `Optional. Full name or Teacher ID${exampleTeachers.length > 0 ? ` (e.g. ${exampleTeachers.map((t) => t.fullName).join(', ')})` : ''}.`,
      'Ikhtiyaari. Magaca buuxa ama Aqoonsiga Macallinka.',
    ],
    [
      'Room',
      'Optional classroom / room number (e.g. Room 101).',
      'Ikhtiyaari. Qolka fasalka (tusaale: Room 101).',
    ],
  ];

  for (const item of instructions) {
    guideSheet.addRow(item);
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function parseTimetableSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ headers: string[]; rows: ParsedTimetableInputRow[] }> {
  const grid = await extractSpreadsheetGrid(buffer, fileName, TIMETABLE_TEMPLATE_COLUMNS.length);

  if (grid.length < 2) {
    throw new Error('The uploaded file must include a header row and at least one timetable row.');
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const columnMap: Array<keyof Omit<ParsedTimetableInputRow, 'rowNumber'> | null> = rawHeaders.map(
    (h) => {
      if (!h || FORBIDDEN_KEYS.has(h.toLowerCase())) return null;
      return HEADER_ALIASES[normalizeHeaderKey(h)] ?? null;
    }
  );

  if (columnMap.filter(Boolean).length < 3) {
    throw new Error(
      'Could not recognize timetable columns. Please use the official Timetable Excel template headings.'
    );
  }

  const dataRows = grid.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per upload.`);
  }

  const parsedRows: ParsedTimetableInputRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (!cells.some((c) => c.trim() !== '')) continue;

    const record: ParsedTimetableInputRow = {
      rowNumber: i + 2,
      className: '',
      dayOfWeek: '',
      periodNumber: '',
      startTime: '',
      endTime: '',
      subject: '',
      teacher: '',
      room: '',
    };

    for (let c = 0; c < columnMap.length; c++) {
      const targetKey = columnMap[c];
      if (!targetKey || FORBIDDEN_KEYS.has(targetKey)) continue;
      const val = (cells[c] ?? '').trim();
      if (targetKey === 'startTime' || targetKey === 'endTime') {
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
