import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherTrainingClassesScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Daftar Kelas"
      subtitle="Lihat daftar kelas training yang Anda ampu."
      icon="layers"
      requireTrainingClass
      quickActions={[
        { label: 'Presensi Training', route: '/teacher/training-attendance' },
        { label: 'Nilai Training', route: '/teacher/training-grades' },
        { label: 'Materi & Tugas', route: '/teacher/training-materials' },
        { label: 'Laporan Training', route: '/teacher/training-reports' },
      ]}
    />
  );
}
