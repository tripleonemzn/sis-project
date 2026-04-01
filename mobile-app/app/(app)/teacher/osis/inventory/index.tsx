import { Redirect } from 'expo-router';

export default function TeacherOsisInventoryRoute() {
  return (
    <Redirect
      href={{
        pathname: '/teacher/sarpras-inventory',
        params: {
          managedOnly: '1',
          title: 'Kelola Inventaris OSIS',
          subtitle: 'Kelola inventaris ruangan OSIS yang ditugaskan kepada Anda.',
        },
      }}
    />
  );
}
