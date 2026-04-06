import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { authService } from '../auth/authService';
import { MOBILE_PROFILE_QUERY_KEY } from '../profile/useProfileQuery';
import { profileApi } from '../profile/profileApi';
import { notifyError } from '../../lib/ui/feedback';
import {
  THEME_MODE_PREFERENCE_KEY,
  useAppTheme,
  type ThemeMode,
} from '../../theme/AppThemeProvider';

type MobileHeaderThemeModeToggleProps = {
  userId: number;
  currentPreferences?: Record<string, unknown> | null;
};

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  iconName: keyof typeof Feather.glyphMap;
}> = [
  {
    value: 'system',
    label: 'MODE SISTEM',
    iconName: 'sun',
  },
  {
    value: 'dark',
    label: 'MODE GELAP',
    iconName: 'moon',
  },
];

export function MobileHeaderThemeModeToggle({
  userId,
  currentPreferences,
}: MobileHeaderThemeModeToggleProps) {
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
    },
    onError: () => {
      notifyError('Gagal menyimpan tema tampilan.');
    },
  });

  const nextOption = mode === 'dark' ? OPTIONS[0] : OPTIONS[1];

  const handleToggle = async (nextMode: ThemeMode) => {
    if (mutation.isPending || nextMode === mode) return;
    const previousMode = mode;
    await setMode(nextMode);
    mutation.mutate(nextMode, {
      onError: () => {
        void setMode(previousMode);
      },
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Klik untuk beralih ke ${nextOption.label}.`}
      disabled={mutation.isPending}
      onPress={() => {
        void handleToggle(nextOption.value);
      }}
      style={{
        alignItems: 'center',
        opacity: mutation.isPending ? 0.75 : 1,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: resolvedTheme === 'dark' ? 'rgba(226, 232, 240, 0.12)' : 'rgba(255, 255, 255, 0.94)',
          borderWidth: 1,
          borderColor: resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.24)',
          shadowColor: '#0f172a',
          shadowOpacity: resolvedTheme === 'dark' ? 0.24 : 0.12,
          shadowOffset: { width: 0, height: 5 },
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        <Feather name={nextOption.iconName} size={17} color={resolvedTheme === 'dark' ? '#e2e8f0' : '#475569'} />
      </View>

      <View style={{ marginTop: 4 }}>
        <Text
          style={{
            color: resolvedTheme === 'dark' ? '#cbd5e1' : '#475569',
            fontSize: 9,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.7,
          }}
        >
          {nextOption.label}
        </Text>
      </View>

      {mutation.isPending ? <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 5 }} /> : null}
    </Pressable>
  );
}
