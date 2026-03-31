import { Redirect } from 'expo-router';

export default function TeacherOsisInventoryRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'teacher-osis-inventory',
          path: '/teacher/osis/inventory',
          label: 'Inventaris OSIS',
        },
      }}
    />
  );
}
