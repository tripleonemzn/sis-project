import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherTrainingGradesScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Nilai Training"
      subtitle="Monitoring nilai peserta training secara berkala."
      icon="bar-chart-2"
      requireTrainingClass
      quickActions={[
        { label: 'Kelas Training', route: '/teacher/training-classes' },
        { label: 'Laporan Training', route: '/teacher/training-reports' },
      ]}
    />
  );
}
