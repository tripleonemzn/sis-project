import { Redirect } from 'expo-router';

export default function StaffHeadTuExamCardsRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'staff-head-tu-exam-cards',
          path: '/staff/head-tu/exam-cards',
          label: 'Kartu Ujian',
        },
      }}
    />
  );
}
