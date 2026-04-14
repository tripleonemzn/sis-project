import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BRAND_COLORS } from '../config/brand';
import logoSource from '../assets/logo_sis_kgb2.png';

type AuthScaffoldProps = {
  children: ReactNode;
  backgroundColor?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AuthScaffold({
  children,
  backgroundColor = BRAND_COLORS.blue,
}: AuthScaffoldProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const headerTopPadding = Math.max(insets.top + 18, 28);
  const headerBottomPadding = clamp(screenHeight * 0.08, 56, 92);
  const panelOverlap = clamp(screenHeight * 0.018, 14, 22);
  const panelContentTopPadding = clamp(screenHeight * 0.04, 28, 40);
  const panelContentBottomPadding = Math.max(insets.bottom + 32, 48);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }} edges={['left', 'right']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      >
        <View style={{ flex: 1, backgroundColor }}>
          <View style={{ paddingHorizontal: 24, paddingTop: headerTopPadding, paddingBottom: headerBottomPadding }}>
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  marginBottom: 12,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 7 },
                  shadowOpacity: 0.24,
                  shadowRadius: 12,
                  elevation: 12,
                }}
              >
                <Image source={logoSource} style={{ width: 74, height: 74 }} resizeMode="contain" />
              </View>
              <Text style={{ color: '#e0ecff', fontWeight: '700', fontSize: 21, marginBottom: 6 }}>
                Sistem Integrasi Sekolah
              </Text>
              <Text style={{ color: '#dbeafe', fontSize: 14, textAlign: 'center' }}>
                SMKS Karya Guna Bhakti 2
              </Text>
            </View>
          </View>

          <View
            style={{
              flex: 1,
              marginTop: -panelOverlap,
              backgroundColor: BRAND_COLORS.white,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: -52,
                left: -20,
                width: 140,
                height: 110,
                borderRadius: 100,
                backgroundColor: '#ebf3ff',
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: -62,
                left: 92,
                width: 170,
                height: 120,
                borderRadius: 100,
                backgroundColor: '#f1f7ff',
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: -46,
                right: -20,
                width: 150,
                height: 100,
                borderRadius: 100,
                backgroundColor: '#ecf4ff',
              }}
            />

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: panelContentTopPadding,
                paddingBottom: panelContentBottomPadding,
                flexGrow: 1,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default AuthScaffold;
