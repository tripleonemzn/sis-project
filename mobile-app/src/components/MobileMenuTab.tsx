import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

type MobileMenuTabProps = {
  active: boolean;
  label: string;
  onPress: () => void;
  iconName?: FeatherIconName;
  minWidth?: number;
  style?: StyleProp<ViewStyle>;
};

const ICON_RULES: Array<{ pattern: RegExp; iconName: FeatherIconName; color: string }> = [
  { pattern: /ringkasan|overview|summary/i, iconName: 'grid', color: '#2563eb' },
  { pattern: /jadwal|kalender|semester/i, iconName: 'calendar', color: '#2563eb' },
  { pattern: /bank soal|soal|ujian|butir/i, iconName: 'clipboard', color: '#f59e0b' },
  { pattern: /program/i, iconName: 'layout', color: '#7c3aed' },
  { pattern: /kelas|class/i, iconName: 'layout', color: '#0ea5e9' },
  { pattern: /mapel|materi|pelajaran|kktp|kkm/i, iconName: 'book-open', color: '#0f766e' },
  { pattern: /guru|assignment|ortu|orang tua/i, iconName: 'users', color: '#2563eb' },
  { pattern: /siswa|akun|profile|profil/i, iconName: 'user', color: '#2563eb' },
  { pattern: /riwayat/i, iconName: 'book-open', color: '#0f766e' },
  { pattern: /karier|tautan|link/i, iconName: 'briefcase', color: '#8b5cf6' },
  { pattern: /ruang/i, iconName: 'home', color: '#16a34a' },
  { pattern: /inventaris|aset/i, iconName: 'package', color: '#f97316' },
  { pattern: /anggaran|biaya|budget/i, iconName: 'credit-card', color: '#f59e0b' },
  { pattern: /peminjaman|pinjam/i, iconName: 'book', color: '#f59e0b' },
  { pattern: /absensi|rekap/i, iconName: 'check-square', color: '#16a34a' },
  { pattern: /perizinan|izin/i, iconName: 'file-text', color: '#6366f1' },
  { pattern: /pembina|wali/i, iconName: 'shield', color: '#0ea5e9' },
  { pattern: /ekskul|ekstrakurikuler|kegiatan/i, iconName: 'activity', color: '#ec4899' },
  { pattern: /risiko/i, iconName: 'alert-triangle', color: '#ef4444' },
  { pattern: /disiplin/i, iconName: 'shield', color: '#ef4444' },
  { pattern: /tahun ajaran/i, iconName: 'calendar', color: '#2563eb' },
  { pattern: /promotion|kenaikan|alumni/i, iconName: 'shuffle', color: '#f97316' },
  { pattern: /harian/i, iconName: 'sun', color: '#f59e0b' },
  { pattern: /telat/i, iconName: 'alert-circle', color: '#ef4444' },
];

function hexToRgba(hex: string, alpha: number) {
  const raw = String(hex || '').replace('#', '');
  const value =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : raw;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  if ([red, green, blue].some((item) => Number.isNaN(item))) return `rgba(37, 99, 235, ${alpha})`;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function resolveIconMeta(label: string, explicitIconName?: FeatherIconName) {
  if (explicitIconName) {
    return { iconName: explicitIconName, color: '#2563eb' };
  }
  const matched = ICON_RULES.find((item) => item.pattern.test(String(label || '').trim()));
  return matched || { iconName: 'grid', color: '#2563eb' };
}

export function MobileMenuTab({ active, label, onPress, iconName, minWidth = 94, style }: MobileMenuTabProps) {
  const iconMeta = resolveIconMeta(label, iconName);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: minWidth,
          minWidth,
          maxWidth: minWidth,
          borderWidth: 1,
          borderColor: active ? '#bfdbfe' : '#e2e8f0',
          backgroundColor: active ? '#f8fbff' : '#fff',
          borderRadius: 14,
          paddingHorizontal: 8,
          paddingTop: 10,
          paddingBottom: 8,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hexToRgba(iconMeta.color, active ? 0.14 : 0.08),
          marginBottom: 6,
        }}
      >
        <Feather name={iconMeta.iconName} size={16} color={active ? iconMeta.color : '#475569'} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          textAlign: 'center',
          fontSize: 11,
          lineHeight: 14,
          fontWeight: active ? '700' : '600',
          color: active ? '#1d4ed8' : '#334155',
          minHeight: 28,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: 28,
          height: 2,
          borderRadius: 999,
          backgroundColor: active ? '#2563eb' : 'transparent',
          marginTop: 6,
        }}
      />
    </Pressable>
  );
}

export default MobileMenuTab;
