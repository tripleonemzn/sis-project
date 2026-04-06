import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Laptop, Moon } from 'lucide-react';
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
  icon: typeof Laptop;
}> = [
  {
    value: 'system',
    label: 'Sistem',
    title: 'Ikuti Sistem',
    icon: Laptop,
  },
  {
    value: 'dark',
    label: 'Gelap',
    title: 'Mode Gelap',
    icon: Moon,
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

  const handleSelect = (nextMode: ThemeMode) => {
    if (mutation.isPending || nextMode === mode) return;
    const previousMode = mode;
    setMode(nextMode);
    mutation.mutate(nextMode, {
      onError: () => setMode(previousMode),
    });
  };

  return (
    <div
      className="hidden md:flex items-center gap-1 rounded-2xl border px-1.5 py-1"
      style={{
        borderColor: resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.24)' : '#dbeafe',
        backgroundColor: resolvedTheme === 'dark' ? 'rgba(15, 23, 42, 0.44)' : 'rgba(255, 255, 255, 0.72)',
      }}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-label={option.title}
            disabled={mutation.isPending}
            onClick={() => handleSelect(option.value)}
            className="flex min-w-[52px] flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition"
            style={{
              borderColor: active
                ? resolvedTheme === 'dark'
                  ? 'rgba(96, 165, 250, 0.45)'
                  : '#bfdbfe'
                : 'transparent',
              backgroundColor: active
                ? resolvedTheme === 'dark'
                  ? 'rgba(30, 41, 59, 0.92)'
                  : '#eff6ff'
                : 'transparent',
              color: active
                ? resolvedTheme === 'dark'
                  ? '#bfdbfe'
                  : '#1d4ed8'
                : resolvedTheme === 'dark'
                  ? '#94a3b8'
                  : '#64748b',
              opacity: mutation.isPending ? 0.72 : 1,
            }}
          >
            <Icon className="h-4 w-4" />
            <span className="mt-1 text-[10px] font-semibold leading-none">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
