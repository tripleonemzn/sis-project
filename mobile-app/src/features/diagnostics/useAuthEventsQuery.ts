import { useQuery } from '@tanstack/react-query';
import { authEventLogger } from '../../lib/auth/authEventLogger';

export function useAuthEventsQuery(enabled = true) {
  return useQuery({
    queryKey: ['mobile-auth-events'],
    enabled,
    queryFn: () => authEventLogger.getAll(),
  });
}

