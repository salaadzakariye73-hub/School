import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  BookMarked,
  ClipboardCheck,
  FileSpreadsheet,
  Wallet,
  CreditCard,
  CalendarRange,
  Printer,
  Settings,
  UserCircle,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { SchoolCrest } from '../ui/SchoolCrest';
import type { UserRole } from '../../types';
import type { TranslationKey } from '../../i18n/translations';

export type NavTabId =
  | 'dashboard'
  | 'students'
  | 'teachers'
  | 'classes'
  | 'timetable'
  | 'homework'
  | 'attendance'
  | 'exams'
  | 'fees'
  | 'idCards'
  | 'academicYears'
  | 'reports'
  | 'settings'
  | 'profile'
  | 'myProfile'
  | 'myAttendance'
  | 'myResults'
  | 'myFees'
  | 'childTimetable'
  | 'childHomework'
  | 'childAttendance'
  | 'childResults'
  | 'childFees';

type NavGroupId = 'overview' | 'academics' | 'operations' | 'portal' | 'account';

interface NavItem {
  id: NavTabId;
  group: NavGroupId;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    group: 'overview',
    labelKey: 'navDashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'teacher', 'student', 'parent', 'accountant'],
  },

  // Staff Academics
  { id: 'students', group: 'academics', labelKey: 'navStudents', icon: GraduationCap, roles: ['admin', 'teacher', 'accountant'] },
  { id: 'teachers', group: 'academics', labelKey: 'navTeachers', icon: Users, roles: ['admin'] },
  { id: 'classes', group: 'academics', labelKey: 'navClasses', icon: BookOpen, roles: ['admin', 'teacher'] },
  { id: 'timetable', group: 'academics', labelKey: 'navTimetable', icon: CalendarDays, roles: ['admin', 'teacher', 'student'] },
  { id: 'homework', group: 'academics', labelKey: 'navHomework', icon: BookMarked, roles: ['admin', 'teacher', 'student'] },
  { id: 'attendance', group: 'academics', labelKey: 'navAttendance', icon: ClipboardCheck, roles: ['admin', 'teacher'] },
  { id: 'exams', group: 'academics', labelKey: 'navExams', icon: FileSpreadsheet, roles: ['admin', 'teacher'] },

  // Staff Finance, Records & System
  { id: 'fees', group: 'operations', labelKey: 'navFees', icon: Wallet, roles: ['admin', 'accountant'] },
  { id: 'idCards', group: 'operations', labelKey: 'navIdCardsCerts', icon: CreditCard, roles: ['admin'] },
  { id: 'academicYears', group: 'operations', labelKey: 'navAcademicYears', icon: CalendarRange, roles: ['admin'] },
  { id: 'reports', group: 'operations', labelKey: 'navReports', icon: Printer, roles: ['admin', 'teacher', 'accountant'] },
  { id: 'settings', group: 'operations', labelKey: 'navSettings', icon: Settings, roles: ['admin'] },

  // Student-only navigation
  { id: 'myProfile', group: 'portal', labelKey: 'navMyProfile', icon: GraduationCap, roles: ['student'] },
  { id: 'myAttendance', group: 'portal', labelKey: 'navMyAttendance', icon: ClipboardCheck, roles: ['student'] },
  { id: 'myResults', group: 'portal', labelKey: 'navMyResults', icon: FileSpreadsheet, roles: ['student'] },
  { id: 'myFees', group: 'portal', labelKey: 'navMyFees', icon: Wallet, roles: ['student'] },

  // Parent-only navigation
  { id: 'childTimetable', group: 'portal', labelKey: 'navChildTimetable', icon: CalendarDays, roles: ['parent'] },
  { id: 'childHomework', group: 'portal', labelKey: 'navChildHomework', icon: BookMarked, roles: ['parent'] },
  { id: 'childAttendance', group: 'portal', labelKey: 'navChildAttendance', icon: ClipboardCheck, roles: ['parent'] },
  { id: 'childResults', group: 'portal', labelKey: 'navChildResults', icon: FileSpreadsheet, roles: ['parent'] },
  { id: 'childFees', group: 'portal', labelKey: 'navChildFees', icon: Wallet, roles: ['parent'] },

  // Shared Account / Password page
  {
    id: 'profile',
    group: 'account',
    labelKey: 'navProfile',
    icon: UserCircle,
    roles: ['admin', 'teacher', 'student', 'parent', 'accountant'],
  },
];

const GROUP_ORDER: NavGroupId[] = ['overview', 'academics', 'operations', 'portal', 'account'];

interface AppShellProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  children: React.ReactNode;
}

export function AppShell({ activeTab, onSelectTab, children }: AppShellProps) {
  const { user, settings, logout } = useAuth();
  const { theme, toggleTheme, lang, setLang, tr } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const currentItem = visibleNav.find((item) => item.id === activeTab) || visibleNav[0];

  const roleLabel =
    user.role === 'admin'
      ? tr('roleAdmin')
      : user.role === 'teacher'
      ? tr('roleTeacher')
      : user.role === 'student'
      ? tr('roleStudent')
      : user.role === 'parent'
      ? tr('roleParent')
      : tr('roleAccountant');

  const groupHeading = (group: NavGroupId) => {
    if (group === 'overview') return null;
    if (group === 'academics') return lang === 'so' ? 'Waxbarashada' : 'Academics';
    if (group === 'operations') return lang === 'so' ? 'Maaliyadda & Maamulka' : 'Finance & Admin';
    if (group === 'portal') return lang === 'so' ? 'Xogta Gaarka ah' : 'Portal';
    return lang === 'so' ? 'Akoonka' : 'Account';
  };

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'U';

  const handleNavClick = (id: NavTabId) => {
    onSelectTab(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-[2px] lg:hidden no-print"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-68 bg-gradient-to-b from-[#0F294A] via-[#0C2240] to-[#08172E] text-white flex flex-col border-r border-white/10 transform transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <SchoolCrest className="w-7 h-7" logoUrl={settings?.schoolLogoUrl} />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm tracking-tight text-white truncate">
                {settings?.schoolName || tr('appName')}
              </div>
              <div className="text-[11px] font-mono text-slate-300/80 truncate">
                {settings?.academicYear || '2026-2027'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {GROUP_ORDER.map((group) => {
            const items = visibleNav.filter((item) => item.group === group);
            if (items.length === 0) return null;
            const heading = groupHeading(group);
            return (
              <div key={group} className="space-y-1">
                {heading && (
                  <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300/60">
                    {heading}
                  </div>
                )}
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-[#0F294A] font-semibold shadow-sm'
                          : 'text-slate-200/90 font-medium hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-[#0F294A]' : 'text-slate-300/85'
                        }`}
                      />
                      <span className="truncate">{tr(item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-white/10 space-y-2.5 bg-black/15">
          <div className="flex items-center gap-3 px-1.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/15 flex items-center justify-center text-xs font-display font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-white truncate">{user.name}</div>
              <div className="text-slate-300/80 truncate">{roleLabel}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{tr('signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {currentItem ? tr(currentItem.labelKey) : tr('navDashboard')}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Language Switcher */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/90 dark:bg-slate-800">
              <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mx-1.5 hidden sm:block" />
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'en'
                    ? 'bg-[#0F294A] text-white dark:bg-blue-600 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('so')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'so'
                    ? 'bg-[#0F294A] text-white dark:bg-blue-600 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                SO
              </button>
            </div>

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto print:p-0 print:max-w-none saas-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
