import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The box itself stays 24px so a form does not look like a toy, but the
 * pseudo-element widens the real hit area past 44px for fingers.
 */
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer relative size-6 shrink-0 rounded-md border-2 border-input bg-card transition-colors',
        "before:absolute before:-inset-2.5 before:content-['']",
        'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === 'indeterminate' ? <Minus className="size-4" /> : <Check className="size-4" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

export interface CheckboxFieldProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/** Checkbox plus label in one 48px row - the whole row is the tap target. */
export const CheckboxField = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxFieldProps
>(function CheckboxField({ label, description, className, id, ...props }, ref) {
  const generated = React.useId();
  const fieldId = id ?? generated;
  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'flex min-h-touch cursor-pointer select-none items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/60',
        className,
      )}
    >
      <Checkbox ref={ref} id={fieldId} {...props} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
});

export default Checkbox;
