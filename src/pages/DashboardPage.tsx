import React, { useCallback, useEffect, useState } from 'react';
import {
  GraduationCap,
  Users,
  BookOpen,
  ClipboardCheck,
  Wallet,
  AlertCircle,
  TrendingDown,
  Scale,
  Megaphone,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { formatMoney } from '../utils/export';
import { Modal } from '../components/ui/Modal';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementTarget,
  Classroom,
  DashboardStats,
} from '../types';

export function DashboardPage() {
  const { user, settings } = useAuth();
  const { tr } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin announcement modal
  const [annOpen, setAnnOpen] = useState(false);
  const [annForm, setAnnForm] = useState({
    title: '',
    content: '',
    category: 'Notice' as AnnouncementCategory,
    targetRole: 'all' as AnnouncementTarget,
    targetClassId: '',
    eventDate: '',
  });
  const [postingAnn, setPostingAnn] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashData, annData, classData] = await Promise.all([
        apiRequest<DashboardStats>('/api/dashboard'),
        apiRequest<Announcement[]>('/api/announcements'),
        user?.role === 'admin'
          ? apiRequest<Classroom[]>('/api/classes')
          : Promise.resolve([] as Classroom[]),
      ]);
      setStats(dashData);
      setAnnouncements(annData);
      setClasses(classData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostingAnn(true);
    try {
      await apiRequest('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: annForm.title,
          content: annForm.content,
          category: annForm.category,
          targetRole: annForm.targetRole,
          targetClassId: annForm.targetRole === 'class' ? annForm.targetClassId : null,
          eventDate: annForm.eventDate,
        }),
      });
      setAnnOpen(false);
      setAnnForm({
        title: '',
        content: '',
        category: 'Notice',
        targetRole: 'all',
        targetClassId: classes[0]?._id || '',
        eventDate: '',
      });
      const annData = await apiRequest<Announcement[]>('/api/announcements');
      setAnnouncements(annData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post announcement.');
    } finally {
      setPostingAnn(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await apiRequest(`/api/announcements/${id}`, { method: 'DELETE' });
      setAnnouncements((prev) => prev.filter((a) => a._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete announcement.');
    }
  };

  const categoryLabel = (cat?: AnnouncementCategory) => {
    if (cat === 'Holiday') return tr('catHoliday');
    if (cat === 'Exam') return tr('catExam');
    if (cat === 'Update') return tr('catUpdate');
    return tr('catNotice');
  };

  const targetLabel = (ann: Announcement) => {
    if (ann.targetRole === 'class') {
      const cName = typeof ann.targetClassId === 'object' ? ann.targetClassId?.name : '';
      return cName ? `${tr('classLabel')}: ${cName}` : tr('specificClassOnly');
    }
    if (ann.targetRole === 'student') return tr('studentsOnly');
    if (ann.targetRole === 'teacher') return tr('teachersOnly');
    if (ann.targetRole === 'parent') return tr('parentsOnly');
    if (ann.targetRole === 'accountant') return tr('accountantsOnly');
    return tr('allUsers');
  };

  const symbol = settings?.currencySymbol || '$';
  const code = settings?.currencyCode || 'USD';
  const showFinancials = user?.role === 'admin' || user?.role === 'accountant';

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <div
            key={n}
            className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse p-5"
          />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
        {error || tr('noData')}
      </div>
    );
  }

  const cards = [
    {
      label: tr('totalStudents'),
      value: stats.totalStudents.toLocaleString(),
      sub: tr('active'),
      icon: GraduationCap,
      visible: true,
    },
    {
      label: tr('totalTeachers'),
      value: stats.totalTeachers.toLocaleString(),
      sub: tr('active'),
      icon: Users,
      visible: user?.role === 'admin',
    },
    {
      label: tr('totalClasses'),
      value: stats.totalClasses.toLocaleString(),
      sub: settings?.academicYear || '2026-2027',
      icon: BookOpen,
      visible: true,
    },
    {
      label: tr('todayAttendance'),
      value: `${stats.todayAttendanceRate}%`,
      sub:
        stats.todayMarked > 0
          ? `${stats.todayPresent}/${stats.todayMarked} ${tr('studentsMarkedToday')}`
          : tr('noAttendanceToday'),
      icon: ClipboardCheck,
      visible: user?.role !== 'accountant',
    },
    {
      label: tr('totalFeesCollected'),
      value: formatMoney(stats.totalFeesCollected, symbol, code),
      sub: tr('collected'),
      icon: Wallet,
      visible: showFinancials,
    },
    {
      label: tr('outstandingFees'),
      value: formatMoney(stats.outstandingFees, symbol, code),
      sub: tr('outstanding'),
      icon: AlertCircle,
      visible: showFinancials,
    },
    {
      label: tr('totalExpenses'),
      value: formatMoney(stats.totalExpenses || 0, symbol, code),
      sub: tr('expensesTab'),
      icon: TrendingDown,
      visible: showFinancials,
    },
    {
      label: tr('netBalance'),
      value: formatMoney(stats.netBalance ?? stats.totalFeesCollected, symbol, code),
      sub: tr('collected'),
      icon: Scale,
      visible: showFinancials,
    },
  ].filter((c) => c.visible);

  const maxFeeValue = Math.max(
    1,
    ...stats.feeByClass.map((f) => f.collected + f.outstanding)
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          cards.length >= 7 || cards.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        } gap-4`}
      >
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {card.value}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                  {card.sub}
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0F294A] dark:text-blue-400 shrink-0">
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {user?.role !== 'accountant' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
              {tr('attendanceLast7Days')}
            </h2>
            <div className="h-52 flex items-end justify-between gap-2 pt-4">
              {stats.attendanceTrend.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {day.total > 0 ? `${day.rate}%` : '-'}
                  </div>
                  <div className="w-full max-w-[36px] bg-slate-100 dark:bg-slate-800 rounded-t-md h-32 flex items-end overflow-hidden">
                    <div
                      className="w-full bg-[#0F294A] dark:bg-blue-500 rounded-t-md transition-all"
                      style={{ height: `${day.total > 0 ? Math.max(6, day.rate) : 0}%` }}
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {day.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showFinancials && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {tr('feeBreakdownByClass')}
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#0F294A] dark:bg-blue-500 inline-block" />
                  {tr('collected')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                  {tr('outstanding')}
                </span>
              </div>
            </div>

            {stats.feeByClass.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                {tr('noData')}
              </div>
            ) : (
              <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                {stats.feeByClass.map((row) => {
                  const collectedPct = Math.round((row.collected / maxFeeValue) * 100);
                  const outstandingPct = Math.round((row.outstanding / maxFeeValue) * 100);
                  return (
                    <div key={row.className} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {row.className}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatMoney(row.collected, symbol, code)} /{' '}
                          {formatMoney(row.collected + row.outstanding, symbol, code)}
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                        <div
                          className="h-full bg-[#0F294A] dark:bg-blue-500"
                          style={{ width: `${collectedPct}%` }}
                        />
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${outstandingPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* School Announcements */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#0F294A] dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {tr('announcementsTitle')}
            </h2>
          </div>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setAnnForm({
                  title: '',
                  content: '',
                  category: 'Notice',
                  targetRole: 'all',
                  targetClassId: classes[0]?._id || '',
                  eventDate: '',
                });
                setAnnOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-xs font-medium whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr('addAnnouncement')}</span>
            </button>
          )}
        </div>

        {announcements.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{tr('noAnnouncements')}</p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {announcements.map((ann) => (
              <div key={ann._id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {ann.title}
                    </span>
                    <span className="text-[11px] font-mono uppercase tracking-wide text-[#0F294A] dark:text-blue-400">
                      [{categoryLabel(ann.category)}
                      {ann.eventDate ? ` · ${ann.eventDate}` : ''}]
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                    {ann.content}
                  </p>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {ann.authorName} · {ann.createdAt.slice(0, 10)} · {targetLabel(ann)}
                  </div>
                </div>
                {user?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteAnnouncement(ann._id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                    title={tr('delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Announcement Modal */}
      <Modal
        open={annOpen}
        onClose={() => setAnnOpen(false)}
        title={tr('addAnnouncement')}
      >
        <form onSubmit={handlePostAnnouncement} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('announcementTitle')}
            </label>
            <input
              type="text"
              required
              value={annForm.title}
              onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('announcementCategory')}
              </label>
              <select
                value={annForm.category}
                onChange={(e) =>
                  setAnnForm({ ...annForm, category: e.target.value as AnnouncementCategory })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Notice">{tr('catNotice')}</option>
                <option value="Holiday">{tr('catHoliday')}</option>
                <option value="Exam">{tr('catExam')}</option>
                <option value="Update">{tr('catUpdate')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('eventDateOptional')}
              </label>
              <input
                type="date"
                value={annForm.eventDate}
                onChange={(e) => setAnnForm({ ...annForm, eventDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('targetAudience')}
              </label>
              <select
                value={annForm.targetRole}
                onChange={(e) =>
                  setAnnForm({ ...annForm, targetRole: e.target.value as AnnouncementTarget })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="all">{tr('allUsers')}</option>
                <option value="student">{tr('studentsOnly')}</option>
                <option value="teacher">{tr('teachersOnly')}</option>
                <option value="parent">{tr('parentsOnly')}</option>
                <option value="accountant">{tr('accountantsOnly')}</option>
                <option value="class">{tr('specificClassOnly')}</option>
              </select>
            </div>

            {annForm.targetRole === 'class' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr('selectClass')}
                </label>
                <select
                  required
                  value={annForm.targetClassId}
                  onChange={(e) => setAnnForm({ ...annForm, targetClassId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">-- {tr('selectClass')} --</option>
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tr('announcementBody')}
            </label>
            <textarea
              rows={4}
              required
              value={annForm.content}
              onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setAnnOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={postingAnn}
              className="px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {postingAnn ? tr('loading') : tr('postAnnouncement')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
