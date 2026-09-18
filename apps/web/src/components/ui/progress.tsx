import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** 0-100. */
  value?: number | null;
  tone?: 'primary' | 'success' | 'warning' | 'destructive';
  size?: 'sm' | 'default' | 'lg';
}

const TONES: Record<NonNullable<ProgressProps['tone']>, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

const SIZES: Record<NonNullable<ProgressProps['size']>, string> = {
  sm: 'h-1.5',
  default: 'h-2.5',
  lg: 'h-4',
};

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(function Progress({ className, value, tone = 'primary', size = 'default', ...props }, ref) {
  const clamped = Math.min(100, Math.max(0, value ?? 0));
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={clamped}
      className={cn('relative w-full overflow-hidden rounded-full bg-muted', SIZES[size], className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('size-full flex-1 rounded-full transition-transform duration-300', TONES[tone])}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});

export default Progress;
