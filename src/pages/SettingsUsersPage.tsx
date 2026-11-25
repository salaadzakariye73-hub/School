import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, KeyRound, Power, Download, Upload, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { resizeImageFileToDataUrl } from '../utils/image';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import type {
  Classroom,
  GradeRule,
  ManagedUser,
  SchoolSettings,
  Student,
  Teacher,
  UserRole,
} from '../types';

interface ParsedBackup {
  backupVersion?: number;
  exportedAt?: string;
  collections: {
    students?: unknown[];
    teachers?: unknown[];
    classrooms?: unknown[];
    [key: string]: unknown;
  };
}

export function SettingsUsersPage() {
  const { user: currentUser, settings, updateSettingsState } = useAuth();
  const { tr } = useTheme();

  const [tab, setTab] = useState<'users' | 'school' | 'backup'>('users');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // User Modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [childSearch, setChildSearch] = useState('');
  const [userForm, setUserForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'teacher' as UserRole,
    teacherRef: '',
    studentRef: '',
    childrenRefs: [] as string[],
    studentClassId: '',
    teacherAssignedClasses: [] as string[],
    active: true,
  });

  // Quick Reset Password Modal
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetting, setResetting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  // School settings state
  const [schoolForm, setSchoolForm] = useState<SchoolSettings>({
    schoolName: settings?.schoolName || 'Al-Najax School',
    schoolAddress: settings?.schoolAddress || 'Mogadishu, Somalia',
    schoolPhone: settings?.schoolPhone || '+252 61 000 0000',
    schoolLogoUrl: settings?.schoolLogoUrl || '',
    academicYear: settings?.academicYear || '2026-2027',
    currencyCode: settings?.currencyCode || 'USD',
    currencySymbol: settings?.currencySymbol || '$',
    gradingScale: settings?.gradingScale || [],
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Backup & Restore state
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userList, teacherList, studentList, classList, latestSettings] = await Promise.all([
        apiRequest<ManagedUser[]>('/api/users'),
        apiRequest<Teacher[]>('/api/teachers'),
        apiRequest<Student[]>('/api/students'),
        apiRequest<Classroom[]>('/api/classes'),
        apiRequest<SchoolSettings>('/api/settings'),
      ]);
      setUsers(userList);
      setTeachers(teacherList);
      setStudents(studentList);
      setClasses(classList);
      setSchoolForm(latestSettings);
      updateSettingsState(latestSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, [updateSettingsState]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openAddUser = () => {
    setEditingUser(null);
    setUserFormError(null);
    setChildSearch('');
    setUserForm({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'teacher',
      teacherRef: '',
      studentRef: '',
      childrenRefs: [],
      studentClassId: '',
      teacherAssignedClasses: [],
      active: true,
    });
    setUserModalOpen(true);
  };

  const openEditUser = (u: ManagedUser) => {
    setEditingUser(u);
    setUserFormError(null);
    setChildSearch('');
    const tId = u.teacherRef?._id || '';
    const sId = u.studentRef?._id || '';
    const cIds = Array.isArray(u.childrenRefs) ? u.childrenRefs.map((c) => c._id) : [];
    const matchedTeacher = teachers.find((t) => t._id === tId);
    const matchedStudent = students.find((s) => s._id === sId);
    const sClassId =
      matchedStudent && typeof matchedStudent.classId === 'object'
        ? matchedStudent.classId._id
        : (matchedStudent?.classId as string) || '';

    setUserForm({
      name: u.name,
      username: u.username || '',
      email: u.email || '',
      password: '',
      role: u.role,
      teacherRef: tId,
      studentRef: sId,
      childrenRefs: cIds,
      studentClassId: sClassId,
      teacherAssignedClasses: matchedTeacher
        ? matchedTeacher.assignedClasses.map((c) => c._id)
        : [],
      active: u.active,
    });
    setUserModalOpen(true);
  };

  const handleSelectTeacherProfile = (teacherId: string) => {
    const tch = teachers.find((t) => t._id === teacherId);
    setUserForm((prev) => ({
      ...prev,
      teacherRef: teacherId,
      name: prev.name || tch?.fullName || '',
      email: prev.email || tch?.email || '',
      teacherAssignedClasses: tch ? tch.assignedClasses.map((c) => c._id) : [],
    }));
  };

  const handleSelectStudentProfile = (stuId: string) => {
    const stu = students.find((s) => s._id === stuId);
    const clsId =
      stu && typeof stu.classId === 'object'
        ? stu.classId._id
        : (stu?.classId as string) || '';
    setUserForm((prev) => ({
      ...prev,
      studentRef: stuId,
      name: prev.name || stu?.fullName || '',
      username: prev.username || stu?.studentId || '',
      studentClassId: clsId,
    }));
  };

  const toggleTeacherClass = (classId: string) => {
    setUserForm((prev) => ({
      ...prev,
      teacherAssignedClasses: prev.teacherAssignedClasses.includes(classId)
        ? prev.teacherAssignedClasses.filter((id) => id !== classId)
        : [...prev.teacherAssignedClasses, classId],
    }));
  };

  const toggleParentChild = (studentId: string) => {
    setUserForm((prev) => {
      const exists = prev.childrenRefs.includes(studentId);
      const nextIds = exists
        ? prev.childrenRefs.filter((id) => id !== studentId)
        : [...prev.childrenRefs, studentId];
      const firstChild = students.find((s) => s._id === studentId);
      return {
        ...prev,
        childrenRefs: nextIds,
        name: !prev.name && !exists && firstChild?.parentName ? firstChild.parentName : prev.name,
      };
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    setSavingUser(true);
    try {
      const payload: Record<string, unknown> = {
        name: userForm.name,
        username: userForm.username.trim() || undefined,
        email: userForm.email.trim() || undefined,
        role: userForm.role,
        teacherRef: userForm.role === 'teacher' ? userForm.teacherRef || null : null,
        studentRef: userForm.role === 'student' ? userForm.studentRef || null : null,
        childrenRefs: userForm.role === 'parent' ? userForm.childrenRefs : [],
        studentClassId:
          userForm.role === 'student' && userForm.studentRef
            ? userForm.studentClassId || undefined
            : undefined,
        teacherAssignedClasses:
          userForm.role === 'teacher' && userForm.teacherRef
            ? userForm.teacherAssignedClasses
            : undefined,
        active: userForm.active,
      };
      if (userForm.password.trim()) {
        payload.password = userForm.password;
      }

      if (editingUser) {
        await apiRequest(`/api/users/${editingUser._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setUserModalOpen(false);
      await loadData();
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : 'Failed to save user.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleActive = async (u: ManagedUser) => {
    setError(null);
    try {
      await apiRequest(`/api/users/${u._id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !u.active }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account status.');
    }
  };

  const handleQuickResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || resetPwd.length < 6) return;
    setResetting(true);
    try {
      await apiRequest(`/api/users/${resetTarget._id}`, {
        method: 'PUT',
        body: JSON.stringify({ password: resetPwd }),
      });
      setResetTarget(null);
      setResetPwd('');
      setMessage(tr('passwordUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setResetting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/users/${deleteTarget._id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 256, 0.85);
      setSchoolForm((prev) => ({ ...prev, schoolLogoUrl: dataUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process logo.');
    }
  };

  const updateGradeRule = (idx: number, field: keyof GradeRule, value: string | number) => {
    setSchoolForm((prev) => ({
      ...prev,
      gradingScale: prev.gradingScale.map((g, i) => (i === idx ? { ...g, [field]: value } : g)),
    }));
  };

  const addGradeRule = () => {
    setSchoolForm((prev) => ({
      ...prev,
      gradingScale: [
        ...prev.gradingScale,
        { grade: 'E', minPercent: 40, remarkEn: 'Below Average', remarkSo: 'Dhexdhexaad ka Hoose' },
      ],
    }));
  };

  const removeGradeRule = (idx: number) => {
    setSchoolForm((prev) => ({
      ...prev,
      gradingScale: prev.gradingScale.filter((_, i) => i !== idx),
    }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiRequest<SchoolSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(schoolForm),
      });
      setSchoolForm(updated);
      updateSettingsState(updated);
      setMessage(tr('settingsSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    setError(null);
    setMessage(null);
    try {
      const backup = await apiRequest<Record<string, unknown>>('/api/backup/export');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dugsiga-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download backup.');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    setMessage(null);
    if (!file) {
      setPendingBackup(null);
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ParsedBackup;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !parsed.collections ||
        !Array.isArray(parsed.collections.students) ||
        !Array.isArray(parsed.collections.teachers) ||
        !Array.isArray(parsed.collections.classrooms)
      ) {
        throw new Error('Invalid Dugsiga SMS backup JSON file.');
      }
      setPendingBackup(parsed);
    } catch (err) {
      setPendingBackup(null);
      setError(err instanceof Error ? err.message : 'Invalid backup file.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify({
          confirmOverwrite: true,
          backup: pendingBackup,
        }),
      });
      setConfirmRestoreOpen(false);
      setPendingBackup(null);
      setMessage(tr('backupRestoredMsg'));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup.');
      setConfirmRestoreOpen(false);
    } finally {
      setRestoring(false);
    }
  };

  const roleDisplay = (r: UserRole) =>
    r === 'admin'
      ? tr('roleAdmin')
      : r === 'teacher'
      ? tr('roleTeacher')
      : r === 'student'
      ? tr('roleStudent')
      : r === 'parent'
      ? tr('roleParent')
      : tr('roleAccountant');

  const filteredUsers = roleFilter ? users.filter((u) => u.role === roleFilter) : users;
  const filteredChildOptions = students.filter((s) => {
    if (!childSearch.trim()) return true;
    const q = childSearch.toLowerCase();
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.studentId.toLowerCase().includes(q) ||
      s.parentPhone.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'users'
              ? 'bg-[#0F294A] text-white dark:bg-blue-600'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {tr('usersTab')}
        </button>
        <button
          type="button"
          onClick={() => setTab('school')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'school'
              ? 'bg-[#0F294A] text-white dark:bg-blue-600'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {tr('schoolSettingsTab')}
        </button>
        <button
          type="button"
          onClick={() => setTab('backup')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'backup'
              ? 'bg-[#0F294A] text-white dark:bg-blue-600'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          {tr('backupRestoreTab')}
        </button>
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

      {tab === 'users' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">{tr('all')} ({users.length})</option>
                <option value="admin">{tr('roleAdmin')}</option>
                <option value="teacher">{tr('roleTeacher')}</option>
                <option value="student">{tr('roleStudent')}</option>
                <option value="parent">{tr('roleParent')}</option>
                <option value="accountant">{tr('roleAccountant')}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={openAddUser}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('addUser')}</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{tr('fullName')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('username')} / {tr('email')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('role')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('classLabel')} / {tr('linkedChildren')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('accountStatus')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{tr('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        {tr('loading')}
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        {tr('noData')}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const classInfo =
                        u.role === 'teacher' && u.teacherRef?.assignedClasses?.length
                          ? u.teacherRef.assignedClasses.map((c) => c.name).join(', ')
                          : u.role === 'student' && u.studentRef?.classId && typeof u.studentRef.classId === 'object'
                          ? u.studentRef.classId.name
                          : u.role === 'parent' && u.childrenRefs && u.childrenRefs.length > 0
                          ? u.childrenRefs.map((c) => `${c.fullName} (${c.studentId})`).join(', ')
                          : '-';
                      const isSelf = u._id === currentUser?._id;
                      return (
                        <tr key={u._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-medium">{u.name}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                            {u.username && <div className="font-mono">{u.username}</div>}
                            {u.email && <div>{u.email}</div>}
                          </td>
                          <td className="px-4 py-3">{roleDisplay(u.role)}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                            {classInfo}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            <span
                              className={
                                u.active
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }
                            >
                              {u.active ? tr('active') : tr('disabled')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setResetTarget(u);
                                  setResetPwd('');
                                }}
                                className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                                title={tr('resetPassword')}
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => void handleToggleActive(u)}
                                  className="p-1.5 rounded-md text-slate-600 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-300 dark:hover:text-amber-400 dark:hover:bg-amber-950/40"
                                  title={u.active ? tr('deactivate') : tr('activate')}
                                >
                                  <Power className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditUser(u)}
                                className="p-1.5 rounded-md text-slate-600 hover:text-[#0F294A] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                                title={tr('edit')}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(u)}
                                  className="p-1.5 rounded-md text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-950/40"
                                  title={tr('delete')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
        </div>
      ) : tab === 'school' ? (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <SchoolCrest className="w-16 h-16 shrink-0" logoUrl={schoolForm.schoolLogoUrl} />
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {tr('schoolLogoLabel')}
              </div>
              <div className="flex items-center gap-3">
                <label className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  {tr('uploadLogo')}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleLogoUpload(e)}
                    className="hidden"
                  />
                </label>
                {schoolForm.schoolLogoUrl && (
                  <button
                    type="button"
                    onClick={() => setSchoolForm({ ...schoolForm, schoolLogoUrl: '' })}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {tr('removePhoto')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('schoolNameLabel')}
              </label>
              <input
                type="text"
                required
                value={schoolForm.schoolName}
                onChange={(e) => setSchoolForm({ ...schoolForm, schoolName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('schoolAddress')}
              </label>
              <input
                type="text"
                value={schoolForm.schoolAddress}
                onChange={(e) => setSchoolForm({ ...schoolForm, schoolAddress: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('schoolPhone')}
              </label>
              <input
                type="text"
                value={schoolForm.schoolPhone}
                onChange={(e) => setSchoolForm({ ...schoolForm, schoolPhone: e.target.value })}
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
                value={schoolForm.academicYear}
                onChange={(e) => setSchoolForm({ ...schoolForm, academicYear: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('currencyCode')}
              </label>
              <select
                value={schoolForm.currencyCode}
                onChange={(e) => {
                  const nextCode = e.target.value;
                  const nextSym =
                    nextCode === 'USD' ? '$' : nextCode === 'SOS' ? 'Sh' : nextCode === 'EUR' ? '€' : nextCode;
                  setSchoolForm({
                    ...schoolForm,
                    currencyCode: nextCode,
                    currencySymbol: nextSym,
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="USD">USD ($)</option>
                <option value="SOS">SOS (Somali Shilling)</option>
                <option value="SLSH">SLSH (Somaliland Shilling)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('currencySymbol')}
              </label>
              <input
                type="text"
                required
                value={schoolForm.currencySymbol}
                onChange={(e) => setSchoolForm({ ...schoolForm, currencySymbol: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">{tr('gradingScaleTitle')}</h3>
              <button
                type="button"
                onClick={addGradeRule}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {tr('addGradeRule')}
              </button>
            </div>

            <div className="space-y-2">
              {schoolForm.gradingScale.map((rule, idx) => (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
                  <input
                    type="text"
                    value={rule.grade}
                    onChange={(e) => updateGradeRule(idx, 'grade', e.target.value)}
                    placeholder={tr('grade')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rule.minPercent}
                    onChange={(e) => updateGradeRule(idx, 'minPercent', Number(e.target.value))}
                    placeholder={tr('minPercent')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tabular-nums"
                  />
                  <input
                    type="text"
                    value={rule.remarkEn}
                    onChange={(e) => updateGradeRule(idx, 'remarkEn', e.target.value)}
                    placeholder={tr('remarkEn')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                  <input
                    type="text"
                    value={rule.remarkSo}
                    onChange={(e) => updateGradeRule(idx, 'remarkSo', e.target.value)}
                    placeholder={tr('remarkSo')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeGradeRule(idx)}
                    className="px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-left sm:text-center"
                  >
                    {tr('delete')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {savingSettings ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backup Export */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F294A] dark:text-blue-400">
                <Download className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-semibold">{tr('backupTitle')}</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {tr('backupDesc')}
            </p>
            <button
              type="button"
              onClick={() => void handleDownloadBackup()}
              disabled={downloadingBackup}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{downloadingBackup ? tr('loading') : tr('downloadBackupBtn')}</span>
            </button>
          </div>

          {/* Backup Restore */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-700 dark:text-amber-300">
                <Upload className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-semibold">{tr('restoreTitle')}</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {tr('restoreDesc')}
            </p>

            <div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Upload className="w-4 h-4" />
                <span>{tr('chooseBackupFile')}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => void handleBackupFileSelected(e)}
                  className="hidden"
                />
              </label>
            </div>

            {pendingBackup && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {pendingBackup.exportedAt ? `${tr('generatedOn')}: ${pendingBackup.exportedAt.slice(0, 10)}` : 'Backup Ready'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">{tr('navStudents')}</div>
                    <div className="font-mono font-bold tabular-nums">
                      {pendingBackup.collections.students?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{tr('navTeachers')}</div>
                    <div className="font-mono font-bold tabular-nums">
                      {pendingBackup.collections.teachers?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">{tr('totalClasses')}</div>
                    <div className="font-mono font-bold tabular-nums">
                      {pendingBackup.collections.classrooms?.length || 0}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmRestoreOpen(true)}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                >
                  {tr('restoreConfirmBtn')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Form Modal */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? tr('editUser') : tr('addUser')}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          {userFormError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {userFormError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('role')}
              </label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="teacher">{tr('roleTeacher')}</option>
                <option value="student">{tr('roleStudent')}</option>
                <option value="parent">{tr('roleParent')}</option>
                <option value="accountant">{tr('roleAccountant')}</option>
                <option value="admin">{tr('roleAdmin')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('accountStatus')}
              </label>
              <select
                value={userForm.active ? 'active' : 'disabled'}
                onChange={(e) => setUserForm({ ...userForm, active: e.target.value === 'active' })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="active">{tr('active')}</option>
                <option value="disabled">{tr('disabled')}</option>
              </select>
            </div>
          </div>

          {userForm.role === 'teacher' && (
            <div className="space-y-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('linkTeacherProfile')}
                </label>
                <select
                  value={userForm.teacherRef}
                  onChange={(e) => handleSelectTeacherProfile(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">-- {tr('unassigned')} --</option>
                  {teachers.map((tch) => (
                    <option key={tch._id} value={tch._id}>
                      {tch.fullName} ({tch.teacherId})
                    </option>
                  ))}
                </select>
              </div>

              {userForm.teacherRef && classes.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('assignToClasses')}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {classes.map((cls) => (
                      <label
                        key={cls._id}
                        className="flex items-center gap-2 p-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={userForm.teacherAssignedClasses.includes(cls._id)}
                          onChange={() => toggleTeacherClass(cls._id)}
                        />
                        <span className="truncate">{cls.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {userForm.role === 'student' && (
            <div className="space-y-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('linkStudentProfile')}
                </label>
                <select
                  value={userForm.studentRef}
                  onChange={(e) => handleSelectStudentProfile(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">-- {tr('unassigned')} --</option>
                  {students.map((stu) => (
                    <option key={stu._id} value={stu._id}>
                      {stu.studentId} — {stu.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {userForm.studentRef && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {tr('assignToClass')}
                  </label>
                  <select
                    value={userForm.studentClassId}
                    onChange={(e) => setUserForm({ ...userForm, studentClassId: e.target.value })}
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
              )}
            </div>
          )}

          {userForm.role === 'parent' && (
            <div className="space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {tr('linkChildrenLabel')} ({userForm.childrenRefs.length})
                </label>
                <input
                  type="text"
                  value={childSearch}
                  onChange={(e) => setChildSearch(e.target.value)}
                  placeholder={tr('search')}
                  className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
              <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredChildOptions.map((stu) => (
                  <label
                    key={stu._id}
                    className="flex items-center gap-2 p-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={userForm.childrenRefs.includes(stu._id)}
                      onChange={() => toggleParentChild(stu._id)}
                    />
                    <span className="truncate">
                      {stu.studentId} — {stu.fullName}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('fullName')}
            </label>
            <input
              type="text"
              required
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('username')}
              </label>
              <input
                type="text"
                placeholder={userForm.role === 'student' ? 'STU-2026-001' : 'username'}
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('email')}
              </label>
              <input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('password')}
            </label>
            <input
              type="password"
              required={!editingUser}
              minLength={editingUser && !userForm.password ? undefined : 6}
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              placeholder={editingUser ? tr('newPasswordHint') : ''}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={savingUser}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {savingUser ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Reset Password Modal */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`${tr('resetPassword')} — ${resetTarget?.name || ''}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleQuickResetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('newPassword')}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={resetting}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {resetting ? tr('loading') : tr('save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteUser()}
        loading={deleting}
      />

      <ConfirmModal
        open={confirmRestoreOpen}
        onClose={() => setConfirmRestoreOpen(false)}
        onConfirm={() => void handleConfirmRestore()}
        title={tr('confirmRestoreTitle')}
        message={tr('confirmRestoreMsg')}
        confirmLabel={tr('restoreConfirmBtn')}
        loading={restoring}
      />
    </div>
  );
}
