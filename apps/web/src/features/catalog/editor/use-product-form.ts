import * as React from 'react';
import type { PrepStation, ProductType, Unit } from '@pos/shared';

import { DEFAULT_WEIGHTED_UNIT, isFractional } from '../catalog-labels';
import type {
  ProductFull,
  ProductImagePayload,
  ProductWritePayload,
  RecipeComponentPayload,
} from '../catalog-api';

/**
 * The editor's form state.
 *
 * One flat object with one setter, because the tabs all write into the same
 * product and a field belongs to exactly one of them. Money stays in minor
 * units and tax in basis points the whole way through - nothing here divides.
 */

export interface EditorImage {
  url: string;
  alt: string | null;
}

export interface ProductForm {
  sku: string;
  barcode: string;
  altBarcodes: string[];
  namePt: string;
  nameEn: string;
  descriptionPt: string;
  descriptionEn: string;
  categoryId: string | null;
  supplierId: string | null;
  type: ProductType;
  unit: Unit;
  salePriceMinor: number;
  costPriceMinor: number;
  taxRateBps: number;
  trackStock: boolean;
  minStockLevel: number;
  maxStockLevel: number | null;
  images: EditorImage[];
  tileColor: string | null;
  showInQuickGrid: boolean;
  isMenuItem: boolean;
  prepStation: PrepStation | null;
  available: boolean;
  publishOnline: boolean;
  onlineSlug: string;
  weightGrams: number | null;
  active: boolean;
  modifierGroupIds: string[];
  components: RecipeComponentPayload[];
}

export function emptyForm(defaults: { taxRateBps: number; barcode?: string }): ProductForm {
  return {
    sku: '',
    barcode: defaults.barcode ?? '',
    altBarcodes: [],
    namePt: '',
    nameEn: '',
    descriptionPt: '',
    descriptionEn: '',
    categoryId: null,
    supplierId: null,
    type: 'standard',
    unit: 'each',
    salePriceMinor: 0,
    costPriceMinor: 0,
    taxRateBps: defaults.taxRateBps,
    trackStock: true,
    minStockLevel: 0,
    maxStockLevel: null,
    images: [],
    tileColor: null,
    showInQuickGrid: false,
    isMenuItem: false,
    prepStation: null,
    available: true,
    publishOnline: false,
    onlineSlug: '',
    weightGrams: null,
    active: true,
    modifierGroupIds: [],
    components: [],
  };
}

export function formFromProduct(product: ProductFull): ProductForm {
  return {
    sku: product.sku,
    barcode: product.barcode ?? '',
    altBarcodes: product.altBarcodes ?? [],
    namePt: product.namePt,
    nameEn: product.nameEn ?? '',
    descriptionPt: product.descriptionPt ?? '',
    descriptionEn: product.descriptionEn ?? '',
    categoryId: product.categoryId,
    supplierId: product.supplierId,
    type: product.type,
    unit: product.unit,
    salePriceMinor: product.salePriceMinor,
    // Undefined for a role without product:cost - never render it as 0 elsewhere.
    costPriceMinor: product.costPriceMinor ?? 0,
    taxRateBps: product.taxRateBps,
    trackStock: product.trackStock,
    minStockLevel: product.minStockLevel,
    maxStockLevel: product.maxStockLevel,
    images: product.images.map((image) => ({ url: image.url, alt: image.alt })),
    tileColor: product.tileColor,
    showInQuickGrid: product.showInQuickGrid,
    isMenuItem: product.isMenuItem,
    prepStation: product.prepStation,
    available: product.available,
    publishOnline: product.publishOnline,
    onlineSlug: product.onlineSlug ?? '',
    weightGrams: product.weightGrams,
    active: product.active,
    modifierGroupIds: (product.modifierGroups ?? []).map((group) => group.id),
    components: (product.components ?? []).map((component) => ({
      componentProductId: component.componentProductId,
      quantity: component.quantity,
      unit: component.unit,
      wastagePercentBps: component.wastagePercentBps,
    })),
  };
}

export interface FormValidation {
  /** Field path -> message, matching the API's own field paths. */
  errors: Record<string, string>;
  /** The tab the first error lives on, so saving can jump the user there. */
  firstTab: string | null;
}

const FIELD_TABS: Record<string, string> = {
  namePt: 'geral',
  unit: 'geral',
  salePriceMinor: 'precos',
  costPriceMinor: 'precos',
  taxRateBps: 'precos',
  sku: 'codigos',
  barcode: 'codigos',
  onlineSlug: 'online',
  components: 'receita',
};

export function validate(form: ProductForm): FormValidation {
  const errors: Record<string, string> = {};

  if (form.namePt.trim().length === 0) errors.namePt = 'O nome e obrigatorio.';
  if (form.salePriceMinor < 0) errors.salePriceMinor = 'O preco nao pode ser negativo.';
  if (form.type === 'weighted' && !isFractional(form.unit)) {
    errors.unit = 'Um produto pesado tem de usar uma unidade fraccionada (kg, g, litro, ml ou metro).';
  }
  if (form.type === 'composite' && form.components.length === 0) {
    errors.components = 'Um produto composto tem de ter pelo menos um componente na receita.';
  }
  if (
    form.maxStockLevel !== null &&
    form.maxStockLevel > 0 &&
    form.maxStockLevel < form.minStockLevel
  ) {
    errors.maxStockLevel = 'O maximo nao pode ser inferior ao minimo.';
  }
  if (form.publishOnline && form.onlineSlug.trim().length === 0) {
    errors.onlineSlug = 'Indique um endereco para a loja online.';
  }

  const firstKey = Object.keys(errors)[0];
  return { errors, firstTab: firstKey ? (FIELD_TABS[firstKey] ?? 'geral') : null };
}

export function tabForField(path: string): string {
  return FIELD_TABS[path] ?? 'geral';
}

function images(form: ProductForm): ProductImagePayload[] {
  return form.images.map((image, index) => ({
    url: image.url,
    alt: image.alt,
    sortOrder: index,
    isPrimary: index === 0,
  }));
}

/**
 * The write payload. `includeCost` is false for a role without product:cost, so
 * the editor can never blank a cost it was never allowed to read.
 */
export function toPayload(form: ProductForm, includeCost: boolean): ProductWritePayload {
  const payload: ProductWritePayload = {
    sku: form.sku.trim() || undefined,
    barcode: form.barcode.trim() ? form.barcode.trim() : null,
    altBarcodes: form.altBarcodes,
    namePt: form.namePt.trim(),
    nameEn: form.nameEn.trim() ? form.nameEn.trim() : null,
    descriptionPt: form.descriptionPt.trim() ? form.descriptionPt.trim() : null,
    descriptionEn: form.descriptionEn.trim() ? form.descriptionEn.trim() : null,
    categoryId: form.categoryId,
    supplierId: form.supplierId,
    type: form.type,
    unit: form.unit,
    salePriceMinor: form.salePriceMinor,
    taxRateBps: form.taxRateBps,
    trackStock: form.trackStock,
    minStockLevel: form.minStockLevel,
    maxStockLevel: form.maxStockLevel,
    images: images(form),
    tileColor: form.tileColor,
    showInQuickGrid: form.showInQuickGrid,
    isMenuItem: form.isMenuItem,
    prepStation: form.prepStation,
    available: form.available,
    publishOnline: form.publishOnline,
    onlineSlug: form.onlineSlug.trim() ? form.onlineSlug.trim() : null,
    weightGrams: form.weightGrams,
    active: form.active,
    modifierGroupIds: form.modifierGroupIds,
  };

  if (includeCost) payload.costPriceMinor = form.costPriceMinor;
  if (form.type === 'composite') payload.components = form.components;

  return payload;
}

export type PatchForm = (part: Partial<ProductForm>) => void;

export interface UseProductForm {
  form: ProductForm;
  patch: PatchForm;
  reset: (next: ProductForm) => void;
  dirty: boolean;
}

export function useProductForm(initial: ProductForm): UseProductForm {
  const [form, setForm] = React.useState<ProductForm>(initial);
  const [baseline, setBaseline] = React.useState<ProductForm>(initial);

  const patch = React.useCallback<PatchForm>((part) => {
    setForm((current) => {
      const next = { ...current, ...part };
      // Changing to "pesado" must not leave a discrete unit behind, because the
      // server rejects that combination outright.
      if (part.type === 'weighted' && !isFractional(next.unit)) {
        next.unit = DEFAULT_WEIGHTED_UNIT;
      }
      if (part.type === 'service') next.trackStock = false;
      return next;
    });
  }, []);

  const reset = React.useCallback((next: ProductForm) => {
    setForm(next);
    setBaseline(next);
  }, []);

  const dirty = React.useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  return { form, patch, reset, dirty };
}
