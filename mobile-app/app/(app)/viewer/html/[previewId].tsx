import { Feather } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { getHtmlPreviewEntry, pruneHtmlPreviewEntries } from '../../../../src/lib/viewer/htmlPreviewStore';

export default function HtmlPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 18, topMin: 18, topOffset: 6 });
  const params = useLocalSearchParams<{ previewId?: string }>();
  const previewId = typeof params.previewId === 'string' ? params.previewId : '';

  const preview = useMemo(() => {
    pruneHtmlPreviewEntries();
    return getHtmlPreviewEntry(previewId);
  }, [previewId]);

  if (isLoading) return <AppLoadingScreen message="Menyiapkan pratinjau..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!preview) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Pratinjau Tidak Tersedia
        </Text>
        <QueryStateView
          type="error"
          message="Dokumen pratinjau tidak ditemukan. Silakan buka ulang dari modul asal."
        />
        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', ...pagePadding }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#d6e0f2',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 20, fontWeight: '700', color: BRAND_COLORS.textDark }}>
              {preview.title}
            </Text>
            {preview.helper ? (
              <Text numberOfLines={1} style={{ fontSize: 12, color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                {preview.helper}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          minHeight: 420,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#dbe7fb',
          backgroundColor: '#fff',
          overflow: 'hidden',
          shadowColor: '#1f3f8f',
          shadowOpacity: 0.06,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        }}
      >
        <WebView originWhitelist={['*']} source={{ html: preview.html }} />
      </View>
    </View>
  );
}
