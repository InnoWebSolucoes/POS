import * as React from 'react';
import { CheckCircle2, FlaskConical, ShoppingBasket, Trash2, XCircle } from 'lucide-react';
import { roundHalfUp } from '@pos/shared';

import {
  Button,
  EmptyState,
  Input,
  MoneyInput,
  QuantityStepper,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { money } from '@/lib/format';

import { useValidateBasket } from '../api';
import {
  buyGetLabel,
  PROMOTION_TYPE_LABELS,
  type PromotionEvaluationDto,
  type PromotionSummaryDto,
} from '../types';
import { Field } from './field';
import { ProductSearchList } from './product-search-list';

interface TestLine {
  productId: string;
  name: string;
  categoryId: string | null;
  quantity: number;
  unitPriceMinor: number;
}

export interface PromotionTestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The code the sheet opens with; still editable, so any code can be tried. */
  initialCode?: string;
}

const lineTotal = (line: TestLine): number => Math.max(0, roundHalfUp(line.unitPriceMinor * line.quantity));

function summaryValue(promotion: PromotionSummaryDto): string {
  if (promotion.type === 'buy_x_get_y') return buyGetLabel(promotion.buyQuantity, promotion.getQuantity);
  return PROMOTION_TYPE_LABELS[promotion.type];
}

/**
 * Checks a promotion against a basket you build by hand, before it goes on a
 * poster. It calls the very same endpoint the register calls, so what it shows
 * is what the cashier will get.
 */
export function PromotionTestSheet({ open, onOpenChange, initialCode = '' }: PromotionTestSheetProps) {
  const [code, setCode] = React.useState(initialCode);
  const [lines, setLines] = React.useState<TestLine[]>([]);
  const [result, setResult] = React.useState<PromotionEvaluationDto | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCode(initialCode);
    setResult(null);
  }, [open, initialCode]);

  const test = useValidateBasket();

  /** Any change invalidates the last verdict - a stale green tick is a lie. */
  const touch = () => setResult(null);

  const addProduct = (productId: string, name: string, categoryId: string | null, unitPriceMinor: number) => {
    touch();
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === productId);
      if (existing) {
        return prev.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { productId, name, categoryId, quantity: 1, unitPriceMinor }];
    });
  };

  const patchLine = (productId: string, next: Partial<TestLine>) => {
    touch();
    setLines((prev) => prev.map((line) => (line.productId === productId ? { ...line, ...next } : line)));
  };

  const removeLine = (productId: string) => {
    touch();
    setLines((prev) => prev.filter((line) => line.productId !== productId));
  };

  const subtotalMinor = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const names = new Map(lines.map((line) => [line.productId, line.name]));
  const canRun = Boolean(code.trim()) && lines.length > 0 && !test.isPending;

  const run = () => {
    setResult(null);
    test.mutate(
      {
        code: code.trim(),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          categoryId: line.categoryId,
        })),
        subtotalMinor,
      },
      { onSuccess: setResult },
    );
  };

  const requestError =
    test.isError && !result
      ? test.error instanceof ApiRequestError
        ? test.error.message
        : 'Nao foi possivel testar a promocao.'
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Testar promocao</SheetTitle>
          <SheetDescription>
            Monte um cesto de exemplo e veja exactamente o que o codigo desconta.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-5">
            <Field label="Codigo promocional" htmlFor="test-code" required>
              <Input
                id="test-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  touch();
                }}
                placeholder="NATAL25"
                autoComplete="off"
                spellCheck={false}
                className="tabular uppercase"
              />
            </Field>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Cesto de teste</p>

              {lines.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border">
                  <EmptyState
                    size="sm"
                    icon={ShoppingBasket}
                    title="Cesto vazio"
                    description="Escolha produtos em baixo para montar o cesto."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {lines.map((line) => (
                    <li key={line.productId} className="space-y-3 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {line.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover ${line.name}`}
                          onClick={() => removeLine(line.productId)}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <QuantityStepper
                          value={line.quantity}
                          onChange={(quantity) => patchLine(line.productId, { quantity })}
                          min={1}
                          max={999}
                          step={1}
                        />
                        <div className="w-36">
                          <MoneyInput
                            value={line.unitPriceMinor}
                            onChange={(unitPriceMinor) => patchLine(line.productId, { unitPriceMinor })}
                            min={0}
                            aria-label={`Preco unitario de ${line.name}`}
                          />
                        </div>
                        <span className="tabular text-sm font-semibold text-foreground">
                          {money(lineTotal(line))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
                <span className="tabular text-base font-semibold text-foreground">{money(subtotalMinor)}</span>
              </div>
            </div>

            <Separator />

            <ProductSearchList
              onPick={(product) =>
                addProduct(
                  product.id,
                  product.namePt,
                  product.category?.id ?? product.categoryId ?? null,
                  product.salePriceMinor,
                )
              }
              isPicked={(id) => lines.some((line) => line.productId === id)}
              listClassName="max-h-64"
            />

            {requestError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                <p className="text-sm font-semibold text-destructive">Nao foi possivel testar</p>
                <p className="mt-1 text-sm text-muted-foreground">{requestError}</p>
              </div>
            )}

            {result && !result.valid && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <XCircle className="size-5 shrink-0" aria-hidden="true" />
                  Nao se aplica
                </p>
                <p className="mt-1 text-sm text-foreground">{result.reason ?? 'Promocao nao aplicavel.'}</p>
              </div>
            )}

            {result && result.valid && (
              <div className="space-y-3 rounded-xl border border-success/40 bg-success/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                  <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
                  Aplica-se a este cesto
                </p>

                {result.promotion && (
                  <p className="text-sm text-foreground">
                    <span className="tabular font-semibold">{result.promotion.code}</span>
                    {' - '}
                    {result.promotion.namePt}
                    <span className="text-muted-foreground"> ({summaryValue(result.promotion)})</span>
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Desconto</span>
                  <span className="tabular text-xl font-semibold text-success">
                    -{money(result.discountMinor)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total apos desconto</span>
                  <span className="tabular text-base font-semibold text-foreground">
                    {money(Math.max(0, subtotalMinor - result.discountMinor))}
                  </span>
                </div>

                <Separator />

                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Linhas abrangidas
                </p>
                {result.affectedLines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma linha em particular.</p>
                ) : (
                  <ul className="space-y-1">
                    {result.affectedLines.map((line) => (
                      <li key={line.productId} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-foreground">
                          {names.get(line.productId) ?? 'Produto'}
                        </span>
                        <span className="tabular shrink-0 font-medium text-foreground">
                          -{money(line.discountMinor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={run}
            disabled={!canRun}
            loading={test.isPending}
            loadingLabel="A testar..."
            leftIcon={<FlaskConical />}
          >
            Testar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default PromotionTestSheet;
