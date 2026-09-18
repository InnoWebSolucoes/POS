import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';

import { cn } from '@/lib/utils';

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-1', className)} {...props} />;
});

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'relative aspect-square size-6 shrink-0 rounded-full border-2 border-input bg-card text-primary transition-colors',
        "before:absolute before:-inset-2.5 before:content-['']",
        'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="size-3 fill-primary text-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});

export interface RadioFieldProps extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/** A full-width, finger-sized option row. */
export const RadioField = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioFieldProps
>(function RadioField({ label, description, className, id, ...props }, ref) {
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
      <RadioGroupItem ref={ref} id={fieldId} {...props} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
});

export default RadioGroup;
