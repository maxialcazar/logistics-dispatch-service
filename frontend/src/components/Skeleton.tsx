import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={twMerge(clsx('animate-pulse rounded-md bg-slate-800/60', className))}
      {...props}
    />
  );
}

interface SkeletonKpiCardProps {
  variant?: 'inline' | 'stacked';
  className?: string;
}

export function SkeletonKpiCard({ variant = 'inline', className }: SkeletonKpiCardProps) {
  if (variant === 'stacked') {
    return (
      <div
        aria-hidden="true"
        className={twMerge(
          clsx('rounded-xl border border-slate-800/80 bg-slate-900 p-4 shadow-sm', className)
        )}
      >
        <div className="mb-2 flex items-start justify-between">
          <Skeleton className="h-9 w-9 rounded-lg border border-slate-800/80" />
          <Skeleton className="h-5 w-14 rounded border border-slate-800/80" />
        </div>
        <Skeleton className="mb-1.5 h-7 w-16" />
        <Skeleton className="h-3.5 w-28" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={twMerge(
        clsx(
          'flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900 p-4 shadow-sm',
          className
        )
      )}
    >
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="mt-2 h-7 w-16" />
        <Skeleton className="mt-2 h-3.5 w-24" />
      </div>
      <Skeleton className="h-10 w-10 flex-shrink-0 rounded-lg border border-slate-800/80 bg-slate-800/70" />
    </div>
  );
}

export type SkeletonTableColumn =
  | 'text'
  | 'short'
  | 'icon-text'
  | 'avatar-text'
  | 'badges'
  | 'progress'
  | 'pill';

interface SkeletonTableRowsProps {
  rows?: number;
  columns: SkeletonTableColumn[];
  cellClassName?: string;
}

function renderTableCellSkeleton(type: SkeletonTableColumn, rowIdx: number) {
  switch (type) {
    case 'short':
      return <Skeleton className="h-4 w-16" />;
    case 'icon-text':
      return (
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5 rounded flex-shrink-0" />
          <Skeleton className={clsx('h-3.5', rowIdx % 2 === 0 ? 'w-24' : 'w-20')} />
        </div>
      );
    case 'avatar-text':
      return (
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
          <Skeleton className={clsx('h-4', rowIdx % 2 === 0 ? 'w-32' : 'w-24')} />
        </div>
      );
    case 'badges':
      return (
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-5 w-16 rounded" />
          {rowIdx % 2 === 0 && <Skeleton className="h-5 w-20 rounded" />}
        </div>
      );
    case 'progress':
      return (
        <div className="flex items-center gap-2">
          <Skeleton className="h-1.5 w-16 rounded-full" />
          <Skeleton className="h-4 w-9" />
        </div>
      );
    case 'pill':
      return <Skeleton className="h-5 w-16 rounded-full" />;
    case 'text':
    default:
      return <Skeleton className={clsx('h-4', rowIdx % 2 === 0 ? 'w-36' : 'w-28')} />;
  }
}

export function SkeletonTableRows({
  rows = 5,
  columns,
  cellClassName = 'px-4 py-3',
}: SkeletonTableRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} aria-hidden="true">
          {columns.map((col, colIdx) => (
            <td key={colIdx} className={cellClassName}>
              {renderTableCellSkeleton(col, rowIdx)}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface SkeletonChartProps {
  variant?: 'bar' | 'donut';
  className?: string;
}

const BAR_HEIGHTS = [
  ['h-20', 'h-5'],
  ['h-36', 'h-8'],
  ['h-28', 'h-4'],
  ['h-48', 'h-10'],
  ['h-40', 'h-6'],
  ['h-24', 'h-5'],
  ['h-32', 'h-7'],
] as const;

export function SkeletonChart({ variant = 'bar', className }: SkeletonChartProps) {
  return (
    <div
      aria-hidden="true"
      className={twMerge(
        clsx(
          'flex h-[400px] flex-col rounded-xl border border-slate-800/80 bg-slate-900 p-6 shadow-sm',
          className
        )
      )}
    >
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-44" />
      </div>

      {variant === 'donut' ? (
        <div className="flex flex-1 flex-col items-center justify-between py-2">
          <div className="flex flex-1 items-center justify-center">
            <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-slate-800/60 animate-pulse">
              <div className="h-24 w-24 rounded-full bg-slate-900" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Skeleton className="h-2.5 w-2.5 rounded-sm" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-end">
          <div className="flex flex-1 items-end gap-3">
            <div className="hidden sm:flex h-full flex-col justify-between pb-6 pr-1">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-3 w-6" />
              ))}
            </div>
            <div className="flex flex-1 flex-col">
              <div className="grid grid-cols-7 items-end gap-2 sm:gap-3 border-b border-slate-800/80 pb-2 h-56">
                {BAR_HEIGHTS.map(([primary, secondary], i) => (
                  <div key={i} className="flex items-end justify-center gap-1">
                    <Skeleton className={clsx('w-3 sm:w-4 rounded-t rounded-b-none', primary)} />
                    <Skeleton className={clsx('w-3 sm:w-4 rounded-t rounded-b-none bg-slate-800/40', secondary)} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2 sm:gap-3 pt-2">
                {BAR_HEIGHTS.map((_, i) => (
                  <Skeleton key={i} className="mx-auto h-3 w-7 sm:w-9" />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6 pt-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SkeletonFeedItem() {
  return (
    <div
      aria-hidden="true"
      className="flex gap-3 border-b border-slate-800/80 pb-3 last:border-0 last:pb-0"
    >
      <Skeleton className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-10 flex-shrink-0" />
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

