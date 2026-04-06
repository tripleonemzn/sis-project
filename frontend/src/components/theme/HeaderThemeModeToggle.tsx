import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoonStar, SunMedium } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { userService } from '../../services/user.service';
import {
  THEME_MODE_PREFERENCE_KEY,
  useAppTheme,
  type ThemeMode,
} from '../../providers/AppThemeProvider';

type HeaderThemeModeToggleProps = {
  userId: number;
  currentPreferences?: Record<string, unknown> | null;
};

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  title: string;
  icon: typeof SunMedium;
}> = [
  {
    value: 'system',
    label: 'MODE SISTEM',
    title: 'Ikuti Sistem',
    icon: SunMedium,
  },
  {
    value: 'dark',
    label: 'MODE GELAP',
    title: 'Mode Gelap',
    icon: MoonStar,
  },
];

export function HeaderThemeModeToggle({
  userId,
  currentPreferences,
}: HeaderThemeModeToggleProps) {
  const queryClient = useQueryClient();
  const { mode, resolvedTheme, setMode } = useAppTheme();

  const mutation = useMutation({
    mutationFn: async (nextMode: ThemeMode) => {
      return userService.update(userId, {
        preferences: {
          ...(currentPreferences || {}),
          [THEME_MODE_PREFERENCE_KEY]: nextMode,
        },
      });
    },
    onSuccess: async () => {
      authService.clearMeCache();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: () => {
      toast.error('Gagal menyimpan tema tampilan.');
    },
  });

  const nextOption = mode === 'dark' ? OPTIONS[0] : OPTIONS[1];
  const NextIcon = nextOption.icon;

  const handleToggle = (nextMode: ThemeMode) => {
    if (mutation.isPending || nextMode === mode) return;
    const previousMode = mode;
    setMode(nextMode);
    mutation.mutate(nextMode, {
      onError: () => setMode(previousMode),
    });
  };

  return (
    <button
      type="button"
      title={`Klik untuk beralih ke ${nextOption.title}.`}
      aria-label={`Klik untuk beralih ke ${nextOption.title}.`}
      disabled={mutation.isPending}
      onClick={() => handleToggle(nextOption.value)}
      className="hidden md:inline-flex flex-col items-center justify-center gap-1 transition"
      style={{ opacity: mutation.isPending ? 0.72 : 1 }}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full transition"
        style={{
          backgroundColor: resolvedTheme === 'dark' ? 'rgba(226, 232, 240, 0.12)' : 'rgba(255, 255, 255, 0.92)',
          color: resolvedTheme === 'dark' ? '#e2e8f0' : '#475569',
          border: resolvedTheme === 'dark' ? '1px solid rgba(148, 163, 184, 0.24)' : '1px solid rgba(148, 163, 184, 0.26)',
          boxShadow:
            resolvedTheme === 'dark'
              ? '0 6px 16px rgba(2, 6, 23, 0.28)'
              : '0 8px 18px rgba(148, 163, 184, 0.24)',
        }}
      >
        <NextIcon className="h-[19px] w-[19px]" />
      </span>
      <span className="flex flex-col items-center justify-center">
        <span
          className="text-[9px] font-bold uppercase leading-none tracking-[0.14em]"
          style={{ color: resolvedTheme === 'dark' ? '#cbd5e1' : '#475569' }}
        >
          {nextOption.label}
        </span>
      </span>
    </button>
  );
}
