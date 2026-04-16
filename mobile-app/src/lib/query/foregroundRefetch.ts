export const MOBILE_FOREGROUND_REFETCH_MIN_INTERVAL_MS = 60_000;

type ForegroundRefetchGuardParams = {
  dataUpdatedAt: number;
  isFetching: boolean;
  lastTriggeredAt: number;
  minIntervalMs?: number;
  now?: number;
};

export function shouldRunForegroundRefetch({
  dataUpdatedAt,
  isFetching,
  lastTriggeredAt,
  minIntervalMs = MOBILE_FOREGROUND_REFETCH_MIN_INTERVAL_MS,
  now = Date.now(),
}: ForegroundRefetchGuardParams) {
  if (isFetching) return false;
  if (lastTriggeredAt > 0 && now - lastTriggeredAt < minIntervalMs) return false;
  if (dataUpdatedAt > 0 && now - dataUpdatedAt < minIntervalMs) return false;
  return true;
}
