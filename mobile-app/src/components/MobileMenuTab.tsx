import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '../theme/AppThemeProvider';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

type MobileMenuTabProps = {
  active: boolean;
  label: string;
  onPress: () => void;
  iconName?: FeatherIconName;
  minWidth?: number;
  maxWidth?: number;
  compact?: boolean;
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

export function MobileMenuTab({
  active,
  label,
  onPress,
  iconName,
  minWidth = 76,
  maxWidth = 114,
  compact = true,
  style,
}: MobileMenuTabProps) {
  const iconMeta = resolveIconMeta(label, iconName);
  const { colors, resolvedTheme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minWidth,
          maxWidth,
          borderWidth: 1,
          borderColor: active ? colors.primary : colors.borderSoft,
          backgroundColor: active ? (resolvedTheme === 'dark' ? colors.primarySoft : '#f8fbff') : colors.surface,
          borderRadius: compact ? 16 : 18,
          paddingHorizontal: compact ? 10 : 12,
          paddingTop: compact ? 9 : 11,
          paddingBottom: compact ? 8 : 10,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-start',
          opacity: pressed ? 0.88 : 1,
          ...(active
            ? {
                shadowColor: '#2563eb',
                shadowOpacity: resolvedTheme === 'dark' ? 0.28 : 0.1,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 2,
              }
            : null),
        },
        style,
      ]}
    >
      <View
        style={{
          width: compact ? 28 : 32,
          height: compact ? 28 : 32,
          borderRadius: compact ? 11 : 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hexToRgba(iconMeta.color, active ? 0.14 : 0.08),
          marginBottom: compact ? 5 : 6,
        }}
      >
        <Feather name={iconMeta.iconName} size={compact ? 15 : 16} color={active ? iconMeta.color : colors.textMuted} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          textAlign: 'center',
          fontSize: compact ? 10.5 : 11.5,
          lineHeight: compact ? 13 : 14,
          fontWeight: active ? '700' : '600',
          color: active ? colors.primary : colors.text,
          minHeight: compact ? 24 : 28,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: compact ? 22 : 28,
          height: 2,
          borderRadius: 999,
          backgroundColor: active ? colors.primary : 'transparent',
          marginTop: compact ? 5 : 6,
        }}
      />
    </Pressable>
  );
}

export default MobileMenuTab;
