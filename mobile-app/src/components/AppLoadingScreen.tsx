import { ActivityIndicator, Text, View } from 'react-native';
import { useAppTheme } from '../theme/AppThemeProvider';

type AppLoadingScreenProps = {
  message?: string;
};

export function AppLoadingScreen({ message = 'Memuat aplikasi...' }: AppLoadingScreenProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
        paddingHorizontal: 18,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 380,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingVertical: 22,
          paddingHorizontal: 16,
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={{
            marginTop: 12,
            color: colors.text,
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
