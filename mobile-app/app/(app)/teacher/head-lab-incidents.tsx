import { TeacherWebBridgeModuleScreen } from '../../../src/features/teacherBridge/TeacherWebBridgeModuleScreen';

export default function TeacherHeadLabIncidentsScreen() {
  return (
    <TeacherWebBridgeModuleScreen
      title="Laporan Insiden"
      subtitle="Pantau laporan insiden laboratorium dan tindak lanjut perbaikan."
      icon="alert-triangle"
      expectedDuties={['KEPALA_LAB']}
      quickActions={[
        {
          label: 'Inventaris Lab',
          description: 'Gunakan data inventaris untuk menelusuri aset terkait insiden.',
          route: '/teacher/head-lab-inventory',
        },
      ]}
    />
  );
}
