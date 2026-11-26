import React, { useState } from 'react';
import {
  Sun,
  Moon,
  RefreshCw,
  Database,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Globe,
} from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
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

  const portalHighlights =
    lang === 'so'
      ? [
          'Maamulka Ardayda, Macallimiinta & Fasalada',
          'Xaadirinta Maalinlaha ah & Jadwalka Imtixaanka',
          'EVC Plus, Zaad, Sahal & Rasiidyo Daabacan',
          'Bogga Gaarka ah ee Waalidka & Ardayga',
        ]
      : [
          'Students, Teachers, Classes & Excel Imports',
          'Daily Attendance Locks & Examination Timetables',
          'EVC Plus, Zaad, Sahal & Printable Fee Receipts',
          'Dedicated Portals for Parents & Students',
        ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Utility Bar */}
      <div className="flex items-center justify-between px-4 sm:px-8 py-4 max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <SchoolCrest className="w-9 h-9" />
          <div>
            <div className="font-display font-bold text-base sm:text-lg text-[#0F294A] dark:text-white leading-tight">
              {tr('appName')}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              {tr('schoolPortal')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
            <Globe className="w-3.5 h-3.5 text-slate-400 mx-1.5 hidden sm:block" />
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Centered Split Stage */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/5 dark:shadow-black/40 saas-fade-in">
          {/* Left Architectural Brand Column */}
          <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-8 bg-gradient-to-br from-[#0F294A] via-[#13325B] to-[#081A33] text-white relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />

            <div className="relative space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                <SchoolCrest className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-mono uppercase tracking-widest text-blue-200/80">
                  {tr('schoolPortal')}
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight leading-snug text-white">
                  {tr('appName')}
                </h1>
                <p className="text-sm text-slate-200/85 leading-relaxed">
                  {lang === 'so'
                    ? 'Nidaam casri ah oo fudud, ammaan ah, loona dhisay dugsiyada Soomaaliya.'
                    : 'Clean, role-based academic, attendance, examination, and fee operations built for schools in Somalia.'}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {portalHighlights.map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-slate-100/90">
                    <CheckCircle2 className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative pt-6 border-t border-white/15 text-xs text-slate-300/80 flex items-center justify-between gap-2">
              <span>{lang === 'so' ? 'Af-Soomaali & English' : 'Somali & English'}</span>
              <span className="font-mono">EVC · Zaad · Sahal</span>
            </div>
          </div>

          {/* Right Form Panel */}
          <div className="lg:col-span-7 p-6 sm:p-9 flex flex-col justify-center">
            {checkingStatus ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                {tr('loading')}
              </div>
            ) : !dbStatus?.dbConfigured || !dbStatus?.dbConnected ? (
              <div className="space-y-4">
                <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300">
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
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 break-words">
                    {dbStatus.dbError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void checkStatus()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{tr('retryConnection')}</span>
                </button>
              </div>
            ) : dbStatus.needsSetup ? (
              <form onSubmit={handleSetup} className="space-y-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-[#0F294A] dark:text-blue-300">
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
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
                    {tr('schoolNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
                    {tr('fullName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ahmed Hassan"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
                    {tr('email')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@school.so"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
                    {tr('password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
                >
                  {submitting ? tr('loading') : tr('createAdminBtn')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#0F294A] dark:text-blue-400 shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                      {tr('loginTitle')}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                      {tr('loginSubtitle')}
                    </p>
                  </div>
                </div>

                {/* 5 Separate Role Access Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
                  {roleTabs.map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => {
                        setSelectedRole(item.role);
                        setError(null);
                      }}
                      className={`px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        selectedRole === item.role
                          ? 'bg-[#0F294A] text-white dark:bg-blue-600 shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
                    {tr('password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm"
                >
                  {submitting ? tr('signingIn') : tr('signIn')}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
