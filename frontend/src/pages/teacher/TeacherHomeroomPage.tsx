import { Routes, Route, Navigate } from 'react-router-dom';
import { HomeroomStudentsPage } from './homeroom/HomeroomStudentsPage';
import { HomeroomPermissionsPage } from './homeroom/HomeroomPermissionsPage';
import { HomeroomAttendancePage } from './homeroom/HomeroomAttendancePage';
import { HomeroomBehaviorPage } from './homeroom/HomeroomBehaviorPage';
import { TeacherHomeroomProgramPage } from './homeroom/TeacherHomeroomProgramPage';
import { TeacherHomeroomLegacyReportRedirect } from './homeroom/TeacherHomeroomLegacyReportRedirect';

export const TeacherHomeroomPage = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="students" replace />} />
      <Route path="students" element={<HomeroomStudentsPage />} />
      <Route path="attendance" element={<HomeroomAttendancePage />} />
      <Route path="behavior" element={<HomeroomBehaviorPage />} />
      <Route path="permissions" element={<HomeroomPermissionsPage />} />
      <Route path="rapor/program/:programCode" element={<TeacherHomeroomProgramPage />} />
      <Route path="rapor-sbts" element={<TeacherHomeroomLegacyReportRedirect hint="MIDTERM" />} />
      <Route path="rapor-sas" element={<TeacherHomeroomLegacyReportRedirect hint="FINAL_ODD" />} />
      <Route path="rapor-sat" element={<TeacherHomeroomLegacyReportRedirect hint="FINAL_EVEN" />} />
    </Routes>
  );
};
