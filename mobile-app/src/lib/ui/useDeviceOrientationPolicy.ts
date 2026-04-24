import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useResponsiveLayout } from './useResponsiveLayout';

export function useDeviceOrientationPolicy() {
  const layout = useResponsiveLayout();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;
    void (async () => {
      try {
        await ScreenOrientation.lockAsync(
          layout.isTablet
            ? ScreenOrientation.OrientationLock.DEFAULT
            : ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      } catch {
        if (!active) return;
      }
    })();

    return () => {
      active = false;
    };
  }, [layout.isTablet]);
}
