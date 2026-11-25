import React, { useState } from 'react';
import { Sun, Moon, RefreshCw, Database, ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import type { UserRole } from '../types';

export function LoginPage() {
  const { dbStatus, checkingStatus, checkStatus, login, setupAdmin } = useAuth();
  const { theme, toggleTheme, lang, setLang, tr } = useTheme();

  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [schoolName, setSchoolName] = useState('Al-Najax School');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier.trim(), password, selectedRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setupAdmin({
        schoolName: schoolName.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const roleTabs: Array<{ role: UserRole; label: string }> = [
    { role: 'admin', label: tr('roleAdmin') },
    { role: 'teacher', label: tr('roleTeacher') },
    { role: 'student', label: tr('roleStudent') },
    { role: 'parent', label: tr('roleParent') },
    { role: 'accountant', label: tr('roleAccountant') },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <SchoolCrest className="w-9 h-9" />
          <span className="font-display font-bold text-lg text-[#0F294A] dark:text-white">
            {tr('appName')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                lang === 'en'
                  ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('so')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                lang === 'so'
                  ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              SO
            </button>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm">
          {checkingStatus ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {tr('loading')}
            </div>
          ) : !dbStatus?.dbConfigured || !dbStatus?.dbConnected ? (
            <div className="space-y-4">
              <div className="w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300">
                <Database className="w-5 h-5" />
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {!dbStatus?.dbConfigured
                  ? tr('dbNotConfiguredTitle')
                  : tr('dbDisconnectedTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {tr('dbNotConfiguredDesc')}
              </p>
              {dbStatus?.dbError && (
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 break-words">
                  {dbStatus.dbError}
                </div>
              )}
              <button
                type="button"
                onClick={() => void checkStatus()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{tr('retryConnection')}</span>
              </button>
            </div>
          ) : dbStatus.needsSetup ? (
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-[#0F294A] dark:text-blue-300">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {tr('firstRunTitle')}
                  </h2>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {tr('firstRunDesc')}
              </p>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('schoolNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F294A] dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('fullName')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ahmed Hassan"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F294A] dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('email')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@school.so"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F294A] dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('password')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F294A] dark:focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60 transition-colors"
              >
                {submitting ? tr('loading') : tr('createAdminBtn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#0F294A] dark:text-blue-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {tr('loginTitle')}
                  </h2>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {tr('loginSubtitle')}
              </p>

              {/* 5 Separate Role Access Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {roleTabs.map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(item.role);
                      setError(null);
                    }}
                    className={`px-2.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedRole === item.role
                        ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {selectedRole === 'student'
                    ? tr('loginIdentifierStudent')
                    : selectedRole === 'parent'
                    ? tr('loginIdentifierParent')
                    : tr('loginIdentifierStaff')}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  placeholder={selectedRole === 'student' ? 'STU-2026-001' : 'username or email'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F294A] dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('password')}
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F294A] dark:focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60 transition-colors"
              >
                {submitting ? tr('signingIn') : tr('signIn')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
