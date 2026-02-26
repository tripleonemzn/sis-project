export const LIVE_QUERY_INTERVAL_MS = 5000;

export const liveQueryOptions = {
  staleTime: 0,
  refetchInterval: LIVE_QUERY_INTERVAL_MS,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchOnMount: true,
} as const;
