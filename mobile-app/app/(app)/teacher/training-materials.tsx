import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherTrainingMaterialsScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Materi Training"
      subtitle="Kelola materi pembelajaran untuk kelas training."
      icon="book-open"
      requireTrainingClass
      quickActions={[
        { label: 'Kelas Training', route: '/teacher/training-classes' },
        { label: 'Nilai Training', route: '/teacher/training-grades' },
      ]}
    />
  );
}
