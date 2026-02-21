import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BRAND_COLORS } from '../config/brand';

type QueryStateViewProps = {
  type: 'loading' | 'error';
  message?: string;
  onRetry?: () => void;
};

export function QueryStateView({ type, message, onRetry }: QueryStateViewProps) {
  if (type === 'loading') {
    return (
      <View
        style={{
          backgroundColor: BRAND_COLORS.white,
          borderWidth: 1,
          borderColor: '#d6e0f2',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ActivityIndicator size="small" color={BRAND_COLORS.blue} />
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginLeft: 8 }}>
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
                backgroundColor: '#e8effc',
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
        backgroundColor: '#fff1f2',
        borderColor: '#fecdd3',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text style={{ color: '#9f1239', marginBottom: onRetry ? 10 : 0 }}>
        {message || 'Gagal memuat data.'}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{
            backgroundColor: BRAND_COLORS.navy,
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
