import { Redirect } from 'expo-router';

export default function PrincipalMonitoringOsisRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'principal-monitoring-osis',
          path: '/principal/monitoring/osis',
          label: 'Pemilihan OSIS',
        },
      }}
    />
  );
}
