import { X } from 'lucide-react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@/components/ui';

import { useCategoryOptions, useProductsByIds } from '../api';
import { SCOPE_LABELS, type PromotionFormErrors, type PromotionScope } from '../types';
import { Field } from './field';
import { ProductSearchList } from './product-search-list';
import { QueryError } from './query-error';

export interface ScopePickerProps {
  scope: PromotionScope;
  categoryId: string;
  productIds: string[];
  errors: PromotionFormErrors;
  disabled?: boolean;
  onScopeChange: (scope: PromotionScope) => void;
  onCategoryChange: (categoryId: string) => void;
  onProductIdsChange: (productIds: string[]) => void;
}

/** What the promotion is allowed to touch: the whole basket, a category, or a list. */
export function ScopePicker({
  scope,
  categoryId,
  productIds,
  errors,
  disabled = false,
  onScopeChange,
  onCategoryChange,
  onProductIdsChange,
}: ScopePickerProps) {
  const categories = useCategoryOptions(scope === 'category');
  const picked = useProductsByIds(productIds, scope === 'products');

  const names = new Map((picked.data ?? []).map((product) => [product.id, product.namePt]));

  const toggleProduct = (productId: string) => {
    onProductIdsChange(
      productIds.includes(productId)
        ? productIds.filter((id) => id !== productId)
        : [...productIds, productId],
    );
  };

  return (
    <div className="space-y-4">
      <Field
        label="Ambito"
        hint="Onde o desconto se aplica dentro do cesto."
        error={scope === 'category' ? errors.categoryId : errors.productIds}
      >
        <Select
          value={scope}
          onValueChange={(value) => onScopeChange(value as PromotionScope)}
          disabled={disabled}
        >
          <SelectTrigger aria-label="Ambito da promocao">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SCOPE_LABELS) as PromotionScope[]).map((value) => (
              <SelectItem key={value} value={value}>
                {SCOPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {scope === 'category' && (
        <div className="rounded-xl border border-border p-3">
          {categories.isLoading && <Skeleton className="h-12 w-full" />}

          {!categories.isLoading && categories.isError && (
            <QueryError compact error={categories.error} onRetry={() => void categories.refetch()} />
          )}

          {!categories.isLoading && !categories.isError && (categories.data ?? []).length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">Sem categorias no catalogo.</p>
          )}

          {!categories.isLoading && !categories.isError && (categories.data ?? []).length > 0 && (
            <Select value={categoryId} onValueChange={onCategoryChange} disabled={disabled}>
              <SelectTrigger aria-label="Categoria abrangida">
                <SelectValue placeholder="Escolher categoria" />
              </SelectTrigger>
              <SelectContent>
                {(categories.data ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.namePt}
                    {category.active ? '' : ' (inactiva)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {scope === 'products' && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {productIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {productIds.map((id) => (
                <Badge key={id} variant="secondary" size="lg" className="gap-2 pr-1">
                  <span className="max-w-[12rem] truncate">
                    {names.get(id) ?? (picked.isLoading ? 'A carregar...' : 'Produto removido')}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-full"
                    aria-label="Remover produto"
                    disabled={disabled}
                    onClick={() => toggleProduct(id)}
                  >
                    <X className="size-4" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}

          <ProductSearchList
            onPick={(product) => toggleProduct(product.id)}
            isPicked={(id) => productIds.includes(id)}
            listClassName="max-h-64"
          />

          <p className="tabular text-xs text-muted-foreground">
            {productIds.length} {productIds.length === 1 ? 'produto seleccionado' : 'produtos seleccionados'}
          </p>
        </div>
      )}
    </div>
  );
}

export default ScopePicker;
