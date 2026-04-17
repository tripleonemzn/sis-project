import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BRAND_COLORS } from '../config/brand';
import { useAppTextScale } from '../theme/AppTextScaleProvider';

type FeatherIconName = ComponentProps<typeof Feather>['name'];

type AutoIconRule = {
  pattern: RegExp;
  name: FeatherIconName;
  color: string;
};

const AUTO_ICON_RULES: AutoIconRule[] = [
  { pattern: /ringkasan|overview|summary/i, name: 'grid', color: '#2563eb' },
  { pattern: /kategori|category/i, name: 'layers', color: '#8b5cf6' },
  { pattern: /mapel|materi|pelajaran|pendidikan|cp|tp/i, name: 'book-open', color: '#0f766e' },
  { pattern: /assignment|guru|teacher/i, name: 'users', color: '#2563eb' },
  { pattern: /jadwal|kalender|semester/i, name: 'calendar', color: '#2563eb' },
  { pattern: /jam mengajar|teaching load/i, name: 'clock', color: '#f59e0b' },
  { pattern: /ujian|soal|bank soal|sesi/i, name: 'clipboard', color: '#f59e0b' },
  { pattern: /program/i, name: 'layout', color: '#7c3aed' },
  { pattern: /kelas|class/i, name: 'layout', color: '#0ea5e9' },
  { pattern: /ruangan|ruang/i, name: 'home', color: '#16a34a' },
  { pattern: /peminjaman|pinjam|loan/i, name: 'book', color: '#f59e0b' },
  { pattern: /aset|inventaris/i, name: 'package', color: '#f97316' },
  { pattern: /anggaran|budget|biaya/i, name: 'credit-card', color: '#f59e0b' },
  { pattern: /siswa|student/i, name: 'user', color: '#2563eb' },
  { pattern: /orang tua|ortu|parent/i, name: 'users', color: '#8b5cf6' },
  { pattern: /pembina|wali/i, name: 'shield', color: '#0ea5e9' },
  { pattern: /ekskul|ekstrakurikuler|kegiatan/i, name: 'activity', color: '#ec4899' },
  { pattern: /risiko|risk/i, name: 'alert-triangle', color: '#ef4444' },
  { pattern: /disiplin/i, name: 'shield', color: '#ef4444' },
  { pattern: /absensi|rekap/i, name: 'check-square', color: '#16a34a' },
  { pattern: /perizinan|izin/i, name: 'file-text', color: '#6366f1' },
  { pattern: /laporan|report/i, name: 'bar-chart-2', color: '#2563eb' },
  { pattern: /kkm|target/i, name: 'target', color: '#e11d48' },
  { pattern: /promotion|kenaikan|alumni/i, name: 'shuffle', color: '#f97316' },
  { pattern: /utama|akun|account|profil|profile/i, name: 'user', color: '#2563eb' },
  { pattern: /riwayat/i, name: 'book-open', color: '#0f766e' },
  { pattern: /karier|tautan|link/i, name: 'briefcase', color: '#8b5cf6' },
  { pattern: /harian/i, name: 'sun', color: '#f59e0b' },
  { pattern: /telat|late/i, name: 'alert-circle', color: '#ef4444' },
  { pattern: /semua/i, name: 'layers', color: '#64748b' },
  { pattern: /menunggu|pending/i, name: 'clock', color: '#f59e0b' },
  { pattern: /disetujui|approved|aktif/i, name: 'check-circle', color: '#16a34a' },
  { pattern: /ditolak|rejected/i, name: 'x-circle', color: '#dc2626' },
  { pattern: /duty/i, name: 'flag', color: '#0ea5e9' },
];

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const safeHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;
  const red = Number.parseInt(safeHex.slice(0, 2), 16);
  const green = Number.parseInt(safeHex.slice(2, 4), 16);
  const blue = Number.parseInt(safeHex.slice(4, 6), 16);
  if ([red, green, blue].some((value) => Number.isNaN(value))) return `rgba(37, 99, 235, ${alpha})`;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getAutoIconSpec(label: string): AutoIconRule | null {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel) return null;
  return AUTO_ICON_RULES.find((item) => item.pattern.test(normalizedLabel)) || null;
}

export type MobileTabChipProps = {
  active: boolean;
  label: string;
  onPress: () => void;
  compact?: boolean;
  minWidth?: number;
  icon?: ReactNode;
  stacked?: boolean;
  useAutoIcon?: boolean;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function MobileTabChip({
  active,
  label,
  onPress,
  compact = false,
  minWidth,
  icon,
  stacked = false,
  useAutoIcon = false,
  iconSize,
  style,
  textStyle,
}: MobileTabChipProps) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const autoIcon = useAutoIcon ? getAutoIconSpec(label) : null;
  const resolvedIcon =
    icon || autoIcon ? (
      icon || <Feather name={autoIcon?.name || 'grid'} size={iconSize || (stacked ? 18 : 14)} color={autoIcon?.color || '#2563eb'} />
    ) : null;
  const iconTint = autoIcon?.color || '#2563eb';

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minWidth: stacked ? minWidth || 96 : minWidth,
          maxWidth: stacked ? 126 : undefined,
          borderWidth: 1,
          borderColor: active ? '#bfdbfe' : '#d7e3f7',
          backgroundColor: active ? '#f8fbff' : '#ffffff',
          borderRadius: stacked ? 18 : 14,
          paddingHorizontal: stacked ? 10 : compact ? 12 : 14,
          paddingVertical: stacked ? 10 : compact ? 10 : 11,
          minHeight: stacked ? 82 : 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.88 : 1,
          ...(active
            ? {
                shadowColor: '#2563eb',
                shadowOpacity: 0.12,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }
            : null),
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: stacked ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {resolvedIcon ? (
          <View
            style={
              stacked
                ? {
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 6,
                    backgroundColor: hexToRgba(iconTint, active ? 0.16 : 0.1),
                  }
                : {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 6,
                    backgroundColor: hexToRgba(iconTint, active ? 0.14 : 0.08),
                  }
            }
          >
            {resolvedIcon}
          </View>
        ) : null}
        <Text
          numberOfLines={stacked ? 2 : 1}
          style={[
            {
              color: active ? '#1d4ed8' : BRAND_COLORS.textDark,
              fontWeight: active ? '700' : '600',
              fontSize: scaleFont(stacked ? 11.5 : compact ? 11.5 : 12.5),
              lineHeight: stacked ? scaleLineHeight(14) : undefined,
              letterSpacing: 0.1,
              textAlign: stacked ? 'center' : 'left',
            },
            textStyle,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
