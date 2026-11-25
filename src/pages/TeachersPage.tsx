import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { resizeImageFileToDataUrl } from '../utils/image';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { Classroom, Teacher } from '../types';

export function TeachersPage() {
  const { tr } = useTheme();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    teacherId: '',
    fullName: '',
    phone: '',
    email: '',
    subjectsText: '',
    assignedClasses: [] as string[],
    status: 'Active' as 'Active' | 'Inactive',
    photoUrl: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teacherList, classList] = await Promise.all([
        apiRequest<Teacher[]>('/api/teachers'),
        apiRequest<Classroom[]>('/api/classes'),
      ]);
      setTeachers(teacherList);
      setClasses(classList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teachers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setFormError(null);
    setForm({
      teacherId: `TCH-${String(teachers.length + 1).padStart(3, '0')}`,
      fullName: '',
      phone: '',
      email: '',
      subjectsText: '',
      assignedClasses: [],
      status: 'Active',
      photoUrl: '',
    });
    setFormOpen(true);
  };

  const openEdit = (teacher: Teacher) => {
    setEditing(teacher);
    setFormError(null);
    setForm({
      teacherId: teacher.teacherId,
      fullName: teacher.fullName,
      phone: teacher.phone,
      email: teacher.email,
      subjectsText: teacher.assignedSubjects.join(', '),
      assignedClasses: teacher.assignedClasses.map((c) => c._id),
      status: teacher.status,
      photoUrl: teacher.photoUrl || '',
    });
    setFormOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 256, 0.82);
      setForm((prev) => ({ ...prev, photoUrl: dataUrl }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to process photo.');
    }
  };

  const toggleClass = (classId: string) => {
    setForm((prev) => ({
      ...prev,
      assignedClasses: prev.assignedClasses.includes(classId)
        ? prev.assignedClasses.filter((id) => id !== classId)
        : [...prev.assignedClasses, classId],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const assignedSubjects = form.subjectsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        teacherId: form.teacherId,
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        assignedSubjects,
        assignedClasses: form.assignedClasses,
        status: form.status,
        photoUrl: form.photoUrl,
      };

      if (editing) {
        await apiRequest(`/api/teachers/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/teachers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save teacher.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/teachers/${deleteTarget._id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete teacher.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {tr('teachersTitle')} ({teachers.length})
        </p>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{tr('addTeacher')}</span>
        </button>
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
                <th className="px-4 py-3 font-semibold">{tr('teacherId')}</th>
                <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                <th className="px-4 py-3 font-semibold">{tr('phone')}</th>
                <th className="px-4 py-3 font-semibold">{tr('email')}</th>
                <th className="px-4 py-3 font-semibold">{tr('assignedSubjects')}</th>
                <th className="px-4 py-3 font-semibold">{tr('assignedClasses')}</th>
                <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {tr('loading')}
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {tr('noData')}
                  </td>
                </tr>
              ) : (
                teachers.map((tch) => (
                  <tr key={tch._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {tch.teacherId}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {tch.fullName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {tch.phone}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tch.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {tch.assignedSubjects.length > 0 ? tch.assignedSubjects.join(', ') : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {tch.assignedClasses.length > 0
                        ? tch.assignedClasses.map((c) => c.name).join(', ')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(tch)}
                          className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                          title={tr('edit')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(tch)}
                          className="p-1.5 rounded-md text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-950/40"
                          title={tr('delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? tr('editTeacher') : tr('addTeacher')}
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
                {tr('teacherId')}
              </label>
              <input
                type="text"
                required
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('fullName')}
              </label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('phone')}
              </label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('email')}
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('assignedSubjects')}
            </label>
            <input
              type="text"
              value={form.subjectsText}
              onChange={(e) => setForm({ ...form, subjectsText: e.target.value })}
              placeholder={tr('subjectsCommaHint')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('photoLabel')}
            </label>
            <div className="flex items-center gap-3">
              {form.photoUrl && (
                <img
                  src={form.photoUrl}
                  alt="Teacher preview"
                  className="w-10 h-10 rounded-lg object-cover border border-slate-300 dark:border-slate-700"
                />
              )}
              <label className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                {tr('uploadPhoto')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handlePhotoUpload(e)}
                  className="hidden"
                />
              </label>
              {form.photoUrl && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, photoUrl: '' })}
                  className="text-xs text-red-600 hover:underline"
                >
                  {tr('removePhoto')}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              {tr('assignedClasses')}
            </label>
            {classes.length === 0 ? (
              <p className="text-xs text-slate-500">{tr('noData')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {classes.map((cls) => (
                  <label
                    key={cls._id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={form.assignedClasses.includes(cls._id)}
                      onChange={() => toggleClass(cls._id)}
                    />
                    <span className="truncate">{cls.name}</span>
                  </label>
                ))}
              </div>
            )}
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
