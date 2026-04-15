import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ENV } from '../../config/env';
import { tokenStorage } from '../../lib/storage/tokenStorage';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const INVALIDATE_DEBOUNCE_MS = 150;
const SHORT_LIVED_CONNECTION_MS = 5000;
const MAX_SHORT_LIVED_CONNECTIONS = 3;
const SOCKET_COOLDOWN_MS = 5 * 60 * 1000;
const NOTIFICATION_QUERY_PREFIXES = ['mobile-notifications'];
const GRADE_REPORT_QUERY_PREFIXES = [
  'mobile-student-grade-overview',
  'mobile-teacher-subject-report',
  'mobile-homeroom-report-ledger',
  'mobile-homeroom-report-ranking',
  'mobile-homeroom-report-student',
  'mobile-wakakur-reports-ledger',
];
const ATTENDANCE_QUERY_PREFIXES = [
  'mobile-teacher-subject-attendance',
  'mobile-student-attendance',
  'mobile-student-class-attendance',
  'mobile-homeroom-daily',
  'mobile-homeroom-recap',
  'mobile-homeroom-late',
  'mobile-principal-attendance-recap',
  'mobile-admin-academic-late-summary',
  'mobile-wakakur-reports-attendance',
];
const PROCTORING_QUERY_PREFIXES = [
  'mobile-proctoring-schedules',
  'mobile-proctoring-detail',
];
const PRINCIPAL_APPROVAL_QUERY_PREFIXES = [
  'mobile-principal-approvals',
  'mobile-principal-write-offs',
  'mobile-principal-payment-reversals',
  'mobile-principal-cash-sessions',
  'mobile-principal-cash-session-approvals',
  'mobile-principal-bank-reconciliations',
  'mobile-principal-budget-realization',
  'mobile-principal-governance',
  'mobile-principal-finance-audit',
  'mobile-principal-finance-performance',
  'mobile-principal-finance-integrity',
  'mobile-principal-closing-periods',
  'mobile-principal-closing-period-approvals',
  'mobile-principal-closing-period-reopen-requests',
  'mobile-principal-closing-period-reopen-approvals',
];
const DOMAIN_QUERY_TARGETS: Record<string, string[]> = {
  GRADES: GRADE_REPORT_QUERY_PREFIXES,
  REPORTS: GRADE_REPORT_QUERY_PREFIXES,
  ATTENDANCE: ATTENDANCE_QUERY_PREFIXES,
  PROCTORING: PROCTORING_QUERY_PREFIXES,
};
const MUTATION_QUERY_TARGETS: Array<{ pattern: RegExp; queryKeyPrefixes: string[] }> = [
  {
    pattern: /^\/api\/grades(?:\/|$)/,
    queryKeyPrefixes: GRADE_REPORT_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/reports(?:\/|$)/,
    queryKeyPrefixes: GRADE_REPORT_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/teacher-assignments(?:\/|$)/,
    queryKeyPrefixes: GRADE_REPORT_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/notifications(?:\/|$)/,
    queryKeyPrefixes: NOTIFICATION_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/attendances\/(?:subject|daily)(?:\/|$)/,
    queryKeyPrefixes: ATTENDANCE_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/proctoring\/schedules(?:\/|$)/,
    queryKeyPrefixes: PROCTORING_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/budget-requests(?:\/|$)/,
    queryKeyPrefixes: PRINCIPAL_APPROVAL_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/payments\/(?:cash-sessions|closing-periods|closing-period-reopen-requests|write-offs|reversals)(?:\/|$)/,
    queryKeyPrefixes: PRINCIPAL_APPROVAL_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/server\/(?:info|storage|monitoring)(?:\/|$)/,
    queryKeyPrefixes: ['mobile-admin-server-info', 'mobile-admin-server-storage', 'mobile-admin-server-monitoring'],
  },
];

type RealtimeEventPayload = {
  type?: string;
  path?: string;
  domain?: string;
};

function buildRealtimeWsUrl(token: string) {
  const normalizedBase = String(ENV.API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return null;
  const wsBase = normalizedBase.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  const client = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'unknown';
  return `${wsBase}/realtime/ws?token=${encodeURIComponent(token)}&client=${encodeURIComponent(client)}`;
}

export function useMobileRealtimeSync(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = INITIAL_BACKOFF_MS;
    let appState = AppState.currentState;
    let shortLivedConnections = 0;
    let socketCooldownUntil = 0;
    let lastOpenedAt = 0;
    let pendingGlobalInvalidate = false;
    const pendingQueryKeyPrefixes = new Set<string>();

    const isAppActive = () => appState === 'active';

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = (delayMs: number) => {
      if (disposed || !isAppActive()) return;
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, Math.max(delayMs, INITIAL_BACKOFF_MS));
    };

    const resolveMutationQueryKeyPrefixes = (path: string): string[] => {
      for (const target of MUTATION_QUERY_TARGETS) {
        if (target.pattern.test(path)) {
          return target.queryKeyPrefixes;
        }
      }
      return [];
    };

    const resolveDomainQueryKeyPrefixes = (domain: string | undefined): string[] => {
      const normalized = String(domain || '').trim().toUpperCase();
      return DOMAIN_QUERY_TARGETS[normalized] || [];
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

      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
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

    const connect = async () => {
      if (disposed || !isAppActive() || socketCooldownUntil > Date.now()) return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const token = await tokenStorage.getAccessToken();
      if (disposed || !token) return;

      const wsUrl = buildRealtimeWsUrl(token);
      if (!wsUrl) return;

      lastOpenedAt = Date.now();
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        backoffMs = INITIAL_BACKOFF_MS;
        shortLivedConnections = 0;
        socketCooldownUntil = 0;
        clearReconnectTimer();
      };

      socket.onmessage = (event) => {
        if (typeof event.data === 'string' && event.data.length > 0) {
          try {
            const payload = JSON.parse(event.data) as RealtimeEventPayload;
            if (payload?.type === 'READY') return;
            if (payload?.type === 'PRESENCE') {
              scheduleInvalidate(['mobile-admin-server-online-users', 'mobile-admin-server-monitoring']);
              return;
            }
            if (payload?.type === 'DOMAIN_EVENT') {
              const targets = resolveDomainQueryKeyPrefixes(payload.domain);
              scheduleInvalidate(targets.length > 0 ? targets : undefined);
              return;
            }
            if (payload?.type === 'MUTATION' && typeof payload.path === 'string') {
              const targets = resolveMutationQueryKeyPrefixes(payload.path);
              scheduleInvalidate(targets.length > 0 ? targets : undefined);
              return;
            }
          } catch {
            // noop
          }
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
        const livedMs = Date.now() - lastOpenedAt;
        if (livedMs > 0 && livedMs < SHORT_LIVED_CONNECTION_MS) {
          shortLivedConnections += 1;
          if (shortLivedConnections >= MAX_SHORT_LIVED_CONNECTIONS) {
            socketCooldownUntil = Date.now() + SOCKET_COOLDOWN_MS;
            scheduleReconnect(SOCKET_COOLDOWN_MS);
            return;
          }
        } else {
          shortLivedConnections = 0;
        }
        if (!isAppActive()) return;
        scheduleReconnect(backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      };
    };

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      appState = state;
      if (state !== 'active') {
        clearReconnectTimer();
        closeSocket();
        return;
      }
      scheduleInvalidate();
      if (socketCooldownUntil > Date.now()) {
        scheduleReconnect(socketCooldownUntil - Date.now());
        return;
      }
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        backoffMs = INITIAL_BACKOFF_MS;
        void connect();
      }
    });

    void connect();

    return () => {
      disposed = true;
      appStateSubscription.remove();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (invalidateTimer) clearTimeout(invalidateTimer);
      closeSocket();
    };
  }, [enabled, queryClient]);
}
