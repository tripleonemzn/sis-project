import { Redirect } from 'expo-router';

export default function PrincipalMonitoringOperationsRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'principal-monitoring-operations',
          path: '/principal/monitoring/operations',
          label: 'Monitoring',
        },
      }}
    />
  );
}
