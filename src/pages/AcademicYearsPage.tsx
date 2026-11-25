import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { AcademicTerm, AcademicYearItem, Classroom, Student } from '../types';

export function AcademicYearsPage() {
  const { settings, refreshMe } = useAuth();
  const { tr } = useTheme();

  const [tab, setTab] = useState<'years' | 'promote'>('years');
  const [years, setYears] = useState<AcademicYearItem[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Add/Edit Academic Year modal
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYearItem | null>(null);
  const [savingYear, setSavingYear] = useState(false);
  const [yearForm, setYearForm] = useState<{
    name: string;
    isCurrent: boolean;
    status: 'Active' | 'Archived';
    terms: AcademicTerm[];
  }>({
    name: '',
    isCurrent: true,
    status: 'Active',
    terms: [
      { name: 'Term 1', startDate: '', endDate: '', isCurrent: true },
      { name: 'Term 2', startDate: '', endDate: '', isCurrent: false },
    ],
  });

  // Promotion state
  const [fromClassId, setFromClassId] = useState('');
  const [toClassId, setToClassId] = useState('');
  const [toAcademicYear, setToAcademicYear] = useState(settings?.academicYear || '2026-2027');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [confirmPromoteOpen, setConfirmPromoteOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [yearList, classList, studentList] = await Promise.all([
        apiRequest<AcademicYearItem[]>('/api/academic-years'),
        apiRequest<Classroom[]>('/api/classes'),
        apiRequest<Student[]>('/api/students?status=Active'),
      ]);
      setYears(yearList);
      setClasses(classList);
      setStudents(studentList);

      if (classList.length > 0 && !fromClassId) {
        setFromClassId(classList[0]._id);
        setToClassId(classList[1]?._id || classList[0]._id);
      }
      const activeYr = yearList.find((y) => y.isCurrent);
      if (activeYr) setToAcademicYear(activeYr.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load academic years.');
    } finally {
      setLoading(false);
    }
  }, [fromClassId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const classStudents = students.filter((s) => {
    const cid = typeof s.classId === 'object' ? s.classId._id : s.classId;
    return cid === fromClassId;
  });

  useEffect(() => {
    setSelectedStudentIds(classStudents.map((s) => s._id));
  }, [fromClassId, students.length]);

  const openAddYear = () => {
    setEditingYear(null);
    setYearForm({
      name: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      isCurrent: years.length === 0,
      status: 'Active',
      terms: [
        { name: 'Term 1', startDate: '', endDate: '', isCurrent: true },
        { name: 'Term 2', startDate: '', endDate: '', isCurrent: false },
      ],
    });
    setYearModalOpen(true);
  };

  const openEditYear = (yr: AcademicYearItem) => {
    setEditingYear(yr);
    setYearForm({
      name: yr.name,
      isCurrent: yr.isCurrent,
      status: yr.status,
      terms: yr.terms.length > 0 ? yr.terms : [{ name: 'Term 1', startDate: '', endDate: '', isCurrent: true }],
    });
    setYearModalOpen(true);
  };

  const handleSaveYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingYear(true);
    setError(null);
    setMessage(null);
    try {
      if (editingYear) {
        await apiRequest(`/api/academic-years/${editingYear._id}`, {
          method: 'PUT',
          body: JSON.stringify(yearForm),
        });
      } else {
        await apiRequest('/api/academic-years', {
          method: 'POST',
          body: JSON.stringify(yearForm),
        });
      }
      setYearModalOpen(false);
      await Promise.all([loadData(), refreshMe()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save academic year.');
    } finally {
      setSavingYear(false);
    }
  };

  const handleSetCurrent = async (yr: AcademicYearItem) => {
    setError(null);
    try {
      await apiRequest(`/api/academic-years/${yr._id}`, {
        method: 'PUT',
        body: JSON.stringify({ isCurrent: true, status: 'Active' }),
      });
      await Promise.all([loadData(), refreshMe()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set active academic year.');
    }
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAllStudents = () => {
    if (selectedStudentIds.length === classStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(classStudents.map((s) => s._id));
    }
  };

  const handleConfirmPromote = async () => {
    setPromoting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest<{ promotedCount: number; message: string }>(
        '/api/academic-years/promote',
        {
          method: 'POST',
          body: JSON.stringify({
            fromClassId,
            toClassId,
            toAcademicYear,
            studentIds: selectedStudentIds,
          }),
        }
      );
      setConfirmPromoteOpen(false);
      setMessage(res.message || tr('promotionSuccess'));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote students.');
      setConfirmPromoteOpen(false);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('years')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'years'
                ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {tr('manageYearsTab')}
          </button>
          <button
            type="button"
            onClick={() => setTab('promote')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'promote'
                ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {tr('promoteStudentsTab')}
          </button>
        </div>

        {tab === 'years' && (
          <button
            type="button"
            onClick={openAddYear}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('addAcademicYear')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">{tr('loading')}</div>
      ) : tab === 'years' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {years.length === 0 ? (
            <div className="col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
              {tr('noData')}
            </div>
          ) : (
            years.map((yr) => (
              <div
                key={yr._id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display font-bold text-lg text-slate-900 dark:text-white font-mono">
                      {yr.name}
                    </div>
                    <div className="text-xs mt-0.5 font-medium">
                      {yr.isCurrent ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {tr('currentYearLabel')}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {yr.status === 'Archived' ? tr('archived') : tr('active')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!yr.isCurrent && (
                      <button
                        type="button"
                        onClick={() => void handleSetCurrent(yr)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{tr('setAsCurrent')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditYear(yr)}
                      className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                      title={tr('edit')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {yr.terms.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {tr('termsTitle')}
                    </div>
                    {yr.terms.map((tm, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {tm.name}
                          {tm.isCurrent ? ` (${tr('active')})` : ''}
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {tm.startDate || '-'} → {tm.endDate || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('fromClass')}
              </label>
              <select
                value={fromClassId}
                onChange={(e) => setFromClassId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {classes.map((cls) => (
                  <option key={cls._id} value={cls._id}>
                    {cls.name} ({cls.academicYear})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('toClass')}
              </label>
              <select
                value={toClassId}
                onChange={(e) => setToClassId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {classes.map((cls) => (
                  <option key={cls._id} value={cls._id}>
                    {cls.name} ({cls.academicYear})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('targetAcademicYear')}
              </label>
              <input
                type="text"
                list="academic-year-options"
                value={toAcademicYear}
                onChange={(e) => setToAcademicYear(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
              <datalist id="academic-year-options">
                {years.map((y) => (
                  <option key={y._id} value={y.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      classStudents.length > 0 &&
                      selectedStudentIds.length === classStudents.length
                    }
                    onChange={toggleAllStudents}
                  />
                  <span>{tr('selectAll')}</span>
                </label>
                <span className="text-xs text-slate-500">
                  ({selectedStudentIds.length}/{classStudents.length})
                </span>
              </div>

              <button
                type="button"
                disabled={selectedStudentIds.length === 0 || !toClassId || !toAcademicYear.trim()}
                onClick={() => setConfirmPromoteOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-xs font-medium disabled:opacity-50 whitespace-nowrap"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>{tr('promoteSelectedBtn')}</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 w-10" />
                    <th className="px-4 py-3 font-semibold">{tr('studentId')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('academicYear')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {classStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        {tr('noData')}
                      </td>
                    </tr>
                  ) : (
                    classStudents.map((stu) => (
                      <tr key={stu._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(stu._id)}
                            onChange={() => toggleStudent(stu._id)}
                          />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                          {stu.studentId}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{stu.fullName}</td>
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                          {stu.academicYear}
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

      {/* Add/Edit Academic Year Modal */}
      <Modal
        open={yearModalOpen}
        onClose={() => setYearModalOpen(false)}
        title={editingYear ? tr('editAcademicYear') : tr('addAcademicYear')}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveYear} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('yearName')}
              </label>
              <input
                type="text"
                required
                placeholder="2026-2027"
                value={yearForm.name}
                onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('status')}
              </label>
              <select
                value={yearForm.status}
                onChange={(e) =>
                  setYearForm({ ...yearForm, status: e.target.value as 'Active' | 'Archived' })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Active">{tr('active')}</option>
                <option value="Archived">{tr('archived')}</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={yearForm.isCurrent}
              onChange={(e) => setYearForm({ ...yearForm, isCurrent: e.target.checked })}
            />
            <span>{tr('setAsCurrent')}</span>
          </label>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{tr('termsTitle')}</span>
              <button
                type="button"
                onClick={() =>
                  setYearForm((prev) => ({
                    ...prev,
                    terms: [
                      ...prev.terms,
                      {
                        name: `Term ${prev.terms.length + 1}`,
                        startDate: '',
                        endDate: '',
                        isCurrent: false,
                      },
                    ],
                  }))
                }
                className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium"
              >
                {tr('addTerm')}
              </button>
            </div>

            {yearForm.terms.map((tm, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                <input
                  type="text"
                  value={tm.name}
                  onChange={(e) =>
                    setYearForm((prev) => ({
                      ...prev,
                      terms: prev.terms.map((t, i) => (i === idx ? { ...t, name: e.target.value } : t)),
                    }))
                  }
                  placeholder={tr('termName')}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <input
                  type="date"
                  value={tm.startDate}
                  onChange={(e) =>
                    setYearForm((prev) => ({
                      ...prev,
                      terms: prev.terms.map((t, i) =>
                        i === idx ? { ...t, startDate: e.target.value } : t
                      ),
                    }))
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <input
                  type="date"
                  value={tm.endDate}
                  onChange={(e) =>
                    setYearForm((prev) => ({
                      ...prev,
                      terms: prev.terms.map((t, i) =>
                        i === idx ? { ...t, endDate: e.target.value } : t
                      ),
                    }))
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    setYearForm((prev) => ({
                      ...prev,
                      terms: prev.terms.filter((_, i) => i !== idx),
                    }))
                  }
                  className="text-xs text-red-600 hover:underline text-left sm:text-center"
                >
                  {tr('delete')}
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setYearModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={savingYear}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {savingYear ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={confirmPromoteOpen}
        onClose={() => setConfirmPromoteOpen(false)}
        onConfirm={() => void handleConfirmPromote()}
        title={tr('confirmPromotionTitle')}
        message={tr('confirmPromotionDesc')}
        confirmLabel={tr('promoteSelectedBtn')}
        loading={promoting}
      />
    </div>
  );
}
