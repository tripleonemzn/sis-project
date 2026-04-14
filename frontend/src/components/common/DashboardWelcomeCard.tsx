import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { User } from '../../types/auth';

type DashboardWelcomeTone = 'blue' | 'sky' | 'teal' | 'emerald' | 'orange' | 'rose' | 'violet';

type DashboardWelcomeUser = Partial<Pick<User, 'name' | 'username' | 'photo'>> | null;

type DashboardWelcomeCardProps = {
  user?: DashboardWelcomeUser;
  eyebrow?: string;
  title?: string;
  subtitle: string;
  meta?: string;
  tone?: DashboardWelcomeTone;
  aside?: ReactNode;
  className?: string;
  fallbackName?: string;
};

const toneClasses: Record<
  DashboardWelcomeTone,
  {
    panel: string;
    ring: string;
    avatar: string;
    avatarText: string;
    eyebrow: string;
  }
> = {
  blue: {
    panel: 'border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80',
    ring: 'ring-blue-200',
    avatar: 'bg-blue-100',
    avatarText: 'text-blue-700',
    eyebrow: 'text-blue-600',
  },
  sky: {
    panel: 'border-sky-100 bg-gradient-to-br from-sky-50 to-cyan-100/80',
    ring: 'ring-sky-200',
    avatar: 'bg-sky-100',
    avatarText: 'text-sky-700',
    eyebrow: 'text-sky-600',
  },
  teal: {
    panel: 'border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-100/80',
    ring: 'ring-teal-200',
    avatar: 'bg-teal-100',
    avatarText: 'text-teal-700',
    eyebrow: 'text-teal-600',
  },
  emerald: {
    panel: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80',
    ring: 'ring-emerald-200',
    avatar: 'bg-emerald-100',
    avatarText: 'text-emerald-700',
    eyebrow: 'text-emerald-600',
  },
  orange: {
    panel: 'border-orange-100 bg-gradient-to-br from-amber-50 to-orange-100/80',
    ring: 'ring-orange-200',
    avatar: 'bg-orange-100',
    avatarText: 'text-orange-700',
    eyebrow: 'text-orange-600',
  },
  rose: {
    panel: 'border-rose-100 bg-gradient-to-br from-rose-50 to-red-100/80',
    ring: 'ring-rose-200',
    avatar: 'bg-rose-100',
    avatarText: 'text-rose-700',
    eyebrow: 'text-rose-600',
  },
  violet: {
    panel: 'border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80',
    ring: 'ring-violet-200',
    avatar: 'bg-violet-100',
    avatarText: 'text-violet-700',
    eyebrow: 'text-violet-600',
  },
};

export function DashboardWelcomeCard({
  user,
  eyebrow,
  title,
  subtitle,
  meta,
  tone = 'blue',
  aside,
  className,
  fallbackName = 'Pengguna',
}: DashboardWelcomeCardProps) {
  const palette = toneClasses[tone];
  const resolvedName = String(user?.name || user?.username || fallbackName).trim() || fallbackName;
  const avatarLetter = resolvedName.charAt(0).toUpperCase() || 'P';
  const titleText = title || `Selamat Datang, ${resolvedName}! 👋`;

  return (
    <div
      className={clsx(
        'rounded-2xl px-6 py-4 shadow-sm relative flex flex-col md:flex-row justify-between items-center gap-4',
        palette.panel,
        className,
      )}
    >
      <div className="flex items-center gap-6">
        <div className="-mt-16 relative">
          <div
            className={clsx('w-36 h-36 rounded-full p-1 bg-white/90 ring-1', palette.ring)}
            style={{
              boxShadow:
                'inset 6px 6px 12px rgba(0,0,0,0.06), inset -6px -6px 12px rgba(255,255,255,0.9), 8px 8px 16px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.7)',
            }}
          >
            {user?.photo ? (
              <img
                src={
                  user.photo.startsWith('/api') || user.photo.startsWith('http')
                    ? user.photo
                    : `/api/uploads/${user.photo}`
                }
                alt={resolvedName}
                className="w-full h-full rounded-full object-cover"
                onError={(event) => {
                  (event.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName)}&background=random`;
                }}
              />
            ) : (
              <div
                className={clsx(
                  'w-full h-full rounded-full flex items-center justify-center font-bold text-6xl',
                  palette.avatar,
                  palette.avatarText,
                )}
              >
                {avatarLetter}
              </div>
            )}
          </div>
        </div>
        <div>
          {eyebrow ? (
            <p className={clsx('text-label font-semibold uppercase tracking-[0.22em]', palette.eyebrow)}>
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-lg font-bold text-gray-900 mb-1">{titleText}</h1>
          <p className="text-body text-gray-500">{subtitle}</p>
          {meta ? <p className="mt-2 text-label font-medium text-gray-500">{meta}</p> : null}
        </div>
      </div>

      {aside ? <div className="w-full md:w-auto">{aside}</div> : null}
    </div>
  );
}
