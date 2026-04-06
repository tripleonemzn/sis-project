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
  const { mode, setMode } = useAppTheme();

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

  const activeOption = mode === 'dark' ? OPTIONS[1] : OPTIONS[0];
  const nextOption = mode === 'dark' ? OPTIONS[0] : OPTIONS[1];
  const ActiveIcon = activeOption.icon;
  const isDarkSelected = mode === 'dark';

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
      title={`Mode aktif ${activeOption.title}. Klik untuk beralih ke ${nextOption.title}.`}
      aria-label={`Mode aktif ${activeOption.title}. Klik untuk beralih ke ${nextOption.title}.`}
      disabled={mutation.isPending}
      onClick={() => handleToggle(nextOption.value)}
      className="hidden md:inline-flex items-center rounded-full transition"
      style={{
        width: 132,
        height: 46,
        paddingLeft: isDarkSelected ? 6 : 14,
        paddingRight: isDarkSelected ? 14 : 6,
        justifyContent: isDarkSelected ? 'flex-start' : 'flex-end',
        backgroundColor: isDarkSelected ? '#1f2937' : '#f8fafc',
        border: isDarkSelected ? '1px solid rgba(15, 23, 42, 0.2)' : '1px solid rgba(148, 163, 184, 0.28)',
        boxShadow: isDarkSelected
          ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 24px rgba(2, 6, 23, 0.24)'
          : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 22px rgba(148, 163, 184, 0.24)',
        opacity: mutation.isPending ? 0.72 : 1,
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition"
        style={{
          order: isDarkSelected ? 0 : 1,
          backgroundColor: '#ffffff',
          color: isDarkSelected ? '#111827' : '#475569',
          border: isDarkSelected ? '3px solid #d1d5db' : '3px solid #cbd5e1',
          boxShadow: isDarkSelected
            ? '0 6px 16px rgba(15, 23, 42, 0.32)'
            : '0 8px 18px rgba(148, 163, 184, 0.26)',
        }}
      >
        <ActiveIcon className="h-[18px] w-[18px]" />
      </span>
      <span
        className="flex min-w-0 flex-1 items-center justify-center"
        style={{
          order: isDarkSelected ? 1 : 0,
          paddingLeft: isDarkSelected ? 14 : 10,
          paddingRight: isDarkSelected ? 10 : 14,
        }}
      >
        <span
          className="text-[10px] font-extrabold uppercase leading-none tracking-[0.12em]"
          style={{ color: isDarkSelected ? '#e5e7eb' : '#475569' }}
        >
          {activeOption.label}
        </span>
      </span>
    </button>
  );
}
