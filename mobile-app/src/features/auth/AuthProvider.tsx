import { isAxiosError } from 'axios';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { authService } from './authService';
import { LoginPayload, AuthUser } from './types';
import { tokenStorage } from '../../lib/storage/tokenStorage';
import { authSession } from '../../lib/auth/authSession';
import { authEventLogger } from '../../lib/auth/authEventLogger';
import { offlineCache } from '../../lib/storage/offlineCache';
import { CACHE_MAX_SNAPSHOTS_PER_FEATURE, CACHE_PREFIXES, CACHE_TTL_MS } from '../../config/cache';
import {
  syncPushDeviceRegistration,
} from '../pushNotifications/pushNotificationService';

const PUSH_SYNC_RETRY_DELAYS_MS = [0, 15000, 60000] as const;
const PUSH_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  restoreError: string | null;
  rehydrate: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const appResumePushSyncCleanupRef = useRef<(() => void) | null>(null);

  const rehydrate = useCallback(async () => {
    setIsLoading(true);
    setRestoreError(null);
    try {
      await offlineCache.maintenanceSweep({
        prefixes: CACHE_PREFIXES,
        maxAgeMs: CACHE_TTL_MS,
        maxEntriesPerPrefix: CACHE_MAX_SNAPSHOTS_PER_FEATURE,
      });
      const token = await tokenStorage.getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }

      const me = await authService.me();
      setUser(me);
      await authEventLogger.log('SESSION_RESTORED', `Sesi dipulihkan untuk user ${me.username}`);
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as { message?: string } | undefined;
        if (status === 401 || status === 403) {
          await tokenStorage.clearAll();
        }
        setRestoreError(data?.message || 'Gagal memulihkan sesi. Silakan login ulang.');
        await authEventLogger.log(
          'SESSION_RESTORE_FAILED',
          data?.message || `Restore gagal dengan status ${status || 'unknown'}`,
        );
      } else {
        setRestoreError('Gagal memulihkan sesi. Silakan login ulang.');
        await authEventLogger.log('SESSION_RESTORE_FAILED', 'Restore gagal karena error non-HTTP.');
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    rehydrate();
  }, [rehydrate]);

  useEffect(() => {
    authSession.setUnauthorizedHandler(async () => {
      setUser(null);
      setRestoreError('Sesi berakhir. Silakan login kembali.');
    });

    return () => {
      authSession.setUnauthorizedHandler(null);
    };
  }, []);

  const schedulePushSyncWithRetry = useCallback(() => {
    let cancelled = false;
    let hasRegistered = false;
    const timerIds: Array<ReturnType<typeof setTimeout>> = [];

    const runAttempt = async () => {
      if (cancelled || hasRegistered) return;
      const result = await syncPushDeviceRegistration();
      if (result.registered) {
        hasRegistered = true;
      }
    };

    for (const delayMs of PUSH_SYNC_RETRY_DELAYS_MS) {
      const timerId = setTimeout(() => {
        void runAttempt();
      }, delayMs);
      timerIds.push(timerId);
    }

    return () => {
      cancelled = true;
      for (const timerId of timerIds) {
        clearTimeout(timerId);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const cleanup = schedulePushSyncWithRetry();
    return () => {
      cleanup();
    };
  }, [user, schedulePushSyncWithRetry]);

  useEffect(() => {
    if (!user) return;

    let currentState: AppStateStatus = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = currentState === 'background' || currentState === 'inactive';
      const nowActive = nextState === 'active';
      currentState = nextState;
      if (!wasBackground || !nowActive) return;

      appResumePushSyncCleanupRef.current?.();
      appResumePushSyncCleanupRef.current = schedulePushSyncWithRetry();
    });

    return () => {
      appResumePushSyncCleanupRef.current?.();
      appResumePushSyncCleanupRef.current = null;
      appStateSubscription.remove();
    };
  }, [user, schedulePushSyncWithRetry]);

  useEffect(() => {
    if (!user) return;

    const syncIntervalId = setInterval(() => {
      void syncPushDeviceRegistration();
    }, PUSH_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(syncIntervalId);
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      restoreError,
      rehydrate,
      login: async (payload: LoginPayload) => {
        try {
          const nextUser = await authService.login(payload);
          setRestoreError(null);
          setUser(nextUser);
          await authEventLogger.log('LOGIN_SUCCESS', `Login sukses untuk user ${nextUser.username}`);
        } catch (error: unknown) {
          const message =
            typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            typeof (error as { response?: { data?: { message?: string } } }).response?.data
              ?.message === 'string'
              ? (error as { response?: { data?: { message?: string } } }).response?.data
                  ?.message
              : error instanceof Error
                ? error.message
                : 'Login gagal';
          const msg = message || 'Login gagal';
          await authEventLogger.log('LOGIN_FAILED', msg);
          throw error;
        }
      },
      logout: async () => {
        setRestoreError(null);
        await authService.logout();
        setUser(null);
        await authEventLogger.log('LOGOUT', 'User logout manual');
      },
    }),
    [user, isLoading, restoreError, rehydrate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
