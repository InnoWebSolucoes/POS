import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

export type SortDirection = 'asc' | 'desc';

export interface DataTableSort {
  key: string;
  direction: SortDirection;
}

export type SortableValue = string | number | boolean | Date | null | undefined;

export interface DataTableColumn<T> {
  /** Stable id; doubles as the property read when no accessor is given. */
  key: string;
  header: React.ReactNode;
  cell?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Any CSS width - "12rem", "20%", 160. */
  width?: string | number;
  sortable?: boolean;
  /** Value used when sorting, if the raw property is not what you sort on. */
  sortValue?: (row: T) => SortableValue;
  /** Monospace tabular figures for money and quantity columns. */
  numeric?: boolean;
  className?: string;
  headClassName?: string;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: { label: string; onClick: () => void };
  onRowClick?: (row: T, index: number) => void;
  isRowSelected?: (row: T, index: number) => boolean;
  /** Controlled sorting; leave out for the built-in state. */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  defaultSort?: DataTableSort | null;
  /** Sort here, or let the caller sort server-side. */
  manualSorting?: boolean;
  stickyHeader?: boolean;
  caption?: string;
  className?: string;
  containerClassName?: string;
}

const readValue = <T,>(row: T, column: DataTableColumn<T>): SortableValue => {
  if (column.sortValue) return column.sortValue(row);
  const value = (row as Record<string, unknown>)[column.key];
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value;
  return String(value);
};

/** Fallback renderer when a column has no cell(): never hand React an object. */
const renderValue = (value: SortableValue): React.ReactNode => {
  if (value === null || value === undefined || value === '') return '-';
  if (value instanceof Date) return value.toLocaleDateString('pt-PT');
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  return String(value);
};

const compareValues = (a: SortableValue, b: SortableValue): number => {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // blanks always sink to the bottom
  if (bEmpty) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'pt-PT', { numeric: true, sensitivity: 'base' });
};

/**
 * A small, typed table. No tanstack, no plugins - columns in, rows out, with
 * the three states every list screen needs: loading, empty, full.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 6,
  emptyTitle = 'Sem resultados',
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  isRowSelected,
  sort,
  onSortChange,
  defaultSort = null,
  manualSorting = false,
  stickyHeader = false,
  caption,
  className,
  containerClassName,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = React.useState<DataTableSort | null>(defaultSort);
  const activeSort = sort !== undefined ? sort : internalSort;

  const applySort = (column: DataTableColumn<T>) => {
    let next: DataTableSort | null;
    if (!activeSort || activeSort.key !== column.key) next = { key: column.key, direction: 'asc' };
    else if (activeSort.direction === 'asc') next = { key: column.key, direction: 'desc' };
    else next = null;

    if (sort === undefined) setInternalSort(next);
    onSortChange?.(next);
  };

  const visibleRows = React.useMemo(() => {
    if (manualSorting || !activeSort) return rows;
    const column = columns.find((c) => c.key === activeSort.key);
    if (!column) return rows;
    const factor = activeSort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(readValue(a, column), readValue(b, column)) * factor);
  }, [rows, columns, activeSort, manualSorting]);

  const colCount = columns.length;

  return (
    <Table className={className} containerClassName={containerClassName}>
      {caption && <TableCaption>{caption}</TableCaption>}
      <TableHeader sticky={stickyHeader}>
        <TableRow className="hover:bg-transparent">
          {columns.map((column) => {
            const sorted = activeSort?.key === column.key ? activeSort.direction : null;
            const width = typeof column.width === 'number' ? `${column.width}px` : column.width;
            return (
              <TableHead
                key={column.key}
                align={column.align ?? (column.numeric ? 'right' : 'left')}
                style={width ? { width } : undefined}
                aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                className={cn(column.sortable && 'p-0', column.headClassName)}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => applySort(column)}
                    className={cn(
                      'inline-flex h-12 w-full min-h-touch items-center gap-1.5 px-4 text-xs font-semibold uppercase tracking-wide',
                      'transition-colors hover:text-foreground',
                      'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      sorted ? 'text-foreground' : 'text-muted-foreground',
                      (column.align ?? (column.numeric ? 'right' : 'left')) === 'right' && 'justify-end',
                      (column.align ?? 'left') === 'center' && 'justify-center',
                    )}
                  >
                    <span>{column.header}</span>
                    {sorted === 'asc' && <ArrowUp className="size-3.5" aria-hidden="true" />}
                    {sorted === 'desc' && <ArrowDown className="size-3.5" aria-hidden="true" />}
                    {!sorted && <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />}
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>

      <TableBody>
        {loading &&
          Array.from({ length: skeletonRows }).map((_, rowIndex) => (
            <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
              {columns.map((column) => (
                <TableCell key={column.key}>
                  <Skeleton className={cn('h-4', rowIndex % 2 === 0 ? 'w-3/4' : 'w-1/2')} />
                </TableCell>
              ))}
            </TableRow>
          ))}

        {!loading && visibleRows.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colCount} className="p-0">
              <EmptyState
                title={emptyTitle}
                description={emptyDescription}
                icon={emptyIcon}
                action={emptyAction}
                size="sm"
              />
            </TableCell>
          </TableRow>
        )}

        {!loading &&
          visibleRows.map((row, index) => (
            <TableRow
              key={rowKey(row, index)}
              interactive={Boolean(onRowClick)}
              selected={isRowSelected?.(row, index)}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row, index);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.align}
                  numeric={column.numeric}
                  className={column.className}
                >
                  {column.cell ? column.cell(row, index) : renderValue(readValue(row, column))}
                </TableCell>
              ))}
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

export default DataTable;
