import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Printer, Trash2, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { Modal } from '../components/ui/Modal';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import { BulkTimetableImportModal } from '../components/timetable/BulkTimetableImportModal';
import type { Classroom, SchoolDay, Teacher, TimetableSlot } from '../types';

const DAYS: SchoolDay[] = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];

export function TimetablePage() {
  const { user, settings } = useAuth();
  const { tr } = useTheme();
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    classId: '',
    dayOfWeek: 'Saturday' as SchoolDay,
    periodNumber: 1,
    startTime: '08:00',
    endTime: '08:45',
    subject: '',
    teacherId: '',
    room: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = selectedClassId ? `?classId=${encodeURIComponent(selectedClassId)}` : '';
      const [slotList, classList, teacherList] = await Promise.all([
        apiRequest<TimetableSlot[]>(`/api/timetable${qs}`),
        !isStudent ? apiRequest<Classroom[]>('/api/classes') : Promise.resolve([] as Classroom[]),
        isAdmin ? apiRequest<Teacher[]>('/api/teachers') : Promise.resolve([] as Teacher[]),
      ]);
      setSlots(slotList);
      setClasses(classList);
      setTeachers(teacherList);
      if (!selectedClassId && !isStudent && classList.length > 0 && isAdmin) {
        setSelectedClassId(classList[0]._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timetable.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, isStudent, isAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const dayLabel = (d: SchoolDay) => {
    if (d === 'Saturday') return tr('daySaturday');
    if (d === 'Sunday') return tr('daySunday');
    if (d === 'Monday') return tr('dayMonday');
    if (d === 'Tuesday') return tr('dayTuesday');
    return tr('dayWednesday');
  };

  const openPeriodModal = (day?: SchoolDay, period?: number, existing?: TimetableSlot) => {
    const targetCls =
      existing && typeof existing.classId === 'object'
        ? existing.classId._id
        : selectedClassId || classes[0]?._id || '';
    const matchedClass = classes.find((c) => c._id === targetCls);

    setForm({
      classId: targetCls,
      dayOfWeek: existing?.dayOfWeek || day || 'Saturday',
      periodNumber: existing?.periodNumber || period || 1,
      startTime: existing?.startTime || '08:00',
      endTime: existing?.endTime || '08:45',
      subject: existing?.subject || matchedClass?.subjects?.[0] || '',
      teacherId:
        existing?.teacherId && typeof existing.teacherId === 'object'
          ? existing.teacherId._id
          : '',
      room: existing?.room || '',
    });
    setModalOpen(true);
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/timetable', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save period.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = async (id: string) => {
    try {
      await apiRequest(`/api/timetable/${id}`, { method: 'DELETE' });
      setSlots((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete period.');
    }
  };

  const maxPeriod = Math.max(6, ...slots.map((s) => s.periodNumber));
  const periods = isAdmin
    ? Array.from({ length: maxPeriod }, (_, i) => i + 1)
    : Array.from(new Set(slots.map((s) => s.periodNumber))).sort((a, b) => a - b);

  const selectedClassObj = classes.find((c) => c._id === form.classId);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3">
          {!isStudent && classes.length > 0 && (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">{tr('allClasses')}</option>
              {classes.map((cls) => (
                <option key={cls._id} value={cls._id}>
                  {cls.name} ({cls.academicYear})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>{tr('printTimetable')}</span>
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                disabled={classes.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
                <span>{tr('excelImport')}</span>
              </button>
              <button
                type="button"
                onClick={() => openPeriodModal()}
                disabled={classes.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('addPeriod')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 no-print">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 print-container">
        <div className="hidden print:flex items-center gap-3 border-b border-slate-200 pb-3 mb-4">
          <SchoolCrest className="w-9 h-9" logoUrl={settings?.schoolLogoUrl} />
          <div>
            <div className="font-display font-bold text-base">{settings?.schoolName}</div>
            <div className="text-xs text-slate-500">
              {tr('timetableTitle')} · {classes.find((c) => c._id === selectedClassId)?.name || ''}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">{tr('loading')}</div>
        ) : periods.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">{tr('noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-semibold w-16">{tr('periodNumber')}</th>
                  {DAYS.map((day) => (
                    <th key={day} className="px-3 py-2.5 font-semibold min-w-[140px]">
                      {dayLabel(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {periods.map((pNum) => (
                  <tr key={pNum}>
                    <td className="px-3 py-3 font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30">
                      {pNum}
                    </td>
                    {DAYS.map((day) => {
                      const matching = slots.filter(
                        (s) => s.dayOfWeek === day && s.periodNumber === pNum
                      );
                      return (
                        <td key={day} className="px-3 py-2.5 align-top border-l border-slate-200 dark:border-slate-800">
                          {matching.length === 0 ? (
                            isAdmin ? (
                              <button
                                type="button"
                                onClick={() => openPeriodModal(day, pNum)}
                                className="w-full text-left text-slate-400 hover:text-[#0F294A] dark:hover:text-blue-400 py-1 no-print"
                              >
                                + {tr('add')}
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">-</span>
                            )
                          ) : (
                            <div className="space-y-2">
                              {matching.map((slot) => {
                                const clsName =
                                  typeof slot.classId === 'object' ? slot.classId.name : '';
                                const tchName =
                                  slot.teacherId && typeof slot.teacherId === 'object'
                                    ? slot.teacherId.fullName
                                    : '';
                                return (
                                  <div key={slot._id} className="group relative">
                                    <div className="font-semibold text-slate-900 dark:text-white">
                                      {slot.subject}
                                    </div>
                                    <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                                      {slot.startTime}–{slot.endTime}
                                    </div>
                                    {!selectedClassId && clsName && (
                                      <div className="text-[11px] font-medium text-[#0F294A] dark:text-blue-400">
                                        {clsName}
                                      </div>
                                    )}
                                    {tchName && (
                                      <div className="text-[11px] text-slate-500">{tchName}</div>
                                    )}
                                    {slot.room && (
                                      <div className="text-[11px] text-slate-400">{slot.room}</div>
                                    )}
                                    {isAdmin && (
                                      <div className="mt-1 flex items-center gap-2 no-print">
                                        <button
                                          type="button"
                                          onClick={() => openPeriodModal(day, pNum, slot)}
                                          className="text-[11px] text-[#0F294A] dark:text-blue-400 hover:underline"
                                        >
                                          {tr('edit')}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleDeleteSlot(slot._id)}
                                          className="text-[11px] text-red-600 hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={tr('addPeriod')}>
        <form onSubmit={handleSaveSlot} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('classLabel')}
              </label>
              <select
                required
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
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
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('dayOfWeek')}
              </label>
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value as SchoolDay })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('periodNumber')}
              </label>
              <input
                type="number"
                required
                min={1}
                max={12}
                value={form.periodNumber}
                onChange={(e) => setForm({ ...form, periodNumber: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('subject')}
              </label>
              <input
                type="text"
                required
                list="timetable-subjects"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
              <datalist id="timetable-subjects">
                {(selectedClassObj?.subjects || []).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('startTime')}
              </label>
              <input
                type="time"
                required
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('endTime')}
              </label>
              <input
                type="time"
                required
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('roleTeacher')}
              </label>
              <select
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">-- {tr('unassigned')} --</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('classroomRoom')}
              </label>
              <input
                type="text"
                placeholder="Room 101"
                value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
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

      {isAdmin && (
        <BulkTimetableImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={loadData}
          classes={classes}
          teachers={teachers}
        />
      )}
    </div>
  );
}
