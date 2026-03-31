import { Redirect } from 'expo-router';

export default function PrincipalExamReportsRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'principal-exam-reports',
          path: '/principal/exams/reports',
          label: 'Berita Acara Ujian',
        },
      }}
    />
  );
}
