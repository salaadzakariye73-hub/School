// Lightweight, dependency-free PDF 1.4 generator for printable landscape A4 Examination Timetables

export interface PdfTimetableRow {
  examName: string;
  className: string;
  examDate: string;
  dayOfWeek: string;
  subject: string;
  timeRange: string;
  duration: string;
  invigilator: string;
  room: string;
  notes: string;
}

function escapePdfText(input: string): string {
  const ascii = input
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  return ascii;
}

function truncateText(input: string, maxLen: number): string {
  const s = (input || '').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 2)) + '..';
}

export function downloadExamTimetablePdf(options: {
  filename?: string;
  schoolName: string;
  title: string;
  subtitle?: string;
  rows: PdfTimetableRow[];
}): void {
  const {
    filename = 'examination-timetable.pdf',
    schoolName,
    title,
    subtitle = '',
    rows,
  } = options;

  // Landscape A4: 842 x 595 pt
  const pageWidth = 842;
  const pageHeight = 595;
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2; // 786 pt

  const columns: Array<{ label: string; width: number; maxChars: number }> = [
    { label: 'Date', width: 68, maxChars: 11 },
    { label: 'Day', width: 60, maxChars: 10 },
    { label: 'Examination', width: 112, maxChars: 20 },
    { label: 'Class', width: 70, maxChars: 12 },
    { label: 'Subject', width: 102, maxChars: 18 },
    { label: 'Time', width: 78, maxChars: 13 },
    { label: 'Dur.', width: 46, maxChars: 7 },
    { label: 'Invigilator', width: 110, maxChars: 20 },
    { label: 'Room', width: 65, maxChars: 11 },
    { label: 'Notes', width: 75, maxChars: 13 },
  ];

  const rowsPerPage = 19;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const pageStreams: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    const slice = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    const cmds: string[] = [];

    // Navy Header Banner
    cmds.push('0.059 0.161 0.290 rg');
    cmds.push(`${marginX} ${pageHeight - 74} ${contentWidth} 48 re f`);

    // School Name & Title in white
    cmds.push('1 1 1 rg');
    cmds.push('BT');
    cmds.push('/F2 13 Tf');
    cmds.push(`${marginX + 12} ${pageHeight - 44} Td`);
    cmds.push(`(${escapePdfText(truncateText(schoolName, 60))}) Tj`);
    cmds.push('ET');

    cmds.push('BT');
    cmds.push('/F1 10 Tf');
    cmds.push(`${marginX + 12} ${pageHeight - 62} Td`);
    cmds.push(`(${escapePdfText(truncateText(title, 85))}) Tj`);
    cmds.push('ET');

    // Subtitle / Metadata line
    if (subtitle) {
      cmds.push('0.28 0.33 0.41 rg');
      cmds.push('BT');
      cmds.push('/F1 8.5 Tf');
      cmds.push(`${marginX} ${pageHeight - 90} Td`);
      cmds.push(`(${escapePdfText(truncateText(subtitle, 120))}) Tj`);
      cmds.push('ET');
    }

    // Table Header Bar
    const tableTopY = pageHeight - 104;
    cmds.push('0.93 0.95 0.97 rg');
    cmds.push(`${marginX} ${tableTopY - 20} ${contentWidth} 20 re f`);

    cmds.push('0.059 0.161 0.290 rg');
    let curX = marginX + 4;
    for (const col of columns) {
      cmds.push('BT');
      cmds.push('/F2 8.5 Tf');
      cmds.push(`${curX} ${tableTopY - 13} Td`);
      cmds.push(`(${escapePdfText(col.label)}) Tj`);
      cmds.push('ET');
      curX += col.width;
    }

    // Horizontal line under table header
    cmds.push('0.78 0.82 0.87 RG 0.6 w');
    cmds.push(`${marginX} ${tableTopY - 20} m ${marginX + contentWidth} ${tableTopY - 20} l S`);

    // Rows
    let rowY = tableTopY - 20;
    for (let i = 0; i < slice.length; i++) {
      const r = slice[i];
      const nextY = rowY - 22;

      if (i % 2 === 1) {
        cmds.push('0.98 0.985 0.992 rg');
        cmds.push(`${marginX} ${nextY} ${contentWidth} 22 re f`);
      }

      const values = [
        r.examDate,
        r.dayOfWeek,
        r.examName,
        r.className,
        r.subject,
        r.timeRange,
        r.duration,
        r.invigilator,
        r.room,
        r.notes || '-',
      ];

      cmds.push('0.09 0.12 0.18 rg');
      let cellX = marginX + 4;
      for (let c = 0; c < columns.length; c++) {
        cmds.push('BT');
        cmds.push('/F1 8 Tf');
        cmds.push(`${cellX} ${rowY - 14} Td`);
        cmds.push(`(${escapePdfText(truncateText(values[c] || '', columns[c].maxChars))}) Tj`);
        cmds.push('ET');
        cellX += columns[c].width;
      }

      cmds.push('0.88 0.91 0.94 RG 0.4 w');
      cmds.push(`${marginX} ${nextY} m ${marginX + contentWidth} ${nextY} l S`);
      rowY = nextY;
    }

    // Footer
    cmds.push('0.45 0.50 0.58 rg');
    cmds.push('BT');
    cmds.push('/F1 8 Tf');
    cmds.push(`${marginX} 22 Td`);
    cmds.push(
      `(${escapePdfText(`Generated ${new Date().toISOString().slice(0, 10)}   |   Page ${p + 1} of ${totalPages}`)}) Tj`
    );
    cmds.push('ET');

    pageStreams.push(cmds.join('\n'));
  }

  // Assemble PDF objects cleanly
  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: F1 Helvetica, 4: F2 Helvetica-Bold
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageObjNums: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjNums.push(5 + i * 2);
  }
  objects.push(
    `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${totalPages} >>`
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  for (let i = 0; i < totalPages; i++) {
    const contentObjNum = 5 + i * 2 + 1;
    const stream = pageStreams[i];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>`
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
