import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherTrainingAttendanceScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Presensi Training"
      subtitle="Pantau kehadiran peserta kelas training."
      icon="check-square"
      requireTrainingClass
      quickActions={[
        { label: 'Kelas Training', route: '/teacher/training-classes' },
        { label: 'Nilai Training', route: '/teacher/training-grades' },
      ]}
    />
  );
}
