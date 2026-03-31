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
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: `principal-assigned-inventory-room-${roomId}`,
          path: `/principal/assigned-inventory/${roomId}`,
          label: 'Inventaris Tugas',
        },
      }}
    />
  );
}
