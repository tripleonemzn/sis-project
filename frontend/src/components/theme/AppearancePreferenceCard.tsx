import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Laptop, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import {
  THEME_MODE_PREFERENCE_KEY,
  useAppTheme,
  type ThemeMode,
} from '../../providers/AppThemeProvider';

type AppearancePreferenceCardProps = {
  userId: number;
  currentPreferences?: Record<string, unknown> | null;
};

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Laptop;
}> = [
  {
    value: 'system',
    label: 'Ikuti Sistem',
    description: 'Tampilan mengikuti pengaturan perangkat yang sedang digunakan.',
    icon: Laptop,
  },
  {
    value: 'light',
    label: 'Mode Terang',
    description: 'Gunakan tampilan terang untuk seluruh aplikasi operasional.',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Mode Gelap',
    description: 'Gunakan tampilan gelap agar lebih nyaman di lingkungan redup.',
    icon: Moon,
  },
];

export function AppearancePreferenceCard({
  userId,
  currentPreferences,
}: AppearancePreferenceCardProps) {
  const queryClient = useQueryClient();
  const { mode, resolvedTheme, setMode } = useAppTheme();

  const helperText = useMemo(() => {
    if (mode === 'system') {
      return `Saat ini mengikuti sistem dan aktif sebagai ${resolvedTheme === 'dark' ? 'Mode Gelap' : 'Mode Terang'}.`;
    }
    return `Saat ini aplikasi memakai ${mode === 'dark' ? 'Mode Gelap' : 'Mode Terang'}.`;
  }, [mode, resolvedTheme]);

  const mutation = useMutation({
    mutationFn: async (nextMode: ThemeMode) => {
      const mergedPreferences = {
        ...(currentPreferences || {}),
        [THEME_MODE_PREFERENCE_KEY]: nextMode,
      };
      return userService.update(userId, {
        preferences: mergedPreferences,
      });
    },
    onSuccess: async () => {
      authService.clearMeCache();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Tema tampilan berhasil diperbarui.');
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
      onError: () => {
        setMode(previousMode);
      },
    });
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Pengaturan Tampilan</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Mode Tema Aplikasi</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Pilih mode tampilan yang paling nyaman. Default aplikasi tetap bisa mengikuti pengaturan sistem perangkat.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          {helperText}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.value === mode;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              disabled={mutation.isPending}
              className={[
                'rounded-3xl border px-4 py-4 text-left transition',
                active
                  ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-blue-100 hover:bg-white',
                mutation.isPending ? 'cursor-wait opacity-80' : '',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`rounded-2xl border p-3 ${active ? 'border-blue-200 bg-white' : 'border-slate-200 bg-white'}`}>
                  <Icon className="h-5 w-5" />
                </div>
                {active ? (
                  <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    Aktif
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-sm font-semibold">{option.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{option.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
