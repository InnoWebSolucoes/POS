import * as React from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex min-h-touch w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base text-foreground',
        'shadow-sm transition-colors placeholder:text-muted-foreground',
        'outline-none ring-offset-background focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  );
});

export default Textarea;
