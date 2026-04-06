import { Text, View } from 'react-native';
import { useAppTheme } from '../theme/AppThemeProvider';

export function OfflineCacheNotice({ cachedAt }: { cachedAt?: string | null }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        backgroundColor: colors.warningBg,
        borderColor: colors.warningBorder,
        borderWidth: 1,
        borderRadius: 10,
        padding: 10,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: colors.warningText, fontWeight: '700', marginBottom: 2 }}>Mode Offline</Text>
      <Text style={{ color: colors.warningText, fontSize: 12 }}>
        Menampilkan data cache terakhir
        {cachedAt ? ` (${new Date(cachedAt).toLocaleString('id-ID')})` : ''}.
      </Text>
    </View>
  );
}
