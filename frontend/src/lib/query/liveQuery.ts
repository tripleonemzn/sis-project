export const LIVE_QUERY_INTERVAL_MS = 30000;

function computeLiveRefetchInterval(): number | false {
  if (typeof document === 'undefined') return LIVE_QUERY_INTERVAL_MS;
  return document.visibilityState === 'visible' ? LIVE_QUERY_INTERVAL_MS : false;
}

export const liveQueryOptions = {
  staleTime: 15000,
  refetchInterval: computeLiveRefetchInterval,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchOnMount: false,
} as const;
