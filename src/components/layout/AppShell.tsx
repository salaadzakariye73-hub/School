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

interface NavItem {
  id: NavTabId;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    labelKey: 'navDashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'teacher', 'student', 'parent', 'accountant'],
  },

  // Staff navigation
  { id: 'students', labelKey: 'navStudents', icon: GraduationCap, roles: ['admin', 'teacher', 'accountant'] },
  { id: 'teachers', labelKey: 'navTeachers', icon: Users, roles: ['admin'] },
  { id: 'classes', labelKey: 'navClasses', icon: BookOpen, roles: ['admin', 'teacher'] },
  { id: 'timetable', labelKey: 'navTimetable', icon: CalendarDays, roles: ['admin', 'teacher', 'student'] },
  { id: 'homework', labelKey: 'navHomework', icon: BookMarked, roles: ['admin', 'teacher', 'student'] },
  { id: 'attendance', labelKey: 'navAttendance', icon: ClipboardCheck, roles: ['admin', 'teacher'] },
  { id: 'exams', labelKey: 'navExams', icon: FileSpreadsheet, roles: ['admin', 'teacher'] },
  { id: 'fees', labelKey: 'navFees', icon: Wallet, roles: ['admin', 'accountant'] },
  { id: 'idCards', labelKey: 'navIdCardsCerts', icon: CreditCard, roles: ['admin'] },
  { id: 'academicYears', labelKey: 'navAcademicYears', icon: CalendarRange, roles: ['admin'] },
  { id: 'reports', labelKey: 'navReports', icon: Printer, roles: ['admin', 'teacher', 'accountant'] },
  { id: 'settings', labelKey: 'navSettings', icon: Settings, roles: ['admin'] },

  // Student-only navigation
  { id: 'myProfile', labelKey: 'navMyProfile', icon: GraduationCap, roles: ['student'] },
  { id: 'myAttendance', labelKey: 'navMyAttendance', icon: ClipboardCheck, roles: ['student'] },
  { id: 'myResults', labelKey: 'navMyResults', icon: FileSpreadsheet, roles: ['student'] },
  { id: 'myFees', labelKey: 'navMyFees', icon: Wallet, roles: ['student'] },

  // Parent-only navigation
  { id: 'childTimetable', labelKey: 'navChildTimetable', icon: CalendarDays, roles: ['parent'] },
  { id: 'childHomework', labelKey: 'navChildHomework', icon: BookMarked, roles: ['parent'] },
  { id: 'childAttendance', labelKey: 'navChildAttendance', icon: ClipboardCheck, roles: ['parent'] },
  { id: 'childResults', labelKey: 'navChildResults', icon: FileSpreadsheet, roles: ['parent'] },
  { id: 'childFees', labelKey: 'navChildFees', icon: Wallet, roles: ['parent'] },

  // Shared Account / Password page
  {
    id: 'profile',
    labelKey: 'navProfile',
    icon: UserCircle,
    roles: ['admin', 'teacher', 'student', 'parent', 'accountant'],
  },
];

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

  const handleNavClick = (id: NavTabId) => {
    onSelectTab(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden no-print"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0F294A] text-white flex flex-col border-r border-[#1A3B66] transform transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1D3E69]">
          <div className="flex items-center gap-3 min-w-0">
            <SchoolCrest className="w-8 h-8 shrink-0" logoUrl={settings?.schoolLogoUrl} />
            <span className="font-display font-bold text-base tracking-tight truncate">
              {settings?.schoolName || tr('appName')}
            </span>
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

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-[#0F294A]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{tr(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#1D3E69] space-y-3">
          <div className="text-xs text-slate-300">
            <div className="font-semibold text-white truncate">{user.name}</div>
            <div className="text-slate-300 truncate">{roleLabel}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            <span>{tr('signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {currentItem ? tr(currentItem.labelKey) : tr('navDashboard')}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Language Switcher */}
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
              <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mx-1.5 hidden sm:block" />
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'en'
                    ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('so')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'so'
                    ? 'bg-[#0F294A] text-white dark:bg-blue-600'
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
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto print:p-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
