import ExcelJS from 'exceljs';
import { extractSpreadsheetGrid, MAX_IMPORT_ROWS } from './spreadsheet.js';

export const CLASS_TEMPLATE_COLUMNS = [
  'Class Name',
  'Academic Year',
  'Class Teacher',
  'Subjects',
  'Tuition Fee',
] as const;

export const TEACHER_TEMPLATE_COLUMNS = [
  'Teacher ID',
  'Full Name',
  'Phone Number',
  'Email Address',
  'Assigned Subjects',
  'Assigned Classes',
  'Status',
] as const;

export interface ParsedClassInputRow {
  rowNumber: number;
  name: string;
  academicYear: string;
  classTeacher: string;
  subjectsText: string;
  tuitionFee: string;
}

export interface ParsedTeacherInputRow {
  rowNumber: number;
  teacherId: string;
  fullName: string;
  phone: string;
  email: string;
  subjectsText: string;
  classesText: string;
  status: string;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CLASS_HEADER_ALIASES: Record<string, keyof Omit<ParsedClassInputRow, 'rowNumber'>> = {
  classname: 'name',
  class: 'name',
  grade: 'name',
  name: 'name',
  magacafasalka: 'name',
  fasalka: 'name',

  academicyear: 'academicYear',
  year: 'academicYear',
  sanaddugsiyeedka: 'academicYear',

  classteacher: 'classTeacher',
  teacher: 'classTeacher',
  teacherid: 'classTeacher',
  teachername: 'classTeacher',
  macallinkafasalka: 'classTeacher',

  subjects: 'subjectsText',
  subject: 'subjectsText',
  maaddooyinka: 'subjectsText',

  tuitionfee: 'tuitionFee',
  classfee: 'tuitionFee',
  fee: 'tuitionFee',
  lacagtafasalka: 'tuitionFee',
};

const TEACHER_HEADER_ALIASES: Record<string, keyof Omit<ParsedTeacherInputRow, 'rowNumber'>> = {
  teacherid: 'teacherId',
  id: 'teacherId',
  idnumber: 'teacherId',
  aqoonsigamacallinka: 'teacherId',

  fullname: 'fullName',
  teachername: 'fullName',
  name: 'fullName',
  magacabuuxa: 'fullName',

  phonenumber: 'phone',
  phone: 'phone',
  mobile: 'phone',
  lambarkatelefoonka: 'phone',

  emailaddress: 'email',
  email: 'email',
  cinwaankaiimaylka: 'email',

  assignedsubjects: 'subjectsText',
  subjects: 'subjectsText',
  subject: 'subjectsText',
  maaddooyinkalasiiyay: 'subjectsText',

  assignedclasses: 'classesText',
  classes: 'classesText',
  class: 'classesText',
  fasaladalasiiyay: 'classesText',

  status: 'status',
  teacherstatus: 'status',
  xaaladda: 'status',
};

export async function buildClassTemplateBuffer(
  academicYear: string,
  exampleTeachers: Array<{ teacherId: string; fullName: string }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dugsiga SMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Classes', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const colWidths = [22, 18, 26, 48, 16];
  sheet.columns = CLASS_TEMPLATE_COLUMNS.map((header, idx) => ({
    header,
    key: `col_${idx}`,
    width: colWidths[idx] || 20,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      bottom: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      left: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      right: { style: 'thin', color: { argb: 'FF1E3A5F' } },
    };
  });

  const tch1 = exampleTeachers[0]?.teacherId || '';
  const tch2 = exampleTeachers[1]?.fullName || '';

  const sampleRows = [
    [
      'Grade 7A',
      academicYear,
      tch1,
      'Somali, Arabic, English, Mathematics, Science, Islamic Studies',
      '120',
    ],
    [
      'Grade 8A',
      academicYear,
      tch2,
      'Somali, Arabic, English, Mathematics, Science, Social Studies',
      '135',
    ],
    [
      'Form 1A',
      academicYear,
      '',
      'Somali, Arabic, English, Mathematics, Biology, Chemistry, Physics',
      '150',
    ],
  ];

  for (const rowValues of sampleRows) {
    const added = sheet.addRow(rowValues);
    added.height = 20;
    added.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  }

  const guide = workbook.addWorksheet('Instructions');
  guide.columns = [
    { header: 'Field / Goobta', key: 'field', width: 24 },
    { header: 'English Instructions', key: 'en', width: 52 },
    { header: 'Tilmaamaha Af-Soomaaliga', key: 'so', width: 52 },
  ];
  guide.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
  });

  const notes: Array<[string, string, string]> = [
    ['Class Name', 'Required unique class name per academic year (e.g. Grade 7A, Form 1A).', 'Magaca fasalka oo khasab ah (tusaale: Grade 7A, Form 1A).'],
    ['Academic Year', `School academic year (defaults to ${academicYear} if left blank).`, `Sanad dugsiyeedka (haddii la banneeyo waa ${academicYear}).`],
    ['Class Teacher', 'Optional. Enter an existing Teacher ID (e.g. TCH-001) or exact Teacher Name, or leave blank.', 'Ikhtiyaari. Geli Aqoonsiga Macallinka (tusaale TCH-001) ama magaciisa oo buuxa, ama bannee.'],
    ['Subjects', 'Comma-separated subjects (e.g. Somali, English, Mathematics, Science).', 'Maaddooyinka oo kooma lagu kala saaray (tusaale: Somali, English, Mathematics).'],
    ['Tuition Fee', 'Non-negative numeric fee amount (defaults to 0 if blank).', 'Lacagta fasalka oo tiro ah (0 haddii la banneeyo).'],
  ];
  for (const row of notes) guide.addRow(row);

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function buildTeacherTemplateBuffer(
  exampleClasses: string[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dugsiga SMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Teachers', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const colWidths = [16, 26, 18, 26, 36, 28, 14];
  sheet.columns = TEACHER_TEMPLATE_COLUMNS.map((header, idx) => ({
    header,
    key: `col_${idx}`,
    width: colWidths[idx] || 20,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      bottom: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      left: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      right: { style: 'thin', color: { argb: 'FF1E3A5F' } },
    };
  });

  const clsSample1 = exampleClasses.slice(0, 2).join(', ');
  const clsSample2 = exampleClasses[0] || '';

  const sampleRows = [
    ['TCH-101', 'Hassan Ali Nur', '+252615223344', 'hassan.ali@school.so', 'Mathematics, Physics', clsSample1, 'Active'],
    ['TCH-102', 'Fadumo Omar Farah', '+252615556677', 'fadumo.omar@school.so', 'Somali, Islamic Studies', clsSample2, 'Active'],
    ['TCH-103', 'Abdikadir Mohamed Yusuf', '+252615889900', 'abdikadir.yusuf@school.so', 'English, History', '', 'Active'],
  ];

  for (const rowValues of sampleRows) {
    const added = sheet.addRow(rowValues);
    added.height = 20;
    added.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      if (colNumber === 1 || colNumber === 3) {
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

  for (const colIdx of [1, 3]) {
    sheet.getColumn(colIdx).numFmt = '@';
  }

  const guide = workbook.addWorksheet('Instructions');
  guide.columns = [
    { header: 'Field / Goobta', key: 'field', width: 24 },
    { header: 'English Instructions', key: 'en', width: 52 },
    { header: 'Tilmaamaha Af-Soomaaliga', key: 'so', width: 52 },
  ];
  guide.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
  });

  const notes: Array<[string, string, string]> = [
    ['Teacher ID', 'Unique ID (e.g. TCH-101). Or enable auto-generate ID in the import modal.', 'Aqoonsi gaar ah (tusaale TCH-101). Ama shid samaynta otomaatiga ah.'],
    ['Full Name', 'Required full name of the teacher.', 'Magaca buuxa ee macallinka (waa khasab).'],
    ['Phone Number', 'Valid phone number (7-15 digits, e.g. +252615223344).', 'Telefoon sax ah (7-15 lambar, tusaale +252615223344).'],
    ['Email Address', 'Required valid email address (e.g. teacher@school.so).', 'Cinwaan iimayl sax ah (waa khasab).'],
    ['Assigned Subjects', 'Comma-separated subjects (e.g. Mathematics, Physics).', 'Maaddooyinka uu dhigo oo kooma lagu kala saaray.'],
    [
      'Assigned Classes',
      `Optional comma-separated existing classes: ${exampleClasses.length > 0 ? exampleClasses.join(', ') : 'None created yet'}`,
      `Ikhtiyaari. Fasalada jira oo kooma lagu kala saaray: ${exampleClasses.length > 0 ? exampleClasses.join(', ') : 'Marka hore abuur fasalada'}`,
    ],
    ['Status', 'Active or Inactive (defaults to Active if blank).', 'Active ama Inactive (Active haddii la banneeyo).'],
  ];
  for (const row of notes) guide.addRow(row);

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function parseClassSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ headers: string[]; rows: ParsedClassInputRow[] }> {
  const grid = await extractSpreadsheetGrid(buffer, fileName, CLASS_TEMPLATE_COLUMNS.length);

  if (grid.length < 2) {
    throw new Error('The uploaded file must include a header row and at least one class row.');
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const columnMap: Array<keyof Omit<ParsedClassInputRow, 'rowNumber'> | null> = rawHeaders.map((h) => {
    if (!h || FORBIDDEN_KEYS.has(h.toLowerCase())) return null;
    return CLASS_HEADER_ALIASES[normalizeHeaderKey(h)] ?? null;
  });

  if (columnMap.filter(Boolean).length < 1 || !columnMap.includes('name')) {
    throw new Error(
      'Could not recognize class columns. Please include at least "Class Name" using the Excel template.'
    );
  }

  const dataRows = grid.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per upload.`);
  }

  const parsedRows: ParsedClassInputRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (!cells.some((c) => c.trim() !== '')) continue;

    const record: ParsedClassInputRow = {
      rowNumber: i + 2,
      name: '',
      academicYear: '',
      classTeacher: '',
      subjectsText: '',
      tuitionFee: '',
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

export async function parseTeacherSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ headers: string[]; rows: ParsedTeacherInputRow[] }> {
  const grid = await extractSpreadsheetGrid(buffer, fileName, TEACHER_TEMPLATE_COLUMNS.length);

  if (grid.length < 2) {
    throw new Error('The uploaded file must include a header row and at least one teacher row.');
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const columnMap: Array<keyof Omit<ParsedTeacherInputRow, 'rowNumber'> | null> = rawHeaders.map((h) => {
    if (!h || FORBIDDEN_KEYS.has(h.toLowerCase())) return null;
    return TEACHER_HEADER_ALIASES[normalizeHeaderKey(h)] ?? null;
  });

  if (columnMap.filter(Boolean).length < 2) {
    throw new Error(
      'Could not recognize teacher columns. Please use the official Teacher Excel template headings.'
    );
  }

  const dataRows = grid.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per upload.`);
  }

  const parsedRows: ParsedTeacherInputRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (!cells.some((c) => c.trim() !== '')) continue;

    const record: ParsedTeacherInputRow = {
      rowNumber: i + 2,
      teacherId: '',
      fullName: '',
      phone: '',
      email: '',
      subjectsText: '',
      classesText: '',
      status: '',
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
