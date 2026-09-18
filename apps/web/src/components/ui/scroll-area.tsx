import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '@/lib/utils';

export interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  orientation?: 'vertical' | 'horizontal' | 'both';
  viewportClassName?: string;
}

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(function ScrollArea({ className, children, orientation = 'vertical', viewportClassName, ...props }, ref) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      // Touch scrolling must keep working; the custom bar is decoration only.
      type="auto"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className={cn('size-full rounded-[inherit]', viewportClassName)}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      {(orientation === 'vertical' || orientation === 'both') && <ScrollBar orientation="vertical" />}
      {(orientation === 'horizontal' || orientation === 'both') && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});

export const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(function ScrollBar({ className, orientation = 'vertical', ...props }, ref) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none p-0.5 transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
});

export default ScrollArea;
