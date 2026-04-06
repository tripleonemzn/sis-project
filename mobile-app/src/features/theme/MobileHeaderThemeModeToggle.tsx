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
    label: 'Sistem',
    iconName: 'monitor',
  },
  {
    value: 'dark',
    label: 'Gelap',
    iconName: 'moon',
  },
];

export function MobileHeaderThemeModeToggle({
  userId,
  currentPreferences,
}: MobileHeaderThemeModeToggleProps) {
  const queryClient = useQueryClient();
  const { rehydrate } = useAuth();
  const { colors, mode, setMode } = useAppTheme();

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

  const handleSelect = async (nextMode: ThemeMode) => {
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        backgroundColor: colors.surface,
        paddingHorizontal: 6,
        paddingVertical: 5,
      }}
    >
      {OPTIONS.map((option) => {
        const active = option.value === mode;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            disabled={mutation.isPending}
            onPress={() => {
              void handleSelect(option.value);
            }}
            style={{
              minWidth: 52,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: active ? colors.primary : 'transparent',
              backgroundColor: active ? colors.primarySoft : 'transparent',
              paddingHorizontal: 8,
              paddingVertical: 6,
              opacity: mutation.isPending ? 0.75 : 1,
            }}
          >
            <Feather name={option.iconName} size={15} color={active ? colors.primary : colors.textMuted} />
            <Text
              style={{
                marginTop: 3,
                fontSize: 10,
                fontWeight: '700',
                color: active ? colors.primary : colors.textMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}

      {mutation.isPending ? <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} /> : null}
    </View>
  );
}
