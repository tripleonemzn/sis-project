import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppNoticePayload, NoticeTone, subscribeAppNotice } from '../lib/ui/notice';
import { useAppTextScale } from '../theme/AppTextScaleProvider';

type QueueItem = AppNoticePayload & { id: number };

function toneStyle(tone: NoticeTone) {
  if (tone === 'success') {
    return {
      bg: '#ecfdf5',
      border: '#86efac',
      title: '#166534',
      message: '#166534',
    };
  }

  if (tone === 'error') {
    return {
      bg: '#fff1f2',
      border: '#fda4af',
      title: '#9f1239',
      message: '#9f1239',
    };
  }

  return {
    bg: '#eff6ff',
    border: '#bfdbfe',
    title: '#1d4ed8',
    message: '#1e3a8a',
  };
}

export function AppNoticeHost() {
  const insets = useSafeAreaInsets();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const [activeNotice, setActiveNotice] = useState<QueueItem | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seedRef = useRef(1);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showNext = useCallback(() => {
    if (timerRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    setActiveNotice(next);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setActiveNotice(null);
    }, Math.max(1500, next.durationMs || 2600));
  }, []);

  const dismissActive = useCallback(() => {
    clearTimer();
    setActiveNotice(null);
  }, [clearTimer]);

  useEffect(() => {
    const unsubscribe = subscribeAppNotice((payload) => {
      const next: QueueItem = {
        ...payload,
        id: seedRef.current,
      };
      seedRef.current += 1;

      queueRef.current.push(next);
      showNext();
    });

    return () => {
      unsubscribe();
      clearTimer();
      queueRef.current = [];
    };
  }, [clearTimer, showNext]);

  useEffect(() => {
    if (!activeNotice) {
      showNext();
    }
  }, [activeNotice, showNext]);

  if (!activeNotice) return null;

  const palette = toneStyle(activeNotice.tone);
  const title =
    activeNotice.title || (activeNotice.tone === 'success' ? 'Berhasil' : activeNotice.tone === 'error' ? 'Gagal' : 'Info');

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Pressable
        onPress={dismissActive}
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 12,
          right: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.bg,
          paddingHorizontal: 12,
          paddingVertical: 10,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Text style={{ color: palette.title, fontWeight: '700', fontSize: scaleFont(13) }}>{title}</Text>
        <Text style={{ color: palette.message, marginTop: 2, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
          {activeNotice.message}
        </Text>
      </Pressable>
    </View>
  );
}
