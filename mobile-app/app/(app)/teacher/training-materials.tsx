import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherTrainingMaterialsScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Materi & Tugas"
      subtitle="Kelola materi pembelajaran dan tugas untuk kelas training."
      icon="book-open"
      requireTrainingClass
      quickActions={[
        { label: 'Daftar Kelas', route: '/teacher/training-classes' },
        { label: 'Nilai Training', route: '/teacher/training-grades' },
      ]}
    />
  );
}
