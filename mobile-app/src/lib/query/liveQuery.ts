export const MOBILE_LIVE_QUERY_INTERVAL_MS = 30000;

export const mobileLiveQueryOptions = {
  staleTime: 20000,
  refetchInterval: MOBILE_LIVE_QUERY_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;
