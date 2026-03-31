import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TeacherOsisInventoryRoomRoute() {
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomId = typeof params.roomId === 'string' ? params.roomId.trim() : '';

  if (!roomId) {
    return <Redirect href="/teacher/osis/inventory" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/teacher/sarpras-inventory',
        params: {
          managedOnly: '1',
          roomId,
          title: 'Kelola Inventaris OSIS',
          subtitle: 'Kelola inventaris ruangan OSIS yang ditugaskan kepada Anda.',
        },
      }}
    />
  );
}
