import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { BRAND_COLORS } from '../../src/config/brand';
import { ENV } from '../../src/config/env';
import logoSource from '../../src/assets/logo_sis_kgb2.png';

type GalleryItem = {
  url: string;
  description: string;
};

type GalleryApiResponse = {
  data?: Array<{
    url?: string;
    description?: string;
  }>;
};

const formatPhotoDescription = (raw?: string) => {
  if (!raw) return '';
  const separator = '->';
  if (raw.includes(separator)) {
    const parts = raw.split(separator);
    return parts.slice(1).join(separator).trim();
  }
  return raw.trim();
};

export default function WelcomeScreen() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [brokenSources, setBrokenSources] = useState<Set<string>>(new Set());
  const [isGalleryLoading, setIsGalleryLoading] = useState(true);

  const apiBase = useMemo(() => ENV.API_BASE_URL.replace(/\/+$/, ''), []);
  const assetBase = useMemo(() => apiBase.replace(/\/api\/?$/, ''), [apiBase]);

  const fallbackSources = useMemo(
    () => Array.from({ length: 20 }, (_, i) => `${assetBase}/foto_kegiatan/foto${i + 1}.jpeg`),
    [assetBase],
  );

  const gallerySources = useMemo(
    () =>
      galleryItems.map((item) => {
        if (item.url.startsWith('http')) return item.url;
        const normalizedUrl = item.url.startsWith('/') ? item.url : `/${item.url}`;
        return `${assetBase}${normalizedUrl}`;
      }),
    [galleryItems, assetBase],
  );

  const sourceDescriptionMap = useMemo(() => {
    const map = new Map<string, string>();
    gallerySources.forEach((src, idx) => {
      map.set(src, galleryItems[idx]?.description || '');
    });
    return map;
  }, [gallerySources, galleryItems]);

  const activeSources = useMemo(
    () => (gallerySources.length > 0 ? gallerySources : fallbackSources),
    [gallerySources, fallbackSources],
  );

  const displaySources = useMemo(
    () => activeSources.filter((src) => !brokenSources.has(src)),
    [activeSources, brokenSources],
  );

  useEffect(() => {
    let mounted = true;

    const syncGallery = async () => {
      try {
        const response = await fetch(`${apiBase}/public/foto-kegiatan`, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;

        const payload = (await response.json()) as GalleryApiResponse;
        const nextItems =
          payload.data
            ?.map((item) => ({
              url: item.url?.trim() || '',
              description: item.description?.trim() || '',
            }))
            .filter((item) => item.url.length > 0) || [];

        if (!mounted) return;
        setGalleryItems((prev) =>
          JSON.stringify(prev) === JSON.stringify(nextItems) ? prev : nextItems,
        );
      } catch {
        // Keep fallback sources when request fails.
      } finally {
        if (mounted) setIsGalleryLoading(false);
      }
    };

    syncGallery();
    const refreshId = setInterval(syncGallery, 60000);

    return () => {
      mounted = false;
      clearInterval(refreshId);
    };
  }, [apiBase]);

  useEffect(() => {
    setBrokenSources(new Set());
  }, [activeSources]);

  useEffect(() => {
    const length = displaySources.length > 0 ? displaySources.length : 1;
    setActiveIndex((prev) => (prev >= length ? 0 : prev));
  }, [displaySources.length]);

  useEffect(() => {
    if (displaySources.length <= 1) return;
    const defaultMs = 3500;
    const intervalMs = defaultMs;
    const intervalId = setInterval(() => {
      setActiveIndex((prev) => (prev >= displaySources.length - 1 ? 0 : prev + 1));
    }, intervalMs);
    return () => clearInterval(intervalId);
  }, [displaySources.length]);

  useEffect(() => {
    if (displaySources.length === 0) return;
    displaySources.forEach((src) => {
      Image.prefetch(src).catch(() => undefined);
    });
  }, [displaySources]);

  if (isLoading) return <AppLoadingScreen message="Memuat aplikasi..." />;
  if (isAuthenticated) return <Redirect href="/home" />;

  const currentDescription =
    displaySources.length > 0
      ? formatPhotoDescription(sourceDescriptionMap.get(displaySources[activeIndex]) || '')
      : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BRAND_COLORS.navy }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 28 }}>
        <View
          style={{
            position: 'absolute',
            top: -120,
            right: -80,
            width: 260,
            height: 260,
            borderRadius: 999,
            backgroundColor: BRAND_COLORS.sky,
            opacity: 0.26,
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: -90,
            left: -70,
            width: 230,
            height: 230,
            borderRadius: 999,
            backgroundColor: BRAND_COLORS.teal,
            opacity: 0.22,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 180,
            left: -40,
            width: 120,
            height: 120,
            borderRadius: 999,
            backgroundColor: BRAND_COLORS.pink,
            opacity: 0.17,
          }}
        />

        <View style={{ flex: 1 }}>
          <View style={{ alignItems: 'center', marginTop: 54 }}>
            <View
              style={{
                marginBottom: 18,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 7 },
                shadowOpacity: 0.24,
                shadowRadius: 12,
                elevation: 12,
              }}
            >
              <Image source={logoSource} style={{ width: 108, height: 108 }} resizeMode="contain" />
            </View>

            <Text
              style={{
                color: BRAND_COLORS.white,
                fontSize: 38,
                fontWeight: '700',
                fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
                marginBottom: 3,
                textAlign: 'center',
                letterSpacing: 0.2,
                transform: [{ translateY: 10 }],
              }}
            >
              Selamat Datang
            </Text>

            <Text
              style={{
                color: '#dbeafe',
                fontSize: 17,
                lineHeight: 28,
                textAlign: 'center',
                maxWidth: 320,
                transform: [{ translateY: 10 }],
              }}
            >
              di Platform Digital{'\n'}
              Sistem Integrasi Sekolah
            </Text>
          </View>

          <View style={{ marginTop: 42 }}>
            <View
              style={{
                height: 280,
                borderRadius: 18,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.35)',
                backgroundColor: 'rgba(10, 22, 55, 0.28)',
              }}
            >
              {displaySources.length > 0 ? (
                displaySources.map((src, idx) => (
                  <Image
                    key={`${src}-${idx}`}
                    source={{ uri: src }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: idx === activeIndex ? 1 : 0,
                    }}
                    resizeMode="cover"
                    onError={() => {
                      setBrokenSources((prev) => {
                        if (prev.has(src)) return prev;
                        const next = new Set(prev);
                        next.add(src);
                        return next;
                      });
                    }}
                  />
                ))
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
                  {isGalleryLoading ? (
                    <ActivityIndicator size="small" color={BRAND_COLORS.white} />
                  ) : (
                    <Text style={{ color: '#dbeafe', textAlign: 'center', fontSize: 13 }}>
                      Foto kegiatan belum tersedia.
                    </Text>
                  )}
                </View>
              )}

              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: 'rgba(0,0,0,0.34)',
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    color: BRAND_COLORS.white,
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                >
                  {currentDescription || 'Kegiatan SMKS Karya Guna Bhakti 2'}
                </Text>
              </View>
            </View>
            <Text
              style={{
                color: '#dbeafe',
                fontSize: 11,
                lineHeight: 16,
                textAlign: 'center',
                marginTop: 10,
                marginBottom: 16,
                paddingHorizontal: 8,
                fontStyle: 'italic',
              }}
            >
              Menjadi SMK yang Unggul dalam Membentuk Lulusan Berakhlak Mulia, Kreatif, Kompeten, dan
              Berkarakter.
            </Text>
          </View>

          <View style={{ marginTop: 'auto' }}>
            <Pressable
              onPress={() => router.push('/login')}
              style={{
                backgroundColor: BRAND_COLORS.gold,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontSize: 16, fontWeight: '700' }}>
                Masuk
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/register')}
              style={{
                borderWidth: 1.4,
                borderColor: '#cfe0ff',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Text style={{ color: BRAND_COLORS.white, fontSize: 16, fontWeight: '700' }}>
                Daftar
              </Text>
            </Pressable>

            <Text
              style={{
                color: '#cbd5e1',
                marginTop: 16,
                textAlign: 'center',
                fontSize: 10.5,
                lineHeight: 16,
                fontWeight: '400',
                paddingHorizontal: 6,
              }}
            >
              © 2025 JHA Teknologi Solusi. All rights reserved.{'\n'}Licensed to SMKS Karya Guna Bhakti 2 for
              {' '}use only.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
