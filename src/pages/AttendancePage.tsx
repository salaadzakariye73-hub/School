import { useCallback, useEffect, useState } from 'react';
import { Check, Printer, Download } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { downloadCsv } from '../utils/export';
import type { AttendanceRow, AttendanceStatus, Classroom } from '../types';

interface AttendanceReportData {
  mode: 'daily' | 'monthly';
  period: string;
  sessionsCount: number;
  summary: {
    Present: number;
    Absent: number;
    Late: number;
    Excused: number;
    totalMarks: number;
    overallRate: number;
  };
  rows: Array<{
    studentId: string;
    studentCode: string;
    fullName: string;
    className: string;
    Present: number;
    Absent: number;
    Late: number;
    Excused: number;
    totalDays: number;
    attendanceRate: number;
  }>;
}

export function AttendancePage() {
  const { tr } = useTheme();
  const [tab, setTab] = useState<'mark' | 'report'>('mark');

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Report state
  const [reportMode, setReportMode] = useState<'daily' | 'monthly'>('monthly');
  const [reportClass, setReportClass] = useState('');
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportData, setReportData] = useState<AttendanceReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    apiRequest<Classroom[]>('/api/classes')
      .then((list) => {
        setClasses(list);
        if (list.length > 0) {
          setSelectedClass(list[0]._id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load classes.'));
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!selectedClass || !date) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<{ records: AttendanceRow[] }>(
        `/api/attendance?classId=${encodeURIComponent(selectedClass)}&date=${encodeURIComponent(date)}`
      );
      setRows(data.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  }, [selectedClass, date]);

  useEffect(() => {
    if (tab === 'mark') {
      void loadAttendance();
    }
  }, [tab, loadAttendance]);

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  };

  const setStudentNote = (studentId: string, note: string) => {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, note } : r)));
  };

  const markAllPresent = () => {
    setRows((prev) => prev.map((r) => ({ ...r, status: 'Present' })));
  };

  const handleSave = async () => {
    if (!selectedClass || !date) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/api/attendance', {
        method: 'PUT',
        body: JSON.stringify({ classId: selectedClass, date, records: rows }),
      });
      setMessage(tr('attendanceSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const loadReport = useCallback(async () => {
    setLoadingReport(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mode: reportMode });
      if (reportClass) params.set('classId', reportClass);
      if (reportMode === 'daily') params.set('date', reportDate);
      else params.set('month', reportMonth);
      const data = await apiRequest<AttendanceReportData>(`/api/attendance/report?${params.toString()}`);
      setReportData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance report.');
    } finally {
      setLoadingReport(false);
    }
  }, [reportMode, reportClass, reportDate, reportMonth]);

  useEffect(() => {
    if (tab === 'report') {
      void loadReport();
    }
  }, [tab, loadReport]);

  const statusOptions: Array<{ value: AttendanceStatus; label: string; activeCls: string }> = [
    { value: 'Present', label: tr('present'), activeCls: 'bg-emerald-600 text-white border-emerald-600' },
    { value: 'Absent', label: tr('absent'), activeCls: 'bg-red-600 text-white border-red-600' },
    { value: 'Late', label: tr('late'), activeCls: 'bg-amber-600 text-white border-amber-600' },
    { value: 'Excused', label: tr('excused'), activeCls: 'bg-slate-600 text-white border-slate-600' },
  ];

  const handleExportReport = () => {
    if (!reportData) return;
    downloadCsv(
      `attendance-report-${reportData.period}`,
      [tr('studentId'), tr('fullName'), tr('classLabel'), tr('present'), tr('absent'), tr('late'), tr('excused'), tr('totalDays'), tr('attendanceRate')],
      reportData.rows.map((r) => [
        r.studentCode,
        r.fullName,
        r.className,
        r.Present,
        r.Absent,
        r.Late,
        r.Excused,
        r.totalDays,
        `${r.attendanceRate}%`,
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 no-print">
        <button
          type="button"
          onClick={() => setTab('mark')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'mark'
              ? 'bg-[#0F294A] text-white dark:bg-blue-600'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {tr('markAttendanceTab')}
        </button>
        <button
          type="button"
          onClick={() => setTab('report')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'report'
              ? 'bg-[#0F294A] text-white dark:bg-blue-600'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {tr('attendanceReportTab')}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 no-print">
          {error}
        </div>
      )}

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 no-print">
          {message}
        </div>
      )}

      {tab === 'mark' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('selectClass')}
                </label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm min-w-[180px]"
                >
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('selectDate')}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markAllPresent}
                disabled={rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>{tr('markAllPresent')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || rows.length === 0}
                className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {saving ? tr('loading') : tr('saveAttendance')}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{tr('studentId')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('status')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('note')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        {tr('loading')}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        {tr('noData')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                          {row.studentCode}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          {row.fullName}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {statusOptions.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setStudentStatus(row.studentId, opt.value)}
                                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                                  row.status === opt.value
                                    ? opt.activeCls
                                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.note}
                            onChange={(e) => setStudentNote(row.studentId, e.target.value)}
                            placeholder="..."
                            className="w-full min-w-[140px] px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('filter')}
                </label>
                <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setReportMode('daily')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                      reportMode === 'daily'
                        ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {tr('dailyReport')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportMode('monthly')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                      reportMode === 'monthly'
                        ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {tr('monthlyReport')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('selectClass')}
                </label>
                <select
                  value={reportClass}
                  onChange={(e) => setReportClass(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">{tr('allClasses')}</option>
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              {reportMode === 'daily' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {tr('selectDate')}
                  </label>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {tr('selectMonth')}
                  </label>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportReport}
                disabled={!reportData || reportData.rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>{tr('exportCsv')}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0F294A] text-white text-sm font-medium whitespace-nowrap shrink-0"
              >
                <Printer className="w-4 h-4" />
                <span>{tr('print')}</span>
              </button>
            </div>
          </div>

          {reportData && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-500">{tr('present')}</div>
                <div className="font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {reportData.summary.Present}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-500">{tr('absent')}</div>
                <div className="font-mono text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
                  {reportData.summary.Absent}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-500">{tr('late')}</div>
                <div className="font-mono text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {reportData.summary.Late}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-500">{tr('excused')}</div>
                <div className="font-mono text-xl font-bold tabular-nums">
                  {reportData.summary.Excused}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-500">{tr('attendanceRate')}</div>
                <div className="font-mono text-xl font-bold tabular-nums text-[#0F294A] dark:text-blue-400">
                  {reportData.summary.overallRate}%
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{tr('studentId')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('classLabel')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('present')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('absent')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('late')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('excused')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('attendanceRate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loadingReport ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        {tr('loading')}
                      </td>
                    </tr>
                  ) : !reportData || reportData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        {tr('noData')}
                      </td>
                    </tr>
                  ) : (
                    reportData.rows.map((r) => (
                      <tr key={r.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{r.studentCode}</td>
                        <td className="px-4 py-2.5 font-medium">{r.fullName}</td>
                        <td className="px-4 py-2.5">{r.className}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.Present}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.Absent}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.Late}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.Excused}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                          {r.attendanceRate}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
