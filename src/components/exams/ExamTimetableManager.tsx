import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Download,
  Pencil,
  Plus,
  Printer,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../utils/api';
import { downloadExamTimetablePdf } from '../../utils/pdfExport';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { SchoolCrest } from '../ui/SchoolCrest';
import type {
  AcademicYearItem,
  Classroom,
  Examination,
  ExaminationDashboardStats,
  ExaminationStatus,
  ExamScheduleItem,
  Teacher,
} from '../../types';

interface ExamTimetableManagerProps {
  classes: Classroom[];
  onExamsUpdated?: () => Promise<void> | void;
}

interface EditableScheduleRow {
  localId: string;
  _id?: string;
  classId: string;
  examDate: string;
  subject: string;
  startTime: string;
  endTime: string;
  invigilatorId: string;
  room: string;
  notes: string;
  errors: string[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function computeWeekdayFromYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return '-';
  return WEEKDAYS[dt.getUTCDay()];
}

function computeDurationLabel(startTime: string, endTime: string): string {
  const m1 = startTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  const m2 = endTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m1 || !m2) return '-';
  const mins = Number(m2[1]) * 60 + Number(m2[2]) - (Number(m1[1]) * 60 + Number(m1[2]));
  if (mins <= 0) return '-';
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return h > 0 ? (r > 0 ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

function computeInclusiveDays(startDate: string, endDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return 1;
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const diff = Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
  return diff >= 1 ? diff : 1;
}

export function ExamTimetableManager({ classes, onExamsUpdated }: ExamTimetableManagerProps) {
  const { user, settings } = useAuth();
  const { tr } = useTheme();
  const isAdmin = user?.role === 'admin';

  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [dashboard, setDashboard] = useState<ExaminationDashboardStats>({
    totalExaminations: 0,
    upcomingExaminations: 0,
    ongoingExaminations: 0,
    completedExaminations: 0,
    totalScheduledClasses: 0,
    totalScheduledSubjects: 0,
    totalAssignedInvigilators: 0,
  });
  const [schedules, setSchedules] = useState<ExamScheduleItem[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Create / Edit Examination Modal
  const [examFormOpen, setExamFormOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Examination | null>(null);
  const [savingExam, setSavingExam] = useState(false);
  const [examFormError, setExamFormError] = useState<string | null>(null);
  const [deleteExamTarget, setDeleteExamTarget] = useState<Examination | null>(null);
  const [deletingExam, setDeletingExam] = useState(false);

  const [examForm, setExamForm] = useState({
    name: '',
    academicYear: settings?.academicYear || '2026-2027',
    term: 'Term 1',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    totalDays: 1,
    description: '',
    status: 'Upcoming' as ExaminationStatus,
  });

  // Manual Timetable Editor State (Admin)
  const [managingExam, setManagingExam] = useState<Examination | null>(null);
  const [draftRows, setDraftRows] = useState<EditableScheduleRow[]>([]);
  const [validatingSchedule, setValidatingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Timetable Views & Filters
  const [viewMode, setViewMode] = useState<'full' | 'daily' | 'weekly'>('full');
  const [filterExamId, setFilterExamId] = useState('');
  const [filterClassId, setFilterClassId] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const calls: [
        Promise<{ examinations: Examination[]; dashboard: ExaminationDashboardStats }>,
        Promise<ExamScheduleItem[]>,
        Promise<Teacher[]>,
        Promise<AcademicYearItem[]>,
      ] = [
        apiRequest('/api/examinations'),
        apiRequest('/api/examinations/schedules'),
        isAdmin ? apiRequest<Teacher[]>('/api/teachers') : Promise.resolve([]),
        isAdmin ? apiRequest<AcademicYearItem[]>('/api/academic-years') : Promise.resolve([]),
      ];

      const [examRes, schedList, teacherList, yearList] = await Promise.all(calls);
      setExaminations(examRes.examinations);
      setDashboard(examRes.dashboard);
      setSchedules(schedList);
      setTeachers(teacherList);
      setAcademicYears(yearList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load examination schedules.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openCreateExamModal = () => {
    setEditingExam(null);
    setExamFormError(null);
    const activeYear = academicYears.find((y) => y.isCurrent)?.name || settings?.academicYear || '2026-2027';
    const yearObj = academicYears.find((y) => y.name === activeYear);
    const activeTerm = yearObj?.terms.find((t) => t.isCurrent)?.name || yearObj?.terms[0]?.name || 'Term 1';
    const today = new Date().toISOString().slice(0, 10);
    setExamForm({
      name: '',
      academicYear: activeYear,
      term: activeTerm,
      startDate: today,
      endDate: today,
      totalDays: 1,
      description: '',
      status: 'Upcoming',
    });
    setExamFormOpen(true);
  };

  const openEditExamModal = (ex: Examination) => {
    setEditingExam(ex);
    setExamFormError(null);
    setExamForm({
      name: ex.name,
      academicYear: ex.academicYear,
      term: ex.term,
      startDate: ex.startDate,
      endDate: ex.endDate,
      totalDays: ex.totalDays,
      description: ex.description || '',
      status: ex.status,
    });
    setExamFormOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamFormError(null);
    if (examForm.endDate < examForm.startDate) {
      setExamFormError('End date cannot be before start date.');
      return;
    }
    setSavingExam(true);
    try {
      if (editingExam) {
        await apiRequest(`/api/examinations/${editingExam._id}`, {
          method: 'PUT',
          body: JSON.stringify(examForm),
        });
      } else {
        await apiRequest('/api/examinations', {
          method: 'POST',
          body: JSON.stringify(examForm),
        });
      }
      setExamFormOpen(false);
      await loadAll();
      if (onExamsUpdated) await onExamsUpdated();
    } catch (err) {
      setExamFormError(err instanceof Error ? err.message : 'Failed to save examination.');
    } finally {
      setSavingExam(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteExamTarget) return;
    setDeletingExam(true);
    try {
      await apiRequest(`/api/examinations/${deleteExamTarget._id}`, { method: 'DELETE' });
      if (managingExam?._id === deleteExamTarget._id) {
        setManagingExam(null);
        setDraftRows([]);
      }
      setDeleteExamTarget(null);
      await loadAll();
      if (onExamsUpdated) await onExamsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete examination.');
    } finally {
      setDeletingExam(false);
    }
  };

  const openTimetableEditor = (ex: Examination) => {
    setManagingExam(ex);
    setScheduleFeedback(null);
    setScheduleError(null);
    const existing = schedules
      .filter((s) => {
        const eid = typeof s.examinationId === 'object' ? s.examinationId._id : s.examinationId;
        return eid === ex._id;
      })
      .map((s) => ({
        localId: s._id,
        _id: s._id,
        classId: typeof s.classId === 'object' ? s.classId._id : s.classId,
        examDate: s.examDate,
        subject: s.subject,
        startTime: s.startTime,
        endTime: s.endTime,
        invigilatorId: typeof s.invigilatorId === 'object' ? s.invigilatorId._id : s.invigilatorId,
        room: s.room,
        notes: s.notes || '',
        errors: [],
      }));

    if (existing.length > 0) {
      setDraftRows(existing);
    } else {
      setDraftRows([
        {
          localId: `new-${Date.now()}`,
          classId: '',
          examDate: ex.startDate,
          subject: '',
          startTime: '08:00',
          endTime: '10:00',
          invigilatorId: '',
          room: '',
          notes: '',
          errors: [],
        },
      ]);
    }
  };

  const addDraftRow = () => {
    if (!managingExam) return;
    setScheduleFeedback(null);
    setScheduleError(null);
    setDraftRows((prev) => [
      ...prev,
      {
        localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        classId: '',
        examDate: prev[prev.length - 1]?.examDate || managingExam.startDate,
        subject: '',
        startTime: '08:00',
        endTime: '10:00',
        invigilatorId: '',
        room: '',
        notes: '',
        errors: [],
      },
    ]);
  };

  const updateDraftRow = (localId: string, patch: Partial<EditableScheduleRow>) => {
    setScheduleFeedback(null);
    setScheduleError(null);
    setDraftRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;
        const updated = { ...row, ...patch, errors: [] };
        if (patch.classId !== undefined && patch.classId !== row.classId) {
          updated.subject = '';
        }
        return updated;
      })
    );
  };

  const removeDraftRow = (localId: string) => {
    setScheduleFeedback(null);
    setScheduleError(null);
    setDraftRows((prev) => prev.filter((r) => r.localId !== localId));
  };

  const handleValidateDrafts = async (): Promise<boolean> => {
    if (!managingExam) return false;
    setValidatingSchedule(true);
    setScheduleError(null);
    setScheduleFeedback(null);
    try {
      const res = await apiRequest<{
        valid: boolean;
        rowErrors: Array<{ index: number; errors: string[] }>;
      }>(`/api/examinations/${managingExam._id}/schedules/validate`, {
        method: 'POST',
        body: JSON.stringify({
          rows: draftRows.map((r) => ({
            _id: r._id,
            classId: r.classId,
            examDate: r.examDate,
            subject: r.subject,
            startTime: r.startTime,
            endTime: r.endTime,
            invigilatorId: r.invigilatorId,
            room: r.room,
            notes: r.notes,
          })),
        }),
      });

      const errorMap = new Map<number, string[]>();
      for (const re of res.rowErrors) errorMap.set(re.index, re.errors);

      setDraftRows((prev) =>
        prev.map((row, idx) => ({
          ...row,
          errors: errorMap.get(idx) || [],
        }))
      );

      if (res.valid) {
        setScheduleFeedback(tr('timetableNoConflictsMsg'));
      } else {
        setScheduleError('Timetable validation detected conflicts. Please review the highlighted rows.');
      }
      return res.valid;
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to validate timetable.');
      return false;
    } finally {
      setValidatingSchedule(false);
    }
  };

  const handleSaveTimetable = async () => {
    if (!managingExam) return;
    setSavingSchedule(true);
    setScheduleError(null);
    setScheduleFeedback(null);
    try {
      const payloadRows = draftRows.map((r) => ({
        _id: r._id,
        classId: r.classId,
        examDate: r.examDate,
        subject: r.subject,
        startTime: r.startTime,
        endTime: r.endTime,
        invigilatorId: r.invigilatorId,
        room: r.room,
        notes: r.notes,
      }));

      await apiRequest(`/api/examinations/${managingExam._id}/schedules`, {
        method: 'PUT',
        body: JSON.stringify({ rows: payloadRows }),
      });

      setMessage(tr('timetableSavedMsg'));
      setScheduleFeedback(tr('timetableSavedMsg'));
      await loadAll();
      if (onExamsUpdated) await onExamsUpdated();
    } catch (err: unknown) {
      // Also run validation so exact rowErrors highlight inline
      await handleValidateDrafts();
      setScheduleError(err instanceof Error ? err.message : 'Failed to save examination timetable.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const allSubjectsInSchedules = useMemo(() => {
    const s = new Set<string>();
    for (const sc of schedules) s.add(sc.subject);
    return Array.from(s).sort();
  }, [schedules]);

  const allTeachersInSchedules = useMemo(() => {
    const map = new Map<string, string>();
    for (const sc of schedules) {
      if (typeof sc.invigilatorId === 'object' && sc.invigilatorId) {
        map.set(sc.invigilatorId._id, sc.invigilatorId.fullName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((sc) => {
      const exId = typeof sc.examinationId === 'object' ? sc.examinationId._id : sc.examinationId;
      const clsId = typeof sc.classId === 'object' ? sc.classId._id : sc.classId;
      const invId = typeof sc.invigilatorId === 'object' ? sc.invigilatorId._id : sc.invigilatorId;

      if (filterExamId && exId !== filterExamId) return false;
      if (filterClassId && clsId !== filterClassId) return false;
      if (filterSubject && sc.subject !== filterSubject) return false;
      if (filterTeacherId && invId !== filterTeacherId) return false;
      if (viewMode === 'daily' && filterDate && sc.examDate !== filterDate) return false;
      return true;
    });
  }, [schedules, filterExamId, filterClassId, filterSubject, filterTeacherId, viewMode, filterDate]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, ExamScheduleItem[]>();
    for (const sc of filteredSchedules) {
      const key = viewMode === 'weekly' ? sc.dayOfWeek : sc.examDate;
      const list = groups.get(key) || [];
      list.push(sc);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [filteredSchedules, viewMode]);

  const handleDownloadPdf = () => {
    const pdfRows = filteredSchedules.map((sc) => ({
      examName: typeof sc.examinationId === 'object' ? sc.examinationId.name : '-',
      className: typeof sc.classId === 'object' ? sc.classId.name : '-',
      examDate: sc.examDate,
      dayOfWeek: sc.dayOfWeek,
      subject: sc.subject,
      timeRange: `${sc.startTime}-${sc.endTime}`,
      duration: `${sc.durationMinutes}m`,
      invigilator: typeof sc.invigilatorId === 'object' ? sc.invigilatorId.fullName : '-',
      room: sc.room,
      notes: sc.notes || '',
    }));

    const selectedExamObj = examinations.find((e) => e._id === filterExamId);
    downloadExamTimetablePdf({
      filename: 'examination-timetable.pdf',
      schoolName: settings?.schoolName || 'Dugsiga SMS',
      title: selectedExamObj
        ? `${tr('examTimetableTitle')} - ${selectedExamObj.name} (${selectedExamObj.academicYear})`
        : tr('examTimetableTitle'),
      subtitle: `${settings?.schoolAddress || ''}  |  ${settings?.schoolPhone || ''}`,
      rows: pdfRows,
    });
  };

  const selectedYearObj = academicYears.find((y) => y.name === examForm.academicYear);

  return (
    <div className="space-y-6">
      {/* Examination Management Dashboard (7 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 no-print">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {tr('totalExaminationsLabel')}
          </div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {dashboard.totalExaminations}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {tr('upcomingExamsLabel')}
          </div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-[#0F294A] dark:text-blue-400">
            {dashboard.upcomingExaminations}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {tr('ongoingExamsLabel')}
          </div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {dashboard.ongoingExaminations}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {tr('completedExamsLabel')}
          </div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {dashboard.completedExaminations}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {tr('scheduledClassesLabel')}
          </div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {dashboard.totalScheduledClasses}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {tr('scheduledSubjectsLabel')}
          </div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {dashboard.totalScheduledSubjects}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {tr('assignedInvigilatorsLabel')}
          </div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {dashboard.totalAssignedInvigilators}
          </div>
        </div>
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

      {/* Examinations List & Create Button */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {tr('examManagementTab')}
            </h2>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateExamModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('createNewExamination')}</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">{tr('examName')}</th>
                <th className="px-4 py-3 font-semibold">{tr('academicYear')}</th>
                <th className="px-4 py-3 font-semibold">{tr('examTerm')}</th>
                <th className="px-4 py-3 font-semibold">{tr('examStartDate')}</th>
                <th className="px-4 py-3 font-semibold">{tr('examEndDate')}</th>
                <th className="px-4 py-3 font-semibold text-right">{tr('examTotalDays')}</th>
                <th className="px-4 py-3 font-semibold">{tr('status')}</th>
                <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {tr('loading')}
                  </td>
                </tr>
              ) : examinations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {tr('noData')}
                  </td>
                </tr>
              ) : (
                examinations.map((ex) => {
                  const statusLabel =
                    ex.status === 'Ongoing'
                      ? tr('examStatusOngoing')
                      : ex.status === 'Completed'
                      ? tr('examStatusCompleted')
                      : tr('examStatusUpcoming');
                  return (
                    <tr key={ex._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{ex.name}</div>
                        {ex.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                            {ex.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{ex.academicYear}</td>
                      <td className="px-4 py-3">{ex.term}</td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{ex.startDate}</td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{ex.endDate}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{ex.totalDays}</td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span
                          className={
                            ex.status === 'Completed'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : ex.status === 'Ongoing'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-[#0F294A] dark:text-blue-400'
                          }
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openTimetableEditor(ex)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-[#0F294A] dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                                <span>
                                  {tr('manageTimetableBtn')} ({ex.scheduleCount || 0})
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditExamModal(ex)}
                                className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                                title={tr('edit')}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteExamTarget(ex)}
                                className="p-1.5 rounded-md text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-950/40"
                                title={tr('delete')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Timetable Editor (Admin Only when an Examination is selected) */}
      {isAdmin && managingExam && (
        <div className="bg-white dark:bg-slate-900 border-2 border-[#0F294A]/30 dark:border-blue-500/40 rounded-xl p-4 space-y-4 no-print">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {tr('examTimetableTitle')}: {managingExam.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {managingExam.academicYear} · {managingExam.term} · {managingExam.startDate} →{' '}
                {managingExam.endDate} ({managingExam.totalDays} days)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addDraftRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tr('addScheduleRowBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleValidateDrafts()}
                disabled={validatingSchedule || draftRows.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-medium"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{validatingSchedule ? tr('loading') : tr('validateScheduleBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTimetable()}
                disabled={savingSchedule}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-xs font-semibold disabled:opacity-60"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{savingSchedule ? tr('loading') : tr('saveTimetableBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setManagingExam(null);
                  setDraftRows([]);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
              >
                {tr('close')}
              </button>
            </div>
          </div>

          {scheduleError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {scheduleError}
            </div>
          )}
          {scheduleFeedback && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
              {scheduleFeedback}
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-2.5 py-2 font-semibold">#</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[135px]">{tr('classLabel')}</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[130px]">{tr('examDateCol')}</th>
                  <th className="px-2.5 py-2 font-semibold">{tr('dayOfWeek')}</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[140px]">{tr('subject')}</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[105px]">{tr('startTime')}</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[105px]">{tr('endTime')}</th>
                  <th className="px-2.5 py-2 font-semibold">{tr('durationCol')}</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[160px]">{tr('invigilatorCol')}</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[115px]">{tr('examRoomCol')}</th>
                  <th className="px-2.5 py-2 font-semibold min-w-[130px]">{tr('notes')}</th>
                  <th className="px-2.5 py-2 font-semibold text-right">{tr('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {draftRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-6 text-center text-slate-500">
                      {tr('noData')}
                    </td>
                  </tr>
                ) : (
                  draftRows.map((row, idx) => {
                    const selectedCls = classes.find((c) => c._id === row.classId);
                    const classSubjects = selectedCls?.subjects || [];
                    const hasErrors = row.errors.length > 0;
                    return (
                      <React.Fragment key={row.localId}>
                        <tr
                          className={
                            hasErrors
                              ? 'bg-red-50/70 dark:bg-red-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }
                        >
                          <td className="px-2.5 py-2 font-mono tabular-nums text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={row.classId}
                              onChange={(e) =>
                                updateDraftRow(row.localId, { classId: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            >
                              <option value="">-- {tr('selectClass')} --</option>
                              {classes.map((cls) => (
                                <option key={cls._id} value={cls._id}>
                                  {cls.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="date"
                              min={managingExam.startDate}
                              max={managingExam.endDate}
                              value={row.examDate}
                              onChange={(e) =>
                                updateDraftRow(row.localId, { examDate: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
                            />
                          </td>
                          <td className="px-2.5 py-2 font-medium whitespace-nowrap">
                            {computeWeekdayFromYmd(row.examDate)}
                          </td>
                          <td className="px-2 py-1.5">
                            {classSubjects.length > 0 ? (
                              <select
                                value={row.subject}
                                onChange={(e) =>
                                  updateDraftRow(row.localId, { subject: e.target.value })
                                }
                                className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              >
                                <option value="">-- {tr('subject')} --</option>
                                {classSubjects.map((sub) => (
                                  <option key={sub} value={sub}>
                                    {sub}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={row.subject}
                                placeholder={tr('subject')}
                                onChange={(e) =>
                                  updateDraftRow(row.localId, { subject: e.target.value })
                                }
                                className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="time"
                              value={row.startTime}
                              onChange={(e) =>
                                updateDraftRow(row.localId, { startTime: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="time"
                              value={row.endTime}
                              onChange={(e) =>
                                updateDraftRow(row.localId, { endTime: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs"
                            />
                          </td>
                          <td className="px-2.5 py-2 font-mono tabular-nums whitespace-nowrap">
                            {computeDurationLabel(row.startTime, row.endTime)}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={row.invigilatorId}
                              onChange={(e) =>
                                updateDraftRow(row.localId, { invigilatorId: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            >
                              <option value="">-- {tr('invigilatorCol')} --</option>
                              {teachers.map((tc) => (
                                <option key={tc._id} value={tc._id}>
                                  {tc.fullName} ({tc.teacherId})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.room}
                              placeholder="Room 101"
                              onChange={(e) =>
                                updateDraftRow(row.localId, { room: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.notes}
                              onChange={(e) =>
                                updateDraftRow(row.localId, { notes: e.target.value })
                              }
                              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeDraftRow(row.localId)}
                              className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title={tr('delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                        {hasErrors && (
                          <tr className="bg-red-50/90 dark:bg-red-950/40">
                            <td colSpan={12} className="px-4 py-1.5 text-[11px] text-red-700 dark:text-red-300">
                              {row.errors.map((errMsg, errIdx) => (
                                <div key={errIdx}>• {errMsg}</div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Examination Timetable Views, Filtering, Printing & PDF Export */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3 no-print">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {isAdmin ? tr('examTimetableTitle') : tr('myInvigilationScheduleTitle')}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    { id: 'full', label: tr('viewFullTimetable') },
                    { id: 'daily', label: tr('viewDailyTimetable') },
                    { id: 'weekly', label: tr('viewWeeklyTimetable') },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setViewMode(m.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      viewMode === m.id
                        ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={filteredSchedules.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{tr('downloadPdfBtn')}</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                disabled={filteredSchedules.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-xs font-medium disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{tr('printExamTimetableBtn')}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <select
              value={filterExamId}
              onChange={(e) => setFilterExamId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="">-- {tr('examName')} ({tr('all')}) --</option>
              {examinations.map((ex) => (
                <option key={ex._id} value={ex._id}>
                  {ex.name} ({ex.academicYear})
                </option>
              ))}
            </select>

            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="">{tr('allClasses')}</option>
              {classes.map((cls) => (
                <option key={cls._id} value={cls._id}>
                  {cls.name}
                </option>
              ))}
            </select>

            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="">{tr('filterBySubject')}</option>
              {allSubjectsInSchedules.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            <select
              value={filterTeacherId}
              onChange={(e) => setFilterTeacherId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="">{tr('filterByTeacher')}</option>
              {allTeachersInSchedules.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            {viewMode === 'daily' && (
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            )}
          </div>
        </div>

        {/* Print Header (visible on print) */}
        <div className="hidden print:flex items-center justify-between p-4 border-b border-slate-300">
          <div className="flex items-center gap-3">
            <SchoolCrest className="w-10 h-10" logoUrl={settings?.schoolLogoUrl} />
            <div>
              <div className="font-display font-bold text-base">{settings?.schoolName}</div>
              <div className="text-xs text-slate-600">
                {tr('examTimetableTitle')} · {settings?.schoolAddress}
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'full' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('examName')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('classLabel')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('examDateCol')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('dayOfWeek')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('subject')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('startTime')} - {tr('endTime')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('durationCol')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('invigilatorCol')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('examRoomCol')}</th>
                  <th className="px-3.5 py-2.5 font-semibold">{tr('notes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      {tr('noData')}
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((sc) => {
                    const exName =
                      typeof sc.examinationId === 'object' ? sc.examinationId.name : '-';
                    const clsName = typeof sc.classId === 'object' ? sc.classId.name : '-';
                    const invName =
                      typeof sc.invigilatorId === 'object' ? sc.invigilatorId.fullName : '-';
                    return (
                      <tr key={sc._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3.5 py-2.5 font-medium">{exName}</td>
                        <td className="px-3.5 py-2.5 font-semibold">{clsName}</td>
                        <td className="px-3.5 py-2.5 font-mono tabular-nums">{sc.examDate}</td>
                        <td className="px-3.5 py-2.5">{sc.dayOfWeek}</td>
                        <td className="px-3.5 py-2.5 font-medium text-[#0F294A] dark:text-blue-300">
                          {sc.subject}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono tabular-nums whitespace-nowrap">
                          {sc.startTime} - {sc.endTime}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono tabular-nums">
                          {sc.durationMinutes}m
                        </td>
                        <td className="px-3.5 py-2.5">{invName}</td>
                        <td className="px-3.5 py-2.5 font-mono">{sc.room}</td>
                        <td className="px-3.5 py-2.5 text-slate-500">{sc.notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {groupedByDay.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">{tr('noData')}</div>
            ) : (
              groupedByDay.map(([groupKey, items]) => (
                <div
                  key={groupKey}
                  className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 font-display font-semibold text-sm text-[#0F294A] dark:text-blue-300 flex items-center justify-between">
                    <span>
                      {groupKey}
                      {viewMode === 'daily' && items[0]?.dayOfWeek
                        ? ` (${items[0].dayOfWeek})`
                        : ''}
                    </span>
                    <span className="text-xs font-mono text-slate-500">{items.length}</span>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {items.map((sc) => (
                      <div
                        key={sc._id}
                        className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                            {sc.examDate} · {sc.startTime}-{sc.endTime} ({sc.durationMinutes}m)
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {typeof sc.classId === 'object' ? sc.classId.name : '-'}
                          </span>
                          <span className="font-medium text-[#0F294A] dark:text-blue-400">
                            {sc.subject}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-300">
                          <span>
                            {tr('invigilatorCol')}:{' '}
                            <strong>
                              {typeof sc.invigilatorId === 'object'
                                ? sc.invigilatorId.fullName
                                : '-'}
                            </strong>
                          </span>
                          <span className="font-mono">
                            {tr('examRoomCol')}: <strong>{sc.room}</strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Examination Modal */}
      <Modal
        open={examFormOpen}
        onClose={() => setExamFormOpen(false)}
        title={editingExam ? tr('editExamination') : tr('createNewExamination')}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveExam} className="space-y-4">
          {examFormError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {examFormError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('examName')}
              </label>
              <input
                type="text"
                required
                value={examForm.name}
                onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
                placeholder="Midterm Examination / Final Examination"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('academicYear')}
              </label>
              <input
                type="text"
                required
                list="exam-academic-years"
                value={examForm.academicYear}
                onChange={(e) => setExamForm({ ...examForm, academicYear: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
              <datalist id="exam-academic-years">
                {academicYears.map((y) => (
                  <option key={y._id} value={y.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('examTerm')}
              </label>
              <input
                type="text"
                required
                list="exam-terms-list"
                value={examForm.term}
                onChange={(e) => setExamForm({ ...examForm, term: e.target.value })}
                placeholder="Term 1 / Semester 1"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
              <datalist id="exam-terms-list">
                {selectedYearObj?.terms.map((t) => (
                  <option key={t.name} value={t.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('examStartDate')}
              </label>
              <input
                type="date"
                required
                value={examForm.startDate}
                onChange={(e) => {
                  const s = e.target.value;
                  setExamForm((prev) => ({
                    ...prev,
                    startDate: s,
                    totalDays: computeInclusiveDays(s, prev.endDate),
                  }));
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('examEndDate')}
              </label>
              <input
                type="date"
                required
                min={examForm.startDate}
                value={examForm.endDate}
                onChange={(e) => {
                  const end = e.target.value;
                  setExamForm((prev) => ({
                    ...prev,
                    endDate: end,
                    totalDays: computeInclusiveDays(prev.startDate, end),
                  }));
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('examTotalDays')}
              </label>
              <input
                type="number"
                min={1}
                required
                value={examForm.totalDays}
                onChange={(e) =>
                  setExamForm({ ...examForm, totalDays: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('status')}
              </label>
              <select
                value={examForm.status}
                onChange={(e) =>
                  setExamForm({ ...examForm, status: e.target.value as ExaminationStatus })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Upcoming">{tr('examStatusUpcoming')}</option>
                <option value="Ongoing">{tr('examStatusOngoing')}</option>
                <option value="Completed">{tr('examStatusCompleted')}</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('examDescription')}
              </label>
              <textarea
                rows={2}
                value={examForm.description}
                onChange={(e) => setExamForm({ ...examForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setExamFormOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={savingExam}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {savingExam ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteExamTarget)}
        onClose={() => setDeleteExamTarget(null)}
        onConfirm={() => void handleDeleteExam()}
        loading={deletingExam}
      />
    </div>
  );
}
