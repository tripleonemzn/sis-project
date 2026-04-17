import { Text, View } from 'react-native';
import { useAppTheme } from '../theme/AppThemeProvider';
import { useAppTextScale } from '../theme/AppTextScaleProvider';

export function OfflineCacheNotice({ cachedAt }: { cachedAt?: string | null }) {
  const { colors } = useAppTheme();
  const { typography } = useAppTextScale();
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
      <Text style={{ color: colors.warningText, ...typography.bodyCompact, fontWeight: '700', marginBottom: 2 }}>
        Mode Offline
      </Text>
      <Text style={{ color: colors.warningText, ...typography.caption }}>
        Menampilkan data cache terakhir
        {cachedAt ? ` (${new Date(cachedAt).toLocaleString('id-ID')})` : ''}.
      </Text>
    </View>
  );
}
