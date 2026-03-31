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
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: `teacher-osis-inventory-room-${roomId}`,
          path: `/teacher/assigned-inventory/${roomId}`,
          label: 'Kelola Inventaris',
        },
      }}
    />
  );
}
