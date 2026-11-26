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
  BulkImportValidationSummary,
  BulkTeacherImportCommitResponse,
  BulkTeacherImportRow,
  BulkTeacherImportUploadResponse,
  BulkTeacherImportValidateResponse,
  Classroom,
} from '../../types';

interface BulkTeacherImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
  classes: Classroom[];
}

type ImportStep = 1 | 2 | 3 | 4 | 5 | 6;
type RowFilter = 'all' | 'valid' | 'duplicate' | 'invalid';

const TEMPLATE_HEADERS = [
  'Teacher ID',
  'Full Name',
  'Phone Number',
  'Email Address',
  'Assigned Subjects',
  'Assigned Classes',
  'Status',
];

const PAGE_SIZE = 50;
const COMMIT_CHUNK_SIZE = 250;

export function BulkTeacherImportModal({
  open,
  onClose,
  onImported,
  classes,
}: BulkTeacherImportModalProps) {
  const { tr, lang } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<ImportStep>(1);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [autoGenId, setAutoGenId] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BulkTeacherImportRow[]>([]);
  const [summary, setSummary] = useState<BulkImportValidationSummary>({
    total: 0,
    valid: 0,
    duplicates: 0,
    invalid: 0,
    warnings: 0,
  });
  const [availableClasses, setAvailableClasses] = useState<
    Array<{ _id: string; name: string; academicYear: string }>
  >([]);

  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [page, setPage] = useState(1);
  const [validating, setValidating] = useState(false);
  const [dirtyEdits, setDirtyEdits] = useState(false);

  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 });
  const [commitResult, setCommitResult] = useState<BulkTeacherImportCommitResponse | null>(null);

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
    setDownloadingTemplate(true);
    try {
      await apiDownloadBlob(
        '/api/teachers/import/template',
        'dugsiga-teacher-import-template.xlsx'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download Excel template.');
    } finally {
      setDownloadingTemplate(false);
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
      formData.append('autoGenerateMissingId', String(autoGenId));

      const res = await apiUploadWithProgress<BulkTeacherImportUploadResponse>(
        '/api/teachers/import/upload',
        formData,
        (pct) => setUploadProgress(pct)
      );

      setFileName(res.fileName);
      setRows(res.rows);
      setSummary(res.summary);
      setAvailableClasses(
        res.availableClasses?.length > 0
          ? res.availableClasses
          : classes.map((c) => ({ _id: c._id, name: c.name, academicYear: c.academicYear }))
      );
      setRowFilter('all');
      setPage(1);
      setDirtyEdits(false);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload and read spreadsheet.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
  };

  const updateRowField = (
    rowNumber: number,
    field: keyof Pick<
      BulkTeacherImportRow,
      'teacherId' | 'fullName' | 'phone' | 'email' | 'subjectsText' | 'classesText' | 'status'
    >,
    value: string
  ) => {
    setDirtyEdits(true);
    setRows((prev) =>
      prev.map((r) => (r.rowNumber === rowNumber ? { ...r, [field]: value } : r))
    );
  };

  const handleRevalidate = async (
    nextAutoGen = autoGenId
  ): Promise<BulkTeacherImportRow[] | null> => {
    setError(null);
    setValidating(true);
    try {
      const res = await apiRequest<BulkTeacherImportValidateResponse>(
        '/api/teachers/import/validate',
        {
          method: 'POST',
          body: JSON.stringify({
            rows: rows.map((r) => ({
              rowNumber: r.rowNumber,
              teacherId: r.teacherId,
              fullName: r.fullName,
              phone: r.phone,
              email: r.email,
              subjectsText: r.subjectsText,
              classesText: r.classesText,
              status: r.status,
            })),
            autoGenerateMissingId: nextAutoGen,
          }),
        }
      );
      setRows(res.rows);
      setSummary(res.summary);
      if (res.availableClasses?.length) setAvailableClasses(res.availableClasses);
      setDirtyEdits(false);
      return res.rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate records.');
      return null;
    } finally {
      setValidating(false);
    }
  };

  const handleDownloadRejected = (rejectedSource?: BulkTeacherImportRow[]) => {
    const source = rejectedSource ?? rows.filter((r) => r.rowStatus !== 'valid');
    if (source.length === 0) return;

    const headers = [...TEMPLATE_HEADERS, 'Validation Status', 'Errors'];
    const csvRows = source.map((r) => [
      r.teacherId,
      r.fullName,
      r.phone,
      r.email,
      r.subjectsText,
      r.classesText,
      r.status,
      r.rowStatus,
      r.errors.join(' | '),
    ]);

    downloadCsv('rejected-teacher-records', headers, csvRows);
  };

  const handleImportAll = async () => {
    setError(null);

    let currentRows = rows;
    if (dirtyEdits) {
      const refreshed = await handleRevalidate(autoGenId);
      if (!refreshed) return;
      currentRows = refreshed;
    }

    const validRows = currentRows.filter((r) => r.rowStatus === 'valid');
    const preRejected = currentRows.filter((r) => r.rowStatus !== 'valid');

    if (validRows.length === 0) {
      setError(tr('noValidTeachersToImport'));
      return;
    }

    setStep(5);
    setImportProgress({ processed: 0, total: validRows.length });

    let totalImported = 0;
    let totalFailed = 0;
    const allRejected: BulkTeacherImportRow[] = [...preRejected];

    try {
      for (let i = 0; i < validRows.length; i += COMMIT_CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + COMMIT_CHUNK_SIZE);
        const res = await apiRequest<BulkTeacherImportCommitResponse>(
          '/api/teachers/import/commit',
          {
            method: 'POST',
            body: JSON.stringify({
              rows: chunk.map((r) => ({
                rowNumber: r.rowNumber,
                teacherId: r.teacherId,
                fullName: r.fullName,
                phone: r.phone,
                email: r.email,
                subjectsText: r.subjectsText,
                classesText: r.classesText,
                status: r.status,
              })),
              autoGenerateMissingId: false,
            }),
          }
        );

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
      setError(err instanceof Error ? err.message : 'Import failed while saving teachers.');
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

  const classOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of availableClasses) names.add(c.name);
    for (const c of classes) names.add(c.name);
    return Array.from(names).sort();
  }, [availableClasses, classes]);

  const stepItems: Array<{ id: ImportStep; label: string }> = [
    { id: 1, label: tr('step1Template') },
    { id: 2, label: tr('step2Upload') },
    { id: 3, label: tr('step3Preview') },
    { id: 4, label: tr('step4Validate') },
    { id: 5, label: tr('step5Import') },
    { id: 6, label: tr('step6Results') },
  ];

  const importPct =
    importProgress.total > 0
      ? Math.round((importProgress.processed / importProgress.total) * 100)
      : 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr('bulkTeacherImportTitle')}
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {tr('bulkTeacherImportSubtitle')}
        </p>

        {/* 6-Step Progress Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {stepItems.map((item) => {
            const isActive = step === item.id || (step === 4 && item.id === 3);
            const isCompleted = step > item.id;
            const canClick =
              (item.id === 1 && step !== 5) ||
              (item.id === 2 && step !== 5) ||
              ((item.id === 3 || item.id === 4) && rows.length > 0 && step !== 5 && step !== 6);
            return (
              <button
                key={item.id}
                type="button"
                disabled={!canClick}
                onClick={() => {
                  if (canClick) setStep(item.id === 3 ? 4 : item.id);
                }}
                className={`px-3 py-2 rounded-lg border text-left text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#0F294A] border-[#0F294A] text-white dark:bg-blue-600 dark:border-blue-600'
                    : isCompleted
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-400'
                } ${canClick ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: DOWNLOAD EXCEL TEMPLATE */}
        {step === 1 && (
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#0F294A] dark:text-blue-400" />
                  <span>{tr('step1Template')}</span>
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {tr('teacherTemplateDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadTemplate()}
                disabled={downloadingTemplate}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium transition-colors shrink-0 disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadingTemplate ? tr('loading') : tr('downloadExcelTemplate')}
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {tr('templateColumnsTitle')} (7)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
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
        )}

        {/* STEP 2: UPLOAD EXCEL / CSV FILE */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3">
              <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoGenId}
                  onChange={(e) => setAutoGenId(e.target.checked)}
                  className="rounded border-slate-300 text-[#0F294A] focus:ring-[#0F294A]"
                />
                <span>{tr('autoGenTeacherIdToggle')}</span>
              </label>

              <button
                type="button"
                onClick={() => void handleDownloadTemplate()}
                disabled={downloadingTemplate}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F294A] dark:text-blue-400 hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{tr('downloadExcelTemplate')}</span>
              </button>
            </div>

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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
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

        {/* STEPS 3 & 4: PREVIEW & VALIDATION TABLE */}
        {(step === 3 || step === 4) && (
          <div className="space-y-4">
            {/* Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('totalRecordsLabel')}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {summary.total}
                </div>
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
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('warningsLabel')}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-700 dark:text-slate-200">
                  {summary.warnings}
                </div>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: 'all', label: `${tr('filterAllRows')} (${summary.total})` },
                    { key: 'valid', label: `${tr('filterValidRows')} (${summary.valid})` },
                    {
                      key: 'duplicate',
                      label: `${tr('filterDuplicateRows')} (${summary.duplicates})`,
                    },
                    { key: 'invalid', label: `${tr('filterInvalidRows')} (${summary.invalid})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setRowFilter(tab.key);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      rowFilter === tab.key
                        ? 'bg-[#0F294A] border-[#0F294A] text-white dark:bg-blue-600 dark:border-blue-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 mr-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoGenId}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAutoGenId(next);
                      void handleRevalidate(next);
                    }}
                    className="rounded border-slate-300"
                  />
                  <span>{tr('autoGenTeacherIdToggle')}</span>
                </label>

                <button
                  type="button"
                  onClick={() => void handleRevalidate(autoGenId)}
                  disabled={validating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
                  <span>{tr('revalidateBtn')}</span>
                </button>

                {summary.duplicates + summary.invalid > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadRejected()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-950/60"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{tr('downloadRejectedBtn')}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {fileName} · {tr('editCellHint')}
              </span>
              <div className="flex items-center gap-3">
                {classOptions.length > 0 && (
                  <span className="truncate max-w-md">
                    {tr('assignedClasses')}: {classOptions.join(', ')}
                  </span>
                )}
                {dirtyEdits && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    * {tr('revalidateBtn')}
                  </span>
                )}
              </div>
            </div>

            <datalist id="bulk-teacher-class-options">
              {classOptions.map((cn) => (
                <option key={cn} value={cn} />
              ))}
            </datalist>

            {/* Editable Preview Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[42vh]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                    <tr>
                      <th className="px-2.5 py-2 font-semibold">{tr('rowNumberCol')}</th>
                      <th className="px-2.5 py-2 font-semibold">{tr('validationCol')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[120px]">{tr('teacherId')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[165px]">{tr('fullName')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[130px]">{tr('phone')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[175px]">{tr('email')}</th>
                      <th className="px-2.5 py-2 font-semibold min-w-[170px]">
                        {tr('assignedSubjects')}
                      </th>
                      <th className="px-2.5 py-2 font-semibold min-w-[160px]">
                        {tr('assignedClasses')}
                      </th>
                      <th className="px-2.5 py-2 font-semibold min-w-[105px]">{tr('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                          {tr('noData')}
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((row) => {
                        const rowBg =
                          row.rowStatus === 'invalid'
                            ? 'bg-red-50/50 dark:bg-red-950/20'
                            : row.rowStatus === 'duplicate'
                            ? 'bg-amber-50/50 dark:bg-amber-950/20'
                            : 'bg-white dark:bg-slate-900';

                        return (
                          <tr key={row.rowNumber} className={rowBg}>
                            <td className="px-2.5 py-2 font-mono tabular-nums text-slate-500">
                              {row.rowNumber}
                            </td>
                            <td className="px-2.5 py-2 min-w-[190px]">
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
                                {row.errors.map((errMsg, idx) => (
                                  <div
                                    key={idx}
                                    className="text-[11px] text-red-600 dark:text-red-400 leading-tight"
                                  >
                                    • {errMsg}
                                  </div>
                                ))}
                                {row.warnings.map((warnMsg, idx) => (
                                  <div
                                    key={idx}
                                    className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight"
                                  >
                                    • {warnMsg}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.teacherId}
                                onChange={(e) =>
                                  updateRowField(row.rowNumber, 'teacherId', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.fullName}
                                onChange={(e) =>
                                  updateRowField(row.rowNumber, 'fullName', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.phone}
                                onChange={(e) =>
                                  updateRowField(row.rowNumber, 'phone', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.email}
                                onChange={(e) =>
                                  updateRowField(row.rowNumber, 'email', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.subjectsText}
                                onChange={(e) =>
                                  updateRowField(row.rowNumber, 'subjectsText', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                list="bulk-teacher-class-options"
                                value={row.classesText}
                                onChange={(e) =>
                                  updateRowField(row.rowNumber, 'classesText', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                value={row.status}
                                onChange={(e) =>
                                  updateRowField(row.rowNumber, 'status', e.target.value)
                                }
                                className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              >
                                {!['Active', 'Inactive'].includes(row.status) && (
                                  <option value={row.status}>{row.status || '--'}</option>
                                )}
                                <option value="Active">{tr('active')}</option>
                                <option value="Inactive">{tr('inactive')}</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
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

            {/* Footer Buttons */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
              >
                {tr('importBackToUpload')}
              </button>

              <div className="flex items-center justify-end gap-3">
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
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {tr('importAllTeachers')} ({summary.valid})
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: IMPORT PROGRESS */}
        {step === 5 && (
          <div className="py-12 px-4 text-center space-y-4">
            <RefreshCw className="w-10 h-10 mx-auto text-[#0F294A] dark:text-blue-400 animate-spin" />
            <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              {tr('importingTeachersProgress')}
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

        {/* STEP 6: IMPORT RESULTS SUMMARY */}
        {step === 6 && commitResult && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-display font-bold text-base text-emerald-900 dark:text-emerald-200">
                  {tr('teacherImportCompleteTitle')}
                </h3>
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {tr('teacherImportCompleteMessage')}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {lang === 'so'
                    ? `${commitResult.importedCount} macallin ayaa si guul leh loo diiwaangeliyay (${commitResult.totalProcessed} wadar ahaan).`
                    : `${commitResult.importedCount} teachers successfully imported out of ${commitResult.totalProcessed} records.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {tr('totalRecordsLabel')}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
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
              <div className="flex items-center gap-2">
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
