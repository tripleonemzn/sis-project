import { Routes, Route, Navigate } from 'react-router-dom';
import { HomeroomStudentsPage } from './homeroom/HomeroomStudentsPage';
import { HomeroomAttendancePage } from './homeroom/HomeroomAttendancePage';
import { HomeroomBehaviorPage } from './homeroom/HomeroomBehaviorPage';
import { HomeroomPermissionsPage } from './homeroom/HomeroomPermissionsPage';
import { TeacherHomeroomSbtsPage } from './homeroom/TeacherHomeroomSbtsPage';
import { TeacherHomeroomSasPage } from './homeroom/TeacherHomeroomSasPage';
import { TeacherHomeroomSatPage } from './homeroom/TeacherHomeroomSatPage';

export const TeacherHomeroomPage = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="students" replace />} />
      <Route path="students" element={<HomeroomStudentsPage />} />
      <Route path="attendance" element={<HomeroomAttendancePage />} />
      <Route path="behavior" element={<HomeroomBehaviorPage />} />
      <Route path="permissions" element={<HomeroomPermissionsPage />} />
      <Route path="rapor-sbts" element={<TeacherHomeroomSbtsPage />} />
      <Route path="rapor-sas" element={<TeacherHomeroomSasPage />} />
      <Route path="rapor-sat" element={<TeacherHomeroomSatPage />} />
    </Routes>
  );
};
