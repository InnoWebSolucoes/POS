import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        "before:absolute before:-inset-2.5 before:content-['']",
        'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-6 rounded-full bg-card shadow-lg ring-0 transition-transform',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
});

export interface SwitchFieldProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/** The settings-screen row: label on the left, switch on the right. */
export const SwitchField = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchFieldProps
>(function SwitchField({ label, description, className, id, ...props }, ref) {
  const generated = React.useId();
  const fieldId = id ?? generated;
  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'flex min-h-touch cursor-pointer select-none items-center justify-between gap-4 rounded-lg px-1 py-2',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch ref={ref} id={fieldId} {...props} />
    </label>
  );
});

export default Switch;
