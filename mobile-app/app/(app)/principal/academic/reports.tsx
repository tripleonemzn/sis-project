import { Redirect } from 'expo-router';

export default function PrincipalAcademicReportsRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'principal-academic-reports',
          path: '/principal/academic/reports',
          label: 'Rapor & Ranking',
        },
      }}
    />
  );
}
