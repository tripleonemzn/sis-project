import { Redirect } from 'expo-router';

export default function PrincipalAssignedInventoryHubRoute() {
  return (
    <Redirect
      href={{
        pathname: '/teacher/sarpras-inventory',
        params: {
          managedOnly: '1',
          title: 'Inventaris Tugas',
          subtitle: 'Kelola inventaris ruangan yang ditugaskan kepada Anda.',
        },
      }}
    />
  );
}
