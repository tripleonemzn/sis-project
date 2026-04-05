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

type RealtimeEventPayload = {
  type?: string;
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
              void queryClient.invalidateQueries({
                queryKey: ['mobile-admin-server-online-users'],
                refetchType: 'active',
              });
              void queryClient.invalidateQueries({
                queryKey: ['mobile-admin-server-monitoring'],
                refetchType: 'active',
              });
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
