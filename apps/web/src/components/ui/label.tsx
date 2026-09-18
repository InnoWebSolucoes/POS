import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const labelVariants = cva(
  'inline-flex select-none items-center gap-1.5 text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
  {
    variants: {
      size: {
        sm: 'text-xs',
        default: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {
  /** Appends the red asterisk used across the back-office forms. */
  required?: boolean;
}

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  function Label({ className, size, required, children, ...props }, ref) {
    return (
      <LabelPrimitive.Root ref={ref} className={cn(labelVariants({ size }), className)} {...props}>
        {children}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </LabelPrimitive.Root>
    );
  },
);

export { labelVariants };
export default Label;
