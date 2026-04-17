import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';
import { MobileSelectField } from '../../components/MobileSelectField';
import { useAuth } from '../auth/AuthProvider';
import { authService } from '../auth/authService';
import { MOBILE_PROFILE_QUERY_KEY } from '../profile/useProfileQuery';
import { profileApi } from '../profile/profileApi';
import { notifyError, notifySuccess } from '../../lib/ui/feedback';
import { useAppTheme } from '../../theme/AppThemeProvider';
import { useAppTextScale } from '../../theme/AppTextScaleProvider';
import {
  MOBILE_TEXT_SCALE_OPTIONS,
  MOBILE_TEXT_SCALE_PREFERENCE_KEY,
  type MobileTextScaleMode,
} from '../../theme/typography';

type MobileTextScalePreferenceCardProps = {
  userId: number;
  currentPreferences?: Record<string, unknown> | null;
};

function getHelperText(mode: MobileTextScaleMode) {
  if (mode === 'large') {
    return 'Ukuran teks utama diperbesar agar lebih nyaman dibaca tanpa mengubah alur aplikasi.';
  }
  if (mode === 'extraLarge') {
    return 'Ukuran teks utama diperbesar lebih lanjut untuk kebutuhan visibilitas yang lebih tinggi.';
  }
  return 'Ikuti Sistem memakai ukuran huruf bawaan perangkat. Ubah ke Besar atau Sangat Besar jika teks masih terasa kecil.';
}

function getModeBadgeLabel(mode: MobileTextScaleMode) {
  if (mode === 'large') return 'BESAR';
  if (mode === 'extraLarge') return 'SANGAT BESAR';
  return 'SISTEM';
}

export function MobileTextScalePreferenceCard({
  userId,
  currentPreferences,
}: MobileTextScalePreferenceCardProps) {
  const queryClient = useQueryClient();
  const { rehydrate } = useAuth();
  const { colors } = useAppTheme();
  const { mode, setMode, typography } = useAppTextScale();

  const mutation = useMutation({
    mutationFn: async (nextMode: MobileTextScaleMode) => {
      return profileApi.updateSelf(userId, {
        preferences: {
          ...(currentPreferences || {}),
          [MOBILE_TEXT_SCALE_PREFERENCE_KEY]: nextMode,
        },
      });
    },
    onSuccess: async () => {
      authService.clearMeCache();
      await queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
      await rehydrate();
      notifySuccess('Ukuran teks berhasil diperbarui.');
    },
    onError: () => {
      notifyError('Gagal menyimpan ukuran teks.');
    },
  });

  const handleChange = (nextValue: string) => {
    const parsedMode = MOBILE_TEXT_SCALE_OPTIONS.find((option) => option.value === nextValue)?.value;
    if (!parsedMode || parsedMode === mode || mutation.isPending) return;
    const previousMode = mode;
    setMode(parsedMode);
    mutation.mutate(parsedMode, {
      onError: () => {
        setMode(previousMode);
      },
    });
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textMuted, ...typography.micro, letterSpacing: 1.2 }}>AKSESIBILITAS</Text>
          <Text style={{ color: colors.text, ...typography.sectionTitle, marginTop: 6 }}>Ukuran Teks Aplikasi</Text>
          <Text style={{ color: colors.textMuted, ...typography.bodyCompact, marginTop: 8 }}>
            Aplikasi tetap menghormati ukuran huruf dari perangkat. Pilih ukuran yang lebih besar jika butuh tampilan
            yang lebih nyaman dibaca saat belajar atau ujian.
          </Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.primarySoft,
            backgroundColor: colors.surfaceMuted,
            paddingHorizontal: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: colors.primary, ...typography.caption, fontWeight: '700' }}>
            {getModeBadgeLabel(mode)}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <MobileSelectField
          label="Ukuran Teks"
          value={mode}
          options={MOBILE_TEXT_SCALE_OPTIONS}
          onChange={handleChange}
          helperText={getHelperText(mode)}
          disabled={mutation.isPending}
        />
      </View>

      {mutation.isPending ? (
        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textMuted, marginLeft: 8, ...typography.caption }}>
            Menyimpan preferensi ukuran teks...
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default MobileTextScalePreferenceCard;
