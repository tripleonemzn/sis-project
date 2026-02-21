import { ActivityIndicator, Text, View } from 'react-native';
import { BRAND_COLORS } from '../config/brand';

type AppLoadingScreenProps = {
  message?: string;
};

export function AppLoadingScreen({ message = 'Memuat aplikasi...' }: AppLoadingScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#e9eefb',
        paddingHorizontal: 18,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 380,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#d6e0f2',
          backgroundColor: BRAND_COLORS.white,
          paddingVertical: 22,
          paddingHorizontal: 16,
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={BRAND_COLORS.blue} />
        <Text
          style={{
            marginTop: 12,
            color: BRAND_COLORS.textDark,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}
