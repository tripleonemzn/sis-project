import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PrincipalAssignedInventoryRoomRoute() {
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomId = typeof params.roomId === 'string' ? params.roomId.trim() : '';

  if (!roomId) {
    return <Redirect href="/principal/assigned-inventory" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/teacher/sarpras-inventory',
        params: {
          managedOnly: '1',
          roomId,
          title: 'Kelola Inventaris',
          subtitle: 'Kelola inventaris ruangan yang ditugaskan kepada Anda.',
        },
      }}
    />
  );
}
