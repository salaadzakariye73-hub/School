export type Language = 'en' | 'so';
export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | 'accountant';
export type StudentStatus = 'Active' | 'Inactive' | 'Graduated' | 'Transferred';
export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';
export type PaymentMethod = 'Cash' | 'EVC Plus' | 'Zaad' | 'Sahal' | 'Bank Transfer';
export type AnnouncementTarget = 'all' | 'student' | 'teacher' | 'parent' | 'accountant' | 'class';
export type AnnouncementCategory = 'Notice' | 'Holiday' | 'Exam' | 'Update';
export type SchoolDay = 'Saturday' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday';
export type HomeworkStatus = 'Assigned' | 'Completed' | 'Reviewed';
export type ExpenseCategory = 'Salaries' | 'Utilities' | 'Supplies' | 'Maintenance' | 'Rent' | 'Other';

export interface GradeRule {
  grade: string;
  minPercent: number;
  remarkEn: string;
  remarkSo: string;
}

export interface SchoolSettings {
  _id?: string;
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolLogoUrl?: string;
  academicYear: string;
  currencyCode: string;
  currencySymbol: string;
  gradingScale: GradeRule[];
}

export interface AuthUser {
  _id: string;
  name: string;
  username?: string;
  email?: string;
  role: UserRole;
  teacherRef?: string | null;
  studentRef?: string | null;
  childrenRefs?: string[];
}

export interface ManagedUser extends Omit<AuthUser, 'teacherRef' | 'studentRef' | 'childrenRefs'> {
  active: boolean;
  createdAt?: string;
  teacherRef?: {
    _id: string;
    teacherId: string;
    fullName: string;
    assignedClasses?: Array<{ _id: string; name: string }>;
  } | null;
  studentRef?: {
    _id: string;
    studentId: string;
    fullName: string;
    classId?: { _id: string; name: string } | string;
  } | null;
  childrenRefs?: Array<{
    _id: string;
    studentId: string;
    fullName: string;
    classId?: { _id: string; name: string } | string;
  }>;
}

export interface Announcement {
  _id: string;
  title: string;
  content: string;
  category?: AnnouncementCategory;
  targetRole: AnnouncementTarget;
  targetClassId?: { _id: string; name: string } | string | null;
  eventDate?: string;
  authorName: string;
  createdAt: string;
}

export interface TeacherRef {
  _id: string;
  teacherId: string;
  fullName: string;
  phone: string;
  email: string;
}

export interface Classroom {
  _id: string;
  name: string;
  academicYear: string;
  classTeacherId?: TeacherRef | string | null;
  subjects: string[];
  tuitionFee: number;
  studentCount?: number;
}

export interface Teacher {
  _id: string;
  teacherId: string;
  fullName: string;
  phone: string;
  email: string;
  photoUrl?: string;
  assignedSubjects: string[];
  assignedClasses: Array<{ _id: string; name: string; academicYear: string }>;
  status: 'Active' | 'Inactive';
}

export interface PromotionRecord {
  fromYear: string;
  fromClassName: string;
  toYear: string;
  toClassName: string;
  promotedAt: string;
}

export interface Student {
  _id: string;
  studentId: string;
  fullName: string;
  gender: 'Male' | 'Female';
  dateOfBirth: string;
  parentName: string;
  parentPhone: string;
  address?: string;
  photoUrl?: string;
  classId: { _id: string; name: string; academicYear: string; tuitionFee: number; subjects?: string[] } | string;
  academicYear: string;
  admissionDate: string;
  status: StudentStatus;
  customFeeOverride?: number | null;
  promotionHistory?: PromotionRecord[];
}

export interface AttendanceRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  status: AttendanceStatus;
  note: string;
}

export interface FeeSummaryRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  parentName: string;
  parentPhone: string;
  classId: string;
  className: string;
  totalFee: number;
  paidAmount: number;
  remainingBalance: number;
  feeStatus: 'Paid' | 'Partial' | 'Unpaid';
  lastPaymentDate: string | null;
}

export interface FeePayment {
  _id: string;
  receiptNumber: string;
  studentId: {
    _id: string;
    studentId: string;
    fullName: string;
    parentName: string;
    parentPhone: string;
    customFeeOverride?: number | null;
  };
  classId: {
    _id: string;
    name: string;
    tuitionFee: number;
  };
  academicYear: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes: string;
  recordedByName: string;
}

export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  todayAttendanceRate: number;
  todayPresent: number;
  todayMarked: number;
  totalFeesCollected: number;
  outstandingFees: number;
  totalExpenses?: number;
  netBalance?: number;
  attendanceTrend: Array<{
    date: string;
    label: string;
    present: number;
    total: number;
    rate: number;
  }>;
  feeByClass: Array<{
    className: string;
    collected: number;
    outstanding: number;
  }>;
}

export interface TimetableSlot {
  _id: string;
  classId: { _id: string; name: string; academicYear: string } | string;
  dayOfWeek: SchoolDay;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: string;
  teacherId?: { _id: string; teacherId: string; fullName: string } | string | null;
  room?: string;
}

export interface HomeworkItem {
  _id: string;
  classId: { _id: string; name: string; academicYear: string } | string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  status: HomeworkStatus;
  assignedByName: string;
  createdAt?: string;
}

export interface ExpenseItem {
  _id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  recordedByName: string;
}

export interface AcademicTerm {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface AcademicYearItem {
  _id: string;
  name: string;
  isCurrent: boolean;
  status: 'Active' | 'Archived';
  terms: AcademicTerm[];
}

export interface StudentPortalOverview {
  student: Student;
  classroom: Classroom | null;
  settings: SchoolSettings;
  attendanceSummary: {
    Present: number;
    Absent: number;
    Late: number;
    Excused: number;
    total: number;
    rate: number;
  };
  attendanceRecords: Array<{
    date: string;
    status: AttendanceStatus;
    note: string;
  }>;
  reportCards: Array<{
    examName: string;
    subjects: Array<{
      subject: string;
      score: number | null;
      maxMarks: number;
      percentage: number | null;
      grade: string;
      remarkEn: string;
      remarkSo: string;
    }>;
    summary: {
      totalScore: number;
      totalPossible: number;
      average: number;
      percentage: number;
      grade: string;
      remarkEn: string;
      remarkSo: string;
    };
  }>;
  feeSummary: {
    totalFee: number;
    paidAmount: number;
    remainingBalance: number;
    feeStatus: 'Paid' | 'Partial' | 'Unpaid';
    payments: FeePayment[];
  };
  homework?: HomeworkItem[];
  examSchedules?: ExamScheduleItem[];
  announcements: Announcement[];
}

export interface ParentPortalChildOverview {
  student: Student;
  classroom: Classroom | null;
  attendanceSummary: {
    Present: number;
    Absent: number;
    Late: number;
    Excused: number;
    total: number;
    rate: number;
  };
  attendanceRecords: Array<{
    date: string;
    status: AttendanceStatus;
    note: string;
  }>;
  reportCards: StudentPortalOverview['reportCards'];
  feeSummary: StudentPortalOverview['feeSummary'];
  homework: HomeworkItem[];
  timetable: TimetableSlot[];
  examSchedules?: ExamScheduleItem[];
}

export interface ParentPortalOverview {
  settings: SchoolSettings;
  children: ParentPortalChildOverview[];
  announcements: Announcement[];
}

export type ExaminationStatus = 'Upcoming' | 'Ongoing' | 'Completed';

export interface Examination {
  _id: string;
  name: string;
  academicYear: string;
  term: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  description: string;
  status: ExaminationStatus;
  scheduleCount?: number;
}

export interface ExaminationDashboardStats {
  totalExaminations: number;
  upcomingExaminations: number;
  ongoingExaminations: number;
  completedExaminations: number;
  totalScheduledClasses: number;
  totalScheduledSubjects: number;
  totalAssignedInvigilators: number;
}

export interface ExamScheduleItem {
  _id: string;
  examinationId:
    | {
        _id: string;
        name: string;
        academicYear: string;
        term: string;
        startDate: string;
        endDate: string;
        status: ExaminationStatus;
      }
    | string;
  classId: { _id: string; name: string; academicYear: string } | string;
  subject: string;
  examDate: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  invigilatorId: { _id: string; teacherId: string; fullName: string; phone?: string } | string;
  room: string;
  notes: string;
}

export type ExamResultImportStatus = 'valid' | 'duplicate' | 'invalid';

export interface ExamResultImportRow {
  rowNumber: number;
  studentId: string;
  studentName: string;
  className: string;
  academicYear: string;
  term: string;
  examName: string;
  subject: string;
  totalMarks: string;
  marksObtained: string;
  rowStatus: ExamResultImportStatus;
  errors: string[];
  warnings: string[];
  matchedStudentObjectId: string | null;
  matchedClassId: string | null;
  matchedExaminationId: string | null;
  canonicalSubject: string;
  canonicalExamName: string;
  canonicalAcademicYear: string;
  canonicalTerm: string;
  numericTotalMarks: number | null;
  numericMarksObtained: number | null;
}

export interface ExamResultImportSummary {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  warnings: number;
}

export interface ExamResultImportUploadResponse {
  fileName: string;
  headersDetected: string[];
  rows: ExamResultImportRow[];
  summary: ExamResultImportSummary;
  examinations: Array<{ _id: string; name: string; academicYear: string; term: string }>;
  classrooms: Array<{ _id: string; name: string; subjects: string[] }>;
}

export interface ExamResultImportCommitResponse {
  totalProcessed: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  failedCount: number;
  rejectedRows: ExamResultImportRow[];
}

export type BulkRowValidationStatus = 'valid' | 'duplicate' | 'invalid';

export interface BulkImportRow {
  rowNumber: number;
  studentId: string;
  fullName: string;
  gender: string;
  className: string;
  parentName: string;
  parentPhone: string;
  address: string;
  dateOfBirth: string;
  admissionDate: string;
  status: string;
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  matchedClassId: string | null;
  matchedClassName: string;
  academicYear: string;
  normalizedGender: 'Male' | 'Female' | null;
  normalizedStatus: StudentStatus;
}

export interface BulkImportValidationSummary {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  warnings: number;
}

export interface BulkImportUploadResponse {
  fileName: string;
  headersDetected: string[];
  rows: BulkImportRow[];
  summary: BulkImportValidationSummary;
  availableClasses: Array<{ _id: string; name: string; academicYear: string }>;
}

export interface BulkImportValidateResponse {
  rows: BulkImportRow[];
  summary: BulkImportValidationSummary;
  availableClasses: Array<{ _id: string; name: string; academicYear: string }>;
}

export interface BulkImportCommitResponse {
  totalProcessed: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  failedCount: number;
  rejectedRows: BulkImportRow[];
}

export interface BulkClassImportRow {
  rowNumber: number;
  name: string;
  academicYear: string;
  classTeacher: string;
  subjectsText: string;
  tuitionFee: string;
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  matchedTeacherId: string | null;
  matchedTeacherLabel: string;
  parsedSubjects: string[];
  numericTuitionFee: number;
}

export interface BulkClassImportUploadResponse {
  fileName: string;
  headersDetected: string[];
  rows: BulkClassImportRow[];
  summary: BulkImportValidationSummary;
  availableTeachers: Array<{ _id: string; teacherId: string; fullName: string; email: string }>;
}

export interface BulkClassImportValidateResponse {
  rows: BulkClassImportRow[];
  summary: BulkImportValidationSummary;
  availableTeachers: Array<{ _id: string; teacherId: string; fullName: string; email: string }>;
}

export interface BulkClassImportCommitResponse {
  totalProcessed: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  failedCount: number;
  rejectedRows: BulkClassImportRow[];
}

export interface BulkTeacherImportRow {
  rowNumber: number;
  teacherId: string;
  fullName: string;
  phone: string;
  email: string;
  subjectsText: string;
  classesText: string;
  status: string;
  rowStatus: BulkRowValidationStatus;
  errors: string[];
  warnings: string[];
  parsedSubjects: string[];
  matchedClassIds: string[];
  matchedClassNames: string[];
  normalizedStatus: 'Active' | 'Inactive';
}

export interface BulkTeacherImportUploadResponse {
  fileName: string;
  headersDetected: string[];
  rows: BulkTeacherImportRow[];
  summary: BulkImportValidationSummary;
  availableClasses: Array<{ _id: string; name: string; academicYear: string }>;
}

export interface BulkTeacherImportValidateResponse {
  rows: BulkTeacherImportRow[];
  summary: BulkImportValidationSummary;
  availableClasses: Array<{ _id: string; name: string; academicYear: string }>;
}

export interface BulkTeacherImportCommitResponse {
  totalProcessed: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  failedCount: number;
  rejectedRows: BulkTeacherImportRow[];
}
