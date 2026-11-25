import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { Classroom, HomeworkItem, HomeworkStatus } from '../types';

export function HomeworkPage() {
  const { user } = useAuth();
  const { tr } = useTheme();
  const canEdit = user?.role === 'admin' || user?.role === 'teacher';

  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HomeworkItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    classId: '',
    subject: '',
    title: '',
    description: '',
    dueDate: new Date().toISOString().slice(0, 10),
    status: 'Assigned' as HomeworkStatus,
  });

  const [deleteTarget, setDeleteTarget] = useState<HomeworkItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = classFilter ? `?classId=${encodeURIComponent(classFilter)}` : '';
      const [hwRes, classRes] = await Promise.all([
        apiRequest<HomeworkItem[]>(`/api/homework${qs}`),
        canEdit ? apiRequest<Classroom[]>('/api/classes') : Promise.resolve([] as Classroom[]),
      ]);
      setHomeworkList(hwRes);
      setClasses(classRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load homework.');
    } finally {
      setLoading(false);
    }
  }, [classFilter, canEdit]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    const firstClass = classes[0];
    setForm({
      classId: classFilter || firstClass?._id || '',
      subject: firstClass?.subjects?.[0] || '',
      title: '',
      description: '',
      dueDate: new Date().toISOString().slice(0, 10),
      status: 'Assigned',
    });
    setModalOpen(true);
  };

  const openEdit = (hw: HomeworkItem) => {
    setEditing(hw);
    setForm({
      classId: typeof hw.classId === 'object' ? hw.classId._id : hw.classId,
      subject: hw.subject,
      title: hw.title,
      description: hw.description,
      dueDate: hw.dueDate,
      status: hw.status,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiRequest(`/api/homework/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiRequest('/api/homework', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save homework.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (hw: HomeworkItem, nextStatus: HomeworkStatus) => {
    try {
      const updated = await apiRequest<HomeworkItem>(`/api/homework/${hw._id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setHomeworkList((prev) => prev.map((item) => (item._id === hw._id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/homework/${deleteTarget._id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete homework.');
    } finally {
      setDeleting(false);
    }
  };

  const statusText = (s: HomeworkStatus) =>
    s === 'Reviewed' ? tr('hwReviewed') : s === 'Completed' ? tr('hwCompleted') : tr('hwAssigned');

  const selectedClass = classes.find((c) => c._id === form.classId);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {canEdit && classes.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">{tr('allClasses')}</option>
              {classes.map((cls) => (
                <option key={cls._id} value={cls._id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openAdd}
            disabled={classes.length === 0}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('assignHomework')}</span>
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
                <th className="px-4 py-3 font-semibold">{tr('classLabel')}</th>
                <th className="px-4 py-3 font-semibold">{tr('subject')}</th>
                <th className="px-4 py-3 font-semibold">{tr('homeworkName')}</th>
                <th className="px-4 py-3 font-semibold">{tr('dueDate')}</th>
                <th className="px-4 py-3 font-semibold">{tr('assignedBy')}</th>
                <th className="px-4 py-3 font-semibold">{tr('status')}</th>
                {canEdit && <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-slate-500">
                    {tr('loading')}
                  </td>
                </tr>
              ) : homeworkList.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-slate-500">
                    {tr('noData')}
                  </td>
                </tr>
              ) : (
                homeworkList.map((hw) => {
                  const className = typeof hw.classId === 'object' ? hw.classId.name : '-';
                  return (
                    <tr key={hw._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium">{className}</td>
                      <td className="px-4 py-3">{hw.subject}</td>
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
                          {statusText(hw.status)}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            {hw.status === 'Assigned' && (
                              <button
                                type="button"
                                onClick={() => void handleUpdateStatus(hw, 'Completed')}
                                className="p-1.5 rounded-md text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-blue-950/40"
                                title={tr('markCompleted')}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {hw.status !== 'Reviewed' && (
                              <button
                                type="button"
                                onClick={() => void handleUpdateStatus(hw, 'Reviewed')}
                                className="p-1.5 rounded-md text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-300 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/40"
                                title={tr('markReviewed')}
                              >
                                <ClipboardCheck className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEdit(hw)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                              title={tr('edit')}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(hw)}
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? tr('editHomework') : tr('assignHomework')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('classLabel')}
              </label>
              <select
                required
                disabled={Boolean(editing)}
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-60"
              >
                {classes.map((cls) => (
                  <option key={cls._id} value={cls._id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('subject')}
              </label>
              <input
                type="text"
                required
                list="homework-subjects"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
              <datalist id="homework-subjects">
                {(selectedClass?.subjects || []).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('homeworkName')}
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('dueDate')}
              </label>
              <input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          {editing && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('status')}
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as HomeworkStatus })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Assigned">{tr('hwAssigned')}</option>
                <option value="Completed">{tr('hwCompleted')}</option>
                <option value="Reviewed">{tr('hwReviewed')}</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('homeworkDescription')}
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
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
