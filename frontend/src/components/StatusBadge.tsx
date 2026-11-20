import clsx from 'clsx';
import { getPackageStatusToken } from '../utils/packageStatus';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  size = 'sm',
  showDot = true,
  className,
}: StatusBadgeProps) {
  const token = getPackageStatusToken(status);

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'md' ? 'px-3 py-1 text-xs font-semibold' : 'px-2.5 py-0.5 text-xs',
        token.badgeClass,
        className
      )}
    >
      {showDot && (
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-full flex-shrink-0',
            token.dotClass,
            token.pulse && 'animate-pulse'
          )}
          aria-hidden="true"
        />
      )}
      <span>{token.label}</span>
    </span>
  );
}
