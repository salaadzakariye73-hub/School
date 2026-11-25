import ExcelJS from 'exceljs';

export const STUDENT_TEMPLATE_COLUMNS = [
  'Student Admission Number',
  'Student Full Name',
  'Gender',
  'Class / Grade',
  'Guardian Name',
  'Guardian Phone',
  'Address',
  'Date of Birth',
  'Enrollment Date',
  'Student Status',
] as const;

export const MAX_IMPORT_ROWS = 5000;

export interface ParsedStudentInputRow {
  rowNumber: number;
  studentId: string;
  fullName: string;
  gender: string;
  className: string;
  parentName: string;
  parentPhone: string;
  address: string;
  dateOfBirth: string;
  admissionDate: string;
  status: string;
}

const HEADER_ALIASES: Record<string, keyof Omit<ParsedStudentInputRow, 'rowNumber'>> = {
  studentadmissionnumber: 'studentId',
  admissionnumber: 'studentId',
  admissionno: 'studentId',
  studentid: 'studentId',
  idnumber: 'studentId',
  aqoonsigaardayga: 'studentId',

  studentfullname: 'fullName',
  fullname: 'fullName',
  studentname: 'fullName',
  name: 'fullName',
  magacabuuxa: 'fullName',

  gender: 'gender',
  sex: 'gender',
  jinsiga: 'gender',

  classgrade: 'className',
  class: 'className',
  grade: 'className',
  classname: 'className',
  fasalka: 'className',

  guardianname: 'parentName',
  parentname: 'parentName',
  parentguardianname: 'parentName',
  guardian: 'parentName',
  magacawaalidka: 'parentName',

  guardianphone: 'parentPhone',
  parentphone: 'parentPhone',
  phone: 'parentPhone',
  phonenumber: 'parentPhone',
  telefoonkawaalidka: 'parentPhone',

  address: 'address',
  studentaddress: 'address',
  homeaddress: 'address',
  cinwaanka: 'address',

  dateofbirth: 'dateOfBirth',
  dob: 'dateOfBirth',
  birthdate: 'dateOfBirth',
  taariikhdadhalashada: 'dateOfBirth',

  enrollmentdate: 'admissionDate',
  enrolmentdate: 'admissionDate',
  admissiondate: 'admissionDate',
  dateenrolled: 'admissionDate',
  taariikhdaqorista: 'admissionDate',

  studentstatus: 'status',
  status: 'status',
  xaaladda: 'status',
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatDateYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function excelSerialToYmd(serial: number, date1904 = false): string {
  if (!Number.isFinite(serial) || serial <= 0) return '';
  const baseEpoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = baseEpoch + Math.round(serial) * 86400000;
  return formatDateYmd(new Date(ms));
}

function extractExcelCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return formatDateYmd(value);
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) {
      return extractExcelCellText(value.result as ExcelJS.CellValue);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text || '').join('').trim();
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return value.hyperlink.trim();
    }
  }
  return String(value).trim();
}

export async function buildStudentTemplateBuffer(
  exampleClasses: string[],
  academicYear: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dugsiga SMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Students', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const colWidths = [26, 28, 13, 18, 26, 20, 26, 16, 16, 16];
  sheet.columns = STUDENT_TEMPLATE_COLUMNS.map((header, idx) => ({
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

  const cls1 = exampleClasses[0] || 'Grade 8A';
  const cls2 = exampleClasses[1] || cls1;
  const currentYear = new Date().getFullYear();

  const sampleRows = [
    [
      `STU-${currentYear}-101`,
      'Amina Mohamed Hassan',
      'Female',
      cls1,
      'Mohamed Hassan Ali',
      '+252615112233',
      'Hodan, Mogadishu',
      '2012-05-14',
      `${currentYear}-09-01`,
      'Active',
    ],
    [
      `STU-${currentYear}-102`,
      'Abdirahman Warsame Farah',
      'Male',
      cls2,
      'Warsame Farah Nur',
      '+252615445566',
      'Wadajir, Mogadishu',
      '2011-11-22',
      `${currentYear}-09-01`,
      'Active',
    ],
    [
      `STU-${currentYear}-103`,
      'Halima Abdi Jama',
      'Female',
      cls1,
      'Abdi Jama Omar',
      '+252615778899',
      'Yaqshid, Mogadishu',
      '2012-03-08',
      `${currentYear}-09-01`,
      'Active',
    ],
  ];

  for (const rowValues of sampleRows) {
    const added = sheet.addRow(rowValues);
    added.height = 20;
    added.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      if (colNumber === 1 || colNumber === 6 || colNumber === 8 || colNumber === 9) {
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

  // Format text columns across initial template rows so manual typing keeps leading zeros/plus signs
  for (const colIdx of [1, 6, 8, 9]) {
    sheet.getColumn(colIdx).numFmt = '@';
  }

  const guideSheet = workbook.addWorksheet('Instructions');
  guideSheet.columns = [
    { header: 'Field / Goobta', key: 'field', width: 28 },
    { header: 'English Instructions', key: 'en', width: 52 },
    { header: 'Tilmaamaha Af-Soomaaliga', key: 'so', width: 52 },
  ];
  guideSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F294A' } };
  });

  const instructions: Array<[string, string, string]> = [
    [
      'Student Admission Number',
      'Unique ID per student (e.g. STU-2026-101). Must not duplicate existing records.',
      'Aqoonsi gaar ah oo arday kasta leeyahay (tusaale: STU-2026-101). Waa inaanu soo noqnoqon.',
    ],
    [
      'Student Full Name',
      'Required full name of the student.',
      'Magaca buuxa ee ardayga (waa khasab).',
    ],
    [
      'Gender',
      'Allowed values: Male or Female (also accepts M/F or Lab/Dheddig).',
      'Qiimaha la ogol yahay: Male ama Female (sidoo kale Lab/Dheddig).',
    ],
    [
      'Class / Grade',
      `Must match an existing class in ${academicYear}: ${exampleClasses.length > 0 ? exampleClasses.join(', ') : 'Create classes first'}`,
      `Waa inuu la mid noqdaa fasal ku jira nidaamka: ${exampleClasses.length > 0 ? exampleClasses.join(', ') : 'Marka hore abuur fasalada'}`,
    ],
    [
      'Guardian Name & Phone',
      'Guardian full name and valid phone number (7-15 digits, e.g. +252615000111).',
      'Magaca waalidka iyo telefoon sax ah (7-15 lambar, tusaale +252615000111).',
    ],
    [
      'Date of Birth & Enrollment Date',
      'Use YYYY-MM-DD format (e.g. 2012-05-14).',
      'Isticmaal qaabka YYYY-MM-DD (tusaale 2012-05-14).',
    ],
    [
      'Student Status',
      'Active, Inactive, Graduated, or Transferred (defaults to Active if blank).',
      'Active, Inactive, Graduated, ama Transferred (haddii la banneeyo waa Active).',
    ],
  ];

  for (const item of instructions) {
    guideSheet.addRow(item);
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  if (!clean.trim()) return [];

  // Detect delimiter from first line outside quotes
  const firstLineEnd = clean.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? clean : clean.slice(0, firstLineEnd);
  let commaCount = 0;
  let semiCount = 0;
  let inQ = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQ = !inQ;
    else if (!inQ) {
      if (ch === ',') commaCount++;
      else if (ch === ';') semiCount++;
    }
  }
  const delimiter = semiCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(field.trim());
        field = '';
      } else if (ch === '\r') {
        if (clean[i + 1] === '\n') i++;
        currentRow.push(field.trim());
        rows.push(currentRow);
        currentRow = [];
        field = '';
      } else if (ch === '\n') {
        currentRow.push(field.trim());
        rows.push(currentRow);
        currentRow = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || currentRow.length > 0) {
    currentRow.push(field.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((c) => c !== ''));
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .trim();
}

function parseSpreadsheetMlRows(xmlText: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = xmlText.match(/<(?:\w+:)?Row\b[^>]*>[\s\S]*?<\/(?:\w+:)?Row>/gi) || [];
  for (const rowXml of rowMatches) {
    const row: string[] = [];
    let colIdx = 0;
    const cellMatches = rowXml.match(/<(?:\w+:)?Cell\b[^>]*>[\s\S]*?<\/(?:\w+:)?Cell>|<(?:\w+:)?Cell\b[^>]*\/>/gi) || [];
    for (const cellXml of cellMatches) {
      const idxMatch = cellXml.match(/(?:\w+:)?Index="(\d+)"/i);
      if (idxMatch) {
        const targetIdx = Number(idxMatch[1]) - 1;
        while (colIdx < targetIdx) {
          row.push('');
          colIdx++;
        }
      }
      const dataMatch = cellXml.match(/<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/i);
      const val = dataMatch ? decodeXmlEntities(dataMatch[1].replace(/<[^>]+>/g, '')) : '';
      row.push(val);
      colIdx++;
    }
    if (row.some((c) => c !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

function parseHtmlTableRows(htmlText: string): string[][] {
  const rows: string[][] = [];
  const trMatches = htmlText.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const cells: string[] = [];
    const tdMatches = tr.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    for (const td of tdMatches) {
      const inner = td.replace(/<[^>]+>/g, ' ');
      cells.push(decodeXmlEntities(inner).replace(/\s+/g, ' ').trim());
    }
    if (cells.some((c) => c !== '')) {
      rows.push(cells);
    }
  }
  return rows;
}

function decodeRkNumber(rk: number): number {
  const isFloat = (rk & 0x02) === 0;
  const div100 = (rk & 0x01) !== 0;
  let val: number;
  if (isFloat) {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(rk & 0xfffffffc, 4);
    val = buf.readDoubleLE(0);
  } else {
    val = (rk >> 2);
  }
  return div100 ? val / 100 : val;
}

function readBiff8WorkbookStream(buffer: Buffer): Buffer | null {
  if (buffer.length < 512) return null;
  // OLE2 signature D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer[0] !== 0xd0 ||
    buffer[1] !== 0xcf ||
    buffer[2] !== 0x11 ||
    buffer[3] !== 0xe0 ||
    buffer[4] !== 0xa1 ||
    buffer[5] !== 0xb1 ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0xe1
  ) {
    return null;
  }

  const sectorShift = buffer.readUInt16LE(0x1e);
  const sectorSize = 1 << sectorShift;
  const miniSectorShift = buffer.readUInt16LE(0x20);
  const miniSectorSize = 1 << miniSectorShift;
  const firstDirSector = buffer.readUInt32LE(0x30);
  const miniStreamCutoff = buffer.readUInt32LE(0x38);
  const firstMiniFatSector = buffer.readUInt32LE(0x3c);
  const numMiniFatSectors = buffer.readUInt32LE(0x40);
  const firstDifatSector = buffer.readUInt32LE(0x44);
  const numDifatSectors = buffer.readUInt32LE(0x48);

  const FREE_SECT = 0xffffffff;
  const END_OF_CHAIN = 0xfffffffe;

  const sectorOffset = (sect: number) => 512 + sect * sectorSize;

  // Build DIFAT sector list -> FAT table
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = buffer.readUInt32LE(0x4c + i * 4);
    if (s !== FREE_SECT && s !== END_OF_CHAIN) fatSectors.push(s);
  }

  let difatSect = firstDifatSector;
  let difatGuard = 0;
  while (difatSect !== FREE_SECT && difatSect !== END_OF_CHAIN && difatGuard < numDifatSectors + 5) {
    const off = sectorOffset(difatSect);
    if (off + sectorSize > buffer.length) break;
    const entriesPerSector = sectorSize / 4 - 1;
    for (let i = 0; i < entriesPerSector; i++) {
      const s = buffer.readUInt32LE(off + i * 4);
      if (s !== FREE_SECT && s !== END_OF_CHAIN) fatSectors.push(s);
    }
    difatSect = buffer.readUInt32LE(off + entriesPerSector * 4);
    difatGuard++;
  }

  const fat: number[] = [];
  for (const s of fatSectors) {
    const off = sectorOffset(s);
    if (off + sectorSize > buffer.length) continue;
    for (let i = 0; i < sectorSize; i += 4) {
      fat.push(buffer.readUInt32LE(off + i));
    }
  }

  const readChain = (startSect: number, maxBytes?: number): Buffer => {
    const chunks: Buffer[] = [];
    let cur = startSect;
    const visited = new Set<number>();
    while (cur !== END_OF_CHAIN && cur !== FREE_SECT && cur < fat.length && !visited.has(cur)) {
      visited.add(cur);
      const off = sectorOffset(cur);
      if (off >= buffer.length) break;
      chunks.push(buffer.subarray(off, Math.min(off + sectorSize, buffer.length)));
      cur = fat[cur];
    }
    const out = Buffer.concat(chunks);
    return maxBytes !== undefined ? out.subarray(0, maxBytes) : out;
  };

  const dirStream = readChain(firstDirSector);
  let rootStartSect = END_OF_CHAIN;
  let rootSize = 0;
  let wbEntry: { startSect: number; size: number } | null = null;

  for (let off = 0; off + 128 <= dirStream.length; off += 128) {
    const nameLen = dirStream.readUInt16LE(off + 0x40);
    const objType = dirStream[off + 0x42];
    if (objType === 0) continue;
    const rawName = dirStream.subarray(off, off + Math.max(0, nameLen - 2)).toString('utf16le');
    const startSect = dirStream.readUInt32LE(off + 0x74);
    const size = dirStream.readUInt32LE(off + 0x78);

    if (objType === 5) {
      rootStartSect = startSect;
      rootSize = size;
    } else if (
      rawName.toLowerCase() === 'workbook' ||
      rawName.toLowerCase() === 'book'
    ) {
      wbEntry = { startSect, size };
    }
  }

  if (!wbEntry) return null;

  if (wbEntry.size < miniStreamCutoff && rootStartSect !== END_OF_CHAIN && numMiniFatSectors > 0) {
    const miniStream = readChain(rootStartSect, rootSize);
    const miniFatBuf = readChain(firstMiniFatSector);
    const miniFat: number[] = [];
    for (let i = 0; i + 4 <= miniFatBuf.length; i += 4) {
      miniFat.push(miniFatBuf.readUInt32LE(i));
    }
    const chunks: Buffer[] = [];
    let cur = wbEntry.startSect;
    const visited = new Set<number>();
    while (cur !== END_OF_CHAIN && cur !== FREE_SECT && cur < miniFat.length && !visited.has(cur)) {
      visited.add(cur);
      const off = cur * miniSectorSize;
      if (off >= miniStream.length) break;
      chunks.push(miniStream.subarray(off, Math.min(off + miniSectorSize, miniStream.length)));
      cur = miniFat[cur];
    }
    return Buffer.concat(chunks).subarray(0, wbEntry.size);
  }

  return readChain(wbEntry.startSect, wbEntry.size);
}

function parseBiff8Rows(stream: Buffer): string[][] {
  const sst: string[] = [];
  const cells = new Map<string, string>();
  let maxRow = -1;
  let maxCol = -1;
  let date1904 = false;

  // Read records sequentially, aggregating CONTINUE records where needed (for SST)
  interface BiffRecord {
    type: number;
    chunks: Buffer[];
  }
  const records: BiffRecord[] = [];
  let pos = 0;
  while (pos + 4 <= stream.length) {
    const recType = stream.readUInt16LE(pos);
    const recLen = stream.readUInt16LE(pos + 2);
    pos += 4;
    if (pos + recLen > stream.length) break;
    const data = stream.subarray(pos, pos + recLen);
    pos += recLen;

    if (recType === 0x003c && records.length > 0 && records[records.length - 1].type === 0x00fc) {
      records[records.length - 1].chunks.push(data);
    } else {
      records.push({ type: recType, chunks: [data] });
    }
  }

  // Only inspect first worksheet BOF..EOF after globals BOF..EOF
  let bofDepth = 0;
  let sheetCount = 0;
  let readingFirstSheet = false;

  for (const rec of records) {
    const data = rec.chunks[0];
    if (rec.type === 0x0809) {
      // BOF
      bofDepth++;
      const dt = data.length >= 4 ? data.readUInt16LE(2) : 0;
      if (dt === 0x0010) {
        sheetCount++;
        readingFirstSheet = sheetCount === 1;
      }
      continue;
    }
    if (rec.type === 0x000a) {
      // EOF
      if (readingFirstSheet) {
        readingFirstSheet = false;
      }
      bofDepth = Math.max(0, bofDepth - 1);
      continue;
    }

    if (rec.type === 0x0022 && data.length >= 2) {
      date1904 = data.readUInt16LE(0) === 1;
    }

    // Parse SST (0x00FC) across chunks safely
    if (rec.type === 0x00fc) {
      let chunkIdx = 0;
      let offset = 8; // skip cstTotal (4) + cstUnique (4)
      const ensure = (n: number): boolean => {
        while (chunkIdx < rec.chunks.length && offset >= rec.chunks[chunkIdx].length) {
          offset -= rec.chunks[chunkIdx].length;
          chunkIdx++;
        }
        return chunkIdx < rec.chunks.length && offset + n <= rec.chunks[chunkIdx].length;
      };
      const readU8 = (): number => {
        ensure(1);
        const v = rec.chunks[chunkIdx][offset];
        offset += 1;
        return v;
      };
      const readU16 = (): number => {
        ensure(2);
        const v = rec.chunks[chunkIdx].readUInt16LE(offset);
        offset += 2;
        return v;
      };
      const readU32 = (): number => {
        ensure(4);
        const v = rec.chunks[chunkIdx].readUInt32LE(offset);
        offset += 4;
        return v;
      };

      const uniqueCount = data.length >= 8 ? data.readUInt32LE(4) : 0;
      for (let s = 0; s < uniqueCount && chunkIdx < rec.chunks.length; s++) {
        if (!ensure(3)) break;
        const cch = readU16();
        let flags = readU8();
        let highByte = (flags & 0x01) !== 0;
        const hasExt = (flags & 0x04) !== 0;
        const hasRich = (flags & 0x08) !== 0;
        const rtRuns = hasRich ? readU16() : 0;
        const extBytes = hasExt ? readU32() : 0;

        let charsLeft = cch;
        let str = '';
        while (charsLeft > 0 && chunkIdx < rec.chunks.length) {
          if (offset >= rec.chunks[chunkIdx].length) {
            chunkIdx++;
            if (chunkIdx >= rec.chunks.length) break;
            flags = rec.chunks[chunkIdx][0];
            highByte = (flags & 0x01) !== 0;
            offset = 1;
          }
          const availBytes = rec.chunks[chunkIdx].length - offset;
          const bpc = highByte ? 2 : 1;
          const takeChars = Math.min(charsLeft, Math.floor(availBytes / bpc));
          if (takeChars <= 0) break;
          const takeBytes = takeChars * bpc;
          const slice = rec.chunks[chunkIdx].subarray(offset, offset + takeBytes);
          str += highByte ? slice.toString('utf16le') : slice.toString('latin1');
          offset += takeBytes;
          charsLeft -= takeChars;
        }

        let skipBytes = rtRuns * 4 + extBytes;
        while (skipBytes > 0 && chunkIdx < rec.chunks.length) {
          const avail = rec.chunks[chunkIdx].length - offset;
          if (avail >= skipBytes) {
            offset += skipBytes;
            skipBytes = 0;
          } else {
            skipBytes -= avail;
            chunkIdx++;
            offset = 0;
          }
        }
        sst.push(str.trim());
      }
      continue;
    }

    if (!readingFirstSheet || data.length < 6) continue;

    const setCell = (r: number, c: number, val: string) => {
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
      cells.set(`${r}:${c}`, val.trim());
    };

    if (rec.type === 0x00fd && data.length >= 10) {
      // LABELSST
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const idx = data.readUInt32LE(6);
      setCell(r, c, sst[idx] ?? '');
    } else if (rec.type === 0x0204 && data.length >= 8) {
      // LABEL
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const len = data.readUInt16LE(6);
      const str = data.subarray(8, 8 + len).toString('latin1');
      setCell(r, c, str);
    } else if (rec.type === 0x0203 && data.length >= 14) {
      // NUMBER
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const num = data.readDoubleLE(6);
      // Heuristic: Excel dates stored as serial numbers around 20000..70000 in DOB/Admission columns will also work if handled downstream
      setCell(r, c, Number.isFinite(num) ? String(num) : '');
    } else if (rec.type === 0x027e && data.length >= 10) {
      // RK
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const num = decodeRkNumber(data.readInt32LE(6));
      setCell(r, c, Number.isFinite(num) ? String(num) : '');
    } else if (rec.type === 0x00bd && data.length >= 12) {
      // MULRK
      const r = data.readUInt16LE(0);
      const firstCol = data.readUInt16LE(2);
      const lastCol = data.readUInt16LE(data.length - 2);
      for (let c = firstCol, off = 4; c <= lastCol && off + 6 <= data.length - 2; c++, off += 6) {
        const num = decodeRkNumber(data.readInt32LE(off + 2));
        setCell(r, c, Number.isFinite(num) ? String(num) : '');
      }
    } else if (rec.type === 0x0006 && data.length >= 14) {
      // FORMULA numeric result (if not string/bool/error sentinel 0xFFFF in bytes 12..13)
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const sentinel = data.readUInt16LE(12);
      if (sentinel !== 0xffff) {
        const num = data.readDoubleLE(6);
        setCell(r, c, Number.isFinite(num) ? String(num) : '');
      }
    }
  }

  void date1904;

  const grid: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      row.push(cells.get(`${r}:${c}`) ?? '');
    }
    if (row.some((cell) => cell !== '')) {
      grid.push(row);
    }
  }
  return grid;
}

export function normalizeDateCell(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  // Pure numeric Excel serial date (e.g. 41043 -> 2012-05-14)
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 10000 && serial <= 90000) {
      return excelSerialToYmd(serial);
    }
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);
    // Prefer DD/MM/YYYY unless middle > 12 (MM/DD/YYYY)
    let day = p1;
    let month = p2;
    if (p2 > 12 && p1 <= 12) {
      month = p1;
      day = p2;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateYmd(parsed);
  }

  return s;
}

export async function extractSpreadsheetGrid(
  buffer: Buffer,
  fileName: string,
  minCols: number = STUDENT_TEMPLATE_COLUMNS.length
): Promise<string[][]> {
  const lower = fileName.toLowerCase();
  let grid: string[][] = [];

  if (lower.endsWith('.csv')) {
    grid = parseCsvRows(buffer.toString('utf8'));
  } else if (lower.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('The uploaded Excel workbook contains no sheets.');
    }
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      const colCount = Math.max(row.cellCount, minCols);
      for (let c = 1; c <= colCount; c++) {
        vals.push(extractExcelCellText(row.getCell(c).value));
      }
      if (vals.some((v) => v !== '')) {
        grid.push(vals);
      }
    });
  } else if (lower.endsWith('.xls')) {
    const textHead = buffer.subarray(0, 512).toString('utf8').trim().toLowerCase();
    if (textHead.includes('<workbook') || textHead.startsWith('<?xml')) {
      grid = parseSpreadsheetMlRows(buffer.toString('utf8'));
    } else if (textHead.includes('<table') || textHead.includes('<html')) {
      grid = parseHtmlTableRows(buffer.toString('utf8'));
    } else {
      const stream = readBiff8WorkbookStream(buffer);
      if (!stream) {
        throw new Error('Invalid or unsupported .xls binary file. Please save as .xlsx or .csv and upload again.');
      }
      grid = parseBiff8Rows(stream);
    }
  } else {
    throw new Error('Unsupported file type. Please upload a .xlsx, .xls, or .csv file.');
  }

  return grid;
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ headers: string[]; rows: ParsedStudentInputRow[] }> {
  const grid = await extractSpreadsheetGrid(buffer, fileName, STUDENT_TEMPLATE_COLUMNS.length);

  if (grid.length < 2) {
    throw new Error('The uploaded file must include a header row and at least one student row.');
  }

  const rawHeaders = grid[0].map((h) => h.trim());
  const columnMap: Array<keyof Omit<ParsedStudentInputRow, 'rowNumber'> | null> = rawHeaders.map((h) => {
    if (!h || FORBIDDEN_KEYS.has(h.toLowerCase())) return null;
    const norm = normalizeHeaderKey(h);
    return HEADER_ALIASES[norm] ?? null;
  });

  const recognizedCount = columnMap.filter(Boolean).length;
  if (recognizedCount < 3) {
    throw new Error(
      'Could not recognize student columns. Please use the official Excel template headings.'
    );
  }

  const dataRows = grid.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows allowed per upload.`);
  }

  const parsedRows: ParsedStudentInputRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (!cells.some((c) => c.trim() !== '')) continue;

    const record: ParsedStudentInputRow = {
      rowNumber: i + 2,
      studentId: '',
      fullName: '',
      gender: '',
      className: '',
      parentName: '',
      parentPhone: '',
      address: '',
      dateOfBirth: '',
      admissionDate: '',
      status: '',
    };

    for (let c = 0; c < columnMap.length; c++) {
      const targetKey = columnMap[c];
      if (!targetKey || FORBIDDEN_KEYS.has(targetKey)) continue;
      const cellVal = (cells[c] ?? '').trim();
      if (targetKey === 'dateOfBirth' || targetKey === 'admissionDate') {
        record[targetKey] = normalizeDateCell(cellVal);
      } else {
        record[targetKey] = cellVal;
      }
    }

    parsedRows.push(record);
  }

  return {
    headers: rawHeaders.filter(Boolean),
    rows: parsedRows,
  };
}
