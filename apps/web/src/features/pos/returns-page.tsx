import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Receipt, RefreshCw, RotateCcw, Search } from 'lucide-react';
import type { Paginated, SaleDto } from '@pos/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangePicker, rangeForPreset, type DateRange } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { amount, formatDateTime, money } from '@/lib/format';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';
import { CreditNoteDialog } from './credit-note';
import { ReturnLines, availableToReturn, emptyDraft, type ReturnDraft } from './return-lines';
import { REFUND_METHOD_LABELS, keyFamily, type RefundDto, type RefundMethod } from './types';

const METHODS: RefundMethod[] = ['original', 'store_credit', 'cash'];

export default function ReturnsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const entity = useAuth((s) => s.entity);

  const [range, setRange] = useState<DateRange>(() => rangeForPreset('hoje'));
  const [receiptQuery, setReceiptQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnDraft>({});
  const [method, setMethod] = useState<RefundMethod>('original');
  const [note, setNote] = useState('');
  const [creditNote, setCreditNote] = useState<RefundDto | null>(null);

  /* ------------------------------------------------------------------ data */

  const listParams = { from: range.from, to: range.to, pageSize: 50, order: 'desc' as const };

  const sales = useQuery({
    queryKey: qk.sales(listParams),
    queryFn: () => api.get<Paginated<SaleDto>>('/api/sales', listParams),
    staleTime: 30_000,
  });

  const detail = useQuery({
    queryKey: qk.sale(selectedId ?? 'none'),
    queryFn: () => api.get<SaleDto>(`/api/sales/${selectedId ?? ''}`),
    enabled: Boolean(selectedId),
  });

  const sale = detail.data ?? null;

  // A freshly loaded sale starts with nothing selected for return.
  useEffect(() => {
    if (!sale) return;
    setDraft(emptyDraft(sale));
    setMethod('original');
    setNote('');
  }, [sale]);

  const byReceipt = useMutation({
    mutationFn: (code: string) => {
      // Receipt numbers carry a slash (FR2026/000123); the API accepts it split.
      const parts = code.split('/').filter(Boolean);
      const path =
        parts.length === 2
          ? `/api/sales/receipt/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`
          : `/api/sales/receipt/${encodeURIComponent(code)}`;
      return api.get<SaleDto>(path);
    },
    onSuccess: (found) => {
      queryClient.setQueryData(qk.sale(found.id), found);
      setSelectedId(found.id);
    },
    onError: (error) =>
      toast.error('Recibo nao encontrado', error instanceof Error ? error.message : 'Erro desconhecido.'),
  });

  /* ---------------------------------------------------------------- refund */

  const selectedLines = useMemo(() => {
    if (!sale) return [];
    return sale.lines
      .filter((line) => (draft[line.id]?.quantity ?? 0) > 0)
      .map((line) => {
        const row = draft[line.id];
        const share = line.quantity > 0 ? row.quantity / line.quantity : 0;
        return {
          saleLineId: line.id,
          quantity: row.quantity,
          reason: row.reason,
          restock: row.restock,
          // Mirrors the server: a proportional slice of what the line was worth.
          amountMinor: Math.round(line.totalMinor * share),
        };
      });
  }, [sale, draft]);

  const refundTotalMinor = selectedLines.reduce((sum, line) => sum + line.amountMinor, 0);
  const alreadyFullyRefunded =
    sale !== null && sale.lines.every((line) => availableToReturn(line) <= 0);

  const refund = useMutation({
    mutationFn: () =>
      api.post<RefundDto>('/api/sales/refunds', {
        saleId: sale?.id,
        lines: selectedLines.map(({ saleLineId, quantity, reason, restock }) => ({
          saleLineId,
          quantity,
          reason,
          restock,
        })),
        method,
        note: note.trim() ? note.trim() : null,
      }),
    onSuccess: (result) => {
      setCreditNote(result);
      void queryClient.invalidateQueries({ queryKey: keyFamily(qk.sales()) });
      void queryClient.invalidateQueries({ queryKey: qk.sale(result.saleId) });
      void queryClient.invalidateQueries({ queryKey: keyFamily(qk.inventory()) });
      toast.success('Devolucao registada', result.reference);
    },
    onError: (error) =>
      toast.error('Nao foi possivel devolver', error instanceof Error ? error.message : 'Erro desconhecido.'),
  });

  const methodDisabled = (value: RefundMethod): boolean =>
    value === 'store_credit' && !sale?.customerId;

  /* ------------------------------------------------------------------ view */

  return (
    /* h-full: PosShell's <main> is a block, so flex-1 alone leaves this page
       sized by its content and the Devolver footer falls off the screen. */
    <div data-surface="pos" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" asChild aria-label="Voltar a caixa">
          <Link to="/pos">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{t('pos.returns', 'Devolucoes')}</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------------------------- find the sale -- */}
        <section className="flex min-h-0 w-[22rem] max-w-[38%] flex-col border-r border-border bg-card">
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
            <div className="flex gap-2">
              <Input
                value={receiptQuery}
                onChange={(event) => setReceiptQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && receiptQuery.trim()) byReceipt.mutate(receiptQuery.trim());
                }}
                placeholder="Numero do recibo"
                aria-label="Numero do recibo"
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Procurar recibo"
                loading={byReceipt.isPending}
                disabled={!receiptQuery.trim()}
                onClick={() => byReceipt.mutate(receiptQuery.trim())}
              >
                <Search />
              </Button>
            </div>
            <DateRangePicker value={range} onChange={(next) => setRange(next)} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {sales.isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : sales.isError ? (
              <EmptyState
                icon={RefreshCw}
                size="sm"
                title={t('common.error', 'Ocorreu um erro')}
                description={sales.error instanceof Error ? sales.error.message : 'Erro desconhecido.'}
                action={{
                  label: t('common.retry', 'Tentar novamente'),
                  onClick: () => void sales.refetch(),
                  icon: RefreshCw,
                }}
              />
            ) : (sales.data?.data.length ?? 0) === 0 ? (
              <EmptyState
                icon={Receipt}
                size="sm"
                title={t('common.noResults', 'Sem resultados')}
                description="Nenhuma venda neste periodo."
              />
            ) : (
              (sales.data?.data ?? []).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={cn(
                    'min-h-touch w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    row.id === selectedId && 'bg-accent',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="tabular font-semibold text-foreground">{row.receiptNumber}</span>
                    <span className="tabular font-semibold text-foreground">{amount(row.totalMinor)}</span>
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                    {row.status !== 'completed' && (
                      <Badge variant={row.status === 'voided' ? 'destructive' : 'muted'} size="sm">
                        {row.status === 'voided'
                          ? 'Anulada'
                          : row.status === 'refunded'
                            ? 'Devolvida'
                            : 'Parcial'}
                      </Badge>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- the sale -- */}
        <section className="flex min-h-0 flex-1 flex-col bg-background">
          {!selectedId ? (
            <EmptyState
              icon={RotateCcw}
              title="Escolha uma venda"
              description="Leia o numero do recibo ou escolha uma venda da lista para devolver artigos."
              className="h-full"
            />
          ) : detail.isPending ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-56" />
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : detail.isError || !sale ? (
            <EmptyState
              icon={RefreshCw}
              title={t('common.error', 'Ocorreu um erro')}
              description={detail.error instanceof Error ? detail.error.message : 'Erro desconhecido.'}
              action={{
                label: t('common.retry', 'Tentar novamente'),
                onClick: () => void detail.refetch(),
                icon: RefreshCw,
              }}
              className="h-full"
            />
          ) : (
            <>
              <div className="shrink-0 border-b border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="tabular text-lg font-bold text-foreground">{sale.receiptNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(sale.createdAt)} - {sale.cashierName ?? '-'}
                      {sale.customerName ? ` - ${sale.customerName}` : ''}
                    </p>
                  </div>
                  <p className="tabular text-xl font-bold text-foreground">{money(sale.totalMinor)}</p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {alreadyFullyRefunded ? (
                  <EmptyState
                    icon={RotateCcw}
                    size="sm"
                    title="Nada a devolver"
                    description="Todos os artigos desta venda ja foram devolvidos."
                  />
                ) : (
                  <ReturnLines
                    sale={sale}
                    draft={draft}
                    onChange={(saleLineId, patch) =>
                      setDraft((current) => ({
                        ...current,
                        [saleLineId]: { ...current[saleLineId], ...patch },
                      }))
                    }
                  />
                )}
              </div>

              <div className="safe-bottom shrink-0 space-y-3 border-t border-border bg-card px-4 py-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('pos.refund', 'Reembolso')}</Label>
                    <div className="flex gap-2">
                      {METHODS.map((value) => (
                        <Button
                          key={value}
                          variant={method === value ? 'default' : 'outline'}
                          className="flex-1 px-2 text-xs sm:text-sm"
                          disabled={methodDisabled(value)}
                          onClick={() => setMethod(value)}
                        >
                          {REFUND_METHOD_LABELS[value]}
                        </Button>
                      ))}
                    </div>
                    {!sale.customerId && (
                      <p className="text-xs text-muted-foreground">
                        Credito de loja exige um cliente associado a venda.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="refund-note">{t('pos.lineNote', 'Nota')}</Label>
                    <Textarea
                      id="refund-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="Opcional"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total a devolver
                    </p>
                    <p className="tabular text-2xl font-bold text-foreground">{money(refundTotalMinor)}</p>
                  </div>
                  <Button
                    size="xl"
                    leftIcon={<RotateCcw />}
                    disabled={selectedLines.length === 0}
                    loading={refund.isPending}
                    onClick={() => refund.mutate()}
                  >
                    {t('pos.doRefund', 'Devolver')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <CreditNoteDialog
        refund={creditNote}
        entity={entity}
        onClose={() => {
          setCreditNote(null);
          setSelectedId(null);
          setReceiptQuery('');
        }}
      />
    </div>
  );
}
