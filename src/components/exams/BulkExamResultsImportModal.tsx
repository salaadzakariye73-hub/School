import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useTheme } from '../../context/ThemeContext';
import { apiDownloadBlob, apiRequest, apiUploadWithProgress } from '../../utils/api';
import { downloadCsv } from '../../utils/export';
import type {
  Classroom,
  Examination,
  ExamResultImportCommitResponse,
  ExamResultImportRow,
  ExamResultImportSummary,
  ExamResultImportUploadResponse,
} from '../../types';

interface BulkExamResultsImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
  examinations: Examination[];
  classes: Classroom[];
}

type ImportStep = 1 | 2 | 4 | 5 | 6;
type RowFilter = 'all' | 'valid' | 'duplicate' | 'invalid';

const TEMPLATE_HEADERS = [
  'Student Admission Number',
  'Student Name',
  'Class',
  'Academic Year',
  'Term',
  'Examination Name',
  'Subject',
  'Total Marks',
  'Marks Obtained',
];

const PAGE_SIZE = 50;
const COMMIT_CHUNK_SIZE = 250;

export function BulkExamResultsImportModal({
  open,
  onClose,
  onImported,
  examinations,
  classes,
}: BulkExamResultsImportModalProps) {
  const { tr, lang } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<ImportStep>(1);
  const [tplExamId, setTplExamId] = useState('');
  const [tplClassId, setTplClassId] = useState('');
  const [downloadingTpl, setDownloadingTpl] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ExamResultImportRow[]>([]);
  const [summary, setSummary] = useState<ExamResultImportSummary>({
    total: 0,
    valid: 0,
    duplicates: 0,
    invalid: 0,
    warnings: 0,
  });

  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [page, setPage] = useState(1);
  const [validating, setValidating] = useState(false);
  const [dirtyEdits, setDirtyEdits] = useState(false);

  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 });
  const [commitResult, setCommitResult] = useState<ExamResultImportCommitResponse | null>(null);

  const resetAll = () => {
    setStep(1);
    setError(null);
    setFileName('');
    setRows([]);
    setSummary({ total: 0, valid: 0, duplicates: 0, invalid: 0, warnings: 0 });
    setRowFilter('all');
    setPage(1);
    setDirtyEdits(false);
    setUploadProgress(0);
    setImportProgress({ processed: 0, total: 0 });
    setCommitResult(null);
  };

  const handleClose = () => {
    if (uploading || step === 5) return;
    resetAll();
    onClose();
  };

  const handleDownloadTemplate = async () => {
    setError(null);
    setDownloadingTpl(true);
    try {
      const qs = new URLSearchParams();
      if (tplExamId) qs.set('examinationId', tplExamId);
      if (tplClassId) qs.set('classId', tplClassId);
      const q = qs.toString();
      await apiDownloadBlob(
        `/api/exams/import/template${q ? `?${q}` : ''}`,
        'dugsiga-exam-results-template.xlsx'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download results template.');
    } finally {
      setDownloadingTpl(false);
    }
  };

  const processSelectedFile = async (file: File) => {
    setError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
      setError('Please select a valid .xlsx, .xls, or .csv file.');
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiUploadWithProgress<ExamResultImportUploadResponse>(
        '/api/exams/import/upload',
        formData,
        (pct) => setUploadProgress(pct)
      );

      setFileName(res.fileName);
      setRows(res.rows);
      setSummary(res.summary);
      setRowFilter('all');
      setPage(1);
      setDirtyEdits(false);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload results file.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processSelectedFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processSelectedFile(file);
  };

  const updateRowField = (
    rowNumber: number,
    field: keyof Pick<
      ExamResultImportRow,
      | 'studentId'
      | 'className'
      | 'academicYear'
      | 'term'
      | 'examName'
      | 'subject'
      | 'totalMarks'
      | 'marksObtained'
    >,
    value: string
  ) => {
    setDirtyEdits(true);
    setRows((prev) =>
      prev.map((r) => (r.rowNumber === rowNumber ? { ...r, [field]: value } : r))
    );
  };

  const handleRevalidate = async (): Promise<ExamResultImportRow[] | null> => {
    setError(null);
    setValidating(true);
    try {
      const res = await apiRequest<{
        rows: ExamResultImportRow[];
        summary: ExamResultImportSummary;
      }>('/api/exams/import/validate', {
        method: 'POST',
        body: JSON.stringify({
          rows: rows.map((r) => ({
            rowNumber: r.rowNumber,
            studentId: r.studentId,
            studentName: r.studentName,
            className: r.className,
            academicYear: r.academicYear,
            term: r.term,
            examName: r.examName,
            subject: r.subject,
            totalMarks: r.totalMarks,
            marksObtained: r.marksObtained,
          })),
        }),
      });
      setRows(res.rows);
      setSummary(res.summary);
      setDirtyEdits(false);
      return res.rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate result rows.');
      return null;
    } finally {
      setValidating(false);
    }
  };

  const handleDownloadRejected = (rejectedSource?: ExamResultImportRow[]) => {
    const source = rejectedSource ?? rows.filter((r) => r.rowStatus !== 'valid');
    if (source.length === 0) return;

    const headers = [...TEMPLATE_HEADERS, 'Validation Status', 'Errors'];
    const csvRows = source.map((r) => [
      r.studentId,
      r.studentName,
      r.className,
      r.academicYear,
      r.term,
      r.examName,
      r.subject,
      r.totalMarks,
      r.marksObtained,
      r.rowStatus,
      r.errors.join(' | '),
    ]);
    downloadCsv('rejected-exam-results', headers, csvRows);
  };

  const handleImportAll = async () => {
    setError(null);

    let currentRows = rows;
    if (dirtyEdits) {
      const refreshed = await handleRevalidate();
      if (!refreshed) return;
      currentRows = refreshed;
    }

    const validRows = currentRows.filter((r) => r.rowStatus === 'valid');
    const preRejected = currentRows.filter((r) => r.rowStatus !== 'valid');

    if (validRows.length === 0) {
      setError(tr('noValidStudentsToImport'));
      return;
    }

    setStep(5);
    setImportProgress({ processed: 0, total: validRows.length });

    let totalImported = 0;
    let totalFailed = 0;
    const allRejected: ExamResultImportRow[] = [...preRejected];

    try {
      for (let i = 0; i < validRows.length; i += COMMIT_CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + COMMIT_CHUNK_SIZE);
        const res = await apiRequest<ExamResultImportCommitResponse>('/api/exams/import/commit', {
          method: 'POST',
          body: JSON.stringify({
            rows: chunk.map((r) => ({
              rowNumber: r.rowNumber,
              studentId: r.studentId,
              studentName: r.studentName,
              className: r.className,
              academicYear: r.academicYear,
              term: r.term,
              examName: r.examName,
              subject: r.subject,
              totalMarks: r.totalMarks,
              marksObtained: r.marksObtained,
            })),
          }),
        });

        totalImported += res.importedCount;
        totalFailed += res.failedCount;
        if (res.rejectedRows?.length) {
          allRejected.push(...res.rejectedRows);
        }
        setImportProgress({
          processed: Math.min(validRows.length, i + chunk.length),
          total: validRows.length,
        });
      }

      const dupCount = allRejected.filter((r) => r.rowStatus === 'duplicate').length;
      const invCount = allRejected.filter((r) => r.rowStatus === 'invalid').length;

      setCommitResult({
        totalProcessed: currentRows.length,
        importedCount: totalImported,
        duplicateCount: dupCount,
        invalidCount: invCount,
        failedCount: totalFailed,
        rejectedRows: allRejected,
      });

      setStep(6);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed while importing examination results.');
      setStep(4);
    }
  };

  const filteredRows = useMemo(() => {
    if (rowFilter === 'all') return rows;
    return rows.filter((r) => r.rowStatus === rowFilter);
  }, [rows, rowFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const importPct =
    importProgress.total > 0
      ? Math.round((importProgress.processed / importProgress.total) * 100)
      : 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr('excelResultsImportTitle')}
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {tr('excelResultsImportSubtitle')}
        </p>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: TEMPLATE */}
        {step === 1 && (
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('examName')} ({tr('all')})
                </label>
                <select
                  value={tplExamId}
                  onChange={(e) => setTplExamId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">-- {tr('examName')} --</option>
                  {examinations.map((ex) => (
                    <option key={ex._id} value={ex._id}>
                      {ex.name} ({ex.academicYear} · {ex.term})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('classLabel')} ({tr('all')})
                </label>
                <select
                  value={tplClassId}
                  onChange={(e) => setTplClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">{tr('allClasses')}</option>
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {TEMPLATE_HEADERS.map((col, idx) => (
                <div
                  key={col}
                  className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <span className="font-mono font-semibold text-[#0F294A] dark:text-blue-400 tabular-nums">
                    {idx + 1}.
                  </span>
                  <span className="truncate">{col}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => void handleDownloadTemplate()}
                disabled={downloadingTpl}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#0F294A] text-[#0F294A] dark:border-blue-400 dark:text-blue-300 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingTpl ? tr('loading') : tr('downloadResultsTemplateBtn')}</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
                >
                  {tr('cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium"
                >
                  {tr('continueToUpload')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: UPLOAD */}
        {step === 2 && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver
                  ? 'border-[#0F294A] bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30'
              }`}
            >
              <Upload className="w-10 h-10 mx-auto text-[#0F294A] dark:text-blue-400 mb-3" />
              <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white mb-1">
                {tr('uploadSpreadsheetTitle')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {tr('uploadSpreadsheetDesc')}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{uploading ? tr('uploadingAndParsing') : tr('chooseExcelFile')}</span>
              </button>

              {uploading && (
                <div className="max-w-md mx-auto mt-5 space-y-1.5">
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-[#0F294A] dark:bg-blue-500 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500">
                    {uploadProgress}%
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={uploading}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
              >
                {tr('step1Template')}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={uploading}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
              >
                {tr('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: PREVIEW & VALIDATION */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500">{tr('totalRecordsLabel')}</div>
                <div className="text-lg font-bold font-mono tabular-nums">{summary.total}</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  {tr('validRecordsLabel')}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {summary.valid}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  {tr('duplicateRecordsLabel')}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {summary.duplicates}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <div className="text-xs text-red-700 dark:text-red-300">
                  {tr('invalidRecordsLabel')}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-red-700 dark:text-red-300">
                  {summary.invalid}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500">{tr('warningsLabel')}</div>
                <div className="text-lg font-bold font-mono tabular-nums">{summary.warnings}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: 'all', label: `${tr('filterAllRows')} (${summary.total})` },
                    { key: 'valid', label: `${tr('filterValidRows')} (${summary.valid})` },
                    { key: 'duplicate', label: `${tr('filterDuplicateRows')} (${summary.duplicates})` },
                    { key: 'invalid', label: `${tr('filterInvalidRows')} (${summary.invalid})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setRowFilter(t.key);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      rowFilter === t.key
                        ? 'bg-[#0F294A] border-[#0F294A] text-white dark:bg-blue-600 dark:border-blue-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRevalidate()}
                  disabled={validating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
                  <span>{tr('revalidateBtn')}</span>
                </button>
                {summary.duplicates + summary.invalid > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadRejected()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{tr('downloadRejectedBtn')}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500 flex items-center justify-between">
              <span>
                {fileName} · {tr('editCellHint')}
              </span>
              {dirtyEdits && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  * {tr('revalidateBtn')}
                </span>
              )}
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[42vh]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                    <tr>
                      <th className="px-2.5 py-2 font-semibold">{tr('rowNumberCol')}</th>
                      <th className="px-2.5 py-2 font-semibold">{tr('validationCol')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[125px]">{tr('studentId')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[150px]">{tr('fullName')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[110px]">{tr('classLabel')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[100px]">{tr('academicYear')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[90px]">{tr('examTerm')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[155px]">{tr('examName')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[125px]">{tr('subject')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[85px]">{tr('totalMarksCol')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[95px]">{tr('marksObtainedCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {visibleRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={
                          row.rowStatus === 'invalid'
                            ? 'bg-red-50/50 dark:bg-red-950/20'
                            : row.rowStatus === 'duplicate'
                            ? 'bg-amber-50/50 dark:bg-amber-950/20'
                            : 'bg-white dark:bg-slate-900'
                        }
                      >
                        <td className="px-2.5 py-2 font-mono tabular-nums text-slate-500">
                          {row.rowNumber}
                        </td>
                        <td className="px-2.5 py-2 min-w-[195px]">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                                row.rowStatus === 'valid'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : row.rowStatus === 'duplicate'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-red-700 dark:text-red-400'
                              }`}
                            >
                              {row.rowStatus === 'valid' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : row.rowStatus === 'duplicate' ? (
                                <AlertTriangle className="w-3.5 h-3.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {row.rowStatus === 'valid'
                                  ? tr('validBadge')
                                  : row.rowStatus === 'duplicate'
                                  ? tr('duplicateBadge')
                                  : tr('invalidBadge')}
                              </span>
                            </span>
                            {row.errors.map((e, i) => (
                              <div
                                key={i}
                                className="text-[11px] text-red-600 dark:text-red-400 leading-tight"
                              >
                                • {e}
                              </div>
                            ))}
                            {row.warnings.map((w, i) => (
                              <div
                                key={i}
                                className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight"
                              >
                                • {w}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.studentId}
                            onChange={(e) =>
                              updateRowField(row.rowNumber, 'studentId', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
                          />
                        </td>
                        <td className="px-2.5 py-2 font-medium">{row.studentName || '-'}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.className}
                            onChange={(e) =>
                              updateRowField(row.rowNumber, 'className', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.academicYear}
                            onChange={(e) =>
                              updateRowField(row.rowNumber, 'academicYear', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.term}
                            onChange={(e) => updateRowField(row.rowNumber, 'term', e.target.value)}
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.examName}
                            onChange={(e) =>
                              updateRowField(row.rowNumber, 'examName', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.subject}
                            onChange={(e) =>
                              updateRowField(row.rowNumber, 'subject', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.totalMarks}
                            onChange={(e) =>
                              updateRowField(row.rowNumber, 'totalMarks', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.marksObtained}
                            onChange={(e) =>
                              updateRowField(row.rowNumber, 'marksObtained', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono tabular-nums">
                  {safePage} / {totalPages} ({filteredRows.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
              >
                {tr('importBackToUpload')}
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
                >
                  {tr('cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleImportAll()}
                  disabled={validating || summary.valid === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {tr('importAllResultsBtn')} ({summary.valid})
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: PROGRESS */}
        {step === 5 && (
          <div className="py-12 px-4 text-center space-y-4">
            <RefreshCw className="w-10 h-10 mx-auto text-[#0F294A] dark:text-blue-400 animate-spin" />
            <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              {tr('loading')}
            </h3>
            <div className="max-w-md mx-auto space-y-2">
              <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#0F294A] dark:bg-blue-500 transition-all duration-300"
                  style={{ width: `${importPct}%` }}
                />
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {importProgress.processed} / {importProgress.total} ({importPct}%)
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: RESULTS SUMMARY */}
        {step === 6 && commitResult && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-base text-emerald-900 dark:text-emerald-200">
                  {tr('importCompleteTitle')}
                </h3>
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {tr('resultsImportCompleteMsg')}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {lang === 'so'
                    ? `${commitResult.importedCount} natiijo ayaa si guul leh loo keydiyay.`
                    : `${commitResult.importedCount} results imported successfully.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500">{tr('totalRecordsLabel')}</div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1">
                  {commitResult.totalProcessed}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  {tr('importedSuccessLabel')}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                  {commitResult.importedCount}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <div className="text-xs text-red-700 dark:text-red-300">
                  {tr('failedRecordsLabel')}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-red-700 dark:text-red-300 mt-1">
                  {commitResult.failedCount}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  {tr('duplicateRecordsLabel')}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-1">
                  {commitResult.duplicateCount}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <div className="text-xs text-red-700 dark:text-red-300">
                  {tr('invalidRecordsLabel')}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-red-700 dark:text-red-300 mt-1">
                  {commitResult.invalidCount}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div>
                {commitResult.rejectedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadRejected(commitResult.rejectedRows)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {tr('downloadRejectedBtn')} ({commitResult.rejectedRows.length})
                    </span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetAll();
                    setStep(2);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
                >
                  {tr('importBackToUpload')}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium"
                >
                  {tr('close')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
