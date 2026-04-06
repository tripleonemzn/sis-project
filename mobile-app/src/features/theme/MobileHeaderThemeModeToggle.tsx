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

  const activeOption = mode === 'dark' ? OPTIONS[1] : OPTIONS[0];
  const nextOption = mode === 'dark' ? OPTIONS[0] : OPTIONS[1];
  const isDarkSelected = mode === 'dark';

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
      accessibilityLabel={`Mode aktif ${activeOption.label}. Klik untuk beralih ke ${nextOption.label}.`}
      disabled={mutation.isPending}
      onPress={() => {
        void handleToggle(nextOption.value);
      }}
      style={{
        width: 118,
        height: 44,
        borderRadius: 999,
        flexDirection: isDarkSelected ? 'row' : 'row-reverse',
        alignItems: 'center',
        paddingLeft: isDarkSelected ? 5 : 12,
        paddingRight: isDarkSelected ? 12 : 5,
        backgroundColor: isDarkSelected ? '#1f2937' : '#f8fafc',
        borderWidth: 1,
        borderColor: isDarkSelected ? 'rgba(15, 23, 42, 0.2)' : 'rgba(148, 163, 184, 0.26)',
        shadowColor: '#0f172a',
        shadowOpacity: isDarkSelected ? 0.22 : 0.12,
        shadowOffset: { width: 0, height: 5 },
        shadowRadius: 10,
        elevation: 3,
        opacity: mutation.isPending ? 0.75 : 1,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          borderWidth: 3,
          borderColor: isDarkSelected ? '#d1d5db' : '#cbd5e1',
          shadowColor: '#0f172a',
          shadowOpacity: isDarkSelected ? 0.26 : 0.12,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Feather name={activeOption.iconName} size={16} color={isDarkSelected ? '#111827' : '#475569'} />
      </View>

      <View
        style={{
          flex: 1,
          paddingLeft: isDarkSelected ? 12 : 8,
          paddingRight: isDarkSelected ? 8 : 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: isDarkSelected ? '#e5e7eb' : '#475569',
            fontSize: 9.5,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.7,
          }}
        >
          {activeOption.label}
        </Text>
      </View>

      {mutation.isPending ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={{
            position: 'absolute',
            top: 11,
            right: isDarkSelected ? 10 : undefined,
            left: isDarkSelected ? undefined : 10,
          }}
        />
      ) : null}
    </Pressable>
  );
}
