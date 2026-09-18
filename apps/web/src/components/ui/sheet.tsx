import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px]',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  );
});

const sheetVariants = cva(
  [
    'fixed z-50 flex flex-col gap-0 border-border bg-card text-card-foreground shadow-xl',
    'transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=open]:duration-300 data-[state=closed]:duration-200',
  ].join(' '),
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 rounded-b-2xl border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 rounded-t-2xl border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        right: 'inset-y-0 right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
      },
      size: {
        sm: '',
        default: '',
        lg: '',
        full: '',
      },
    },
    compoundVariants: [
      { side: ['left', 'right'], size: 'sm', class: 'h-full w-[min(20rem,90vw)]' },
      { side: ['left', 'right'], size: 'default', class: 'h-full w-[min(28rem,92vw)]' },
      { side: ['left', 'right'], size: 'lg', class: 'h-full w-[min(40rem,96vw)]' },
      { side: ['left', 'right'], size: 'full', class: 'h-full w-screen' },
      { side: ['top', 'bottom'], size: 'sm', class: 'max-h-[40vh] w-full' },
      { side: ['top', 'bottom'], size: 'default', class: 'max-h-[65vh] w-full' },
      { side: ['top', 'bottom'], size: 'lg', class: 'max-h-[85vh] w-full' },
      { side: ['top', 'bottom'], size: 'full', class: 'h-[100dvh] w-full rounded-none' },
    ],
    defaultVariants: { side: 'right', size: 'default' },
  },
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideClose?: boolean;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(function SheetContent({ className, children, side = 'right', size, hideClose = false, ...props }, ref) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side, size }), className)} {...props}>
        {side === 'bottom' && (
          <div className="flex shrink-0 justify-center pt-2" aria-hidden="true">
            <span className="h-1.5 w-12 rounded-full bg-border" />
          </div>
        )}
        {children}
        {!hideClose && (
          <SheetPrimitive.Close
            className={cn(
              'absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground',
              'transition-colors hover:bg-muted hover:text-foreground',
              'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <X className="size-5" />
            <span className="sr-only">Fechar</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex shrink-0 flex-col gap-1.5 border-b border-border px-5 py-4 pr-16 text-left', className)}
      {...props}
    />
  );
}

export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'safe-bottom flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold leading-tight tracking-tight text-foreground', className)}
      {...props}
    />
  );
});

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return <SheetPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});

export { sheetVariants };
export default Sheet;
