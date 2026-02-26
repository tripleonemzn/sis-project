import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const INVALIDATE_DEBOUNCE_MS = 120;

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
    let backoffMs = INITIAL_BACKOFF_MS;

    const scheduleInvalidate = () => {
      if (invalidateTimer !== null) return;
      invalidateTimer = window.setTimeout(() => {
        invalidateTimer = null;
        void queryClient.invalidateQueries({ refetchType: 'active' });
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
      if (disposed) return;
      const token = localStorage.getItem('token');
      if (!token) return;

      socket = new WebSocket(buildRealtimeWsUrl(token));

      socket.onopen = () => {
        backoffMs = INITIAL_BACKOFF_MS;
      };

      socket.onmessage = () => {
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
