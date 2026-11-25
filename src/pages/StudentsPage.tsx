import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Eye, Pencil, Trash2, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { formatMoney } from '../utils/export';
import { resizeImageFileToDataUrl } from '../utils/image';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import type { Classroom, Student, StudentStatus } from '../types';

interface StudentProfileData {
  student: Student;
  attendanceSummary: { Present: number; Absent: number; Late: number; Excused: number; total: number };
  examHistory: Array<{
    examName: string;
    subject: string;
    score: number;
    maxMarks: number;
    percentage: number;
    grade: string;
  }>;
  feeSummary: {
    totalFee: number;
    paidAmount: number;
    remainingBalance: number;
  } | null;
}

export function StudentsPage() {
  const { user, settings } = useAuth();
  const { tr } = useTheme();
  const isAdmin = user?.role === 'admin';

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [profileData, setProfileData] = useState<StudentProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [form, setForm] = useState({
    studentId: '',
    fullName: '',
    gender: 'Male' as 'Male' | 'Female',
    dateOfBirth: '',
    parentName: '',
    parentPhone: '',
    classId: '',
    academicYear: settings?.academicYear || '2026-2027',
    admissionDate: new Date().toISOString().slice(0, 10),
    status: 'Active' as StudentStatus,
    customFeeOverride: '',
    photoUrl: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (classFilter) params.set('classId', classFilter);
      if (statusFilter) params.set('status', statusFilter);

      const [studentList, classList] = await Promise.all([
        apiRequest<Student[]>(`/api/students?${params.toString()}`),
        apiRequest<Classroom[]>('/api/classes'),
      ]);
      setStudents(studentList);
      setClasses(classList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [search, classFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openAddModal = () => {
    setEditingStudent(null);
    setFormError(null);
    const nextNum = String(students.length + 1).padStart(3, '0');
    setForm({
      studentId: `STU-${new Date().getFullYear()}-${nextNum}`,
      fullName: '',
      gender: 'Male',
      dateOfBirth: '2012-01-01',
      parentName: '',
      parentPhone: '',
      classId: classes[0]?._id || '',
      academicYear: settings?.academicYear || '2026-2027',
      admissionDate: new Date().toISOString().slice(0, 10),
      status: 'Active',
      customFeeOverride: '',
      photoUrl: '',
    });
    setFormOpen(true);
  };

  const openEditModal = (stu: Student) => {
    setEditingStudent(stu);
    setFormError(null);
    const clsId = typeof stu.classId === 'object' ? stu.classId._id : stu.classId;
    setForm({
      studentId: stu.studentId,
      fullName: stu.fullName,
      gender: stu.gender,
      dateOfBirth: stu.dateOfBirth,
      parentName: stu.parentName,
      parentPhone: stu.parentPhone,
      classId: clsId,
      academicYear: stu.academicYear,
      admissionDate: stu.admissionDate,
      status: stu.status,
      customFeeOverride:
        stu.customFeeOverride !== null && stu.customFeeOverride !== undefined
          ? String(stu.customFeeOverride)
          : '',
      photoUrl: stu.photoUrl || '',
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        customFeeOverride: form.customFeeOverride.trim() === '' ? null : Number(form.customFeeOverride),
      };
      if (editingStudent) {
        await apiRequest(`/api/students/${editingStudent._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save student.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/students/${deleteTarget._id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete student.');
    } finally {
      setDeleting(false);
    }
  };

  const openProfile = async (stu: Student) => {
    setLoadingProfile(true);
    setProfileData(null);
    try {
      const data = await apiRequest<StudentProfileData>(`/api/students/${stu._id}`);
      setProfileData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student profile.');
    } finally {
      setLoadingProfile(false);
    }
  };

  const statusLabel = (s: StudentStatus) => {
    if (s === 'Active') return tr('active');
    if (s === 'Inactive') return tr('inactive');
    if (s === 'Graduated') return tr('graduated');
    return tr('transferred');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('searchStudentsPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F294A] dark:focus:ring-blue-500"
            />
          </div>

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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="">{tr('allStatuses')}</option>
            <option value="Active">{tr('active')}</option>
            <option value="Inactive">{tr('inactive')}</option>
            <option value="Graduated">{tr('graduated')}</option>
            <option value="Transferred">{tr('transferred')}</option>
          </select>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('addStudent')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 no-print">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">{tr('studentId')}</th>
                <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                <th className="px-4 py-3 font-semibold">{tr('gender')}</th>
                <th className="px-4 py-3 font-semibold">{tr('classLabel')}</th>
                <th className="px-4 py-3 font-semibold">{tr('parentName')}</th>
                <th className="px-4 py-3 font-semibold">{tr('parentPhone')}</th>
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
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {tr('noData')}
                  </td>
                </tr>
              ) : (
                students.map((stu) => {
                  const className = typeof stu.classId === 'object' ? stu.classId?.name : '-';
                  return (
                    <tr key={stu._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {stu.studentId}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {stu.fullName}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {stu.gender === 'Male' ? tr('male') : tr('female')}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{className}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{stu.parentName}</td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {stu.parentPhone}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        <span
                          className={
                            stu.status === 'Active'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {statusLabel(stu.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void openProfile(stu)}
                            className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                            title={tr('view')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(stu)}
                                className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                                title={tr('edit')}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(stu)}
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

      {/* Add / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingStudent ? tr('editStudent') : tr('addStudent')}
        maxWidthClass="max-w-2xl"
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
                {tr('studentId')}
              </label>
              <input
                type="text"
                required
                value={form.studentId}
                onChange={(e) => setForm({ ...form, studentId: e.target.value })}
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
                {tr('gender')}
              </label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as 'Male' | 'Female' })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Male">{tr('male')}</option>
                <option value="Female">{tr('female')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('dateOfBirth')}
              </label>
              <input
                type="date"
                required
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('parentName')}
              </label>
              <input
                type="text"
                required
                value={form.parentName}
                onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('parentPhone')}
              </label>
              <input
                type="text"
                required
                placeholder="+252 61 ..."
                value={form.parentPhone}
                onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

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
                <option value="">-- {tr('selectClass')} --</option>
                {classes.map((cls) => (
                  <option key={cls._id} value={cls._id}>
                    {cls.name} ({cls.academicYear})
                  </option>
                ))}
              </select>
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
                {tr('admissionDate')}
              </label>
              <input
                type="date"
                required
                value={form.admissionDate}
                onChange={(e) => setForm({ ...form, admissionDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('status')}
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Active">{tr('active')}</option>
                <option value="Inactive">{tr('inactive')}</option>
                <option value="Graduated">{tr('graduated')}</option>
                <option value="Transferred">{tr('transferred')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('customFeeOverride')}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.customFeeOverride}
                onChange={(e) => setForm({ ...form, customFeeOverride: e.target.value })}
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
                    alt="Student preview"
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

      {/* Profile Modal (Printable) */}
      <Modal
        open={Boolean(profileData) || loadingProfile}
        onClose={() => setProfileData(null)}
        title={tr('studentProfile')}
        maxWidthClass="max-w-2xl"
      >
        {loadingProfile ? (
          <div className="py-8 text-center text-sm text-slate-500">{tr('loading')}</div>
        ) : profileData ? (
          <div className="space-y-6 print-container">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <SchoolCrest className="w-10 h-10" logoUrl={settings?.schoolLogoUrl} />
                <div>
                  <div className="font-display font-bold text-base text-slate-900 dark:text-white">
                    {settings?.schoolName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {settings?.schoolAddress} · {settings?.schoolPhone}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {profileData.student.photoUrl && (
                  <img
                    src={profileData.student.photoUrl}
                    alt={profileData.student.fullName}
                    className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                  />
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-xs font-medium no-print"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{tr('printProfile')}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">{tr('studentId')}</div>
                <div className="font-mono font-semibold">{profileData.student.studentId}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('fullName')}</div>
                <div className="font-semibold">{profileData.student.fullName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('gender')}</div>
                <div>{profileData.student.gender === 'Male' ? tr('male') : tr('female')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('dateOfBirth')}</div>
                <div className="font-mono">{profileData.student.dateOfBirth}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('classLabel')}</div>
                <div>
                  {typeof profileData.student.classId === 'object'
                    ? profileData.student.classId.name
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('academicYear')}</div>
                <div className="font-mono">{profileData.student.academicYear}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('parentName')}</div>
                <div>{profileData.student.parentName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('parentPhone')}</div>
                <div className="font-mono">{profileData.student.parentPhone}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{tr('admissionDate')}</div>
                <div className="font-mono">{profileData.student.admissionDate}</div>
              </div>
            </div>

            {/* Attendance Summary */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <h3 className="font-display text-sm font-semibold mb-2">{tr('attendanceSummary')}</h3>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className="text-slate-500">{tr('present')}</div>
                  <div className="font-mono font-bold text-base tabular-nums">
                    {profileData.attendanceSummary.Present}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className="text-slate-500">{tr('absent')}</div>
                  <div className="font-mono font-bold text-base tabular-nums">
                    {profileData.attendanceSummary.Absent}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className="text-slate-500">{tr('late')}</div>
                  <div className="font-mono font-bold text-base tabular-nums">
                    {profileData.attendanceSummary.Late}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className="text-slate-500">{tr('excused')}</div>
                  <div className="font-mono font-bold text-base tabular-nums">
                    {profileData.attendanceSummary.Excused}
                  </div>
                </div>
              </div>
            </div>

            {/* Fee Summary if permitted */}
            {profileData.feeSummary && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <h3 className="font-display text-sm font-semibold mb-2">{tr('feeSummary')}</h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <div className="text-xs text-slate-500">{tr('totalFee')}</div>
                    <div className="font-mono font-semibold tabular-nums">
                      {formatMoney(
                        profileData.feeSummary.totalFee,
                        settings?.currencySymbol,
                        settings?.currencyCode
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <div className="text-xs text-slate-500">{tr('paidAmount')}</div>
                    <div className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatMoney(
                        profileData.feeSummary.paidAmount,
                        settings?.currencySymbol,
                        settings?.currencyCode
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <div className="text-xs text-slate-500">{tr('remainingBalance')}</div>
                    <div className="font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                      {formatMoney(
                        profileData.feeSummary.remainingBalance,
                        settings?.currencySymbol,
                        settings?.currencyCode
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Exam History */}
            {profileData.examHistory.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <h3 className="font-display text-sm font-semibold mb-2">{tr('examHistory')}</h3>
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="py-1.5">{tr('examName')}</th>
                      <th className="py-1.5">{tr('subject')}</th>
                      <th className="py-1.5 text-right">{tr('score')}</th>
                      <th className="py-1.5 text-right">{tr('grade')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {profileData.examHistory.map((ex, i) => (
                      <tr key={i}>
                        <td className="py-1.5">{ex.examName}</td>
                        <td className="py-1.5">{ex.subject}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {ex.score}/{ex.maxMarks} ({ex.percentage}%)
                        </td>
                        <td className="py-1.5 text-right font-semibold">{ex.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Academic Promotion History */}
            {profileData.student.promotionHistory && profileData.student.promotionHistory.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <h3 className="font-display text-sm font-semibold mb-2">{tr('promotionHistoryTitle')}</h3>
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="py-1.5">{tr('fromClass')}</th>
                      <th className="py-1.5">{tr('toClass')}</th>
                      <th className="py-1.5 text-right">{tr('selectDate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {profileData.student.promotionHistory.map((p, i) => (
                      <tr key={i}>
                        <td className="py-1.5">
                          {p.fromClassName} ({p.fromYear})
                        </td>
                        <td className="py-1.5 font-medium">
                          {p.toClassName} ({p.toYear})
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{p.promotedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
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
