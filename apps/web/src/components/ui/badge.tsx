import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold leading-none transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border bg-transparent text-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/20 text-warning',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
      size: {
        sm: 'px-2 py-0.5 text-[0.6875rem]',
        default: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const DOT_COLOURS: Record<string, string> = {
  default: 'bg-primary-foreground',
  secondary: 'bg-secondary-foreground',
  outline: 'bg-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Small status dot before the label - state is never colour alone. */
  dot?: boolean;
  /** Makes the dot blink, for "a decorrer" style states. */
  pulse?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, size, dot = false, pulse = false, children, ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            DOT_COLOURS[variant ?? 'default'],
            pulse && 'animate-ticket-pulse',
          )}
        />
      )}
      {children}
    </span>
  );
});

export default Badge;
