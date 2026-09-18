import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

/**
 * The register is driven with fingers. Every size here clears 44px; `xl` is the
 * one used for tender and send buttons, where a mis-tap costs money.
 */
export const buttonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg',
    'font-semibold leading-none transition-colors duration-100 active:scale-[0.98]',
    'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-card text-foreground shadow-sm hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        success: 'bg-success text-success-foreground shadow-sm hover:bg-success/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-11 px-3 text-sm [&_svg]:size-4',
        default: 'h-12 px-4 text-sm [&_svg]:size-5',
        lg: 'h-14 px-6 text-base [&_svg]:size-5',
        xl: 'h-16 px-8 text-lg [&_svg]:size-6',
        icon: 'size-12 [&_svg]:size-5',
        'icon-lg': 'size-14 [&_svg]:size-6',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    compoundVariants: [
      { variant: 'link', size: 'sm', class: 'h-auto px-0' },
      { variant: 'link', size: 'default', class: 'h-auto px-0' },
      { variant: 'link', size: 'lg', class: 'h-auto px-0' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      block: false,
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the styles onto the child element (a Link, for instance). */
  asChild?: boolean;
  /** Shows the spinner and blocks further taps - double-charging is not an option. */
  loading?: boolean;
  loadingLabel?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    loading = false,
    loadingLabel,
    leftIcon,
    rightIcon,
    disabled,
    children,
    type,
    ...props
  },
  ref,
) {
  if (asChild) {
    // Slot needs exactly one child, so the spinner is not injected here.
    return (
      <Slot
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        data-loading={loading ? '' : undefined}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-5 text-current" /> : leftIcon}
      {loading && loadingLabel ? <span>{loadingLabel}</span> : children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
