import * as React from 'react';
import { Info } from 'lucide-react';
import { PRODUCT_TYPES, UNITS, type CategoryDto, type ProductType, type Unit } from '@pos/shared';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SwitchField,
  Textarea,
} from '@/components/ui';
import {
  isFractional,
  PRODUCT_TYPE_HINTS,
  PRODUCT_TYPE_LABELS,
  unitLabel,
  unitShort,
} from '../catalog-labels';
import { CategoryTreeSelect } from '../components/category-tree-select';
import { FieldError } from '../components/catalog-page';
import type { ProductForm, PatchForm } from './use-product-form';

export interface GeralTabProps {
  form: ProductForm;
  patch: PatchForm;
  errors: Record<string, string>;
  categories: CategoryDto[];
}

export function GeralTab({ form, patch, errors, categories }: GeralTabProps) {
  const weighted = form.type === 'weighted';
  const units: Unit[] = weighted ? UNITS.filter(isFractional) : [...UNITS];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-nome" required>
            Nome (PT)
          </Label>
          <Input
            id="produto-nome"
            value={form.namePt}
            onChange={(event) => patch({ namePt: event.target.value })}
            aria-invalid={Boolean(errors.namePt)}
            placeholder="Agua mineral 1,5L"
          />
          <FieldError message={errors.namePt} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-nome-en">Nome (EN)</Label>
          <Input
            id="produto-nome-en"
            value={form.nameEn}
            onChange={(event) => patch({ nameEn: event.target.value })}
            placeholder="Mineral water 1.5L"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-categoria">Categoria</Label>
          <CategoryTreeSelect
            id="produto-categoria"
            tree={categories}
            value={form.categoryId}
            onChange={(categoryId) => patch({ categoryId })}
          />
        </div>

        <SwitchField
          label="Produto activo"
          description="Um produto inactivo desaparece da caixa e da loja online."
          checked={form.active}
          onCheckedChange={(active) => patch({ active })}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-tipo">Tipo de produto</Label>
          <Select
            value={form.type}
            onValueChange={(next) => patch({ type: next as ProductType })}
          >
            <SelectTrigger id="produto-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PRODUCT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{PRODUCT_TYPE_HINTS[form.type]}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-unidade">Unidade de venda</Label>
          <Select value={form.unit} onValueChange={(next) => patch({ unit: next as Unit })}>
            <SelectTrigger id="produto-unidade" aria-invalid={Boolean(errors.unit)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {unitLabel(unit)} ({unitShort(unit)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.unit} />
          {weighted && (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Um produto pesado e vendido por peso ou medida, por isso a quantidade tem casas
                decimais (1,350 kg). Apenas unidades fraccionadas - kg, g, litro, ml e metro - sao
                aceites; a unidade foi ajustada automaticamente.
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-descricao">Descricao (PT)</Label>
          <Textarea
            id="produto-descricao"
            rows={3}
            value={form.descriptionPt}
            onChange={(event) => patch({ descriptionPt: event.target.value })}
            placeholder="Texto que aparece na loja online e no talao."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-descricao-en">Descricao (EN)</Label>
          <Textarea
            id="produto-descricao-en"
            rows={3}
            value={form.descriptionEn}
            onChange={(event) => patch({ descriptionEn: event.target.value })}
          />
        </div>
      </section>
    </div>
  );
}

export default GeralTab;
