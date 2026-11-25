import { useCallback, useEffect, useState } from 'react';
import { Printer, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { Modal } from '../components/ui/Modal';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import type { Classroom, SchoolSettings, Student } from '../types';

interface MarkRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  score: number | '';
}

interface ClassResultsResponse {
  examName: string;
  className: string;
  academicYear: string;
  subjects: Array<{ subject: string; maxMarks: number }>;
  results: Array<{
    studentId: string;
    studentCode: string;
    fullName: string;
    subjectScores: Record<string, { score: number; maxMarks: number } | null>;
    totalScore: number;
    totalPossible: number;
    average: number;
    percentage: number;
    grade: string;
    remarkEn: string;
    remarkSo: string;
    rank: number | null;
  }>;
}

interface ReportCardData {
  student: Student;
  examName: string;
  subjects: Array<{
    subject: string;
    score: number | null;
    maxMarks: number;
    percentage: number | null;
    grade: string;
    remarkEn: string;
    remarkSo: string;
  }>;
  summary: {
    totalScore: number;
    totalPossible: number;
    average: number;
    percentage: number;
    grade: string;
    remarkEn: string;
    remarkSo: string;
  };
  settings: SchoolSettings;
}

export function ExamsPage() {
  const { settings } = useAuth();
  const { lang, tr } = useTheme();
  const [tab, setTab] = useState<'marks' | 'results'>('marks');

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [examNames, setExamNames] = useState<string[]>([]);

  const [examName, setExamName] = useState('Midterm Exam 2026');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [maxMarks, setMaxMarks] = useState(100);
  const [markRows, setMarkRows] = useState<MarkRow[]>([]);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);

  const [resultsExamName, setResultsExamName] = useState('');
  const [resultsClassId, setResultsClassId] = useState('');
  const [resultsData, setResultsData] = useState<ClassResultsResponse | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const [reportCard, setReportCard] = useState<ReportCardData | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInit = useCallback(async () => {
    try {
      const [classList, names] = await Promise.all([
        apiRequest<Classroom[]>('/api/classes'),
        apiRequest<string[]>('/api/exams/names'),
      ]);
      setClasses(classList);
      setExamNames(names);

      if (classList.length > 0) {
        const first = classList[0];
        setClassId((prev) => prev || first._id);
        setResultsClassId((prev) => prev || first._id);
        if (first.subjects.length > 0) {
          setSubject((prev) => prev || first.subjects[0]);
        }
      }
      if (names.length > 0) {
        setResultsExamName((prev) => prev || names[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes.');
    }
  }, []);

  useEffect(() => {
    void loadInit();
  }, [loadInit]);

  const selectedClassroom = classes.find((c) => c._id === classId);
  const availableSubjects = selectedClassroom?.subjects || [];

  useEffect(() => {
    if (selectedClassroom && selectedClassroom.subjects.length > 0) {
      if (!selectedClassroom.subjects.includes(subject)) {
        setSubject(selectedClassroom.subjects[0]);
      }
    } else {
      setSubject('');
    }
  }, [selectedClassroom, subject]);

  const loadMarks = useCallback(async () => {
    if (!examName.trim() || !classId || !subject) return;
    setLoadingMarks(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<{ maxMarks: number; rows: MarkRow[] }>(
        `/api/exams/marks?examName=${encodeURIComponent(examName.trim())}&classId=${encodeURIComponent(classId)}&subject=${encodeURIComponent(subject)}`
      );
      setMaxMarks(data.maxMarks);
      setMarkRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student marks.');
    } finally {
      setLoadingMarks(false);
    }
  }, [examName, classId, subject]);

  useEffect(() => {
    if (tab === 'marks' && examName.trim() && classId && subject) {
      void loadMarks();
    }
  }, [tab, loadMarks, examName, classId, subject]);

  const handleSaveMarks = async () => {
    if (!examName.trim() || !classId || !subject) return;
    setSavingMarks(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/api/exams/marks', {
        method: 'PUT',
        body: JSON.stringify({
          examName: examName.trim(),
          classId,
          subject,
          maxMarks,
          marks: markRows,
        }),
      });
      setMessage(tr('marksSaved'));
      const names = await apiRequest<string[]>('/api/exams/names');
      setExamNames(names);
      if (!resultsExamName) setResultsExamName(examName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save marks.');
    } finally {
      setSavingMarks(false);
    }
  };

  const loadClassResults = useCallback(async () => {
    if (!resultsExamName || !resultsClassId) return;
    setLoadingResults(true);
    setError(null);
    try {
      const data = await apiRequest<ClassResultsResponse>(
        `/api/exams/results?examName=${encodeURIComponent(resultsExamName)}&classId=${encodeURIComponent(resultsClassId)}`
      );
      setResultsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load class results.');
    } finally {
      setLoadingResults(false);
    }
  }, [resultsExamName, resultsClassId]);

  useEffect(() => {
    if (tab === 'results' && resultsExamName && resultsClassId) {
      void loadClassResults();
    }
  }, [tab, loadClassResults, resultsExamName, resultsClassId]);

  const openReportCard = async (studentId: string) => {
    if (!resultsExamName) return;
    setLoadingCard(true);
    setReportCard(null);
    try {
      const data = await apiRequest<ReportCardData>(
        `/api/exams/report-card/${studentId}?examName=${encodeURIComponent(resultsExamName)}`
      );
      setReportCard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report card.');
    } finally {
      setLoadingCard(false);
    }
  };

  const getLiveGrade = (scoreVal: number | '') => {
    if (scoreVal === '' || maxMarks <= 0) return { pct: '-', grade: '-' };
    const pct = Math.round((Number(scoreVal) / maxMarks) * 1000) / 10;
    const scale = [...(settings?.gradingScale || [])].sort((a, b) => b.minPercent - a.minPercent);
    const rule = scale.find((g) => pct >= g.minPercent) || scale[scale.length - 1];
    return { pct: `${pct}%`, grade: rule?.grade || '-' };
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 no-print">
        <button
          type="button"
          onClick={() => setTab('marks')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'marks'
              ? 'bg-[#0F294A] text-white dark:bg-blue-600'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {tr('enterMarksTab')}
        </button>
        <button
          type="button"
          onClick={() => setTab('results')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'results'
              ? 'bg-[#0F294A] text-white dark:bg-blue-600'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {tr('classResultsTab')}
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

      {tab === 'marks' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {tr('examName')}
              </label>
              <input
                type="text"
                list="exam-names-list"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder={tr('examNamePlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
              <datalist id="exam-names-list">
                {examNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {tr('selectClass')}
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
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
                {tr('subject')}
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {availableSubjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {tr('maxMarks')}
              </label>
              <input
                type="number"
                min={1}
                value={maxMarks}
                onChange={(e) => setMaxMarks(Math.max(1, Number(e.target.value) || 100))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tabular-nums"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSaveMarks()}
              disabled={savingMarks || markRows.length === 0 || !subject}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
            >
              {savingMarks ? tr('loading') : tr('saveMarks')}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{tr('studentId')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('score')} (/{maxMarks})</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('percentage')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('grade')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loadingMarks ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {tr('loading')}
                      </td>
                    </tr>
                  ) : markRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {tr('noData')}
                      </td>
                    </tr>
                  ) : (
                    markRows.map((row) => {
                      const live = getLiveGrade(row.score);
                      return (
                        <tr key={row.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                            {row.studentCode}
                          </td>
                          <td className="px-4 py-2.5 font-medium">{row.fullName}</td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={0}
                              max={maxMarks}
                              step="0.5"
                              value={row.score}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setMarkRows((prev) =>
                                  prev.map((r) =>
                                    r.studentId === row.studentId
                                      ? { ...r, score: raw === '' ? '' : Number(raw) }
                                      : r
                                  )
                                );
                              }}
                              className="w-28 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tabular-nums"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {live.pct}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">{live.grade}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-end justify-between gap-3 no-print">
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('examName')}
                </label>
                <select
                  value={resultsExamName}
                  onChange={(e) => setResultsExamName(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm min-w-[200px]"
                >
                  <option value="">-- {tr('examName')} --</option>
                  {examNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {tr('selectClass')}
                </label>
                <select
                  value={resultsClassId}
                  onChange={(e) => setResultsClassId(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm min-w-[180px]"
                >
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={!resultsData || resultsData.results.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0F294A] text-white text-sm font-medium whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>{tr('print')}</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{tr('rank')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('studentId')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                    {resultsData?.subjects.map((s) => (
                      <th key={s.subject} className="px-3 py-3 font-semibold text-right">
                        {s.subject}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-semibold text-right">{tr('totalMarks')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('average')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('percentage')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('grade')}</th>
                    <th className="px-4 py-3 font-semibold text-right no-print">{tr('reportCard')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loadingResults ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                        {tr('loading')}
                      </td>
                    </tr>
                  ) : !resultsData || resultsData.results.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                        {tr('noData')}
                      </td>
                    </tr>
                  ) : (
                    resultsData.results.map((r) => (
                      <tr key={r.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono tabular-nums font-semibold">
                          {r.rank ?? '-'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{r.studentCode}</td>
                        <td className="px-4 py-2.5 font-medium">{r.fullName}</td>
                        {resultsData.subjects.map((s) => {
                          const sc = r.subjectScores[s.subject];
                          return (
                            <td key={s.subject} className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {sc ? sc.score : '-'}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                          {r.totalScore}/{r.totalPossible}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.average}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                          {r.percentage}%
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">{r.grade}</td>
                        <td className="px-4 py-2.5 text-right no-print">
                          <button
                            type="button"
                            onClick={() => void openReportCard(r.studentId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{tr('view')}</span>
                          </button>
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

      {/* Printable Report Card Modal */}
      <Modal
        open={Boolean(reportCard) || loadingCard}
        onClose={() => setReportCard(null)}
        title={tr('reportCard')}
        maxWidthClass="max-w-2xl"
      >
        {loadingCard ? (
          <div className="py-8 text-center text-sm text-slate-500">{tr('loading')}</div>
        ) : reportCard ? (
          <div className="space-y-6 print-container">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <SchoolCrest className="w-12 h-12" />
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {reportCard.settings.schoolName}
                  </h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {reportCard.settings.schoolAddress} · {reportCard.settings.schoolPhone}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#0F294A] dark:text-blue-400">
                    {tr('reportCard')} — {reportCard.examName}
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="text-slate-500">{tr('studentId')}</div>
                <div className="font-mono font-semibold text-sm">{reportCard.student.studentId}</div>
              </div>
              <div>
                <div className="text-slate-500">{tr('fullName')}</div>
                <div className="font-semibold text-sm">{reportCard.student.fullName}</div>
              </div>
              <div>
                <div className="text-slate-500">{tr('classLabel')}</div>
                <div className="font-semibold text-sm">
                  {typeof reportCard.student.classId === 'object'
                    ? reportCard.student.classId.name
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">{tr('academicYear')}</div>
                <div className="font-mono font-semibold text-sm">{reportCard.student.academicYear}</div>
              </div>
            </div>

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
                {reportCard.subjects.map((sub) => (
                  <tr key={sub.subject}>
                    <td className="px-3 py-2 font-medium">{sub.subject}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {sub.score !== null ? sub.score : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{sub.maxMarks}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {sub.percentage !== null ? `${sub.percentage}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{sub.grade}</td>
                    <td className="px-3 py-2 text-xs">
                      {lang === 'so' ? sub.remarkSo : sub.remarkEn}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg text-sm">
              <div>
                <div className="text-xs text-slate-500">{tr('totalMarks')}</div>
                <div className="font-mono font-bold tabular-nums">
                  {reportCard.summary.totalScore}/{reportCard.summary.totalPossible}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('average')}</div>
                <div className="font-mono font-bold tabular-nums">{reportCard.summary.average}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('percentage')}</div>
                <div className="font-mono font-bold tabular-nums">{reportCard.summary.percentage}%</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('grade')}</div>
                <div className="font-bold">
                  {reportCard.summary.grade} (
                  {lang === 'so' ? reportCard.summary.remarkSo : reportCard.summary.remarkEn})
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-6 text-xs text-slate-600 dark:text-slate-400">
              <div className="border-t border-slate-300 dark:border-slate-700 pt-2">
                {tr('headteacherSignature')}
              </div>
              <div className="border-t border-slate-300 dark:border-slate-700 pt-2">
                {tr('parentSignature')}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
