import { Fragment } from 'react';
import type { SaleLineDto } from '@pos/shared';

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { amount, money, percent, quantity } from '@/lib/format';

export interface SaleLinesTableProps {
  lines: SaleLineDto[];
  /** can('product:cost') - the API omits the field entirely without it. */
  showCost: boolean;
}

export function SaleLinesTable({ lines, showCost }: SaleLinesTableProps) {
  const anyRefunded = lines.some((line) => line.refundedQuantity > 0);

  return (
    <Table containerClassName="rounded-xl">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Artigo</TableHead>
          <TableHead align="right">Qtd</TableHead>
          <TableHead align="right">Preco unit.</TableHead>
          <TableHead align="right" className="hidden sm:table-cell">
            Desconto
          </TableHead>
          <TableHead align="right" className="hidden md:table-cell">
            IVA
          </TableHead>
          {showCost && (
            <TableHead align="right" className="hidden lg:table-cell">
              Custo unit.
            </TableHead>
          )}
          {anyRefunded && (
            <TableHead align="right" className="hidden sm:table-cell">
              Devolvido
            </TableHead>
          )}
          <TableHead align="right">Total</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {lines.map((line) => {
          const hasDetail = line.modifiers.length > 0 || Boolean(line.note);
          return (
            <Fragment key={line.id}>
              <TableRow className={hasDetail ? 'border-b-0' : undefined}>
                <TableCell>
                  <span className="block font-medium text-foreground">{line.name}</span>
                  {line.sku && (
                    <span className="block text-xs text-muted-foreground tabular">{line.sku}</span>
                  )}
                  {line.refundedQuantity > 0 && (
                    <Badge variant="warning" size="sm" className="mt-1 sm:hidden">
                      Devolvido {quantity(line.refundedQuantity, line.unit)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell numeric>{quantity(line.quantity, line.unit)}</TableCell>
                <TableCell numeric>{amount(line.unitPriceMinor)}</TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {line.discountMinor > 0 ? `-${amount(line.discountMinor)}` : '-'}
                </TableCell>
                <TableCell numeric className="hidden md:table-cell">
                  {percent(line.taxRateBps)}
                </TableCell>
                {showCost && (
                  <TableCell numeric className="hidden lg:table-cell">
                    {typeof line.unitCostMinor === 'number' ? amount(line.unitCostMinor) : '-'}
                  </TableCell>
                )}
                {anyRefunded && (
                  <TableCell numeric className="hidden sm:table-cell">
                    {line.refundedQuantity > 0 ? quantity(line.refundedQuantity, line.unit) : '-'}
                  </TableCell>
                )}
                <TableCell numeric className="font-semibold">
                  {money(line.totalMinor)}
                </TableCell>
              </TableRow>

              {hasDetail && (
                <TableRow>
                  <TableCell colSpan={12} className="pt-0">
                    <ul className="flex flex-col gap-1 pl-3 text-sm text-muted-foreground">
                      {line.modifiers.map((modifier) => (
                        <li key={`${line.id}-${modifier.modifierId}`} className="flex gap-2">
                          <span aria-hidden="true">+</span>
                          <span>{modifier.name}</span>
                          {modifier.priceDeltaMinor !== 0 && (
                            <span className="tabular">{money(modifier.priceDeltaMinor, { signed: true })}</span>
                          )}
                        </li>
                      ))}
                      {line.note && <li className="italic">Nota: {line.note}</li>}
                    </ul>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default SaleLinesTable;
