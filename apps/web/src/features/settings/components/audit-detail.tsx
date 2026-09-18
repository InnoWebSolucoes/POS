import * as React from 'react';
import { Lock } from 'lucide-react';

import {
  Badge,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { formatDateTime, money, number as formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  actionLabel,
  actionVariant,
  detailKeyLabel,
  targetLabel,
  type AuditLogEntry,
} from '../audit-types';

/**
 * The stored `details` column is free-form JSON, so this renders it as nested
 * key/value rows instead of dumping the blob. The one shape worth special
 * handling is { before, after } - the pair that says what actually changed.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function renderScalar(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  if (typeof value === 'number') {
    // Anything the API names "...Minor" is money in centimos.
    if (/minor$/i.test(key)) return money(value);
    if (/bps$/i.test(key)) return formatNumber(value);
    return Number.isInteger(value) ? formatNumber(value) : formatNumber(value, 3);
  }
  if (typeof value === 'string') {
    return ISO_DATE.test(value) ? formatDateTime(value) : value;
  }
  return String(value);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function DetailValue({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">Nenhum</span>;
    if (value.every((item) => typeof item !== 'object' || item === null)) {
      return (
        <span className="flex flex-wrap justify-end gap-1">
          {value.map((item, index) => (
            <Badge key={index} variant="outline" size="sm">
              {renderScalar(name, item)}
            </Badge>
          ))}
        </span>
      );
    }
    return (
      <div className="flex w-full flex-col gap-2">
        {value.map((item, index) => (
          <div key={index} className="rounded-lg border border-border/60 p-2">
            <DetailTree value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (isPlainObject(value)) {
    return (
      <div className="w-full">
        <DetailTree value={value} depth={depth + 1} />
      </div>
    );
  }

  return <span className="tabular text-right">{renderScalar(name, value)}</span>;
}

function DetailTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (!isPlainObject(value)) {
    return <p className="tabular text-sm text-foreground">{renderScalar('', value)}</p>;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem detalhes.</p>;
  }

  return (
    <dl className={cn('flex flex-col', depth > 0 && 'mt-1 border-l border-border pl-3')}>
      {entries.map(([key, item]) => {
        const block = isPlainObject(item) || (Array.isArray(item) && item.some(isPlainObject));
        return (
          <div
            key={key}
            className={cn(
              'gap-2 border-b border-border/50 py-2 last:border-b-0',
              block ? 'flex flex-col' : 'flex items-baseline justify-between',
            )}
          >
            <dt className="shrink-0 text-sm text-muted-foreground">{detailKeyLabel(key)}</dt>
            <dd className="min-w-0 text-sm font-medium text-foreground">
              <DetailValue name={key} value={item} depth={depth} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** before/after side by side is the whole point of an audit entry. */
function BeforeAfter({ before, after }: { before: unknown; after: unknown }) {
  const keys = Array.from(
    new Set([
      ...(isPlainObject(before) ? Object.keys(before) : []),
      ...(isPlainObject(after) ? Object.keys(after) : []),
    ]),
  );

  if (keys.length === 0) return null;

  const read = (source: unknown, key: string): unknown =>
    isPlainObject(source) ? source[key] : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Campo</span>
        <span>Antes</span>
        <span>Depois</span>
      </div>
      {keys.map((key) => (
        <div
          key={key}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0"
        >
          <span className="min-w-0 break-words text-muted-foreground">{detailKeyLabel(key)}</span>
          <span className="min-w-0 break-words tabular text-muted-foreground line-through decoration-destructive/60">
            {shortValue(key, read(before, key))}
          </span>
          <span className="min-w-0 break-words tabular font-medium text-foreground">
            {shortValue(key, read(after, key))}
          </span>
        </div>
      ))}
    </div>
  );
}

function shortValue(key: string, value: unknown): string {
  if (value === undefined) return '-';
  if (Array.isArray(value)) return value.length === 0 ? 'Nenhum' : `${value.length} item(ns)`;
  if (isPlainObject(value)) return `${Object.keys(value).length} campo(s)`;
  return renderScalar(key, value);
}

/* -------------------------------------------------------------------------- */
/* Sheet                                                                       */
/* -------------------------------------------------------------------------- */

export interface AuditDetailSheetProps {
  entry: AuditLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditDetailSheet({ entry, open, onOpenChange }: AuditDetailSheetProps) {
  const details = entry?.details;
  const pair =
    isPlainObject(details) && ('before' in details || 'after' in details)
      ? { before: details.before, after: details.after }
      : null;

  const rest = React.useMemo(() => {
    if (!isPlainObject(details)) return details;
    if (!pair) return details;
    const copy: Record<string, unknown> = { ...details };
    delete copy.before;
    delete copy.after;
    return copy;
  }, [details, pair]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{entry ? actionLabel(entry.action) : 'Detalhe'}</SheetTitle>
          <SheetDescription>
            {entry ? formatDateTime(entry.createdAt) : ''}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {entry && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={actionVariant(entry.action)}>{actionLabel(entry.action)}</Badge>
                <Badge variant="outline" className="tabular">
                  {entry.action}
                </Badge>
              </div>

              <dl className="flex flex-col rounded-xl border border-border p-3">
                <Row label="Utilizador" value={entry.userName ?? 'Sistema'} />
                <Row label="ID do utilizador" value={entry.userId ?? '-'} mono />
                <Row label="Tipo de alvo" value={targetLabel(entry.targetType)} />
                <Row label="ID do alvo" value={entry.targetId ?? '-'} mono />
                <Row label="Endereco IP" value={entry.ipAddress ?? '-'} mono />
                <Row label="Data e hora" value={formatDateTime(entry.createdAt)} />
              </dl>

              {pair && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Alteracoes</h3>
                  <BeforeAfter before={pair.before} after={pair.after} />
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Detalhes</h3>
                {rest === null || rest === undefined ? (
                  <p className="text-sm text-muted-foreground">Sem detalhes registados.</p>
                ) : (
                  <div className="rounded-xl border border-border p-3">
                    <DetailTree value={rest} />
                  </div>
                )}
              </section>

              <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Este registo e permanente. Nao existe forma de o editar ou apagar, nem nesta
                aplicacao nem atraves da API.
              </p>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-all text-right text-sm font-medium text-foreground', mono && 'tabular')}>
        {value}
      </dd>
    </div>
  );
}

export default AuditDetailSheet;
