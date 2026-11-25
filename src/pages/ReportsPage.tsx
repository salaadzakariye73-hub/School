import { useCallback, useEffect, useState } from 'react';
import { Printer, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { downloadCsv, formatMoney } from '../utils/export';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import type { Classroom, FeePayment, FeeSummaryRow, Student } from '../types';

type ReportType =
  | 'students'
  | 'classes'
  | 'attendance'
  | 'exams'
  | 'feeCollection'
  | 'outstandingFees';

export function ReportsPage() {
  const { user, settings } = useAuth();
  const { tr } = useTheme();
  const role = user?.role || 'teacher';

  const availableReports: Array<{ id: ReportType; label: string }> = [
    { id: 'students', label: tr('reportStudentList') },
    ...(role !== 'accountant' ? [{ id: 'classes' as ReportType, label: tr('reportClassList') }] : []),
    ...(role !== 'accountant' ? [{ id: 'attendance' as ReportType, label: tr('reportAttendance') }] : []),
    ...(role !== 'accountant' ? [{ id: 'exams' as ReportType, label: tr('reportExamResults') }] : []),
    ...(role === 'admin' || role === 'accountant'
      ? [
          { id: 'feeCollection' as ReportType, label: tr('reportFeeCollection') },
          { id: 'outstandingFees' as ReportType, label: tr('reportOutstandingFees') },
        ]
      : []),
  ];

  const [reportType, setReportType] = useState<ReportType>('students');
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [examNames, setExamNames] = useState<string[]>([]);

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedExam, setSelectedExam] = useState('');

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Array<string | number>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbol = settings?.currencySymbol || '$';
  const code = settings?.currencyCode || 'USD';

  useEffect(() => {
    Promise.all([
      apiRequest<Classroom[]>('/api/classes'),
      role !== 'accountant' ? apiRequest<string[]>('/api/exams/names') : Promise.resolve([]),
    ])
      .then(([classList, names]) => {
        setClasses(classList);
        setExamNames(names);
        if (names.length > 0) setSelectedExam(names[0]);
      })
      .catch(() => {
        // handled when generating report
      });
  }, [role]);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (reportType === 'students') {
        const params = selectedClass ? `?classId=${encodeURIComponent(selectedClass)}` : '';
        const list = await apiRequest<Student[]>(`/api/students${params}`);
        setHeaders([
          tr('studentId'),
          tr('fullName'),
          tr('gender'),
          tr('classLabel'),
          tr('parentName'),
          tr('parentPhone'),
          tr('status'),
        ]);
        setRows(
          list.map((s) => [
            s.studentId,
            s.fullName,
            s.gender === 'Male' ? tr('male') : tr('female'),
            typeof s.classId === 'object' ? s.classId?.name || '-' : '-',
            s.parentName,
            s.parentPhone,
            s.status,
          ])
        );
      } else if (reportType === 'classes') {
        const list = await apiRequest<Classroom[]>('/api/classes');
        setHeaders([
          tr('className'),
          tr('classTeacher'),
          tr('studentCount'),
          tr('subjects'),
          tr('academicYear'),
          tr('tuitionFee'),
        ]);
        setRows(
          list.map((c) => [
            c.name,
            c.classTeacherId && typeof c.classTeacherId === 'object'
              ? c.classTeacherId.fullName
              : tr('unassigned'),
            c.studentCount ?? 0,
            c.subjects.join(', '),
            c.academicYear,
            formatMoney(c.tuitionFee || 0, symbol, code),
          ])
        );
      } else if (reportType === 'attendance') {
        const params = new URLSearchParams({ mode: 'monthly', month: selectedMonth });
        if (selectedClass) params.set('classId', selectedClass);
        const data = await apiRequest<{
          rows: Array<{
            studentCode: string;
            fullName: string;
            className: string;
            Present: number;
            Absent: number;
            Late: number;
            Excused: number;
            attendanceRate: number;
          }>;
        }>(`/api/attendance/report?${params.toString()}`);
        setHeaders([
          tr('studentId'),
          tr('fullName'),
          tr('classLabel'),
          tr('present'),
          tr('absent'),
          tr('late'),
          tr('excused'),
          tr('attendanceRate'),
        ]);
        setRows(
          data.rows.map((r) => [
            r.studentCode,
            r.fullName,
            r.className,
            r.Present,
            r.Absent,
            r.Late,
            r.Excused,
            `${r.attendanceRate}%`,
          ])
        );
      } else if (reportType === 'exams') {
        const targetClass = selectedClass || classes[0]?._id;
        if (!selectedExam || !targetClass) {
          setHeaders([]);
          setRows([]);
          return;
        }
        const data = await apiRequest<{
          results: Array<{
            rank: number | null;
            studentCode: string;
            fullName: string;
            totalScore: number;
            totalPossible: number;
            average: number;
            percentage: number;
            grade: string;
          }>;
        }>(
          `/api/exams/results?examName=${encodeURIComponent(selectedExam)}&classId=${encodeURIComponent(targetClass)}`
        );
        setHeaders([
          tr('rank'),
          tr('studentId'),
          tr('fullName'),
          tr('totalMarks'),
          tr('average'),
          tr('percentage'),
          tr('grade'),
        ]);
        setRows(
          data.results.map((r) => [
            r.rank ?? '-',
            r.studentCode,
            r.fullName,
            `${r.totalScore}/${r.totalPossible}`,
            r.average,
            `${r.percentage}%`,
            r.grade,
          ])
        );
      } else if (reportType === 'feeCollection') {
        const params = selectedClass ? `?classId=${encodeURIComponent(selectedClass)}` : '';
        const list = await apiRequest<FeePayment[]>(`/api/fees/payments${params}`);
        setHeaders([
          tr('receiptNumber'),
          tr('paymentDate'),
          tr('fullName'),
          tr('classLabel'),
          tr('paymentMethod'),
          tr('paymentAmount'),
          tr('recordedBy'),
        ]);
        setRows(
          list.map((p) => [
            p.receiptNumber,
            p.paymentDate,
            p.studentId?.fullName || '-',
            p.classId?.name || '-',
            p.paymentMethod,
            formatMoney(p.amount, symbol, code),
            p.recordedByName,
          ])
        );
      } else if (reportType === 'outstandingFees') {
        const params = new URLSearchParams({ status: 'Unpaid' });
        if (selectedClass) params.set('classId', selectedClass);
        const data = await apiRequest<{ students: FeeSummaryRow[] }>(
          `/api/fees/summary?${params.toString()}`
        );
        setHeaders([
          tr('studentId'),
          tr('fullName'),
          tr('classLabel'),
          tr('parentPhone'),
          tr('totalFee'),
          tr('paidAmount'),
          tr('remainingBalance'),
        ]);
        setRows(
          data.students.map((s) => [
            s.studentCode,
            s.fullName,
            s.className,
            s.parentPhone,
            formatMoney(s.totalFee, symbol, code),
            formatMoney(s.paidAmount, symbol, code),
            formatMoney(s.remainingBalance, symbol, code),
          ])
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  }, [reportType, selectedClass, selectedMonth, selectedExam, classes, symbol, code, tr]);

  useEffect(() => {
    void generateReport();
  }, [generateReport]);

  const activeReportTitle =
    availableReports.find((r) => r.id === reportType)?.label || tr('reportsTitle');

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {tr('navReports')}
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm min-w-[220px]"
            >
              {availableReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {reportType !== 'classes' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {tr('classLabel')}
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {reportType !== 'exams' && <option value="">{tr('allClasses')}</option>}
                {classes.map((cls) => (
                  <option key={cls._id} value={cls._id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {reportType === 'attendance' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {tr('selectMonth')}
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          )}

          {reportType === 'exams' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {tr('examName')}
              </label>
              <select
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm min-w-[180px]"
              >
                <option value="">-- {tr('examName')} --</option>
                {examNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadCsv(`${reportType}-report`, headers, rows)}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>{tr('exportCsv')}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F294A] text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>{tr('print')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 no-print">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
        {/* Report Header (Visible in Print and Screen) */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SchoolCrest className="w-9 h-9" />
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                {settings?.schoolName} — {activeReportTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr('generatedOn')}: {new Date().toISOString().slice(0, 10)} · {tr('academicYear')}:{' '}
                {settings?.academicYear}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            {headers.length > 0 && (
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length)} className="px-4 py-8 text-center text-slate-500">
                    {tr('loading')}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length)} className="px-4 py-8 text-center text-slate-500">
                    {tr('noData')}
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-2.5 tabular-nums">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
