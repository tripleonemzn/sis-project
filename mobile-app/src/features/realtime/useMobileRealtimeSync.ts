import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ENV } from '../../config/env';
import { tokenStorage } from '../../lib/storage/tokenStorage';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const INVALIDATE_DEBOUNCE_MS = 150;

function buildRealtimeWsUrl(token: string) {
  const normalizedBase = String(ENV.API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return null;
  const wsBase = normalizedBase.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  return `${wsBase}/realtime/ws?token=${encodeURIComponent(token)}`;
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

    const scheduleInvalidate = () => {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
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

    const connect = async () => {
      if (disposed) return;

      const token = await tokenStorage.getAccessToken();
      if (disposed || !token) return;

      const wsUrl = buildRealtimeWsUrl(token);
      if (!wsUrl) return;

      socket = new WebSocket(wsUrl);

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
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void connect();
        }, backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      };
    };

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      scheduleInvalidate();
      if (!socket || socket.readyState === WebSocket.CLOSED) {
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
