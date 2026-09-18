import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';

import { cn } from '@/lib/utils';

export interface SeparatorProps
  extends React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> {
  /** Centred caption, as used between the tender methods. */
  label?: React.ReactNode;
}

export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  SeparatorProps
>(function Separator({ className, orientation = 'horizontal', decorative = true, label, ...props }, ref) {
  if (label && orientation === 'horizontal') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <SeparatorPrimitive.Root
          ref={ref}
          decorative={decorative}
          orientation="horizontal"
          className="h-px flex-1 bg-border"
          {...props}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
});

export default Separator;
