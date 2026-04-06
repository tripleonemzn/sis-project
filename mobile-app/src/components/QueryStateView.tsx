import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../theme/AppThemeProvider';

type QueryStateViewProps = {
  type: 'loading' | 'error';
  message?: string;
  onRetry?: () => void;
};

export function QueryStateView({ type, message, onRetry }: QueryStateViewProps) {
  const { colors } = useAppTheme();
  if (type === 'loading') {
    return (
      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.text, fontWeight: '600', marginLeft: 8 }}>
            {message || 'Memuat data...'}
          </Text>
        </View>
        <View style={{ marginTop: 12, gap: 8 }}>
          {[1, 2, 3].map((line) => (
            <View
              key={line}
              style={{
                height: 9,
                borderRadius: 999,
                backgroundColor: colors.primarySoft,
                width: line === 1 ? '100%' : line === 2 ? '85%' : '72%',
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: colors.dangerBg,
        borderColor: colors.dangerBorder,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text style={{ color: colors.dangerText, marginBottom: onRetry ? 10 : 0 }}>
        {message || 'Gagal memuat data.'}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 8,
            paddingVertical: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Coba Lagi</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
