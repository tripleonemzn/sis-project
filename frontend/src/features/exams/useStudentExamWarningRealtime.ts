import { useEffect, useRef } from 'react';

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

export type StudentExamWarningRealtimePayload = {
  id: number;
  title: string;
  message: string;
  warnedAt: string;
  proctorName: string | null;
  category: string | null;
};

export type StudentExamTerminationRealtimePayload = {
  id: number;
  title: string;
  message: string;
  terminatedAt: string;
  proctorName: string | null;
  category: string | null;
};

function buildRealtimeWsUrl(token: string) {
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${window.location.host}/api/realtime/ws`);
  url.searchParams.set('token', token);
  url.searchParams.set('client', 'WEB');
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

function parseWarningPayload(scope: Record<string, ScopeValue> | undefined): StudentExamWarningRealtimePayload | null {
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

function parseTerminationPayload(
  scope: Record<string, ScopeValue> | undefined,
): StudentExamTerminationRealtimePayload | null {
  const id = Number(scope?.terminationNotificationId || 0);
  const title = String(scope?.terminationTitle || 'Sesi Ujian Diakhiri Pengawas').trim();
  const message = String(scope?.terminationMessage || '').trim();
  if (!Number.isFinite(id) || id <= 0 || !message) return null;
  return {
    id,
    title,
    message,
    terminatedAt: String(scope?.terminationAt || new Date().toISOString()),
    proctorName: String(scope?.proctorName || '').trim() || null,
    category: String(scope?.terminationCategory || '').trim() || null,
  };
}

export function useStudentExamWarningRealtime(params: {
  enabled: boolean;
  scheduleId: number | null;
  studentId: number | null;
  onWarning: (payload: StudentExamWarningRealtimePayload) => void;
  onTermination?: (payload: StudentExamTerminationRealtimePayload) => void;
}) {
  const onWarningRef = useRef(params.onWarning);
  const onTerminationRef = useRef(params.onTermination);

  useEffect(() => {
    onWarningRef.current = params.onWarning;
  }, [params.onWarning]);

  useEffect(() => {
    onTerminationRef.current = params.onTermination;
  }, [params.onTermination]);

  useEffect(() => {
    if (!params.enabled || !params.scheduleId || !params.studentId || typeof window === 'undefined') return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof window.setTimeout> | null = null;
    let disposed = false;
    let backoffMs = INITIAL_BACKOFF_MS;

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
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

    const connect = () => {
      if (disposed) return;
      const token = localStorage.getItem('token');
      if (!token) return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }

      socket = new WebSocket(buildRealtimeWsUrl(token));

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
        if (!scopeIncludesNumber(payload.scope, 'scheduleIds', params.scheduleId!)) return;
        if (!scopeIncludesNumber(payload.scope, 'studentIds', params.studentId!)) return;
        const mode = String(payload.scope?.mode || '').trim().toUpperCase();
        if (mode === 'EXAM_WARNING') {
          const warningPayload = parseWarningPayload(payload.scope);
          if (!warningPayload) return;
          onWarningRef.current(warningPayload);
          return;
        }
        if (mode === 'EXAM_TERMINATED') {
          const terminationPayload = parseTerminationPayload(payload.scope);
          if (!terminationPayload) return;
          onTerminationRef.current?.(terminationPayload);
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
        clearReconnect();
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      };
    };

    const handleOnline = () => {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        backoffMs = INITIAL_BACKOFF_MS;
        connect();
      }
    };

    connect();
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      clearReconnect();
      window.removeEventListener('online', handleOnline);
      closeSocket();
    };
  }, [params.enabled, params.scheduleId, params.studentId]);
}
