import { useEffect, useState } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  FileSpreadsheet,
  Wallet,
  Megaphone,
  Printer,
  CalendarDays,
  CalendarClock,
  BookMarked,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { formatMoney } from '../utils/export';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import { Modal } from '../components/ui/Modal';
import type { FeePayment, ParentPortalOverview, SchoolDay } from '../types';

export type ParentPortalSection =
  | 'dashboard'
  | 'childTimetable'
  | 'childHomework'
  | 'childAttendance'
  | 'childResults'
  | 'childFees';

const DAYS: SchoolDay[] = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

export function ParentPortalPage({ section }: { section: ParentPortalSection }) {
  const { lang, tr } = useTheme();
  const [data, setData] = useState<ParentPortalOverview | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<FeePayment | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<ParentPortalOverview>('/api/parent-portal/overview')
      .then((res) => {
        if (!active) return;
        setData(res);
        if (res.children.length > 0) {
          setSelectedChildId((prev) =>
            prev && res.children.some((c) => c.student._id === prev) ? prev : res.children[0].student._id
          );
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load parent portal.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const dayLabel = (d: SchoolDay) => {
    if (d === 'Saturday') return tr('daySaturday');
    if (d === 'Sunday') return tr('daySunday');
    if (d === 'Monday') return tr('dayMonday');
    if (d === 'Tuesday') return tr('dayTuesday');
    if (d === 'Wednesday') return tr('dayWednesday');
    return tr('dayThursday');
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {tr('loading')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
        {error || tr('noData')}
      </div>
    );
  }

  const { settings, announcements, children } = data;
  const symbol = settings.currencySymbol || '$';
  const code = settings.currencyCode || 'USD';

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-sm text-slate-600 dark:text-slate-300">
          {tr('noChildrenLinked')}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold">{tr('announcementsTitle')}</h2>
          </div>
          {announcements.length === 0 ? (
            <p className="text-sm text-slate-500">{tr('noAnnouncements')}</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {announcements.map((ann) => (
                <div key={ann._id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="font-semibold text-sm">{ann.title}</div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{ann.content}</p>
                  <div className="text-xs text-slate-500">
                    {ann.authorName} · {ann.createdAt.slice(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const activeChild = children.find((c) => c.student._id === selectedChildId) || children[0];
  const {
    student,
    classroom,
    attendanceSummary,
    attendanceRecords,
    reportCards,
    feeSummary,
    homework,
    timetable,
    examSchedules = [],
  } = activeChild;
  const latestExam = reportCards[reportCards.length - 1] || null;

  const childSelectorBar = (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
      <div className="flex items-center gap-3 min-w-0">
        {student.photoUrl && (
          <img
            src={student.photoUrl}
            alt={student.fullName}
            className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />
        )}
        <div className="min-w-0">
          <div className="font-display font-semibold text-sm text-slate-900 dark:text-white truncate">
            {student.fullName}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {student.studentId} · {classroom?.name || '-'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {tr('selectChildLabel')}:
        </label>
        <select
          value={student._id}
          onChange={(e) => setSelectedChildId(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
        >
          {children.map((c) => (
            <option key={c.student._id} value={c.student._id}>
              {c.student.fullName} ({c.classroom?.name || c.student.studentId})
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  if (section === 'dashboard') {
    return (
      <div className="space-y-6">
        {childSelectorBar}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {tr('classLabel')}
              </div>
              <div className="mt-1.5 font-display text-xl font-bold text-slate-900 dark:text-white">
                {classroom?.name || '-'}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono">{student.academicYear}</div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F294A] dark:text-blue-400">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {tr('attendanceRate')}
              </div>
              <div className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {attendanceSummary.rate}%
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {attendanceSummary.Present}/{attendanceSummary.total} {tr('present')}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F294A] dark:text-blue-400">
              <ClipboardCheck className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {tr('navExams')}
              </div>
              <div className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {latestExam ? `${latestExam.summary.percentage}% (${latestExam.summary.grade})` : '-'}
              </div>
              <div className="mt-1 text-xs text-slate-500 truncate">
                {latestExam ? latestExam.examName : tr('noData')}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F294A] dark:text-blue-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {tr('remainingBalance')}
              </div>
              <div className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatMoney(feeSummary.remainingBalance, symbol, code)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {feeSummary.feeStatus === 'Paid'
                  ? tr('paid')
                  : feeSummary.feeStatus === 'Partial'
                  ? tr('partial')
                  : tr('unpaid')}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F294A] dark:text-blue-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Announcements & Recent Homework */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Megaphone className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('announcementsTitle')}
              </h2>
            </div>

            {announcements.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{tr('noAnnouncements')}</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {announcements.map((ann) => (
                  <div key={ann._id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {ann.title}
                      </span>
                      {ann.category && (
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[#0F294A] dark:text-blue-400">
                          {ann.category}
                          {ann.eventDate ? ` · ${ann.eventDate}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                      {ann.content}
                    </p>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {ann.authorName} · {ann.createdAt.slice(0, 10)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BookMarked className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('homeworkTitle')}
              </h2>
            </div>
            {homework.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{tr('noData')}</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {homework.slice(0, 6).map((hw) => (
                  <div key={hw._id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">
                        {hw.subject} — {hw.title}
                      </div>
                      {hw.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{hw.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs tabular-nums">{hw.dueDate}</div>
                      <div className="text-xs font-medium text-[#0F294A] dark:text-blue-400">
                        {hw.status === 'Reviewed'
                          ? tr('hwReviewed')
                          : hw.status === 'Completed'
                          ? tr('hwCompleted')
                          : tr('hwAssigned')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (section === 'childTimetable') {
    const periodNums = Array.from(
      new Set(timetable.map((s) => s.periodNumber))
    ).sort((a, b) => a - b);

    return (
      <div className="space-y-4">
        {childSelectorBar}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-container">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
              <h2 className="font-display text-base font-semibold">
                {classroom?.name} — {tr('timetableTitle')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-xs font-medium no-print"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{tr('print')}</span>
            </button>
          </div>

          {periodNums.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">{tr('noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">{tr('periodNumber')}</th>
                    {DAYS.map((day) => (
                      <th key={day} className="px-3 py-2.5 font-semibold">
                        {dayLabel(day)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {periodNums.map((pNum) => (
                    <tr key={pNum}>
                      <td className="px-3 py-2.5 font-mono font-semibold tabular-nums">
                        {pNum}
                      </td>
                      {DAYS.map((day) => {
                        const slot = timetable.find(
                          (s) => s.dayOfWeek === day && s.periodNumber === pNum
                        );
                        const teacherName =
                          slot?.teacherId && typeof slot.teacherId === 'object'
                            ? slot.teacherId.fullName
                            : '';
                        return (
                          <td key={day} className="px-3 py-2.5 align-top">
                            {slot ? (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-slate-900 dark:text-white">
                                  {slot.subject}
                                </div>
                                <div className="font-mono text-[11px] text-slate-500">
                                  {slot.startTime}–{slot.endTime}
                                </div>
                                {teacherName && (
                                  <div className="text-[11px] text-slate-500">{teacherName}</div>
                                )}
                                {slot.room && (
                                  <div className="text-[11px] text-slate-400">{slot.room}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section === 'childHomework') {
    return (
      <div className="space-y-4">
        {childSelectorBar}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">{tr('subject')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('homeworkName')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('dueDate')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('assignedBy')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {homework.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      {tr('noData')}
                    </td>
                  </tr>
                ) : (
                  homework.map((hw) => (
                    <tr key={hw._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium">{hw.subject}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{hw.title}</div>
                        {hw.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {hw.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{hw.dueDate}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{hw.assignedByName}</td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span
                          className={
                            hw.status === 'Reviewed'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : hw.status === 'Completed'
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }
                        >
                          {hw.status === 'Reviewed'
                            ? tr('hwReviewed')
                            : hw.status === 'Completed'
                            ? tr('hwCompleted')
                            : tr('hwAssigned')}
                        </span>
                      </td>
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

  if (section === 'childAttendance') {
    return (
      <div className="space-y-4">
        {childSelectorBar}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">{tr('present')}</div>
            <div className="font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {attendanceSummary.Present}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">{tr('absent')}</div>
            <div className="font-mono text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {attendanceSummary.Absent}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">{tr('late')}</div>
            <div className="font-mono text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {attendanceSummary.Late}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">{tr('excused')}</div>
            <div className="font-mono text-xl font-bold tabular-nums">{attendanceSummary.Excused}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">{tr('attendanceRate')}</div>
            <div className="font-mono text-xl font-bold tabular-nums text-[#0F294A] dark:text-blue-400">
              {attendanceSummary.rate}%
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">{tr('selectDate')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('status')}</th>
                  <th className="px-4 py-3 font-semibold">{tr('note')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {attendanceRecords.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      {tr('noData')}
                    </td>
                  </tr>
                ) : (
                  attendanceRecords.map((rec) => (
                    <tr key={rec.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{rec.date}</td>
                      <td className="px-4 py-2.5 font-medium">
                        {rec.status === 'Present'
                          ? tr('present')
                          : rec.status === 'Absent'
                          ? tr('absent')
                          : rec.status === 'Late'
                          ? tr('late')
                          : tr('excused')}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{rec.note || '-'}</td>
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

  if (section === 'childResults') {
    return (
      <div className="space-y-6">
        {childSelectorBar}

        {/* Child Examination Timetable */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('examTimetableTitle')}
              </h2>
            </div>
            {examSchedules.length > 0 && (
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-xs font-medium no-print whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{tr('printExamTimetableBtn')}</span>
              </button>
            )}
          </div>

          {examSchedules.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{tr('noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border border-slate-200 dark:border-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{tr('examName')}</th>
                    <th className="px-3 py-2 font-semibold">{tr('examDateCol')}</th>
                    <th className="px-3 py-2 font-semibold">{tr('dayOfWeek')}</th>
                    <th className="px-3 py-2 font-semibold">{tr('subject')}</th>
                    <th className="px-3 py-2 font-semibold">{tr('startTime')} - {tr('endTime')}</th>
                    <th className="px-3 py-2 font-semibold">{tr('durationCol')}</th>
                    <th className="px-3 py-2 font-semibold">{tr('examRoomCol')}</th>
                    <th className="px-3 py-2 font-semibold">{tr('invigilatorCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {examSchedules.map((sc) => {
                    const exName =
                      typeof sc.examinationId === 'object' ? sc.examinationId.name : '-';
                    const invName =
                      typeof sc.invigilatorId === 'object' ? sc.invigilatorId.fullName : '-';
                    const h = Math.floor(sc.durationMinutes / 60);
                    const m = sc.durationMinutes % 60;
                    const durLabel = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
                    return (
                      <tr key={sc._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-medium">{exName}</td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">{sc.examDate}</td>
                        <td className="px-3 py-2 text-xs">{sc.dayOfWeek}</td>
                        <td className="px-3 py-2 font-semibold">{sc.subject}</td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">
                          {sc.startTime} - {sc.endTime}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">{durLabel}</td>
                        <td className="px-3 py-2">{sc.room}</td>
                        <td className="px-3 py-2 text-xs">{invName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {reportCards.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
            {tr('noData')}
          </div>
        ) : (
          reportCards.map((card) => (
            <div
              key={card.examName}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 print-container"
            >
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <SchoolCrest className="w-10 h-10" logoUrl={settings.schoolLogoUrl} />
                  <div>
                    <div className="font-display font-bold text-base">{settings.schoolName}</div>
                    <div className="text-xs text-slate-500">
                      {tr('reportCard')} — {card.examName} — {student.fullName}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-xs font-medium no-print"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{tr('printReportCard')}</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{tr('subject')}</th>
                      <th className="px-3 py-2 font-semibold text-right">{tr('score')}</th>
                      <th className="px-3 py-2 font-semibold text-right">{tr('maxMarks')}</th>
                      <th className="px-3 py-2 font-semibold text-right">{tr('percentage')}</th>
                      <th className="px-3 py-2 font-semibold text-right">{tr('grade')}</th>
                      <th className="px-3 py-2 font-semibold">{tr('remark')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {card.subjects.map((sub) => (
                      <tr key={sub.subject}>
                        <td className="px-3 py-2 font-medium">{sub.subject}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{sub.score}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{sub.maxMarks}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {sub.percentage}%
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{sub.grade}</td>
                        <td className="px-3 py-2 text-xs">
                          {lang === 'so' ? sub.remarkSo : sub.remarkEn}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg text-sm">
                <div>
                  <div className="text-xs text-slate-500">{tr('totalMarks')}</div>
                  <div className="font-mono font-bold tabular-nums">
                    {card.summary.totalScore}/{card.summary.totalPossible}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{tr('average')}</div>
                  <div className="font-mono font-bold tabular-nums">{card.summary.average}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{tr('percentage')}</div>
                  <div className="font-mono font-bold tabular-nums">{card.summary.percentage}%</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{tr('grade')}</div>
                  <div className="font-bold">
                    {card.summary.grade} (
                    {lang === 'so' ? card.summary.remarkSo : card.summary.remarkEn})
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // childFees
  return (
    <div className="space-y-4">
      {childSelectorBar}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">{tr('totalFee')}</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums">
            {formatMoney(feeSummary.totalFee, symbol, code)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">{tr('paidAmount')}</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMoney(feeSummary.paidAmount, symbol, code)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">{tr('remainingBalance')}</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {formatMoney(feeSummary.remainingBalance, symbol, code)}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">{tr('receiptNumber')}</th>
                <th className="px-4 py-3 font-semibold">{tr('paymentDate')}</th>
                <th className="px-4 py-3 font-semibold">{tr('paymentMethod')}</th>
                <th className="px-4 py-3 font-semibold text-right">{tr('paymentAmount')}</th>
                <th className="px-4 py-3 font-semibold text-right">{tr('printReceipt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {feeSummary.payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {tr('noData')}
                  </td>
                </tr>
              ) : (
                feeSummary.payments.map((pay) => (
                  <tr key={pay._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{pay.receiptNumber}</td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{pay.paymentDate}</td>
                    <td className="px-4 py-2.5">{pay.paymentMethod}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {formatMoney(pay.amount, symbol, code)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(pay)}
                        className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                        title={tr('printReceipt')}
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        title={tr('paymentReceipt')}
        maxWidthClass="max-w-md"
      >
        {selectedReceipt && (
          <div className="space-y-4 print-container">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <SchoolCrest className="w-9 h-9" logoUrl={settings.schoolLogoUrl} />
                <div>
                  <div className="font-display font-bold text-sm">{settings.schoolName}</div>
                  <div className="text-xs text-slate-500">{tr('paymentReceipt')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-xs font-medium no-print"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{tr('print')}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">{tr('receiptNumber')}</div>
                <div className="font-mono font-semibold">{selectedReceipt.receiptNumber}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('paymentDate')}</div>
                <div className="font-mono">{selectedReceipt.paymentDate}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('fullName')}</div>
                <div className="font-semibold">{student.fullName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('paymentMethod')}</div>
                <div>{selectedReceipt.paymentMethod}</div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
              <span className="text-sm">{tr('paymentAmount')}</span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {formatMoney(selectedReceipt.amount, symbol, code)}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
