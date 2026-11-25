import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { formatMoney } from '../utils/export';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { Classroom, Teacher } from '../types';

export function ClassesPage() {
  const { user, settings } = useAuth();
  const { tr } = useTheme();
  const isAdmin = user?.role === 'admin';

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Classroom | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Classroom | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    academicYear: settings?.academicYear || '2026-2027',
    classTeacherId: '',
    subjectsText: 'Somali, Arabic, English, Mathematics, Science, Islamic Studies, Social Studies',
    tuitionFee: '120',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const classReq = apiRequest<Classroom[]>('/api/classes');
      const teacherReq = isAdmin
        ? apiRequest<Teacher[]>('/api/teachers')
        : Promise.resolve([] as Teacher[]);
      const [classList, teacherList] = await Promise.all([classReq, teacherReq]);
      setClasses(classList);
      setTeachers(teacherList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setFormError(null);
    setForm({
      name: '',
      academicYear: settings?.academicYear || '2026-2027',
      classTeacherId: '',
      subjectsText: 'Somali, Arabic, English, Mathematics, Science, Islamic Studies, Social Studies',
      tuitionFee: '120',
    });
    setFormOpen(true);
  };

  const openEdit = (cls: Classroom) => {
    setEditing(cls);
    setFormError(null);
    const tid =
      cls.classTeacherId && typeof cls.classTeacherId === 'object'
        ? cls.classTeacherId._id
        : (cls.classTeacherId as string) || '';
    setForm({
      name: cls.name,
      academicYear: cls.academicYear,
      classTeacherId: tid,
      subjectsText: cls.subjects.join(', '),
      tuitionFee: String(cls.tuitionFee || 0),
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const subjects = form.subjectsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: form.name,
        academicYear: form.academicYear,
        classTeacherId: form.classTeacherId || null,
        subjects,
        tuitionFee: Number(form.tuitionFee) || 0,
      };

      if (editing) {
        await apiRequest(`/api/classes/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/classes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save class.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/classes/${deleteTarget._id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete class.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const symbol = settings?.currencySymbol || '$';
  const code = settings?.currencyCode || 'USD';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {tr('classesTitle')} ({classes.length})
        </p>
        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('addClass')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">{tr('className')}</th>
                <th className="px-4 py-3 font-semibold">{tr('classTeacher')}</th>
                <th className="px-4 py-3 font-semibold text-right">{tr('studentCount')}</th>
                <th className="px-4 py-3 font-semibold">{tr('subjects')}</th>
                <th className="px-4 py-3 font-semibold">{tr('academicYear')}</th>
                <th className="px-4 py-3 font-semibold text-right">{tr('tuitionFee')}</th>
                {isAdmin && <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-slate-500">
                    {tr('loading')}
                  </td>
                </tr>
              ) : classes.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-slate-500">
                    {tr('noData')}
                  </td>
                </tr>
              ) : (
                classes.map((cls) => {
                  const teacherName =
                    cls.classTeacherId && typeof cls.classTeacherId === 'object'
                      ? cls.classTeacherId.fullName
                      : tr('unassigned');
                  return (
                    <tr key={cls._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {cls.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{teacherName}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {cls.studentCount ?? 0}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-xs">
                        {cls.subjects.length > 0 ? cls.subjects.join(', ') : '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {cls.academicYear}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">
                        {formatMoney(cls.tuitionFee || 0, symbol, code)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(cls)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                              title={tr('edit')}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(cls)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-950/40"
                              title={tr('delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? tr('editClass') : tr('addClass')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('className')}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Form 1A / Grade 7"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                value={form.academicYear}
                onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('classTeacher')}
              </label>
              <select
                value={form.classTeacherId}
                onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">{tr('unassigned')}</option>
                {teachers.map((tch) => (
                  <option key={tch._id} value={tch._id}>
                    {tch.fullName} ({tch.teacherId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('tuitionFee')} ({code})
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.tuitionFee}
                onChange={(e) => setForm({ ...form, tuitionFee: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('subjects')}
            </label>
            <textarea
              rows={3}
              value={form.subjectsText}
              onChange={(e) => setForm({ ...form, subjectsText: e.target.value })}
              placeholder={tr('subjectsCommaHint')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {saving ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        loading={deleting}
      />
    </div>
  );
}
