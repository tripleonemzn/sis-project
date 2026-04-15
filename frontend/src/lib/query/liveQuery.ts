export const LIVE_QUERY_INTERVAL_MS = 30000;

export function computeVisibleRefetchInterval(intervalMs: number): number | false {
  if (typeof document === 'undefined') return intervalMs;
  return document.visibilityState === 'visible' ? intervalMs : false;
}

function computeLiveRefetchInterval(): number | false {
  return computeVisibleRefetchInterval(LIVE_QUERY_INTERVAL_MS);
}

export const liveQueryOptions = {
  staleTime: 15000,
  refetchInterval: computeLiveRefetchInterval,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchOnMount: false,
} as const;
