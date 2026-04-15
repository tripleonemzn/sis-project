import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Toaster } from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { GlobalErrorBoundary } from "./components/common/GlobalErrorBoundary";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { authService } from "./services/auth.service";
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage").then(m => ({ default: m.RegisterPage })));

type SisWindow = Window & {
  __SIS_SLIDESHOW_SETTINGS__?: Record<string, unknown>;
};
const TutorDashboardPage = lazy(() => import("./pages/tutor/TutorDashboardPage").then(m => ({ default: m.TutorDashboardPage })));
const TutorMembersPage = lazy(() => import("./pages/tutor/TutorMembersPage").then(m => ({ default: m.TutorMembersPage })));
const TutorInventoryPage = lazy(() => import("./pages/tutor/TutorInventoryPage").then(m => ({ default: m.TutorInventoryPage })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const UserList = lazy(() => import("./pages/admin/users/UserList").then(m => ({ default: m.UserList })));
const TeacherManagementPage = lazy(() => import("./pages/admin/users/TeacherManagementPage").then(m => ({ default: m.TeacherManagementPage })));
const StudentManagementPage = lazy(() => import("./pages/admin/users/StudentManagementPage").then(m => ({ default: m.StudentManagementPage })));
const TeacherAssignmentPage = lazy(() => import("./pages/admin/users/TeacherAssignmentPage").then(m => ({ default: m.TeacherAssignmentPage })));
const UserVerificationPage = lazy(() => import("./pages/admin/users/UserVerificationPage").then(m => ({ default: m.UserVerificationPage })));
const ImportExportPage = lazy(() => import("./pages/admin/users/ImportExportPage").then(m => ({ default: m.ImportExportPage })));
const AcademicYearPage = lazy(() => import("./pages/admin/academic/AcademicYearPage").then(m => ({ default: m.AcademicYearPage })));
const AttendanceRecapPage = lazy(() => import("./pages/admin/academic/AttendanceRecapPage").then(m => ({ default: m.AttendanceRecapPage })));
const AcademicCalendarPage = lazy(() => import("./pages/admin/academic/AcademicCalendarPage").then(m => ({ default: m.AcademicCalendarPage })));
const SchedulePage = lazy(() => import("./pages/admin/academic/SchedulePage").then(m => ({ default: m.SchedulePage })));
const KkmPage = lazy(() => import("./pages/admin/academic/KkmPage").then(m => ({ default: m.KkmPage })));
const TeachingLoadSummaryPage = lazy(() => import("./pages/admin/academic/TeachingLoadSummaryPage").then(m => ({ default: m.TeachingLoadSummaryPage })));
const MajorPage = lazy(() => import("./pages/admin/master/MajorPage").then(m => ({ default: m.MajorPage })));
const SubjectPage = lazy(() => import("./pages/admin/master/SubjectPage").then(m => ({ default: m.SubjectPage })));
const SubjectCategoryPage = lazy(() => import("./pages/admin/master/SubjectCategoryPage").then(m => ({ default: m.SubjectCategoryPage })));
const ClassPage = lazy(() => import("./pages/admin/master/ClassPage").then(m => ({ default: m.ClassPage })));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard").then(m => ({ default: m.TeacherDashboard })));
const TeacherSchedulePage = lazy(() => import("./pages/teacher/TeacherSchedulePage").then(m => ({ default: m.TeacherSchedulePage })));
const WorkProgramPage = lazy(() => import("./pages/teacher/WorkProgramPage").then(m => ({ default: m.WorkProgramPage })));
const MyClassesPage = lazy(() => import("./pages/teacher/MyClassesPage").then(m => ({ default: m.MyClassesPage })));
const TeacherClassStudentsPage = lazy(() => import("./pages/teacher/classes/TeacherClassStudentsPage").then(m => ({ default: m.TeacherClassStudentsPage })));
const TeacherPlaceholderPage = lazy(() => import("./pages/teacher/TeacherPlaceholderPage"));
const TeacherHomeroomPage = lazy(() => import("./pages/teacher/TeacherHomeroomPage").then(m => ({ default: m.TeacherHomeroomPage })));
const TeacherBpBkPage = lazy(() => import("./pages/teacher/TeacherBpBkPage").then(m => ({ default: m.TeacherBpBkPage })));
const TeacherAttendanceListPage = lazy(() => import("./pages/teacher/TeacherAttendanceListPage").then(m => ({ default: m.TeacherAttendanceListPage })));
const TeacherAttendancePage = lazy(() => import("./pages/teacher/TeacherAttendancePage").then(m => ({ default: m.TeacherAttendancePage })));
const TeacherGradesPage = lazy(() => import("./pages/teacher/TeacherGradesPage").then(m => ({ default: m.TeacherGradesPage })));
const TeacherSubjectReportPage = lazy(() => import("./pages/teacher/TeacherSubjectReportPage").then(m => ({ default: m.TeacherSubjectReportPage })));
const AssignmentSubmissionsPage = lazy(() =>
  import("./pages/teacher/AssignmentSubmissionsPage").then(m => ({ default: m.AssignmentSubmissionsPage })),
);
const InternshipApprovalPage = lazy(() => import("./pages/teacher/internship/InternshipApprovalPage").then(m => ({ default: m.InternshipApprovalPage })));
const TeacherInternshipGuidance = lazy(() => import("./pages/teacher/internship/TeacherInternshipGuidance").then(m => ({ default: m.TeacherInternshipGuidance })));
const TeacherDefenseGradingPage = lazy(() => import("./pages/teacher/internship/TeacherDefenseGradingPage").then(m => ({ default: m.TeacherDefenseGradingPage })));

const MaterialsAndAssignmentsPage = lazy(() => import("./pages/teacher/MaterialsAndAssignmentsPage"));
const ExamListPage = lazy(() => import("./pages/teacher/exams/ExamListPage").then(m => ({ default: m.ExamListPage })));
const ExamEditorPage = lazy(() => import("./pages/teacher/exams/ExamEditorPage").then(m => ({ default: m.ExamEditorPage })));
const ExamSchedulePage = lazy(() => import("./pages/teacher/exams/ExamSchedulePage").then(m => ({ default: m.ExamSchedulePage })));
const ExamItemAnalysisPage = lazy(() =>
  import("./pages/teacher/exams/ExamItemAnalysisPage").then(m => ({ default: m.ExamItemAnalysisPage })),
);
const ExamSubmissionsPage = lazy(() =>
  import("./pages/teacher/exams/ExamSubmissionsPage").then(m => ({ default: m.ExamSubmissionsPage })),
);
const ExamScheduleManagementPage = lazy(() => import("./pages/teacher/wakasek/ExamScheduleManagementPage"));
const ExamSittingManagementPage = lazy(() => import("./pages/teacher/wakasek/ExamSittingManagementPage"));
const ExamProctorManagementPage = lazy(() => import("./pages/teacher/wakasek/ExamProctorManagementPage"));
const ExamManagementHubPage = lazy(() => import("./pages/teacher/wakasek/ExamManagementHubPage"));
const CurriculumManagementHubPage = lazy(() => import("./pages/teacher/wakasek/CurriculumManagementHubPage"));
const WakasekPerformancePage = lazy(() => import("./pages/teacher/wakasek/WakasekPerformancePage"));
const WakasekAcademicReportsPage = lazy(() => import("./pages/teacher/wakasek/WakasekAcademicReportsPage"));
const CurriculumFinalLedgerPage = lazy(() =>
  import('./pages/teacher/wakasek/curriculum/CurriculumFinalLedgerPage'),
);
const TeachingResourceProgramManagementPage = lazy(() =>
  import('./pages/teacher/wakasek/curriculum/TeachingResourceProgramManagementPage'),
);
const StudentManagementHubPage = lazy(() => import("./pages/teacher/wakasek/StudentManagementHubPage"));
const InternshipComponentPage = lazy(() => import("./pages/teacher/wakasek/InternshipComponentPage").then(m => ({ default: m.InternshipComponentPage })));
const JournalMonitoringPage = lazy(() => import("./pages/teacher/wakasek/JournalMonitoringPage"));
const WorkProgramApprovalsPage = lazy(() =>
  import('./pages/teacher/wakasek/curriculum/WorkProgramApprovalsPage'),
);
const HumasSettingsPage = lazy(() => import("./pages/teacher/humas/HumasSettingsPage").then(m => ({ default: m.HumasSettingsPage })));
const InventoryHubPage = lazy(() => import('./pages/teacher/wakasek/sarpras/InventoryHubPage').then(m => ({ default: m.InventoryHubPage })));
const InventoryDetailPage = lazy(() => import('./pages/teacher/wakasek/sarpras/InventoryDetailPage').then(m => ({ default: m.InventoryDetailPage })));
const BudgetApprovalPage = lazy(() => import('./pages/teacher/wakasek/sarpras/BudgetApprovalPage').then(m => ({ default: m.BudgetApprovalPage })));
const IndustryPartnersPage = lazy(() => import("./pages/teacher/humas/IndustryPartnersPage").then(m => ({ default: m.IndustryPartnersPage })));
const OsisElectionPage = lazy(() => import("./pages/teacher/osis/OsisElectionPage").then(m => ({ default: m.OsisElectionPage })));
const OsisManagementPage = lazy(() => import("./pages/teacher/osis/OsisManagementPage").then(m => ({ default: m.OsisManagementPage })));
const OsisElectionMonitoringPage = lazy(() => import("./pages/common/OsisElectionMonitoringPage").then(m => ({ default: m.OsisElectionMonitoringPage })));
const StudentOsisElectionPage = lazy(() => import("./pages/student/StudentOsisElectionPage").then(m => ({ default: m.StudentOsisElectionPage })));
const LearningResourceProgramPage = lazy(() => import("./pages/teacher/learning-resources/LearningResourceProgramPage"));
const AuditLogPage = lazy(() => import("./pages/admin/audit/AuditLogPage").then(m => ({ default: m.AuditLogPage })));
const ServerAreaPage = lazy(() => import("./pages/admin/ServerAreaPage").then(m => ({ default: m.default })));
const StudentExamsPage = lazy(() => import("./pages/student/StudentExamsPage"));
const StudentExamTakePage = lazy(() => import("./pages/student/StudentExamTakePage"));
const StudentPermissionsPage = lazy(() => import("./pages/student/StudentPermissionsPage"));
const StudentSchedulePage = lazy(() => import("./pages/student/StudentSchedulePage"));
const StudentGradesPage = lazy(() => import("./pages/student/StudentGradesPage"));
const StudentAttendancePage = lazy(() => import("./pages/student/StudentAttendancePage"));
const StudentClassAttendancePage = lazy(() => import("./pages/student/StudentClassAttendancePage"));
const StudentLearningPage = lazy(() => import("./pages/student/StudentLearningPage"));
const StudentDashboard = lazy(() => import("./pages/student/StudentDashboard").then(m => ({ default: m.StudentDashboard })));
const StudentExtracurricularPage = lazy(() => import("./pages/student/StudentExtracurricularPage").then(m => ({ default: m.StudentExtracurricularPage })));
const StudentFinancePage = lazy(() => import("./pages/student/StudentFinancePage"));
const StudentInternshipDashboard = lazy(() => import("./pages/student/internship/StudentInternshipDashboard"));
const StudentInternshipReportPage = lazy(() => import("./pages/student/internship/StudentInternshipReportPage"));
const StudentInternshipJournal = lazy(() => import("./pages/student/internship/StudentInternshipJournal"));
const StudentInternshipAttendance = lazy(() => import("./pages/student/internship/StudentInternshipAttendance"));
const PrincipalDashboard = lazy(() => import("./pages/principal/PrincipalDashboard").then(m => ({ default: m.PrincipalDashboard })));
const StaffDashboard = lazy(() => import("./pages/staff/StaffDashboard").then(m => ({ default: m.StaffDashboard })));
const ParentDashboard = lazy(() => import("./pages/parent/ParentDashboard").then(m => ({ default: m.ParentDashboard })));
const CandidateDashboardPage = lazy(() => import("./pages/public/CandidatePortalPage").then(m => ({ default: m.CandidateDashboardPage })));
const CandidateInformationPage = lazy(() => import("./pages/public/CandidatePortalPage").then(m => ({ default: m.CandidateInformationPage })));
const CandidateApplicationPage = lazy(() => import("./pages/public/CandidateApplicationPage").then(m => ({ default: m.CandidateApplicationPage })));
const BkkDashboardPage = lazy(() => import("./pages/public/BkkPortalPage").then(m => ({ default: m.BkkDashboardPage })));
const BkkVacanciesPage = lazy(() => import("./pages/public/BkkPortalPage").then(m => ({ default: m.BkkVacanciesPage })));
const BkkApplicationsPage = lazy(() => import("./pages/public/BkkApplicationsPage").then(m => ({ default: m.BkkApplicationsPage })));
const BkkCareerProfilePage = lazy(() => import("./pages/public/BkkCareerProfilePage").then(m => ({ default: m.BkkCareerProfilePage })));
const CandidateAdmissionReviewPage = lazy(() => import("./pages/admin/users/CandidateAdmissionReviewPage").then(m => ({ default: m.CandidateAdmissionReviewPage })));
const AdminBkkApplicationsPage = lazy(() => import("./pages/admin/users/AdminBkkApplicationsPage").then(m => ({ default: m.AdminBkkApplicationsPage })));
const TrainingClassesPage = lazy(() => import("./pages/admin/training/TrainingClassesPage").then(m => ({ default: m.TrainingClassesPage })));
const ExtracurricularPage = lazy(() => import("./pages/admin/extracurriculars/ExtracurricularPage").then(m => ({ default: m.ExtracurricularPage })));
const ReportCardsPage = lazy(() => import("./pages/admin/academic/ReportCardsPage").then(m => ({ default: m.ReportCardsPage })));
const AdminSlideshowPage = lazy(() => import("./pages/admin/settings/AdminSlideshowPage").then(m => ({ default: m.AdminSlideshowPage })));
const UserProfilePage = lazy(() => import("./pages/common/UserProfilePage").then(m => ({ default: m.UserProfilePage })));
const ExaminerDashboard = lazy(() => import("./pages/examiner/ExaminerDashboard").then(m => ({ default: m.ExaminerDashboard })));
const UKKAssessmentPage = lazy(() => import("./pages/examiner/UKKAssessmentPage").then(m => ({ default: m.UKKAssessmentPage })));
const UKKSchemeListPage = lazy(() => import("./pages/examiner/UKKSchemeListPage").then(m => ({ default: m.UKKSchemeListPage })));
const UKKSchemeFormPage = lazy(() => import("./pages/examiner/UKKSchemeFormPage").then(m => ({ default: m.UKKSchemeFormPage })));
const InternshipGradeInputPage = lazy(() => import("./pages/public/InternshipGradeInputPage").then(m => ({ default: m.InternshipGradeInputPage })));
const PklLetterPrint = lazy(() => import("./pages/print/PklLetterPrint"));
const PklGroupLetterPrint = lazy(() => import("./pages/print/PklGroupLetterPrint"));
const CandidateDecisionLetterPrint = lazy(() => import("./pages/print/CandidateDecisionLetterPrint"));
const BkkShortlistBatchPrint = lazy(() => import("./pages/print/BkkShortlistBatchPrint"));
const ProctorReportPrint = lazy(() => import("./pages/print/ProctorReportPrint"));
const ProctorAttendancePrint = lazy(() => import("./pages/print/ProctorAttendancePrint"));
const ProfileSummaryPrint = lazy(() => import("./pages/print/ProfileSummaryPrint"));
const ProctorReportVerificationPage = lazy(() => import("./pages/public/ProctorReportVerificationPage"));
const ExamCardVerificationPage = lazy(() => import("./pages/public/ExamCardVerificationPage"));
const ProfileSummaryVerificationPage = lazy(() => import("./pages/public/ProfileSummaryVerificationPage"));
const EmailPage = lazy(() => import("./pages/common/EmailPage").then(m => ({ default: m.EmailPage })));

// Helper hook for auth
const useAuth = () => {
  return useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Helper component to redirect based on role
const DashboardRedirect = () => {
  const { data: response, isLoading, isError } = useAuth();
  
  if (isLoading) {
    return <div className="w-full h-screen flex items-center justify-center text-gray-600">Memuat data pengguna...</div>;
  }

  if (isError || !response) return <Navigate to="/login" replace />;

  const user = response.data;
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case "ADMIN":
      return <Navigate to="/admin" replace />;
    case "TEACHER":
      return <Navigate to="/teacher" replace />;
    case "STUDENT":
      return <Navigate to="/student" replace />;
    case "PRINCIPAL":
      return <Navigate to="/principal" replace />;
    case "STAFF":
      return <Navigate to="/staff" replace />;
    case "PARENT":
      return <Navigate to="/parent" replace />;
    case "CALON_SISWA":
      return <Navigate to="/candidate" replace />;
    case "UMUM":
      return <Navigate to="/public" replace />;
    case "EXAMINER":
      return <Navigate to="/examiner" replace />;
    case "EXTRACURRICULAR_TUTOR":
      return <Navigate to="/tutor" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

// Helper component for role-based protection
const RoleRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
  const { data: response, isLoading, isError } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="w-full h-screen flex items-center justify-center text-gray-600">Verifikasi akses...</div>;
  }

  if (isError || !response) {
    console.warn('RoleRoute: No user found, redirecting to login', { from: location });
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const user = response.data;
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    console.warn(`RoleRoute: Role mismatch. User: ${user.role}, Allowed: ${allowedRoles}. Redirecting to /`);
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const ProctorSchedulePage = lazy(() => import('./pages/teacher/proctor/ProctorSchedulePage'));
const ProctorMonitoringPage = lazy(() => import('./pages/teacher/proctor/ProctorMonitoringPage'));

if (typeof window !== 'undefined') {
  // Expose global slideshow settings for login page (updated via admin slideshow)
  const sisWindow = window as SisWindow;
  sisWindow.__SIS_SLIDESHOW_SETTINGS__ = sisWindow.__SIS_SLIDESHOW_SETTINGS__ || {};
}

function App() {

  return (
    <Router>
      <Toaster position="top-right" />
      <GlobalErrorBoundary>
        <Suspense fallback={<div className="w-full h-screen flex items-center justify-center text-gray-600">Memuat...</div>}>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/register/:type" element={<RegisterPage />} />
          <Route path="/pkl/grade/:accessCode" element={<InternshipGradeInputPage />} />
          <Route path="/print/pkl/:id" element={<PklLetterPrint />} />
          <Route path="/print/pkl-group" element={<PklGroupLetterPrint />} />
          <Route path="/print/candidate-admission/:id/decision-letter" element={<CandidateDecisionLetterPrint />} />
          <Route path="/print/bkk-shortlist-batch" element={<BkkShortlistBatchPrint />} />
          <Route path="/print/proctor-report/:reportId" element={<ProctorReportPrint />} />
          <Route path="/print/proctor-attendance/:reportId" element={<ProctorAttendancePrint />} />
          <Route path="/print/profile-summary" element={<ProfileSummaryPrint />} />
          <Route path="/verify/proctor-report/:token" element={<ProctorReportVerificationPage />} />
          <Route path="/verify/exam-card/:token" element={<ExamCardVerificationPage />} />
          <Route path="/verify/profile-summary/:token" element={<ProfileSummaryVerificationPage />} />
          <Route path="/v/ps/:token" element={<ProfileSummaryVerificationPage />} />
        
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<DashboardRedirect />} />
            <Route path="dashboard" element={<DashboardRedirect />} />
            <Route
              path="email"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'TEACHER', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR', 'STAFF']}>
                  <EmailPage />
                </RoleRoute>
              }
            />

            <Route path="admin" element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <Outlet />
              </RoleRoute>
            }>
            <Route index element={<AdminDashboard />} />
            <Route
              path="admin-users"
              element={
                <UserList
                  fixedRole="ADMIN"
                  title="Kelola Admin"
                  description="Kelola akun admin sistem"
                />
              }
            />
            <Route
              path="principal-users"
              element={
                <UserList
                  fixedRole="PRINCIPAL"
                  title="Kelola Kepsek"
                  description="Kelola akun kepala sekolah"
                />
              }
            />
            <Route
              path="staff-users"
              element={
                <UserList
                  fixedRole="STAFF"
                  title="Kelola Staff"
                  description="Kelola akun staff"
                />
              }
            />
            <Route
              path="parent-users"
              element={
                <UserList
                  fixedRole="PARENT"
                  title="Kelola Orang Tua"
                  description="Kelola akun orang tua / wali siswa"
                />
              }
            />
            <Route
              path="bkk-users"
              element={
                <UserList
                  fixedRole="UMUM"
                  title="Kelola Pelamar BKK"
                  description="Kelola akun pelamar BKK dan data calon tenaga kerja."
                />
              }
            />
            <Route
              path="examiner-users"
              element={
                <UserList
                  fixedRole="EXAMINER"
                  title="Kelola Penguji"
                  description="Kelola akun penguji UKK"
                />
              }
            />
            <Route
              path="tutor-users"
              element={
                <UserList
                  fixedRole="EXTRACURRICULAR_TUTOR"
                  title="Kelola Tutor Eksternal"
                  description="Kelola akun tutor eksternal atau pembina non-guru. Guru aktif sebagai pembina dikelola dari menu Ekstrakurikuler."
                />
              }
            />
            <Route path="teachers" element={<TeacherManagementPage />} />
            <Route path="students" element={<StudentManagementPage />} />
            <Route path="user-verification" element={<UserVerificationPage />} />
            <Route path="candidate-admissions" element={<CandidateAdmissionReviewPage />} />
            <Route path="bkk-applications" element={<AdminBkkApplicationsPage />} />
            <Route path="teacher-assignments" element={<TeacherAssignmentPage />} />
            <Route path="import-export" element={<ImportExportPage />} />
            <Route path="academic-years" element={<AcademicYearPage />} />
            <Route path="academic-calendar" element={<AcademicCalendarPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="teaching-load" element={<TeachingLoadSummaryPage />} />
            <Route path="kkm" element={<KkmPage />} />
            <Route path="attendance" element={<AttendanceRecapPage />} />
            <Route path="report-cards" element={<ReportCardsPage />} />
            <Route path="majors" element={<MajorPage />} />
            <Route path="subjects" element={<SubjectPage />} />
            <Route path="subject-categories" element={<SubjectCategoryPage />} />
            <Route path="classes" element={<ClassPage />} />
            <Route path="training-classes" element={<TrainingClassesPage />} />
            <Route path="extracurriculars" element={<ExtracurricularPage />} />
            <Route path="audit-logs" element={<AuditLogPage />} />
            <Route path="question-bank" element={<TeacherPlaceholderPage />} />
            <Route path="exam-sessions" element={<TeacherPlaceholderPage />} />
            <Route path="settings/slideshow" element={<AdminSlideshowPage />} />
            <Route path="settings/profile" element={<UserProfilePage />} />
            <Route path="settings/password" element={<UserProfilePage />} />
            <Route path="settings/server-area" element={<ServerAreaPage />} />
            </Route>
            <Route path="tutor" element={
              <RoleRoute allowedRoles={['EXTRACURRICULAR_TUTOR', 'TEACHER']}>
                <Outlet />
              </RoleRoute>
            }>
            <Route index element={<TutorDashboardPage />} />
            <Route path="dashboard" element={<TutorDashboardPage />} />
            <Route path="members" element={<TutorMembersPage />} />
            <Route path="work-programs" element={<WorkProgramPage />} />
            <Route path="inventory" element={<TutorInventoryPage />} />
            <Route path="assigned-inventory" element={<InventoryHubPage />} />
            <Route path="assigned-inventory/:roomId" element={<InventoryDetailPage />} />
            <Route path="profile" element={<UserProfilePage />} />
            <Route path="general" element={<Navigate to="profile" replace />} />
            </Route>
            <Route
              path="teacher"
              element={
                <RoleRoute allowedRoles={['TEACHER']}>
                  <Outlet />
                </RoleRoute>
              }
            >
            <Route index element={<TeacherDashboard />} />
            <Route path="schedule" element={<TeacherSchedulePage />} />
            <Route path="work-programs" element={<WorkProgramPage />} />

            <Route path="classes" element={<MyClassesPage />} />
            <Route path="classes/:classId/students" element={<TeacherClassStudentsPage />} />
            <Route path="attendance" element={<TeacherAttendanceListPage />} />
            <Route path="attendance/:assignmentId" element={<TeacherAttendancePage />} />
            <Route path="grades" element={<TeacherGradesPage />} />
            <Route path="grades/us" element={<Navigate to="/teacher/grades" replace />} />
            <Route path="bk" element={<TeacherBpBkPage />} />
            <Route path="bk/behaviors" element={<TeacherBpBkPage />} />
            <Route path="bk/permissions" element={<TeacherBpBkPage />} />
            <Route path="bk/counselings" element={<TeacherBpBkPage />} />
            <Route path="internship/approval" element={<InternshipApprovalPage />} />
            <Route path="internship/guidance" element={<TeacherInternshipGuidance />} />
            <Route path="internship/defense" element={<TeacherDefenseGradingPage />} />
            
            <Route path="exams/:legacyProgramCode" element={<ExamListPage />} />
            <Route path="exams/program/:programCode" element={<ExamListPage />} />
            <Route path="exams/bank" element={<ExamListPage />} />
            <Route path="exams/create" element={<ExamEditorPage />} />
            <Route path="exams/:id/edit" element={<ExamEditorPage />} />
            <Route path="exams/:id/schedule" element={<ExamSchedulePage />} />
            <Route path="exams/:id/item-analysis" element={<ExamItemAnalysisPage />} />
            <Route path="exams/:id/submissions" element={<ExamSubmissionsPage />} />
            
            <Route path="wakasek/exam-schedules" element={<ExamScheduleManagementPage />} />
            <Route path="wakasek/exams" element={<ExamManagementHubPage />} />
            <Route path="wakasek/exam-rooms" element={<ExamSittingManagementPage />} />
            <Route path="wakasek/proctor-schedule" element={<ExamProctorManagementPage />} />
            <Route path="wakasek/curriculum" element={<CurriculumManagementHubPage />} />
            <Route
              path="wakasek/teaching-resource-programs"
              element={<TeachingResourceProgramManagementPage />}
            />
            <Route path="wakasek/final-ledger" element={<CurriculumFinalLedgerPage />} />
            <Route path="wakasek/consolidation" element={<Navigate to="/teacher/wakasek/final-ledger" replace />} />
            <Route path="wakasek/performance" element={<WakasekPerformancePage />} />
            <Route path="wakasek/reports" element={<WakasekAcademicReportsPage />} />
            <Route
              path="wakasek/work-program-approvals"
              element={<WorkProgramApprovalsPage />}
            />
            <Route path="wakasek/students" element={<StudentManagementHubPage />} />
            <Route path="wakasek/student-approvals" element={<BudgetApprovalPage />} />
            <Route path="wakasek/internship-components" element={<InternshipComponentPage />} />
            <Route path="wakasek/journal-monitoring" element={<JournalMonitoringPage />} />

            <Route path="proctoring" element={<ProctorSchedulePage />} />
            <Route path="proctoring/:id" element={<ProctorMonitoringPage />} />

            <Route path="report-subjects" element={<TeacherSubjectReportPage />} />
            <Route path="materials" element={<MaterialsAndAssignmentsPage />} />
            <Route path="assignments/:id/submissions" element={<AssignmentSubmissionsPage />} />
            <Route path="osis/management" element={<OsisManagementPage />} />
            <Route path="osis/inventory" element={<TutorInventoryPage />} />
            <Route path="osis/election" element={<OsisElectionPage />} />
            <Route path="osis/vote" element={<StudentOsisElectionPage />} />
            <Route path="learning-resources" element={<TeacherPlaceholderPage />} />
            <Route path="learning-resources/cp" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/atp" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/modules" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/modul-ajar" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/prota" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/promes" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/alokasi-waktu" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/kktp" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/matriks-sebaran" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/:programCode/new" element={<LearningResourceProgramPage />} />
            <Route path="learning-resources/:programCode" element={<LearningResourceProgramPage />} />
            <Route path="communication" element={<TeacherPlaceholderPage />} />
            <Route path="profile" element={<UserProfilePage />} />
            
            <Route path="humas/partners" element={<IndustryPartnersPage />} />
            <Route
              path="humas/applicants"
              element={
                <UserList
                  fixedRole="UMUM"
                  title="Akun Pelamar BKK"
                  description="Pantau akun pelamar BKK dan status verifikasinya dari workspace Wakasek Humas."
                  readOnly
                  readOnlyMessage="Mode review Wakasek Humas: Anda dapat melihat profil, dokumen, dan status verifikasi pelamar. Verifikasi akun, perubahan identitas login, dan penghapusan akun tetap melalui Admin."
                />
              }
            />
            <Route path="humas/reports" element={<TeacherPlaceholderPage />} />
            <Route path="humas/settings" element={<HumasSettingsPage />} />
            <Route path="academic/audit-logs" element={<AuditLogPage />} />
            <Route path="wakasek/student-election" element={<OsisElectionMonitoringPage />} />

            <Route path="sarpras/inventory" element={<InventoryHubPage />} />
            <Route path="sarpras/inventory/:roomId" element={<InventoryDetailPage />} />
            <Route path="assigned-inventory" element={<InventoryHubPage />} />
            <Route path="assigned-inventory/:roomId" element={<InventoryDetailPage />} />
            <Route path="sarpras/budgets" element={<BudgetApprovalPage />} />
            <Route path="sarpras/*" element={<TeacherPlaceholderPage />} />
            <Route path="wali-kelas/*" element={<TeacherHomeroomPage />} />
            <Route path="training/*" element={<TeacherPlaceholderPage />} />
            <Route path="wakasek/*" element={<TeacherPlaceholderPage />} />
            <Route path="head-lab/inventory" element={<InventoryHubPage />} />
            <Route path="head-lab/inventory/:roomId" element={<InventoryDetailPage />} />
            <Route path="head-lab/*" element={<TeacherPlaceholderPage />} />
            <Route path="head-library/inventory" element={<InventoryHubPage />} />
            <Route path="head-library/inventory/:roomId" element={<InventoryDetailPage />} />
            <Route path="head-program/partners" element={<IndustryPartnersPage />} />
            <Route path="head-program/*" element={<TeacherPlaceholderPage />} />
            </Route>
            <Route path="student" element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <Outlet />
              </RoleRoute>
            }>
            <Route index element={<StudentDashboard />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="exams" element={<StudentExamsPage />} />
            <Route path="exams/:legacyProgramCode" element={<StudentExamsPage />} />
            <Route path="exams/program/:programCode" element={<StudentExamsPage />} />
            <Route path="exams/:id/take" element={<StudentExamTakePage />} />
            <Route path="permissions" element={<StudentPermissionsPage />} />
            <Route path="schedule" element={<StudentSchedulePage />} />
            <Route path="learning" element={<StudentLearningPage />} />
            <Route path="grades" element={<StudentGradesPage />} />
            <Route path="attendance" element={<StudentAttendancePage />} />
            <Route path="class-attendance" element={<StudentClassAttendancePage />} />
            <Route path="extracurricular" element={<StudentExtracurricularPage />} />
            <Route path="osis" element={<StudentOsisElectionPage />} />
            
            {/* PKL Routes */}
            <Route path="internship" element={<Outlet />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<StudentInternshipDashboard />} />
              <Route path="journals" element={<StudentInternshipJournal />} />
              <Route path="attendance" element={<StudentInternshipAttendance />} />
              <Route path="report" element={<StudentInternshipReportPage />} />
            </Route>

            <Route path="profile" element={<UserProfilePage />} />
            <Route path="finance" element={<StudentFinancePage />} />
            <Route path="academic/*" element={<TeacherPlaceholderPage />} />
            <Route path="administration/*" element={<TeacherPlaceholderPage />} />
            </Route>
            <Route path="principal/*" element={
              <RoleRoute allowedRoles={['PRINCIPAL']}>
                <PrincipalDashboard />
              </RoleRoute>
            } />
            <Route path="staff/*" element={
              <RoleRoute allowedRoles={['STAFF']}>
                <StaffDashboard />
              </RoleRoute>
            } />
            <Route path="parent/*" element={
              <RoleRoute allowedRoles={['PARENT']}>
                <ParentDashboard />
              </RoleRoute>
            } />
            <Route path="candidate" element={
              <RoleRoute allowedRoles={['CALON_SISWA']}>
                <Outlet />
              </RoleRoute>
            }>
              <Route index element={<CandidateDashboardPage />} />
              <Route path="dashboard" element={<CandidateDashboardPage />} />
              <Route path="application" element={<CandidateApplicationPage />} />
              <Route path="information" element={<CandidateInformationPage />} />
              <Route path="exams" element={<StudentExamsPage />} />
              <Route path="exams/program/:programCode" element={<StudentExamsPage />} />
              <Route path="exams/:id/take" element={<StudentExamTakePage />} />
              <Route path="profile" element={<UserProfilePage />} />
            </Route>
            <Route path="public" element={
              <RoleRoute allowedRoles={['UMUM']}>
                <Outlet />
              </RoleRoute>
            }>
              <Route index element={<BkkDashboardPage />} />
              <Route path="dashboard" element={<BkkDashboardPage />} />
              <Route path="vacancies" element={<BkkVacanciesPage />} />
              <Route path="applications" element={<BkkApplicationsPage />} />
              <Route path="exams" element={<StudentExamsPage />} />
              <Route path="exams/program/:programCode" element={<StudentExamsPage />} />
              <Route path="exams/:id/take" element={<StudentExamTakePage />} />
              <Route path="profile" element={<BkkCareerProfilePage />} />
            </Route>
          
            <Route path="examiner" element={
              <RoleRoute allowedRoles={['EXAMINER']}>
                <Outlet />
              </RoleRoute>
            }>
              <Route index element={<ExaminerDashboard />} />
              <Route path="dashboard" element={<ExaminerDashboard />} />
              <Route path="profile" element={<UserProfilePage />} />
              <Route path="schemes" element={<UKKSchemeListPage />} />
              <Route path="schemes/create" element={<UKKSchemeFormPage />} />
              <Route path="schemes/:id/edit" element={<UKKSchemeFormPage />} />
              <Route path="ukk-assessment" element={<UKKAssessmentPage />} />
              <Route path="general" element={<Navigate to="profile" replace />} />
            </Route>
          </Route>
          </Routes>
        </Suspense>
      </GlobalErrorBoundary>
    </Router>
  );
}

export default App;
