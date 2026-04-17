import { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ENV } from '../../config/env';
import { tokenStorage } from '../../lib/storage/tokenStorage';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const INVALIDATE_DEBOUNCE_MS = 150;
const SHORT_LIVED_CONNECTION_MS = 5000;
const MAX_SHORT_LIVED_CONNECTIONS = 3;
const SOCKET_COOLDOWN_MS = 5 * 60 * 1000;
const HIGH_FREQUENCY_MUTATION_PATTERNS: RegExp[] = [
  /^\/api\/exams\/\d+\/answers$/,
];
const NOTIFICATION_QUERY_PREFIXES = ['mobile-notifications'];
const EXAM_QUERY_PREFIXES = [
  'mobile-student-exams',
  'mobile-student-exam-start',
  'mobile-student-exam-programs',
  'mobile-student-exam-cards',
  'mobile-student-exam-placements',
  'mobile-home-exam-programs',
  'mobile-teacher-exam-programs',
  'mobile-teacher-exam-packets',
  'mobile-teacher-exam-packet-detail',
  'mobile-teacher-exam-editor-programs',
  'mobile-teacher-exam-session-detail',
  'mobile-teacher-exam-submissions',
  'mobile-teacher-exam-item-analysis',
  'mobile-head-tu-exam-cards-overview',
  'mobile-head-tu-exam-cards-programs',
  'mobile-homeroom-book-exam-programs',
  'mobile-wakakur-exam-programs',
  'mobile-wakakur-exam-program-config',
  'mobile-wakakur-exam-components',
  'mobile-wakakur-exam-schedules',
  'mobile-wakakur-exam-sittings',
];
const SCHEDULE_QUERY_PREFIXES = [
  'mobile-schedule',
  'mobile-home-teacher-schedule',
  'mobile-home-teacher-schedule-time-config',
  'mobile-home-student-schedule',
  'mobile-home-student-schedule-time-config',
  'mobile-admin-schedule-entries',
  'mobile-admin-schedule-time-config',
];
const INTERNSHIP_QUERY_PREFIXES = [
  'mobile-home-student-internship-overview',
  'mobile-student-internship-overview',
  'mobile-student-internship-journals',
  'mobile-student-internship-attendances',
  'mobile-internship-duty',
  'mobile-internship-duty-journals',
  'mobile-internship-duty-attendances',
  'mobile-humas-internships',
];
const OSIS_QUERY_PREFIXES = [
  'mobile-home-active-osis-election',
  'mobile-student-osis-options',
  'mobile-teacher-osis-active-election',
  'mobile-osis-election-periods',
  'mobile-osis-election-quick-count',
  'mobile-osis-management-periods',
  'mobile-osis-work-program-readiness',
  'mobile-osis-divisions',
  'mobile-osis-positions',
  'mobile-osis-memberships',
  'mobile-osis-join-requests',
  'mobile-osis-grade-templates',
  'mobile-principal-osis-periods',
  'mobile-principal-osis-management-periods',
  'mobile-principal-osis-readiness',
  'mobile-principal-osis-quick-count',
];
const ACADEMIC_YEAR_QUERY_PREFIXES = [
  'mobile-home-active-academic-year',
  'mobile-osis-management-active-year',
  'mobile-osis-election-active-year',
  'mobile-head-tu-exam-cards-active-year',
  'mobile-principal-osis-active-year',
  'mobile-principal-exam-reports-active-year',
  'mobile-wakakur-exams-active-year',
  'mobile-staff-finance-academic-years',
];
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
const STAFF_FINANCE_QUERY_PREFIXES = [
  'mobile-staff-finance-bank-accounts',
  'mobile-staff-finance-bank-reconciliations',
  'mobile-staff-finance-payment-verifications',
  'mobile-staff-finance-ledger-books',
  'mobile-staff-finance-components',
  'mobile-staff-finance-tariffs',
  'mobile-staff-finance-adjustments',
  'mobile-staff-finance-invoices',
  'mobile-staff-finance-credits',
  'mobile-staff-finance-cash-sessions',
  'mobile-staff-finance-write-offs',
  'mobile-staff-finance-payment-reversals',
  'mobile-staff-finance-dashboard',
  'mobile-staff-finance-reminder-policy',
  'mobile-staff-finance-cash-session-policy',
  'mobile-staff-finance-closing-periods',
  'mobile-staff-finance-closing-period-reopen-requests',
  'mobile-staff-finance-closing-period-policy',
  'mobile-staff-finance-budget-realization',
  'mobile-staff-finance-performance-summary',
  'mobile-staff-finance-integrity-summary',
];
const HEAD_TU_FINANCE_QUERY_PREFIXES = [
  'mobile-head-tu-finance-write-offs',
  'mobile-head-tu-finance-payment-reversals',
  'mobile-head-tu-finance-cash-sessions',
  'mobile-head-tu-finance-cash-session-approvals',
  'mobile-head-tu-finance-bank-reconciliations',
  'mobile-head-tu-finance-budget-realization',
  'mobile-head-tu-finance-governance',
  'mobile-head-tu-finance-audit',
  'mobile-head-tu-finance-performance',
  'mobile-head-tu-finance-integrity',
  'mobile-head-tu-finance-closing-periods',
  'mobile-head-tu-finance-closing-period-approvals',
  'mobile-head-tu-finance-closing-period-reopen-requests',
  'mobile-head-tu-finance-closing-period-reopen-approvals',
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
    queryKeyPrefixes: EXAM_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/exams\/schedules(?:\/|$)/,
    queryKeyPrefixes: EXAM_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/exams\/programs(?:\/|$)/,
    queryKeyPrefixes: EXAM_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/exam-sittings(?:\/|$)/,
    queryKeyPrefixes: EXAM_QUERY_PREFIXES,
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
    pattern: /^\/api\/teacher-assignments(?:\/|$)/,
    queryKeyPrefixes: GRADE_REPORT_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/notifications(?:\/|$)/,
    queryKeyPrefixes: NOTIFICATION_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/schedules(?:\/|$)/,
    queryKeyPrefixes: SCHEDULE_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/schedule-time-configs(?:\/|$)/,
    queryKeyPrefixes: SCHEDULE_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/academic-years(?:\/|$)/,
    queryKeyPrefixes: [...ACADEMIC_YEAR_QUERY_PREFIXES, ...EXAM_QUERY_PREFIXES, ...SCHEDULE_QUERY_PREFIXES],
  },
  {
    pattern: /^\/api\/internships(?:\/|$)/,
    queryKeyPrefixes: INTERNSHIP_QUERY_PREFIXES,
  },
  {
    pattern: /^\/api\/osis(?:\/|$)/,
    queryKeyPrefixes: OSIS_QUERY_PREFIXES,
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
    queryKeyPrefixes: [...PRINCIPAL_APPROVAL_QUERY_PREFIXES, ...STAFF_FINANCE_QUERY_PREFIXES],
  },
  {
    pattern: /^\/api\/payments\/(?:cash-sessions|closing-periods|closing-period-reopen-requests|write-offs|reversals)(?:\/|$)/,
    queryKeyPrefixes: [
      ...PRINCIPAL_APPROVAL_QUERY_PREFIXES,
      ...STAFF_FINANCE_QUERY_PREFIXES,
      ...HEAD_TU_FINANCE_QUERY_PREFIXES,
    ],
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
    const pendingQueryKeyPrefixes = new Set<string>();

    const isEffectivelyActiveState = (state: AppStateStatus) =>
      state === 'active' || (Platform.OS === 'android' && state === 'inactive');
    const isAppActive = () => isEffectivelyActiveState(appState);

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

    const shouldSkipMutationInvalidate = (path: string) =>
      HIGH_FREQUENCY_MUTATION_PATTERNS.some((pattern) => pattern.test(path));

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
      if (!Array.isArray(queryKeyPrefixes) || queryKeyPrefixes.length === 0) return;
      queryKeyPrefixes.forEach((queryKeyPrefix) => {
        if (!queryKeyPrefix) return;
        pendingQueryKeyPrefixes.add(queryKeyPrefix);
      });
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
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
              scheduleInvalidate(targets);
              return;
            }
            if (payload?.type === 'MUTATION' && typeof payload.path === 'string') {
              if (shouldSkipMutationInvalidate(payload.path)) return;
              const targets = resolveMutationQueryKeyPrefixes(payload.path);
              scheduleInvalidate(targets);
              return;
            }
          } catch {
            // noop
          }
        }
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
      if (!isEffectivelyActiveState(state)) {
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
