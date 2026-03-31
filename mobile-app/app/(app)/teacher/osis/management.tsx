import { Redirect } from 'expo-router';

export default function TeacherOsisManagementRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'teacher-osis-management',
          path: '/teacher/osis/management',
          label: 'Struktur & Nilai OSIS',
        },
      }}
    />
  );
}
