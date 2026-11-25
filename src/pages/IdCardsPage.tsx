import { useCallback, useEffect, useState } from 'react';
import { Printer, CreditCard, Award } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { SchoolCrest } from '../components/ui/SchoolCrest';
import type { Classroom, Student, Teacher } from '../types';

export function IdCardsPage() {
  const { settings } = useAuth();
  const { lang, tr } = useTheme();

  const [tab, setTab] = useState<'idCards' | 'certificates'>('idCards');
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ID Cards state
  const [cardTarget, setCardTarget] = useState<'students' | 'teachers'>('students');
  const [classFilter, setClassFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('ALL');

  // Certificate state
  const [certType, setCertType] = useState<'completion' | 'transfer'>('completion');
  const [certStudentId, setCertStudentId] = useState('');
  const [certDate, setCertDate] = useState(new Date().toISOString().slice(0, 10));
  const [certReason, setCertReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stuList, tchList, clsList] = await Promise.all([
        apiRequest<Student[]>('/api/students'),
        apiRequest<Teacher[]>('/api/teachers'),
        apiRequest<Classroom[]>('/api/classes'),
      ]);
      setStudents(stuList);
      setTeachers(tchList);
      setClasses(clsList);
      if (stuList.length > 0 && !certStudentId) {
        setCertStudentId(stuList[0]._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load records.');
    } finally {
      setLoading(false);
    }
  }, [certStudentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredStudents = students.filter((s) => {
    const cid = typeof s.classId === 'object' ? s.classId._id : s.classId;
    if (classFilter && cid !== classFilter) return false;
    if (personFilter !== 'ALL' && s._id !== personFilter) return false;
    return true;
  });

  const filteredTeachers = teachers.filter((t) => {
    if (personFilter !== 'ALL' && t._id !== personFilter) return false;
    return true;
  });

  const certStudent = students.find((s) => s._id === certStudentId) || null;
  const certClassName =
    certStudent && typeof certStudent.classId === 'object' ? certStudent.classId.name : '-';

  const initials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 no-print">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('idCards')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'idCards'
                ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>{tr('idCardsTab')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('certificates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'certificates'
                ? 'bg-[#0F294A] text-white dark:bg-blue-600'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>{tr('certificatesTab')}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F294A] hover:bg-[#173966] dark:bg-blue-600 text-white text-sm font-medium whitespace-nowrap"
        >
          <Printer className="w-4 h-4" />
          <span>{tab === 'idCards' ? tr('printIdCards') : tr('printCertificate')}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 no-print">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">{tr('loading')}</div>
      ) : tab === 'idCards' ? (
        <div className="space-y-5">
          {/* Controls */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3 no-print">
            <select
              value={cardTarget}
              onChange={(e) => {
                setCardTarget(e.target.value as 'students' | 'teachers');
                setPersonFilter('ALL');
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="students">{tr('studentIdCards')}</option>
              <option value="teachers">{tr('teacherIdCards')}</option>
            </select>

            {cardTarget === 'students' && (
              <select
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value);
                  setPersonFilter('ALL');
                }}
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

            <select
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="ALL">{tr('selectAllPeople')}</option>
              {cardTarget === 'students'
                ? students
                    .filter((s) => {
                      const cid = typeof s.classId === 'object' ? s.classId._id : s.classId;
                      return !classFilter || cid === classFilter;
                    })
                    .map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.studentId} — {s.fullName}
                      </option>
                    ))
                : teachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.teacherId} — {t.fullName}
                    </option>
                  ))}
            </select>
          </div>

          {/* Printable ID Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-container">
            {cardTarget === 'students' ? (
              filteredStudents.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-sm text-slate-500">
                  {tr('noData')}
                </div>
              ) : (
                filteredStudents.map((stu) => {
                  const clsName = typeof stu.classId === 'object' ? stu.classId.name : '-';
                  return (
                    <div
                      key={stu._id}
                      className="bg-white dark:bg-slate-900 border-2 border-[#0F294A] rounded-xl overflow-hidden shadow-xs break-inside-avoid"
                    >
                      <div className="bg-[#0F294A] text-white px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <SchoolCrest className="w-8 h-8 shrink-0" logoUrl={settings?.schoolLogoUrl} />
                          <div className="min-w-0">
                            <div className="font-display font-bold text-sm truncate">
                              {settings?.schoolName}
                            </div>
                            <div className="text-[10px] text-blue-200 truncate">
                              {settings?.schoolAddress} · {settings?.schoolPhone}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-blue-100 shrink-0">
                          {tr('roleStudent')} ID
                        </span>
                      </div>

                      <div className="p-4 flex items-center gap-4">
                        {stu.photoUrl ? (
                          <img
                            src={stu.photoUrl}
                            alt={stu.fullName}
                            className="w-20 h-24 rounded-lg object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-24 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-display font-bold text-lg text-[#0F294A] dark:text-blue-300 shrink-0">
                            {initials(stu.fullName)}
                          </div>
                        )}

                        <div className="min-w-0 space-y-1 text-xs flex-1">
                          <div className="font-display font-bold text-base text-slate-900 dark:text-white truncate">
                            {stu.fullName}
                          </div>
                          <div>
                            <span className="text-slate-500">{tr('studentId')}: </span>
                            <span className="font-mono font-semibold tabular-nums">{stu.studentId}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">{tr('classLabel')}: </span>
                            <span className="font-medium">{clsName}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">{tr('academicYear')}: </span>
                            <span className="font-mono tabular-nums">{stu.academicYear}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">{tr('parentPhone')}: </span>
                            <span className="font-mono tabular-nums">{stu.parentPhone}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : filteredTeachers.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-sm text-slate-500">
                {tr('noData')}
              </div>
            ) : (
              filteredTeachers.map((tch) => (
                <div
                  key={tch._id}
                  className="bg-white dark:bg-slate-900 border-2 border-[#0F294A] rounded-xl overflow-hidden shadow-xs break-inside-avoid"
                >
                  <div className="bg-[#0F294A] text-white px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SchoolCrest className="w-8 h-8 shrink-0" logoUrl={settings?.schoolLogoUrl} />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-sm truncate">
                          {settings?.schoolName}
                        </div>
                        <div className="text-[10px] text-blue-200 truncate">
                          {settings?.schoolAddress} · {settings?.schoolPhone}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-blue-100 shrink-0">
                      {tr('roleTeacher')} ID
                    </span>
                  </div>

                  <div className="p-4 flex items-center gap-4">
                    {tch.photoUrl ? (
                      <img
                        src={tch.photoUrl}
                        alt={tch.fullName}
                        className="w-20 h-24 rounded-lg object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-24 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-display font-bold text-lg text-[#0F294A] dark:text-blue-300 shrink-0">
                        {initials(tch.fullName)}
                      </div>
                    )}

                    <div className="min-w-0 space-y-1 text-xs flex-1">
                      <div className="font-display font-bold text-base text-slate-900 dark:text-white truncate">
                        {tch.fullName}
                      </div>
                      <div>
                        <span className="text-slate-500">{tr('teacherId')}: </span>
                        <span className="font-mono font-semibold tabular-nums">{tch.teacherId}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-500">{tr('subjects')}: </span>
                        <span>{tch.assignedSubjects.join(', ') || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">{tr('phone')}: </span>
                        <span className="font-mono tabular-nums">{tch.phone}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-500">{tr('email')}: </span>
                        <span>{tch.email}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Certificate Options */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('certificateType')}
              </label>
              <select
                value={certType}
                onChange={(e) => setCertType(e.target.value as 'completion' | 'transfer')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="completion">{tr('completionCertificate')}</option>
                <option value="transfer">{tr('transferCertificate')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('roleStudent')}
              </label>
              <select
                value={certStudentId}
                onChange={(e) => setCertStudentId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.studentId} — {s.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('dateIssued')}
              </label>
              <input
                type="date"
                value={certDate}
                onChange={(e) => setCertDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tr('certificateReason')}
              </label>
              <input
                type="text"
                value={certReason}
                onChange={(e) => setCertReason(e.target.value)}
                placeholder={
                  certType === 'completion'
                    ? 'Good conduct and academic achievement'
                    : 'Family relocation / Transfer requested'
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          {/* Printable Certificate Preview */}
          {!certStudent ? (
            <div className="p-8 text-center text-sm text-slate-500">{tr('noData')}</div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border-4 border-double border-[#0F294A] rounded-xl p-8 sm:p-12 max-w-3xl mx-auto space-y-8 print-container">
              <div className="flex flex-col items-center text-center space-y-2 border-b border-slate-200 dark:border-slate-800 pb-6">
                <SchoolCrest className="w-16 h-16" logoUrl={settings?.schoolLogoUrl} />
                <h2 className="font-display text-2xl font-bold text-[#0F294A] dark:text-white">
                  {settings?.schoolName}
                </h2>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {settings?.schoolAddress} · {settings?.schoolPhone}
                </div>
                <div className="pt-2 font-display text-xl font-bold uppercase tracking-wide text-slate-900 dark:text-white">
                  {certType === 'completion'
                    ? tr('completionCertificate')
                    : tr('transferCertificate')}
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {lang === 'so' ? (
                  certType === 'completion' ? (
                    <p className="text-center text-base">
                      Maamulka <span className="font-semibold">{settings?.schoolName}</span> wuxuu
                      halkaan ku caddaynayaa in ardayga/ardayadda{' '}
                      <span className="font-bold underline">{certStudent.fullName}</span> (Aqoonsiga:{' '}
                      <span className="font-mono font-semibold">{certStudent.studentId}</span>) uu si
                      guul leh u dhammeeyay waxbarashada fasalka{' '}
                      <span className="font-semibold">{certClassName}</span> sanad dugsiyeedka{' '}
                      <span className="font-mono font-semibold">{certStudent.academicYear}</span>.
                    </p>
                  ) : (
                    <p className="text-center text-base">
                      Tani waa Shahaadada Wareejinta rasmiga ah ee ardayga/ardayadda{' '}
                      <span className="font-bold underline">{certStudent.fullName}</span> (Aqoonsiga:{' '}
                      <span className="font-mono font-semibold">{certStudent.studentId}</span>), oo ka
                      tirsanaa fasalka <span className="font-semibold">{certClassName}</span> (Sanadka{' '}
                      <span className="font-mono font-semibold">{certStudent.academicYear}</span>).
                      Ardaygan waa loo oggolaaday inuu u wareego dugsi kale.
                    </p>
                  )
                ) : certType === 'completion' ? (
                  <p className="text-center text-base">
                    This is to certify that{' '}
                    <span className="font-bold underline">{certStudent.fullName}</span> (Student ID:{' '}
                    <span className="font-mono font-semibold">{certStudent.studentId}</span>) has
                    satisfactorily completed the academic requirements in{' '}
                    <span className="font-semibold">{certClassName}</span> during the{' '}
                    <span className="font-mono font-semibold">{certStudent.academicYear}</span>{' '}
                    academic year at <span className="font-semibold">{settings?.schoolName}</span>.
                  </p>
                ) : (
                  <p className="text-center text-base">
                    This official Transfer Certificate confirms that{' '}
                    <span className="font-bold underline">{certStudent.fullName}</span> (Student ID:{' '}
                    <span className="font-mono font-semibold">{certStudent.studentId}</span>) was a
                    enrolled student in <span className="font-semibold">{certClassName}</span> during
                    academic year{' '}
                    <span className="font-mono font-semibold">{certStudent.academicYear}</span> and is
                    cleared to transfer to another institution.
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg text-xs">
                  <div>
                    <div className="text-slate-500">{tr('dateOfBirth')}</div>
                    <div className="font-mono font-semibold">{certStudent.dateOfBirth}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">{tr('admissionDate')}</div>
                    <div className="font-mono font-semibold">{certStudent.admissionDate}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">{tr('parentName')}</div>
                    <div className="font-semibold">{certStudent.parentName}</div>
                  </div>
                </div>

                {certReason.trim() && (
                  <div className="text-center text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{tr('remark')}:</span> {certReason}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-6 pt-10 text-xs text-center text-slate-600 dark:text-slate-300">
                <div>
                  <div className="font-mono font-semibold mb-1">{certDate}</div>
                  <div className="border-t border-slate-400 pt-1">{tr('dateIssued')}</div>
                </div>
                <div>
                  <div className="h-5" />
                  <div className="border-t border-slate-400 pt-1">{tr('schoolStamp')}</div>
                </div>
                <div>
                  <div className="h-5" />
                  <div className="border-t border-slate-400 pt-1">{tr('headteacherSignature')}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
