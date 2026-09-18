import * as React from 'react';

import { cn } from '@/lib/utils';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/** Placeholder block. Always the same shape as the content it stands in for. */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export default Skeleton;
