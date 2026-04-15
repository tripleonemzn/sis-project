import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { REALTIME_DOMAIN_ACTIVITY_EVENT, type RealtimeDomainActivityDetail } from '../lib/realtime/domainActivity';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const INVALIDATE_DEBOUNCE_MS = 120;
const MAX_COLD_START_FAILURES = 2;
const SHORT_LIVED_CONNECTION_MS = 5000;
const MAX_SHORT_LIVED_CONNECTIONS = 3;
const COLD_START_COOLDOWN_MS = 10 * 60 * 1000;
const WS_DISABLE_UNTIL_KEY = '__realtime_ws_disabled_until';
const NOTIFICATION_REFRESH_EVENT = 'sis:notifications:refresh';
const HIGH_FREQUENCY_MUTATION_PATTERNS: RegExp[] = [
  /^\/api\/exams\/\d+\/answers$/,
];
const NOTIFICATION_MUTATION_PATTERNS: RegExp[] = [
  /^\/api\/exams\/packets\/\d+\/review-feedback(?:\/|$)/,
  /^\/api\/notifications(?:\/|$)/,
];
const NOTIFICATION_QUERY_PREFIXES = ['web-notifications'];
const GRADE_REPORT_QUERY_PREFIXES = [
  'student-grade-overview',
  'teacher-subject-report',
  'class-ledger',
  'class-rankings',
  'wakasek-academic-ledger-preview',
];
const ATTENDANCE_QUERY_PREFIXES = [
  'subject-attendance',
  'student-daily-attendance',
  'student-attendance-history',
];
const PROCTORING_QUERY_PREFIXES = [
  'teacher-proctor-schedules',
  'teacher-proctor-monitoring',
  'wakasek-academic-proctor-summary',
];
const PRINCIPAL_APPROVAL_QUERY_PREFIXES = [
  'budget-requests',
  'principal-finance-write-offs',
  'principal-finance-payment-reversals',
  'principal-finance-cash-sessions',
  'principal-finance-cash-session-approvals',
  'principal-finance-bank-reconciliations',
  'principal-finance-budget-realization',
  'principal-finance-governance',
  'principal-finance-audit',
  'principal-finance-performance',
  'principal-finance-integrity',
  'principal-finance-closing-periods',
  'principal-finance-closing-period-approvals',
  'principal-finance-closing-period-reopen-requests',
  'principal-finance-closing-period-reopen-approvals',
];
const DOMAIN_QUERY_TARGETS: Record<string, string[]> = {
  GRADES: GRADE_REPORT_QUERY_PREFIXES,
  REPORTS: GRADE_REPORT_QUERY_PREFIXES,
  ATTENDANCE: ATTENDANCE_QUERY_PREFIXES,
  PROCTORING: PROCTORING_QUERY_PREFIXES,
};
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
    queryKeyPrefixes: [
      'teacher-assignments',
      'teacher-assignments-dashboard',
      'teaching-load-summary',
      ...GRADE_REPORT_QUERY_PREFIXES,
    ],
  },
  {
    pattern: /^\/api\/grades(?:\/|$)/,
    queryKeyPrefixes: GRADE_REPORT_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/reports(?:\/|$)/,
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
  domain?: string;
};

function buildRealtimeWsUrl(token: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/realtime/ws?token=${encodeURIComponent(token)}&client=web`;
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
    let shortLivedConnections = 0;
    let lastOpenedAt = 0;

    const canUseRealtime = () =>
      document.visibilityState === 'visible' && typeof navigator !== 'undefined' && navigator.onLine !== false;

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = (delayMs: number) => {
      if (disposed) return;
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, Math.max(delayMs, INITIAL_BACKOFF_MS));
    };

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

    const getSocketCooldownRemainingMs = () => {
      try {
        const raw = window.sessionStorage.getItem(WS_DISABLE_UNTIL_KEY);
        if (!raw) return 0;
        const until = Number(raw);
        if (!Number.isFinite(until) || until <= Date.now()) {
          window.sessionStorage.removeItem(WS_DISABLE_UNTIL_KEY);
          return 0;
        }
        return until - Date.now();
      } catch {
        return 0;
      }
    };

    const canAttemptSocket = () => getSocketCooldownRemainingMs() === 0;

    const shouldSkipGlobalInvalidate = (path: string) =>
      HIGH_FREQUENCY_MUTATION_PATTERNS.some((pattern) => pattern.test(path));

    const shouldRefreshNotifications = (path: string) =>
      NOTIFICATION_MUTATION_PATTERNS.some((pattern) => pattern.test(path));

    const resolveQueryKeyPrefixes = (path: string): string[] => {
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

    const emitDomainActivity = (domain: string | undefined) => {
      const normalized = String(domain || '').trim().toUpperCase();
      if (!normalized) return;
      window.dispatchEvent(
        new CustomEvent<RealtimeDomainActivityDetail>(REALTIME_DOMAIN_ACTIVITY_EVENT, {
          detail: {
            domain: normalized,
            occurredAt: Date.now(),
          },
        }),
      );
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
      if (disposed || !canAttemptSocket() || !canUseRealtime()) return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const token = localStorage.getItem('token');
      if (!token) return;

      lastOpenedAt = Date.now();
      socket = new WebSocket(buildRealtimeWsUrl(token));

      socket.onopen = () => {
        backoffMs = INITIAL_BACKOFF_MS;
        hasEverConnected = true;
        coldStartFailures = 0;
        clearReconnectTimer();
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
        if (payload?.type === 'READY') return;
        if (payload?.type === 'PRESENCE') {
          scheduleInvalidate(['admin-server-online-users', 'admin-server-monitoring']);
          return;
        }
        if (payload?.type === 'DOMAIN_EVENT') {
          emitDomainActivity(payload.domain);
          const targets = resolveDomainQueryKeyPrefixes(payload.domain);
          scheduleInvalidate(targets.length > 0 ? targets : undefined);
          return;
        }
        if (payload?.type === 'MUTATION' && typeof payload.path === 'string') {
          if (shouldSkipGlobalInvalidate(payload.path)) return;
          if (shouldRefreshNotifications(payload.path)) {
            window.dispatchEvent(new CustomEvent(NOTIFICATION_REFRESH_EVENT));
          }
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
        const livedMs = Date.now() - lastOpenedAt;
        if (!hasEverConnected) {
          coldStartFailures += 1;
          if (coldStartFailures >= MAX_COLD_START_FAILURES) {
            markSocketCooldown();
            scheduleReconnect(COLD_START_COOLDOWN_MS);
            return;
          }
        }
        if (livedMs > 0 && livedMs < SHORT_LIVED_CONNECTION_MS) {
          shortLivedConnections += 1;
          if (shortLivedConnections >= MAX_SHORT_LIVED_CONNECTIONS) {
            markSocketCooldown();
            scheduleReconnect(COLD_START_COOLDOWN_MS);
            return;
          }
        } else {
          shortLivedConnections = 0;
        }
        if (!canUseRealtime()) return;
        scheduleReconnect(backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      };
    };

    const handleVisibleState = () => {
      if (!canUseRealtime()) {
        clearReconnectTimer();
        closeSocket();
        return;
      }
      scheduleInvalidate();
      if (!canAttemptSocket()) {
        scheduleReconnect(getSocketCooldownRemainingMs());
        return;
      }
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        backoffMs = INITIAL_BACKOFF_MS;
        connect();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'token') return;
      clearReconnectTimer();
      closeSocket();
      backoffMs = INITIAL_BACKOFF_MS;
      hasEverConnected = false;
      coldStartFailures = 0;
      shortLivedConnections = 0;
      clearSocketCooldown();
      connect();
    };

    connect();
    window.addEventListener('focus', handleVisibleState);
    window.addEventListener('online', handleVisibleState);
    window.addEventListener('offline', handleVisibleState);
    document.addEventListener('visibilitychange', handleVisibleState);
    window.addEventListener('storage', handleStorage);

    return () => {
      disposed = true;
      clearReconnectTimer();
      if (invalidateTimer !== null) {
        window.clearTimeout(invalidateTimer);
      }
      window.removeEventListener('focus', handleVisibleState);
      window.removeEventListener('online', handleVisibleState);
      window.removeEventListener('offline', handleVisibleState);
      document.removeEventListener('visibilitychange', handleVisibleState);
      window.removeEventListener('storage', handleStorage);
      closeSocket();
    };
  }, [enabled, queryClient]);
}
