import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export type UnderlineTabBarItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
};

type UnderlineTabBarProps = {
  items: UnderlineTabBarItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  innerClassName?: string;
  ariaLabel?: string;
  textSizeClassName?: string;
};

export function UnderlineTabBar({
  items,
  activeId,
  onChange,
  className,
  innerClassName,
  ariaLabel = 'Tabs',
  textSizeClassName = 'text-sm',
}: UnderlineTabBarProps) {
  if (!items.length) return null;

  return (
    <div className={clsx('border-b border-gray-200', className)}>
      <div
        className={clsx('flex overflow-x-auto gap-4 pb-1 scrollbar-hide', innerClassName)}
        aria-label={ariaLabel}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={clsx(
                'flex items-center gap-2 border-b-2 px-4 py-3 whitespace-nowrap transition-colors',
                textSizeClassName,
                isActive
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              {Icon ? <Icon size={18} /> : null}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default UnderlineTabBar;
