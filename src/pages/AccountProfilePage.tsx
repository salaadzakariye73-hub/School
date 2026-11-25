import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import type { AuthUser, Teacher } from '../types';

export function AccountProfilePage() {
  const { user, updateUserState } = useAuth();
  const { tr } = useTheme();

  const isReadOnlyProfile = user?.role === 'student' || user?.role === 'parent';
  const isTeacher = user?.role === 'teacher';

  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [teacherProfile, setTeacherProfile] = useState<Teacher | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ user: AuthUser; teacherProfile: Teacher | null }>('/api/auth/profile')
      .then((res) => {
        setName(res.user.name || '');
        setUsername(res.user.username || '');
        setEmail(res.user.email || '');
        if (res.teacherProfile) {
          setTeacherProfile(res.teacherProfile);
          setPhone(res.teacherProfile.phone || '');
        }
      })
      .catch(() => {
        // ignore initial profile fetch errors
      });
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErr(null);
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ user: AuthUser; teacherProfile: Teacher | null }>(
        '/api/auth/profile',
        {
          method: 'PUT',
          body: JSON.stringify({ name, username, email, phone }),
        }
      );
      updateUserState(res.user);
      if (res.teacherProfile) setTeacherProfile(res.teacherProfile);
      setProfileMsg(tr('profileUpdated'));
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr(null);
    setPwdMsg(null);
    setSavingPwd(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setPwdMsg(tr('passwordUpdated'));
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Profile Details (editable by Staff/Teachers; read-only summary for Students) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
          {tr('myAccountTitle')}
        </h2>

        {profileErr && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {profileErr}
          </div>
        )}
        {profileMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300">
            {profileMsg}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('fullName')}
            </label>
            <input
              type="text"
              required
              disabled={isReadOnlyProfile}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('username')}
            </label>
            <input
              type="text"
              disabled={isReadOnlyProfile}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('email')}
            </label>
            <input
              type="email"
              disabled={isReadOnlyProfile}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-60"
            />
          </div>

          {isTeacher && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('phone')}
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          )}

          {!isReadOnlyProfile && (
            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {savingProfile ? tr('loading') : tr('updateProfile')}
            </button>
          )}
        </form>

        {isTeacher && teacherProfile && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-sm">
            <div className="text-xs font-semibold text-slate-500">
              {tr('teacherAssignedClassesTitle')}
            </div>
            <div>
              {teacherProfile.assignedClasses.length > 0
                ? teacherProfile.assignedClasses.map((c) => c.name).join(', ')
                : tr('unassigned')}
            </div>
            {teacherProfile.assignedSubjects.length > 0 && (
              <div className="text-xs text-slate-500">
                {tr('assignedSubjects')}: {teacherProfile.assignedSubjects.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
          {tr('changeOwnPassword')}
        </h2>

        {pwdErr && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {pwdErr}
          </div>
        )}
        {pwdMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300">
            {pwdMsg}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('currentPassword')}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('newPassword')}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={savingPwd}
            className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
          >
            {savingPwd ? tr('loading') : tr('changeOwnPassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
