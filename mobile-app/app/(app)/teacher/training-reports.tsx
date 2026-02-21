import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherTrainingReportsScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Laporan Training"
      subtitle="Lihat rekap performa kelas training dalam satu tempat."
      icon="file-text"
      requireTrainingClass
      quickActions={[
        { label: 'Kelas Training', route: '/teacher/training-classes' },
        { label: 'Presensi Training', route: '/teacher/training-attendance' },
        { label: 'Nilai Training', route: '/teacher/training-grades' },
      ]}
    />
  );
}
