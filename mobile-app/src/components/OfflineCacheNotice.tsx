import { Text, View } from 'react-native';

export function OfflineCacheNotice({ cachedAt }: { cachedAt?: string | null }) {
  return (
    <View
      style={{
        backgroundColor: '#ffedd5',
        borderColor: '#fdba74',
        borderWidth: 1,
        borderRadius: 10,
        padding: 10,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: '#9a3412', fontWeight: '700', marginBottom: 2 }}>Mode Offline</Text>
      <Text style={{ color: '#9a3412', fontSize: 12 }}>
        Menampilkan data cache terakhir
        {cachedAt ? ` (${new Date(cachedAt).toLocaleString('id-ID')})` : ''}.
      </Text>
    </View>
  );
}
