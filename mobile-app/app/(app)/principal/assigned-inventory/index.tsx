import { Redirect } from 'expo-router';

export default function PrincipalAssignedInventoryHubRoute() {
  return (
    <Redirect
      href={{
        pathname: '/web-module/[moduleKey]',
        params: {
          moduleKey: 'principal-assigned-inventory-hub',
          path: '/principal/assigned-inventory',
          label: 'Inventaris Tugas',
        },
      }}
    />
  );
}
