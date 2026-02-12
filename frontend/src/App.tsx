import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Toaster } from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { GlobalErrorBoundary } from "./components/common/GlobalErrorBoundary";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { authService } from "./services/auth.service";
const TutorDashboardPage = lazy(() => import("./pages/tutor/TutorDashboardPage").then(m => ({ default: m.TutorDashboardPage })));
const TutorMembersPage = lazy(() => import("./pages/tutor/TutorMembersPage").then(m => ({ default: m.TutorMembersPage })));
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
const TeacherAttendanceListPage = lazy(() => import("./pages/teacher/TeacherAttendanceListPage").then(m => ({ default: m.TeacherAttendanceListPage })));
const TeacherAttendancePage = lazy(() => import("./pages/teacher/TeacherAttendancePage").then(m => ({ default: m.TeacherAttendancePage })));
const TeacherGradesPage = lazy(() => import("./pages/teacher/TeacherGradesPage").then(m => ({ default: m.TeacherGradesPage })));
const TeacherSubjectReportPage = lazy(() => import("./pages/teacher/TeacherSubjectReportPage").then(m => ({ default: m.TeacherSubjectReportPage })));
const InternshipApprovalPage = lazy(() => import("./pages/teacher/internship/InternshipApprovalPage").then(m => ({ default: m.InternshipApprovalPage })));
const TeacherInternshipGuidance = lazy(() => import("./pages/teacher/internship/TeacherInternshipGuidance").then(m => ({ default: m.TeacherInternshipGuidance })));
const TeacherDefenseGradingPage = lazy(() => import("./pages/teacher/internship/TeacherDefenseGradingPage").then(m => ({ default: m.TeacherDefenseGradingPage })));

const MaterialsAndAssignmentsPage = lazy(() => import("./pages/teacher/MaterialsAndAssignmentsPage"));
const ExamListPage = lazy(() => import("./pages/teacher/exams/ExamListPage").then(m => ({ default: m.ExamListPage })));
const ExamEditorPage = lazy(() => import("./pages/teacher/exams/ExamEditorPage").then(m => ({ default: m.ExamEditorPage })));
const ExamSchedulePage = lazy(() => import("./pages/teacher/exams/ExamSchedulePage").then(m => ({ default: m.ExamSchedulePage })));
const ExamScheduleManagementPage = lazy(() => import("./pages/teacher/wakasek/ExamScheduleManagementPage"));
const ExamSittingManagementPage = lazy(() => import("./pages/teacher/wakasek/ExamSittingManagementPage"));
const ExamProctorManagementPage = lazy(() => import("./pages/teacher/wakasek/ExamProctorManagementPage"));
const InternshipComponentPage = lazy(() => import("./pages/teacher/wakasek/InternshipComponentPage").then(m => ({ default: m.InternshipComponentPage })));
const JournalMonitoringPage = lazy(() => import("./pages/teacher/wakasek/JournalMonitoringPage"));
const HumasSettingsPage = lazy(() => import("./pages/teacher/humas/HumasSettingsPage").then(m => ({ default: m.HumasSettingsPage })));
const IndustryPartnersPage = lazy(() => import("./pages/teacher/humas/IndustryPartnersPage").then(m => ({ default: m.IndustryPartnersPage })));
const CpPage = lazy(() => import("./pages/teacher/learning-resources/CpPage"));
const AtpPage = lazy(() => import("./pages/teacher/learning-resources/AtpPage"));
const ModulesPage = lazy(() => import("./pages/teacher/learning-resources/ModulesPage"));
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
const StudentInternshipDashboard = lazy(() => import("./pages/student/internship/StudentInternshipDashboard"));
const StudentInternshipReportPage = lazy(() => import("./pages/student/internship/StudentInternshipReportPage"));
const StudentInternshipJournal = lazy(() => import("./pages/student/internship/StudentInternshipJournal"));
const StudentInternshipAttendance = lazy(() => import("./pages/student/internship/StudentInternshipAttendance"));
const PrincipalDashboard = lazy(() => import("./pages/principal/PrincipalDashboard").then(m => ({ default: m.PrincipalDashboard })));
const StaffDashboard = lazy(() => import("./pages/staff/StaffDashboard").then(m => ({ default: m.StaffDashboard })));
const ParentDashboard = lazy(() => import("./pages/parent/ParentDashboard").then(m => ({ default: m.ParentDashboard })));
const TrainingClassesPage = lazy(() => import("./pages/admin/training/TrainingClassesPage").then(m => ({ default: m.TrainingClassesPage })));
const ExtracurricularPage = lazy(() => import("./pages/admin/extracurriculars/ExtracurricularPage").then(m => ({ default: m.ExtracurricularPage })));
const ReportCardsPage = lazy(() => import("./pages/admin/academic/ReportCardsPage").then(m => ({ default: m.ReportCardsPage })));
const UserProfilePage = lazy(() => import("./pages/common/UserProfilePage").then(m => ({ default: m.UserProfilePage })));
const ExaminerDashboard = lazy(() => import("./pages/examiner/ExaminerDashboard").then(m => ({ default: m.ExaminerDashboard })));
const UKKAssessmentPage = lazy(() => import("./pages/examiner/UKKAssessmentPage").then(m => ({ default: m.UKKAssessmentPage })));
const UKKSchemeListPage = lazy(() => import("./pages/examiner/UKKSchemeListPage").then(m => ({ default: m.UKKSchemeListPage })));
const UKKSchemeFormPage = lazy(() => import("./pages/examiner/UKKSchemeFormPage").then(m => ({ default: m.UKKSchemeFormPage })));
const InternshipGradeInputPage = lazy(() => import("./pages/public/InternshipGradeInputPage").then(m => ({ default: m.InternshipGradeInputPage })));
const PklLetterPrint = lazy(() => import("./pages/print/PklLetterPrint"));
const PklGroupLetterPrint = lazy(() => import("./pages/print/PklGroupLetterPrint"));

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

  const user = (response as any)?.data;
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
  
  function App() {
  return (
    <Router>
      <Toaster position="top-right" />
      <GlobalErrorBoundary>
        <Suspense fallback={<div className="w-full h-screen flex items-center justify-center text-gray-600">Memuat...</div>}>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pkl/grade/:accessCode" element={<InternshipGradeInputPage />} />
          <Route path="/print/pkl/:id" element={<PklLetterPrint />} />
          <Route path="/print/pkl-group" element={<PklGroupLetterPrint />} />
        
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<DashboardRedirect />} />
            <Route path="dashboard" element={<DashboardRedirect />} />
          
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
                  title="Kelola Pembina Ekskul"
                  description="Kelola akun pembina ekstrakurikuler"
                />
              }
            />
            <Route path="teachers" element={<TeacherManagementPage />} />
            <Route path="students" element={<StudentManagementPage />} />
            <Route path="user-verification" element={<UserVerificationPage />} />
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
            </Route>
            <Route path="tutor" element={
              <RoleRoute allowedRoles={['EXTRACURRICULAR_TUTOR']}>
                <Outlet />
              </RoleRoute>
            }>
              <Route index element={<TutorDashboardPage />} />
              <Route path="dashboard" element={<TutorDashboardPage />} />
              <Route path="members" element={<TutorMembersPage />} />
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
            <Route path="internship/approval" element={<InternshipApprovalPage />} />
            <Route path="internship/guidance" element={<TeacherInternshipGuidance />} />
            <Route path="internship/defense" element={<TeacherDefenseGradingPage />} />
            
            <Route path="exams/formatif" element={<ExamListPage />} />
            <Route path="exams/sbts" element={<ExamListPage />} />
            <Route path="exams/sas" element={<ExamListPage />} />
            <Route path="exams/sat" element={<ExamListPage />} />
            <Route path="exams/bank" element={<ExamListPage />} />
            <Route path="exams/create" element={<ExamEditorPage />} />
            <Route path="exams/:id/edit" element={<ExamEditorPage />} />
            <Route path="exams/:id/schedule" element={<ExamSchedulePage />} />
            
            <Route path="wakasek/exam-schedules" element={<ExamScheduleManagementPage />} />
            <Route path="wakasek/exam-rooms" element={<ExamSittingManagementPage />} />
            <Route path="wakasek/proctor-schedule" element={<ExamProctorManagementPage />} />
            <Route path="wakasek/internship-components" element={<InternshipComponentPage />} />
            <Route path="wakasek/journal-monitoring" element={<JournalMonitoringPage />} />

            <Route path="proctoring" element={<ProctorSchedulePage />} />
            <Route path="proctoring/:id" element={<ProctorMonitoringPage />} />

            <Route path="report-subjects" element={<TeacherSubjectReportPage />} />
            <Route path="materials" element={<MaterialsAndAssignmentsPage />} />
            <Route path="learning-resources" element={<TeacherPlaceholderPage />} />
            <Route path="learning-resources/cp" element={<CpPage />} />
            <Route path="learning-resources/atp" element={<AtpPage />} />
            <Route path="learning-resources/modules" element={<ModulesPage />} />
            <Route path="learning-resources/prota" element={<TeacherPlaceholderPage />} />
            <Route path="learning-resources/promes" element={<TeacherPlaceholderPage />} />
            <Route path="communication" element={<TeacherPlaceholderPage />} />
            <Route path="profile" element={<UserProfilePage />} />
            
            <Route path="humas/partners" element={<IndustryPartnersPage />} />
            <Route path="humas/reports" element={<TeacherPlaceholderPage />} />
            <Route path="humas/settings" element={<HumasSettingsPage />} />

            <Route path="wali-kelas/*" element={<TeacherHomeroomPage />} />
            <Route path="training/*" element={<TeacherPlaceholderPage />} />
            <Route path="wakasek/*" element={<TeacherPlaceholderPage />} />
            <Route path="head-lab/*" element={<TeacherPlaceholderPage />} />
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
            <Route path="exams/formatif" element={<StudentExamsPage />} />
            <Route path="exams/sbts" element={<StudentExamsPage />} />
            <Route path="exams/sas" element={<StudentExamsPage />} />
            <Route path="exams/sat" element={<StudentExamsPage />} />
            <Route path="exams/:id/take" element={<StudentExamTakePage />} />
            <Route path="permissions" element={<StudentPermissionsPage />} />
            <Route path="schedule" element={<StudentSchedulePage />} />
            <Route path="learning" element={<StudentLearningPage />} />
            <Route path="grades" element={<StudentGradesPage />} />
            <Route path="attendance" element={<StudentAttendancePage />} />
            <Route path="class-attendance" element={<StudentClassAttendancePage />} />
            <Route path="extracurricular" element={<StudentExtracurricularPage />} />
            
            {/* PKL Routes */}
            <Route path="internship" element={<Outlet />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<StudentInternshipDashboard />} />
              <Route path="journals" element={<StudentInternshipJournal />} />
              <Route path="attendance" element={<StudentInternshipAttendance />} />
              <Route path="report" element={<StudentInternshipReportPage />} />
            </Route>

            <Route path="profile" element={<UserProfilePage />} />
            <Route path="finance" element={<TeacherPlaceholderPage />} />
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
