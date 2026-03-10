export const MOBILE_LIVE_QUERY_INTERVAL_MS = 15000;

export const mobileLiveQueryOptions = {
  staleTime: 10000,
  refetchInterval: MOBILE_LIVE_QUERY_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnReconnect: true,
  refetchOnMount: true,
} as const;
