import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { isTabletViewport } from '../lib/ui/mobileViewport';

export function TabletOrientationManager() {
  const { width, height } = useWindowDimensions();
  const isTablet = isTabletViewport(width, height);

  useEffect(() => {
    const syncOrientation = async () => {
      try {
        if (Platform.OS === 'android' && isTablet) {
          await ScreenOrientation.unlockAsync();
          return;
        }

        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch {
        // Ignore orientation sync failures; layout remains usable in portrait.
      }
    };

    void syncOrientation();
  }, [isTablet]);

  return null;
}

export default TabletOrientationManager;
