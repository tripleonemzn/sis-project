import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { ENV } from '../../config/env';
import { tokenStorage } from '../../lib/storage/tokenStorage';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

type ScopeValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

type RealtimeDomainPayload = {
  type?: string;
  domain?: string;
  scope?: Record<string, ScopeValue>;
};

export type MobileStudentExamWarningRealtimePayload = {
  id: number;
  title: string;
  message: string;
  warnedAt: string;
  proctorName: string | null;
  category: string | null;
};

function buildRealtimeWsUrl(token: string) {
  const normalizedBase = String(ENV.API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return null;
  const wsBase = normalizedBase.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  const url = new URL(`${wsBase}/realtime/ws`);
  url.searchParams.set('token', token);
  url.searchParams.set('client', 'ANDROID');
  return url.toString();
}

function scopeIncludesNumber(
  scope: Record<string, ScopeValue> | undefined,
  key: string,
  target: number,
): boolean {
  const value = scope?.[key];
  if (Array.isArray(value)) {
    return value.some((item) => Number(item) === target);
  }
  return Number(value) === target;
}

function parseWarningPayload(
  scope: Record<string, ScopeValue> | undefined,
): MobileStudentExamWarningRealtimePayload | null {
  const id = Number(scope?.warningNotificationId || 0);
  const title = String(scope?.warningTitle || 'Peringatan Pengawas Ujian').trim();
  const message = String(scope?.warningMessage || '').trim();
  if (!Number.isFinite(id) || id <= 0 || !message) return null;
  return {
    id,
    title,
    message,
    warnedAt: String(scope?.warningAt || new Date().toISOString()),
    proctorName: String(scope?.proctorName || '').trim() || null,
    category: String(scope?.warningCategory || '').trim() || null,
  };
}

export function useStudentExamWarningRealtime(params: {
  enabled: boolean;
  scheduleId: number | null;
  studentId: number | null;
  onWarning: (payload: MobileStudentExamWarningRealtimePayload) => void;
  onAppActiveSync?: () => void;
}) {
  const onWarningRef = useRef(params.onWarning);
  const onAppActiveSyncRef = useRef(params.onAppActiveSync);

  useEffect(() => {
    onWarningRef.current = params.onWarning;
  }, [params.onWarning]);

  useEffect(() => {
    onAppActiveSyncRef.current = params.onAppActiveSync;
  }, [params.onAppActiveSync]);

  useEffect(() => {
    if (!params.enabled || !params.scheduleId || !params.studentId) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let backoffMs = INITIAL_BACKOFF_MS;
    let appState: AppStateStatus = AppState.currentState;

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
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
      if (disposed || appState !== 'active') return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const token = await tokenStorage.getAccessToken();
      if (!token) return;
      const wsUrl = buildRealtimeWsUrl(token);
      if (!wsUrl) return;

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        backoffMs = INITIAL_BACKOFF_MS;
        clearReconnect();
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string' || event.data.length === 0) return;
        let payload: RealtimeDomainPayload | null = null;
        try {
          payload = JSON.parse(event.data) as RealtimeDomainPayload;
        } catch {
          payload = null;
        }
        if (!payload || payload.type !== 'DOMAIN_EVENT' || payload.domain !== 'PROCTORING') return;
        if (String(payload.scope?.mode || '').trim().toUpperCase() !== 'EXAM_WARNING') return;
        if (!scopeIncludesNumber(payload.scope, 'scheduleIds', params.scheduleId!)) return;
        if (!scopeIncludesNumber(payload.scope, 'studentIds', params.studentId!)) return;
        const warningPayload = parseWarningPayload(payload.scope);
        if (!warningPayload) return;
        onWarningRef.current(warningPayload);
      };

      socket.onerror = () => {
        try {
          socket?.close();
        } catch {
          // noop
        }
      };

      socket.onclose = () => {
        if (disposed || appState !== 'active') return;
        clearReconnect();
        reconnectTimer = setTimeout(() => {
          void connect();
        }, backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      };
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appState;
      appState = nextState;
      if (nextState === 'active') {
        if (previousState !== 'active') {
          onAppActiveSyncRef.current?.();
        }
        void connect();
        return;
      }
      clearReconnect();
      closeSocket();
    });

    const focusSubscription = AppState.addEventListener('focus', () => {
      onAppActiveSyncRef.current?.();
      void connect();
    });

    void connect();

    return () => {
      disposed = true;
      clearReconnect();
      appStateSubscription.remove();
      focusSubscription.remove();
      closeSocket();
    };
  }, [params.enabled, params.scheduleId, params.studentId]);
}
