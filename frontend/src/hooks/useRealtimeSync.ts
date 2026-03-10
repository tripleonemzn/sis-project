import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const INVALIDATE_DEBOUNCE_MS = 120;
const MAX_COLD_START_FAILURES = 2;
const COLD_START_COOLDOWN_MS = 10 * 60 * 1000;
const WS_DISABLE_UNTIL_KEY = '__realtime_ws_disabled_until';
const HIGH_FREQUENCY_MUTATION_PATTERNS: RegExp[] = [
  /^\/api\/exams\/\d+\/answers$/,
];
const MUTATION_QUERY_TARGETS: Array<{ pattern: RegExp; queryKeyPrefixes: string[] }> = [
  {
    pattern: /^\/api\/exams\/packets(?:\/|$)/,
    queryKeyPrefixes: ['exam-packets', 'bank-questions', 'available-exams'],
  },
  {
    pattern: /^\/api\/exams\/schedules(?:\/|$)/,
    queryKeyPrefixes: ['available-exams', 'my-exam-sittings', 'exam-schedules'],
  },
  {
    pattern: /^\/api\/exams\/programs(?:\/|$)/,
    queryKeyPrefixes: ['teacher-exam-programs', 'sidebar-exam-programs', 'available-exams'],
  },
  {
    pattern: /^\/api\/teacher-assignments(?:\/|$)/,
    queryKeyPrefixes: ['teacher-assignments', 'teacher-assignments-dashboard', 'teaching-load-summary'],
  },
  {
    pattern: /^\/api\/academic-years(?:\/|$)/,
    queryKeyPrefixes: ['active-academic-year', 'academic-years'],
  },
  {
    pattern: /^\/api\/server\/(?:info|storage|monitoring)(?:\/|$)/,
    queryKeyPrefixes: ['admin-server-info', 'admin-server-storage', 'admin-server-monitoring'],
  },
  {
    pattern: /^\/api\/server\/webmail\/(?:reset-mailbox-password|reset-history)(?:\/|$)/,
    queryKeyPrefixes: ['admin-webmail-reset-history'],
  },
];

type RealtimeMutationPayload = {
  type?: string;
  path?: string;
};

function buildRealtimeWsUrl(token: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/realtime/ws?token=${encodeURIComponent(token)}`;
}

export function useRealtimeSync(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let socket: WebSocket | null = null;
    let disposed = false;
    let reconnectTimer: number | null = null;
    let invalidateTimer: number | null = null;
    let pendingGlobalInvalidate = false;
    const pendingQueryKeyPrefixes = new Set<string>();
    let backoffMs = INITIAL_BACKOFF_MS;
    let hasEverConnected = false;
    let coldStartFailures = 0;
    let disableReconnect = false;

    const clearSocketCooldown = () => {
      try {
        window.sessionStorage.removeItem(WS_DISABLE_UNTIL_KEY);
      } catch {
        // noop
      }
    };

    const markSocketCooldown = () => {
      try {
        window.sessionStorage.setItem(
          WS_DISABLE_UNTIL_KEY,
          String(Date.now() + COLD_START_COOLDOWN_MS),
        );
      } catch {
        // noop
      }
    };

    const canAttemptSocket = () => {
      try {
        const raw = window.sessionStorage.getItem(WS_DISABLE_UNTIL_KEY);
        if (!raw) return true;
        const until = Number(raw);
        if (!Number.isFinite(until) || until <= Date.now()) {
          window.sessionStorage.removeItem(WS_DISABLE_UNTIL_KEY);
          return true;
        }
        return false;
      } catch {
        return true;
      }
    };

    const shouldSkipGlobalInvalidate = (path: string) =>
      HIGH_FREQUENCY_MUTATION_PATTERNS.some((pattern) => pattern.test(path));

    const resolveQueryKeyPrefixes = (path: string): string[] => {
      for (const target of MUTATION_QUERY_TARGETS) {
        if (target.pattern.test(path)) {
          return target.queryKeyPrefixes;
        }
      }
      return [];
    };

    const scheduleInvalidate = (queryKeyPrefixes?: string[]) => {
      if (Array.isArray(queryKeyPrefixes) && queryKeyPrefixes.length > 0) {
        queryKeyPrefixes.forEach((queryKeyPrefix) => {
          if (!queryKeyPrefix) return;
          pendingQueryKeyPrefixes.add(queryKeyPrefix);
        });
      } else {
        pendingGlobalInvalidate = true;
      }

      if (invalidateTimer !== null) return;
      invalidateTimer = window.setTimeout(() => {
        invalidateTimer = null;
        if (pendingGlobalInvalidate) {
          pendingGlobalInvalidate = false;
          pendingQueryKeyPrefixes.clear();
          void queryClient.invalidateQueries({ refetchType: 'active' });
          return;
        }

        if (pendingQueryKeyPrefixes.size === 0) return;
        const targets = Array.from(pendingQueryKeyPrefixes);
        pendingQueryKeyPrefixes.clear();
        targets.forEach((queryKeyPrefix) => {
          void queryClient.invalidateQueries({
            queryKey: [queryKeyPrefix],
            refetchType: 'active',
          });
        });
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const closeSocket = () => {
      if (!socket) return;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      socket = null;
    };

    const connect = () => {
      if (disposed || disableReconnect || !canAttemptSocket()) return;
      const token = localStorage.getItem('token');
      if (!token) return;

      socket = new WebSocket(buildRealtimeWsUrl(token));

      socket.onopen = () => {
        backoffMs = INITIAL_BACKOFF_MS;
        hasEverConnected = true;
        coldStartFailures = 0;
        clearSocketCooldown();
      };

      socket.onmessage = (event) => {
        let payload: RealtimeMutationPayload | null = null;
        if (typeof event.data === 'string' && event.data.length > 0) {
          try {
            payload = JSON.parse(event.data) as RealtimeMutationPayload;
          } catch {
            payload = null;
          }
        }
        if (payload?.type === 'MUTATION' && typeof payload.path === 'string') {
          if (shouldSkipGlobalInvalidate(payload.path)) return;
          const targets = resolveQueryKeyPrefixes(payload.path);
          scheduleInvalidate(targets.length > 0 ? targets : undefined);
          return;
        }
        scheduleInvalidate();
      };

      socket.onerror = () => {
        try {
          socket?.close();
        } catch {
          // noop
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        if (!hasEverConnected) {
          coldStartFailures += 1;
          if (coldStartFailures >= MAX_COLD_START_FAILURES) {
            disableReconnect = true;
            markSocketCooldown();
            return;
          }
        }
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      };
    };

    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return;
      scheduleInvalidate();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'token') return;
      closeSocket();
      backoffMs = INITIAL_BACKOFF_MS;
      hasEverConnected = false;
      coldStartFailures = 0;
      disableReconnect = false;
      clearSocketCooldown();
      connect();
    };

    connect();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('storage', handleStorage);

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (invalidateTimer !== null) {
        window.clearTimeout(invalidateTimer);
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('storage', handleStorage);
      closeSocket();
    };
  }, [enabled, queryClient]);
}
