import { Redirect } from 'expo-router';

export default function TeacherOsisElectionRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'teacher-osis-election',
          path: '/teacher/osis/election',
          label: 'Pemilihan OSIS',
        },
      }}
    />
  );
}
