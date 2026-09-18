import * as React from 'react';
import { Link } from 'react-router-dom';
import { Info, PackageCheck } from 'lucide-react';

import { quantity } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Label,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SwitchField,
} from '@/components/ui';
import { isLowStock, unitShort } from '../catalog-labels';
import { FieldError } from '../components/catalog-page';
import type { ProductFull, SupplierOption } from '../catalog-api';
import type { ProductForm, PatchForm } from './use-product-form';

const NO_SUPPLIER = '__none__';

export interface StockTabProps {
  form: ProductForm;
  patch: PatchForm;
  errors: Record<string, string>;
  suppliers: SupplierOption[];
  canSeeSuppliers: boolean;
  /** Null while creating: there is no quantity to show yet. */
  product: ProductFull | null;
}

export function StockTab({
  form,
  patch,
  errors,
  suppliers,
  canSeeSuppliers,
  product,
}: StockTabProps) {
  const isService = form.type === 'service';
  const fractional = form.type === 'weighted';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <SwitchField
          label="Controlar stock"
          description={
            isService
              ? 'Um servico nunca tem stock; esta opcao fica desligada.'
              : 'Desligue para artigos que nunca ficam esgotados.'
          }
          checked={form.trackStock && !isService}
          disabled={isService}
          onCheckedChange={(trackStock) => patch({ trackStock })}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-stock-min">Stock minimo</Label>
          <NumericInput
            id="produto-stock-min"
            value={form.minStockLevel}
            onValueChange={(minStockLevel) => patch({ minStockLevel })}
            decimals={fractional ? 3 : 0}
            min={0}
            disabled={!form.trackStock || isService}
          />
          <p className="text-xs text-muted-foreground">
            Abaixo ou igual a este valor o produto aparece como stock baixo e gera alerta.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-stock-max">Stock maximo</Label>
          <NumericInput
            id="produto-stock-max"
            value={form.maxStockLevel ?? 0}
            onValueChange={(value) => patch({ maxStockLevel: value > 0 ? value : null })}
            decimals={fractional ? 3 : 0}
            min={0}
            disabled={!form.trackStock || isService}
            aria-invalid={Boolean(errors.maxStockLevel)}
          />
          <FieldError message={errors.maxStockLevel} />
          <p className="text-xs text-muted-foreground">
            0 significa sem limite. Usado para sugerir quantidades de encomenda.
          </p>
        </div>

        {canSeeSuppliers && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="produto-fornecedor">Fornecedor habitual</Label>
            <Select
              value={form.supplierId ?? NO_SUPPLIER}
              onValueChange={(next) =>
                patch({ supplierId: next === NO_SUPPLIER ? null : next })
              }
            >
              <SelectTrigger id="produto-fornecedor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>Sem fornecedor</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 py-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <PackageCheck className="size-4" aria-hidden="true" />
                Quantidade actual
              </span>
              {product && isLowStock(product) && (
                <Badge variant="warning" size="sm" dot>
                  Stock baixo
                </Badge>
              )}
            </div>

            <p className="tabular text-3xl font-semibold text-foreground">
              {product
                ? product.trackStock
                  ? quantity(product.stockQuantity, product.unit)
                  : 'Sem controlo'
                : `0 ${unitShort(form.unit)}`}
            </p>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                A quantidade nao se edita aqui. O stock so muda por uma entrada de mercadoria, um
                ajuste ou um inventario, para que o historico de movimentos continue a explicar
                cada unidade.
              </span>
            </p>

            {product && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" asChild>
                  <Link to="/stock/entrada">Registar entrada</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/stock/ajuste">Fazer ajuste</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default StockTab;
