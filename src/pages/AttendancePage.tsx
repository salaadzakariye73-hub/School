import { useCallback, useEffect, useState } from 'react';
import { Check, Printer, Download, Lock, Unlock, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { downloadCsv } from '../utils/export';
import type { AttendanceRow, AttendanceStatus, Classroom } from '../types';

interface AttendanceReportData {
  mode: 'daily' | 'monthly';
  period: string;
  sessionsCount: number;
  hiddenLockedSessions?: number;
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
  const { user } = useAuth();
  const { tr } = useTheme();
  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'mark' | 'report'>('mark');

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedForTeacher, setLockedForTeacher] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

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

  useEffect(() => {
    if (!confirmSubmitOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        setConfirmSubmitOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmSubmitOpen, saving]);

  const loadAttendance = useCallback(async () => {
    if (!selectedClass || !date) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<{
        locked?: boolean;
        lockedForTeacher?: boolean;
        records: AttendanceRow[];
      }>(`/api/attendance?classId=${encodeURIComponent(selectedClass)}&date=${encodeURIComponent(date)}`);
      setIsLocked(Boolean(data.locked));
      setLockedForTeacher(Boolean(data.lockedForTeacher));
      setRows(data.locked ? [] : data.records);
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
    if (isLocked) return;
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  };

  const setStudentNote = (studentId: string, note: string) => {
    if (isLocked) return;
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, note } : r)));
  };

  const markAllPresent = () => {
    if (isLocked) return;
    setRows((prev) => prev.map((r) => ({ ...r, status: 'Present' })));
  };

  const executeSave = async () => {
    if (!selectedClass || !date || isLocked) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest<{ locked?: boolean; lockedForTeacher?: boolean }>('/api/attendance', {
        method: 'PUT',
        body: JSON.stringify({ classId: selectedClass, date, records: rows }),
      });
      setConfirmSubmitOpen(false);
      if (isTeacher || res.locked) {
        setRows([]);
        setIsLocked(true);
        setLockedForTeacher(true);
        setMessage(tr('attendanceSavedLocked'));
      } else {
        setLockedForTeacher(Boolean(res.lockedForTeacher));
        setMessage(tr('attendanceSaved'));
      }
    } catch (err) {
      setConfirmSubmitOpen(false);
      setError(err instanceof Error ? err.message : 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!selectedClass || !date || isLocked || rows.length === 0) return;
    if (isTeacher) {
      setConfirmSubmitOpen(true);
    } else {
      void executeSave();
    }
  };

  const handleAdminUnlock = async () => {
    if (!isAdmin || !selectedClass || !date) return;
    setUnlocking(true);
    setError(null);
    try {
      await apiRequest('/api/attendance/unlock', {
        method: 'PATCH',
        body: JSON.stringify({ classId: selectedClass, date }),
      });
      setLockedForTeacher(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock attendance.');
    } finally {
      setUnlocking(false);
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

            {!isLocked && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={markAllPresent}
                  disabled={rows.length === 0 || isLocked}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{tr('markAllPresent')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={saving || rows.length === 0 || isLocked}
                  className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {saving ? tr('loading') : tr('saveAttendance')}
                </button>
              </div>
            )}
          </div>

          {isAdmin && lockedForTeacher && !isLocked && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#0F294A] dark:text-blue-400 shrink-0" />
                <span className="font-medium">{tr('lockedForTeacherBadge')}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleAdminUnlock()}
                disabled={unlocking}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>{unlocking ? tr('loading') : tr('unlockForTeacher')}</span>
              </button>
            </div>
          )}

          {isLocked ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#0F294A]/10 dark:bg-blue-950/60 flex items-center justify-center text-[#0F294A] dark:text-blue-400">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('attendanceLockedTitle')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                {tr('attendanceLockedDesc')}
              </p>
            </div>
          ) : (
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
          )}
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

          {isTeacher && (reportData?.hiddenLockedSessions || 0) > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 no-print">
              <Lock className="w-4 h-4 text-[#0F294A] dark:text-blue-400 shrink-0" />
              <span>{tr('attendanceReportHiddenNote')}</span>
            </div>
          )}

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

      {/* Top Confirmation Dialog ("bashqad yar kor looga soo diro") for Teachers */}
      {confirmSubmitOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-5 sm:pt-8 px-4 bg-slate-950/45 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border-2 border-[#0F294A] dark:border-blue-500 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-[#0F294A] dark:bg-blue-700 text-white">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <h3 className="text-sm font-semibold">{tr('confirmAttendanceTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={() => !saving && setConfirmSubmitOpen(false)}
                className="p-1 rounded hover:bg-white/15 transition-colors"
                aria-label={tr('cancel')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {tr('confirmAttendanceMessage')}
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {tr('cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void executeSave()}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  {saving ? tr('loading') : tr('yesSaveAttendance')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
