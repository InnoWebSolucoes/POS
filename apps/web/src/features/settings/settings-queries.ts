import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntityDto, EntitySettings } from '@pos/shared';

import { api } from '@/lib/api';
import { configureFormatting } from '@/lib/format';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';

import type {
  ImportSummary,
  ReceiptPreview,
  SettingsResponse,
  TaxRateInput,
  TaxRatesResponse,
  UploadedFile,
} from './settings-types';

const BASE = '/api/settings';

/** Derived from qk so one invalidate reaches every settings-backed screen. */
const settingsRoot = qk.settings();
const taxRatesKey = [...settingsRoot, 'tax-rates'] as const;

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/** The whole configuration screen in one call: entity record + settings blob. */
export function useSettings() {
  return useQuery({
    queryKey: settingsRoot,
    queryFn: () => api.get<SettingsResponse>(BASE),
  });
}

export function useTaxRates() {
  return useQuery({
    queryKey: taxRatesKey,
    queryFn: () => api.get<TaxRatesResponse>(`${BASE}/tax-rates`),
  });
}

/**
 * The live receipt. The draft is part of the key on purpose: the server renders
 * the real template, so unsaved header/footer text still previews correctly.
 * Callers debounce the draft before handing it over.
 */
export function useReceiptPreview(draft: Partial<EntitySettings> | null, enabled = true) {
  return useQuery({
    queryKey: [...settingsRoot, 'receipt-preview', draft],
    queryFn: () => api.post<ReceiptPreview>(`${BASE}/receipt-preview`, { settings: draft ?? {} }),
    enabled: enabled && draft !== null,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

/** PATCH /api/settings - a partial EntitySettings; unknown keys are ignored. */
export function useUpdateSettings() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: Partial<EntitySettings>) =>
      api.patch<{ settings: EntitySettings; changed: string[] }>(BASE, patch),
    onSuccess: (result) => {
      client.setQueryData<SettingsResponse>(settingsRoot, (previous) =>
        previous ? { ...previous, settings: result.settings } : previous,
      );
      void client.invalidateQueries({ queryKey: settingsRoot });
    },
  });
}

/**
 * PATCH /api/entities/:id - the branding half. The auth store is refreshed on
 * success so the shell, the receipt and every money() call pick the change up
 * without a reload.
 */
export function useUpdateEntity(entityId: string | undefined) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => {
      if (!entityId) throw new Error('Entidade desconhecida.');
      return api.patch<EntityDto>(`/api/entities/${entityId}`, patch);
    },
    onSuccess: (entity) => {
      useAuth.getState().setEntity(entity);
      configureFormatting(entity.currency, entity.locale);
      client.setQueryData<SettingsResponse>(settingsRoot, (previous) =>
        previous ? { ...previous, entity } : previous,
      );
      void client.invalidateQueries({ queryKey: settingsRoot });
      void client.invalidateQueries({ queryKey: taxRatesKey });
      void client.invalidateQueries({ queryKey: qk.entities() });
    },
  });
}

/** PUT /api/settings/tax-rates - replaces the whole named list. */
export function useSaveTaxRates() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (rates: TaxRateInput[]) =>
      api.put<TaxRatesResponse>(`${BASE}/tax-rates`, { rates }),
    onSuccess: (result) => {
      client.setQueryData(taxRatesKey, result);
      void client.invalidateQueries({ queryKey: taxRatesKey });
      void client.invalidateQueries({ queryKey: qk.products() });
    },
  });
}

export function useUploadLogo() {
  return useMutation({
    mutationFn: (file: File) => api.upload<UploadedFile>('/api/uploads/logo', file),
  });
}

/** POST /api/settings/import - adds what is missing, overwrites nothing. */
export function useImportBackup() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (payload: unknown) =>
      api.post<{ summary: ImportSummary }>(`${BASE}/import`, payload),
    onSuccess: () => {
      // An import can touch catalogue, customers and configuration at once.
      void client.invalidateQueries();
    },
  });
}
