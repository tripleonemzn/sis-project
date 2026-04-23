import { Redirect, useLocalSearchParams } from 'expo-router';
import { TeacherSarprasInventoryScreen } from '../../teacher/sarpras-inventory';

export default function PrincipalAssignedInventoryRoomRoute() {
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomId = typeof params.roomId === 'string' ? params.roomId.trim() : '';
  const roomIdNumber = Number.parseInt(roomId, 10);

  if (!roomId || !Number.isFinite(roomIdNumber) || roomIdNumber <= 0) {
    return <Redirect href="/principal/assigned-inventory" />;
  }

  return (
    <TeacherSarprasInventoryScreen
      routeDefaults={{
        managedOnly: true,
        roomId: roomIdNumber,
        title: 'Kelola Inventaris',
        subtitle: 'Kelola inventaris ruangan yang ditugaskan kepada Anda.',
      }}
    />
  );
}
