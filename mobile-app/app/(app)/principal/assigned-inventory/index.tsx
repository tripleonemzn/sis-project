import { TeacherSarprasInventoryScreen } from '../../teacher/sarpras-inventory';

export default function PrincipalAssignedInventoryHubRoute() {
  return (
    <TeacherSarprasInventoryScreen
      routeDefaults={{
        managedOnly: true,
        title: 'Inventaris Tugas',
        subtitle: 'Kelola inventaris ruangan yang ditugaskan kepada Anda.',
      }}
    />
  );
}
