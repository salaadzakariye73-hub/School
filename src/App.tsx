import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppShell, type NavTabId } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { TeachersPage } from './pages/TeachersPage';
import { ClassesPage } from './pages/ClassesPage';
import { TimetablePage } from './pages/TimetablePage';
import { HomeworkPage } from './pages/HomeworkPage';
import { AttendancePage } from './pages/AttendancePage';
import { ExamsPage } from './pages/ExamsPage';
import { FeesPage } from './pages/FeesPage';
import { IdCardsPage } from './pages/IdCardsPage';
import { AcademicYearsPage } from './pages/AcademicYearsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsUsersPage } from './pages/SettingsUsersPage';
import { StudentPortalPage } from './pages/StudentPortalPage';
import { ParentPortalPage } from './pages/ParentPortalPage';
import { AccountProfilePage } from './pages/AccountProfilePage';

function MainApp() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');

  useEffect(() => {
    setActiveTab('dashboard');
  }, [user?._id]);

  if (!user) {
    return <LoginPage />;
  }

  if (user.role === 'student') {
    const studentSection =
      activeTab === 'myProfile' ||
      activeTab === 'myAttendance' ||
      activeTab === 'myResults' ||
      activeTab === 'myFees'
        ? activeTab
        : 'dashboard';

    return (
      <AppShell activeTab={activeTab} onSelectTab={setActiveTab}>
        {activeTab === 'profile' ? (
          <AccountProfilePage />
        ) : activeTab === 'timetable' ? (
          <TimetablePage />
        ) : activeTab === 'homework' ? (
          <HomeworkPage />
        ) : (
          <StudentPortalPage section={studentSection} />
        )}
      </AppShell>
    );
  }

  if (user.role === 'parent') {
    const parentSection =
      activeTab === 'childTimetable' ||
      activeTab === 'childHomework' ||
      activeTab === 'childAttendance' ||
      activeTab === 'childResults' ||
      activeTab === 'childFees'
        ? activeTab
        : 'dashboard';

    return (
      <AppShell activeTab={activeTab} onSelectTab={setActiveTab}>
        {activeTab === 'profile' ? (
          <AccountProfilePage />
        ) : (
          <ParentPortalPage section={parentSection} />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'students' && <StudentsPage />}
      {activeTab === 'teachers' && user.role === 'admin' && <TeachersPage />}
      {activeTab === 'classes' && (user.role === 'admin' || user.role === 'teacher') && <ClassesPage />}
      {activeTab === 'timetable' && (user.role === 'admin' || user.role === 'teacher') && <TimetablePage />}
      {activeTab === 'homework' && (user.role === 'admin' || user.role === 'teacher') && <HomeworkPage />}
      {activeTab === 'attendance' && (user.role === 'admin' || user.role === 'teacher') && <AttendancePage />}
      {activeTab === 'exams' && (user.role === 'admin' || user.role === 'teacher') && <ExamsPage />}
      {activeTab === 'fees' && (user.role === 'admin' || user.role === 'accountant') && <FeesPage />}
      {activeTab === 'idCards' && user.role === 'admin' && <IdCardsPage />}
      {activeTab === 'academicYears' && user.role === 'admin' && <AcademicYearsPage />}
      {activeTab === 'reports' && <ReportsPage />}
      {activeTab === 'settings' && user.role === 'admin' && <SettingsUsersPage />}
      {activeTab === 'profile' && <AccountProfilePage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
