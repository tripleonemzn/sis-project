import { Redirect } from 'expo-router';

export default function TeacherOsisVoteRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'teacher-osis-vote',
          path: '/teacher/osis/vote',
          label: 'Pemungutan Suara OSIS',
        },
      }}
    />
  );
}
