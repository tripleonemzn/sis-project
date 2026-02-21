import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherTrainingClassesScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Kelas Training"
      subtitle="Kelola kelas training yang Anda ampu."
      icon="layers"
      requireTrainingClass
      quickActions={[
        { label: 'Presensi Training', route: '/teacher/training-attendance' },
        { label: 'Nilai Training', route: '/teacher/training-grades' },
        { label: 'Materi Training', route: '/teacher/training-materials' },
        { label: 'Laporan Training', route: '/teacher/training-reports' },
      ]}
    />
  );
}
