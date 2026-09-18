import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export interface PaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  /** Total rows; pass it and the page count is worked out for you. */
  total?: number;
  /** Explicit page count, when the server only tells you that. */
  pageCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Hide the "x-y de z" counter on narrow screens. */
  showSummary?: boolean;
  className?: string;
}

/** first, last, current and its neighbours - everything else is an ellipsis. */
export function pageWindow(page: number, pageCount: number, span = 1): Array<number | 'gap'> {
  if (pageCount <= 1) return [1];
  const pages = new Set<number>([1, pageCount]);
  for (let i = page - span; i <= page + span; i++) {
    if (i >= 1 && i <= pageCount) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) out.push('gap');
    out.push(value);
    previous = value;
  }
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  pageCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  showSummary = true,
  className,
}: PaginationProps) {
  const derivedPages = Math.ceil((total ?? 0) / Math.max(1, pageSize));
  const pages = Math.max(1, pageCount ?? (derivedPages || 1));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = total === undefined ? current * pageSize : Math.min(current * pageSize, total);

  return (
    <nav
      aria-label="Paginacao"
      className={cn('flex flex-wrap items-center justify-between gap-3 px-1 py-3', className)}
    >
      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">Por pagina</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                onPageSizeChange(Number(value));
                onPageChange(1);
              }}
            >
              <SelectTrigger className="h-12 w-[5.5rem]" aria-label="Linhas por pagina">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {showSummary && total !== undefined && (
          <p className="text-sm text-muted-foreground">
            <span className="tabular">{from}</span>-<span className="tabular">{to}</span> de{' '}
            <span className="tabular">{total}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Pagina anterior"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft />
        </Button>

        <ul className="flex items-center gap-1">
          {pageWindow(current, pages).map((item, index) =>
            item === 'gap' ? (
              <li
                key={`gap-${index}`}
                aria-hidden="true"
                className="flex size-12 items-center justify-center text-muted-foreground"
              >
                ...
              </li>
            ) : (
              <li key={item}>
                <Button
                  variant={item === current ? 'default' : 'ghost'}
                  size="icon"
                  aria-label={`Pagina ${item}`}
                  aria-current={item === current ? 'page' : undefined}
                  onClick={() => onPageChange(item)}
                  className="tabular"
                >
                  {item}
                </Button>
              </li>
            ),
          )}
        </ul>

        <Button
          variant="outline"
          size="icon"
          aria-label="Pagina seguinte"
          disabled={current >= pages}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

export default Pagination;
