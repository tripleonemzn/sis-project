import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherHeadLabScheduleScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Jadwal Lab"
      subtitle="Kelola jadwal penggunaan laboratorium dari dashboard kepala lab."
      icon="calendar"
      expectedDuties={['KEPALA_LAB']}
      quickActions={[
        {
          label: 'Inventaris Lab',
          description: 'Cek kondisi dan data aset lab sebelum menyusun jadwal.',
          route: '/teacher/head-lab-inventory',
        },
      ]}
    />
  );
}
