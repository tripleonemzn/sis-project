import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { type AdminSlideshowSlide, adminApi } from '../../../src/features/admin/adminApi';
import { notifyApiError, notifyInfo, notifySuccess } from '../../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type LocalSlideDraft = {
  description: string;
  isActive: boolean;
};

type LocalImageFile = {
  uri: string;
  name?: string;
  type?: string;
  size?: number;
};

const toMediaUrl = (url: string) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
};

export default function AdminSlideshowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const contentPadding = getStandardPagePadding(insets, { horizontal: 16, bottom: 24 });

  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<LocalImageFile | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [slideDraftById, setSlideDraftById] = useState<Record<string, LocalSlideDraft>>({});
  const [slideIntervalSeconds, setSlideIntervalSeconds] = useState<number>(3.5);

  const isAdmin = user?.role === 'ADMIN';

  const slideshowQuery = useQuery({
    queryKey: ['mobile-admin-slideshow'],
    queryFn: () => adminApi.listSlideshowSlides(),
    enabled: isAuthenticated && isAdmin,
  });

  const slides = useMemo(() => slideshowQuery.data?.slides || [], [slideshowQuery.data?.slides]);
  const settings = slideshowQuery.data?.settings;
  const activeSlideCount = slides.filter((item) => item.isActive !== false).length;

  useEffect(() => {
    const rawMs = settings?.slideIntervalMs;
    if (typeof rawMs === 'number' && Number.isFinite(rawMs) && rawMs > 0) {
      setSlideIntervalSeconds(Number((rawMs / 1000).toFixed(1)));
    }
  }, [settings?.slideIntervalMs]);

  useEffect(() => {
    setSlideDraftById((prev) => {
      const next: Record<string, LocalSlideDraft> = {};
      for (const slide of slides) {
        const existing = prev[slide.id];
        next[slide.id] = existing || {
          description: slide.description || '',
          isActive: slide.isActive !== false,
        };
      }
      return next;
    });
  }, [slides]);

  const hasDraftChanges = (slide: AdminSlideshowSlide) => {
    const draft = slideDraftById[slide.id];
    if (!draft) return false;
    return draft.description.trim() !== (slide.description || '').trim() || draft.isActive !== (slide.isActive !== false);
  };

  const pickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['image/jpeg', 'image/png', 'image/webp'],
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (typeof asset.size === 'number' && asset.size > 1 * 1024 * 1024) {
        notifyInfo('Ukuran file slideshow maksimal 1MB.');
        return;
      }
      setUploadFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'image/jpeg',
        size: asset.size,
      });
    } catch (error) {
      notifyApiError(error, 'Gagal memilih gambar slideshow.');
    }
  };

  const uploadSlide = async () => {
    if (!uploadFile) {
      notifyInfo('Pilih foto terlebih dahulu.');
      return;
    }
    if (typeof uploadFile.size === 'number' && uploadFile.size > 1 * 1024 * 1024) {
      notifyInfo('Ukuran file slideshow maksimal 1MB.');
      return;
    }
    if (pendingActionKey) return;
    setPendingActionKey('upload-slide');
    try {
      await adminApi.uploadSlideshowSlide(uploadFile, {
        description: uploadDescription.trim(),
      });
      setUploadFile(null);
      setUploadDescription('');
      notifySuccess('Slide berhasil ditambahkan.');
      await slideshowQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Gagal menambah slide.');
    } finally {
      setPendingActionKey(null);
    }
  };

  const saveSlide = async (slide: AdminSlideshowSlide) => {
    if (pendingActionKey) return;
    const draft = slideDraftById[slide.id];
    if (!draft) return;
    setPendingActionKey(`save-slide-${slide.id}`);
    try {
      await adminApi.updateSlideshowSlide(slide.id, {
        description: draft.description.trim(),
        isActive: draft.isActive,
      });
      notifySuccess('Perubahan slide berhasil disimpan.');
      await slideshowQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Gagal menyimpan perubahan slide.');
    } finally {
      setPendingActionKey(null);
    }
  };

  const resetSlideDraft = (slide: AdminSlideshowSlide) => {
    setSlideDraftById((prev) => ({
      ...prev,
      [slide.id]: {
        description: slide.description || '',
        isActive: slide.isActive !== false,
      },
    }));
  };

  const moveSlide = async (slideId: string, direction: 'UP' | 'DOWN') => {
    if (pendingActionKey) return;
    const currentIndex = slides.findIndex((item) => item.id === slideId);
    if (currentIndex < 0) return;
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const reordered = [...slides.map((item) => item.id)];
    const [picked] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, picked);

    setPendingActionKey(`reorder-slide-${slideId}`);
    try {
      await adminApi.reorderSlideshowSlides(reordered);
      notifySuccess('Urutan slideshow diperbarui.');
      await slideshowQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Gagal mengubah urutan slide.');
    } finally {
      setPendingActionKey(null);
    }
  };

  const confirmDeleteSlide = (slide: AdminSlideshowSlide) => {
    Alert.alert('Hapus Slide', `Hapus slide "${slide.filename}" dari slideshow?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          if (pendingActionKey) return;
          setPendingActionKey(`delete-slide-${slide.id}`);
          void (async () => {
            try {
              await adminApi.deleteSlideshowSlide(slide.id);
              notifySuccess('Slide berhasil dihapus.');
              await slideshowQuery.refetch();
            } catch (error) {
              notifyApiError(error, 'Gagal menghapus slide.');
            } finally {
              setPendingActionKey(null);
            }
          })();
        },
      },
    ]);
  };

  const saveSettings = async () => {
    if (pendingActionKey) return;
    const seconds = Number(slideIntervalSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      notifyInfo('Durasi slide harus lebih dari 0 detik.');
      return;
    }
    const ms = Math.round(seconds * 1000);
    setPendingActionKey('save-settings');
    try {
      await adminApi.updateSlideshowSettings({ slideIntervalMs: ms });
      notifySuccess('Pengaturan durasi slide disimpan.');
      await slideshowQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Gagal menyimpan pengaturan slideshow.');
    } finally {
      setPendingActionKey(null);
    }
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul slideshow..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{ ...contentPadding, paddingHorizontal: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={slideshowQuery.isFetching && !slideshowQuery.isLoading}
          onRefresh={() => slideshowQuery.refetch()}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: BRAND_COLORS.white,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: scaleWithAppTextScale(20), fontWeight: '700' }}>Slideshow</Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola foto dan deskripsi slideshow login/welcome untuk web dan mobile dalam satu panel.
      </Text>

      <View
        style={{
          backgroundColor: BRAND_COLORS.white,
          borderWidth: 1,
          borderColor: '#d6e0f2',
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16), marginBottom: 4 }}>
          Durasi Slide Foto
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 8 }}>
          Atur jeda pergantian foto slideshow (login web & welcome mobile) dalam detik.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            value={String(slideIntervalSeconds)}
            onChangeText={(value) => {
              const parsed = Number(value.replace(',', '.'));
              setSlideIntervalSeconds(Number.isFinite(parsed) ? parsed : 0);
            }}
            keyboardType="numeric"
            style={{
              width: 80,
              borderWidth: 1,
              borderColor: '#d5e0f5',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: BRAND_COLORS.textDark,
            }}
          />
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(13) }}>detik per foto</Text>
          <Pressable
            onPress={() => setSlideIntervalSeconds(3.5)}
            style={{ marginLeft: 4, paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>Reset ke 3.5</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void saveSettings();
            }}
            disabled={pendingActionKey === 'save-settings'}
            style={{
              marginLeft: 'auto',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: BRAND_COLORS.blue,
              opacity: pendingActionKey === 'save-settings' ? 0.7 : 1,
            }}
          >
            {pendingActionKey === 'save-settings' ? (
              <ActivityIndicator size="small" color={BRAND_COLORS.white} />
            ) : (
              <Text style={{ color: BRAND_COLORS.white, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>Simpan Durasi</Text>
            )}
          </Pressable>
        </View>
      </View>

      {slideshowQuery.isLoading ? <QueryStateView type="loading" message="Memuat data slideshow..." /> : null}
      {slideshowQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data slideshow." onRetry={() => slideshowQuery.refetch()} />
      ) : null}

      {!slideshowQuery.isLoading && !slideshowQuery.isError ? (
        <>
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              borderRadius: 16,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16), marginBottom: 2 }}>
              Tambah Slide Baru
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginBottom: 10 }}>
              Tidak dibatasi 16 gambar. Tambah slide sesuai kebutuhan.
            </Text>

            <Pressable
              onPress={() => {
                void pickImage();
              }}
              disabled={!!pendingActionKey}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                backgroundColor: '#f8fbff',
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginBottom: 8,
                opacity: pendingActionKey ? 0.7 : 1,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                {uploadFile ? 'Ganti Foto' : 'Pilih Foto'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                {uploadFile?.name || 'Format: JPG/JPEG/PNG/WEBP, maksimal 1MB'}
              </Text>
            </Pressable>

            <TextInput
              value={uploadDescription}
              onChangeText={setUploadDescription}
              placeholder="Deskripsi foto slideshow"
              placeholderTextColor="#94a3b8"
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#d5e0f5',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: BRAND_COLORS.textDark,
                minHeight: 70,
                marginBottom: 8,
              }}
            />

            <Pressable
              onPress={() => {
                void uploadSlide();
              }}
              disabled={!!pendingActionKey}
              style={{
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: 'center',
                backgroundColor: BRAND_COLORS.blue,
                opacity: pendingActionKey ? 0.7 : 1,
              }}
            >
              {pendingActionKey === 'upload-slide' ? (
                <ActivityIndicator size="small" color={BRAND_COLORS.white} />
              ) : (
                <Text style={{ color: BRAND_COLORS.white, fontWeight: '700' }}>Upload Slide</Text>
              )}
            </Pressable>
          </View>

          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              borderRadius: 16,
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16) }}>Daftar Slide</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2, marginBottom: 8 }}>
              Total {slides.length} slide • {activeSlideCount} aktif
            </Text>

            {slides.map((slide, index) => {
              const draft = slideDraftById[slide.id] || {
                description: slide.description || '',
                isActive: slide.isActive !== false,
              };
              const isSaving = pendingActionKey === `save-slide-${slide.id}`;
              const isDeleting = pendingActionKey === `delete-slide-${slide.id}`;
              const isReordering = pendingActionKey === `reorder-slide-${slide.id}`;

              return (
                <View
                  key={slide.id}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: '#eef3ff',
                    paddingTop: 10,
                    marginTop: index === 0 ? 0 : 10,
                  }}
                >
                  <Image
                    source={{ uri: toMediaUrl(slide.url) }}
                    style={{
                      width: '100%',
                      height: 170,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#d6e0f2',
                      backgroundColor: '#eef3ff',
                    }}
                    resizeMode="cover"
                  />

                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 6 }}>
                    Urutan #{slide.order + 1} • {slide.filename}
                  </Text>

                  <TextInput
                    value={draft.description}
                    onChangeText={(value) =>
                      setSlideDraftById((prev) => ({
                        ...prev,
                        [slide.id]: {
                          ...draft,
                          description: value,
                        },
                      }))
                    }
                    placeholder="Deskripsi slide"
                    placeholderTextColor="#94a3b8"
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: '#d5e0f5',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      color: BRAND_COLORS.textDark,
                      minHeight: 68,
                      marginTop: 8,
                    }}
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      onPress={() =>
                        setSlideDraftById((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            isActive: true,
                          },
                        }))
                      }
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: draft.isActive ? '#22c55e' : '#d6e0f2',
                        backgroundColor: draft.isActive ? '#f0fdf4' : BRAND_COLORS.white,
                        borderRadius: 10,
                        paddingVertical: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: draft.isActive ? '#15803d' : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>
                        Aktif
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setSlideDraftById((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            isActive: false,
                          },
                        }))
                      }
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: !draft.isActive ? '#f59e0b' : '#d6e0f2',
                        backgroundColor: !draft.isActive ? '#fffbeb' : BRAND_COLORS.white,
                        borderRadius: 10,
                        paddingVertical: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: !draft.isActive ? '#b45309' : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>
                        Nonaktif
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      onPress={() => {
                        void moveSlide(slide.id, 'UP');
                      }}
                      disabled={!!pendingActionKey || slide.order <= 0}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: BRAND_COLORS.white,
                        borderRadius: 10,
                        paddingVertical: 9,
                        alignItems: 'center',
                        opacity: pendingActionKey || slide.order <= 0 ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>Naik</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void moveSlide(slide.id, 'DOWN');
                      }}
                      disabled={!!pendingActionKey || slide.order >= slides.length - 1}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: BRAND_COLORS.white,
                        borderRadius: 10,
                        paddingVertical: 9,
                        alignItems: 'center',
                        opacity: pendingActionKey || slide.order >= slides.length - 1 ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>Turun</Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      onPress={() => {
                        void saveSlide(slide);
                      }}
                      disabled={!!pendingActionKey || !hasDraftChanges(slide)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: BRAND_COLORS.blue,
                        backgroundColor: BRAND_COLORS.blue,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                        opacity: pendingActionKey || !hasDraftChanges(slide) ? 0.65 : 1,
                      }}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color={BRAND_COLORS.white} />
                      ) : (
                        <Text style={{ color: BRAND_COLORS.white, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>Simpan</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => resetSlideDraft(slide)}
                      disabled={!!pendingActionKey || !hasDraftChanges(slide)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: BRAND_COLORS.white,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                        opacity: pendingActionKey || !hasDraftChanges(slide) ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>Reset</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteSlide(slide)}
                      disabled={!!pendingActionKey}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                        opacity: pendingActionKey ? 0.65 : 1,
                      }}
                    >
                      {isDeleting || isReordering ? (
                        <ActivityIndicator size="small" color="#b91c1c" />
                      ) : (
                        <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>Hapus</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {slides.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 10 }}>
                Belum ada data slideshow.
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
