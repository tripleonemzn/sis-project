import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';
import { MobileSelectField } from '../../components/MobileSelectField';
import { useAuth } from '../auth/AuthProvider';
import { authService } from '../auth/authService';
import { MOBILE_PROFILE_QUERY_KEY } from '../profile/useProfileQuery';
import { profileApi } from '../profile/profileApi';
import { notifyError, notifySuccess } from '../../lib/ui/feedback';
import {
  THEME_MODE_PREFERENCE_KEY,
  useAppTheme,
  type ThemeMode,
} from '../../theme/AppThemeProvider';

type MobileAppearancePreferenceCardProps = {
  userId: number;
  currentPreferences?: Record<string, unknown> | null;
};

const OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: 'Ikuti Sistem', value: 'system' },
  { label: 'Mode Gelap', value: 'dark' },
];

export function MobileAppearancePreferenceCard({
  userId,
  currentPreferences,
}: MobileAppearancePreferenceCardProps) {
  const queryClient = useQueryClient();
  const { rehydrate } = useAuth();
  const { colors, mode, resolvedTheme, setMode } = useAppTheme();

  const mutation = useMutation({
    mutationFn: async (nextMode: ThemeMode) => {
      return profileApi.updateSelf(userId, {
        preferences: {
          ...(currentPreferences || {}),
          [THEME_MODE_PREFERENCE_KEY]: nextMode,
        },
      });
    },
    onSuccess: async () => {
      authService.clearMeCache();
      await queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
      await rehydrate();
      notifySuccess('Tema tampilan berhasil diperbarui.');
    },
    onError: () => {
      notifyError('Gagal menyimpan tema tampilan.');
    },
  });

  const helperText =
    mode === 'system'
      ? `Saat ini mengikuti sistem dan aktif sebagai ${resolvedTheme === 'dark' ? 'Mode Gelap' : 'Mode Terang'}.`
      : 'Saat ini aplikasi memakai Mode Gelap.';

  const handleChange = async (nextMode: string) => {
    const parsedMode = OPTIONS.find((option) => option.value === nextMode)?.value;
    if (!parsedMode || parsedMode === mode || mutation.isPending) return;
    const previousMode = mode;
    await setMode(parsedMode);
    mutation.mutate(parsedMode, {
      onError: () => {
        void setMode(previousMode);
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
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>
            PENGATURAN TAMPILAN
          </Text>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 6 }}>
            Mode Tema Aplikasi
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
            Pilih tampilan yang nyaman. Default aplikasi tetap bisa mengikuti pengaturan sistem perangkat.
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
          <Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: '700' }}>
            {mode === 'dark' ? 'GELAP' : 'SISTEM'}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <MobileSelectField
          label="Mode Tampilan"
          value={mode}
          options={OPTIONS}
          onChange={(value) => {
            void handleChange(value);
          }}
          helperText={helperText}
          disabled={mutation.isPending}
        />
      </View>

      {mutation.isPending ? (
        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textMuted, marginLeft: 8, fontSize: 12 }}>
            Menyimpan preferensi tampilan...
          </Text>
        </View>
      ) : null}
    </View>
  );
}
