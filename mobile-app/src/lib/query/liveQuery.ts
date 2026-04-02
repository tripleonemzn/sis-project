export const MOBILE_LIVE_QUERY_INTERVAL_MS = 60000;

export const mobileLiveQueryOptions = {
  staleTime: 45000,
  refetchInterval: MOBILE_LIVE_QUERY_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;
