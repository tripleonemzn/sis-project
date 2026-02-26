export const MOBILE_LIVE_QUERY_INTERVAL_MS = 5000;

export const mobileLiveQueryOptions = {
  staleTime: 0,
  refetchInterval: MOBILE_LIVE_QUERY_INTERVAL_MS,
  refetchOnReconnect: true,
  refetchOnMount: true,
} as const;
