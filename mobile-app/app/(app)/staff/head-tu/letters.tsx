import { Redirect } from 'expo-router';

export default function StaffHeadTuLettersRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'staff-head-tu-letters',
          path: '/staff/head-tu/letters',
          label: 'Surat-Menyurat',
        },
      }}
    />
  );
}
