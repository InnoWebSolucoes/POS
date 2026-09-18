import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Wrapper className, for the scroll container around the table. */
  containerClassName?: string;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(function Table(
  { className, containerClassName, ...props },
  ref,
) {
  return (
    <div className={cn('relative w-full overflow-auto', containerClassName)}>
      <table ref={ref} className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  );
});

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /** Pins the header while the body scrolls - long product lists need this. */
  sticky?: boolean;
}

export const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  function TableHeader({ className, sticky = false, ...props }, ref) {
    return (
      <thead
        ref={ref}
        className={cn(sticky && 'sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border))]', className)}
        {...props}
      />
    );
  },
);

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
  },
);

export const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableFooter({ className, ...props }, ref) {
    return (
      <tfoot ref={ref} className={cn('border-t border-border bg-muted/50 font-semibold', className)} {...props} />
    );
  },
);

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Adds the pressed/hover affordance for clickable rows. */
  interactive?: boolean;
  selected?: boolean;
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow(
  { className, interactive = false, selected, ...props },
  ref,
) {
  return (
    <tr
      ref={ref}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'border-b border-border transition-colors data-[state=selected]:bg-accent',
        interactive &&
          'cursor-pointer hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
});

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
}

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { className, align = 'left', ...props },
  ref,
) {
  return (
    <th
      ref={ref}
      className={cn(
        'h-12 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'left' && 'text-left',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        className,
      )}
      {...props}
    />
  );
});

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  /** Monospace tabular figures - use it for every money or quantity cell. */
  numeric?: boolean;
}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { className, align, numeric = false, ...props },
  ref,
) {
  const resolved = align ?? (numeric ? 'right' : 'left');
  return (
    <td
      ref={ref}
      className={cn(
        'px-4 py-3 align-middle text-foreground',
        numeric && 'tabular',
        resolved === 'left' && 'text-left',
        resolved === 'center' && 'text-center',
        resolved === 'right' && 'text-right',
        className,
      )}
      {...props}
    />
  );
});

export const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  function TableCaption({ className, ...props }, ref) {
    return <caption ref={ref} className={cn('mt-3 text-sm text-muted-foreground', className)} {...props} />;
  },
);

export interface TableEmptyProps {
  colSpan: number;
  message?: string;
  description?: string;
  children?: React.ReactNode;
}

/** The centred "Sem resultados" row every list falls back to. */
export function TableEmpty({ colSpan, message = 'Sem resultados', description, children }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {children && <div className="mt-4 flex justify-center">{children}</div>}
      </td>
    </tr>
  );
}

export default Table;
