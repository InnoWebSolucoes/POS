import { z } from 'zod';
import { BEEP_SOUNDS, PAYMENT_METHODS } from '@pos/shared';

/**
 * Zod contracts for the settings module.
 *
 * Every shape here mirrors a real type from @pos/shared (EntitySettings,
 * EmbeddedBarcodeRule). Unknown keys are stripped rather than rejected so a
 * client can PATCH back the whole object it received from GET / without the
 * extra bookkeeping keys (taxRates) causing a 422.
 */

/** EmbeddedValueKind from @pos/shared/barcode.ts, as a runtime tuple. */
export const EMBEDDED_VALUE_KINDS = [
  'weight_grams',
  'weight_milli',
  'price_minor',
  'price_major_2dp',
] as const;

export const POS_THEMES = ['dark', 'light', 'system'] as const;

/** An EAN-13 is exactly 13 digits; every slice must live inside it. */
const EAN13_LENGTH = 13;

/* -------------------------------------------------------------------------- */
/* Embedded barcode rules                                                      */
/* -------------------------------------------------------------------------- */

export const embeddedBarcodeRuleSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, 'Identificador obrigatorio.')
      .max(40, 'Identificador demasiado longo.'),
    label: z.string().trim().min(1, 'Nome obrigatorio.').max(80, 'Nome demasiado longo.'),
    prefixes: z
      .array(
        z
          .string()
          .trim()
          .regex(/^\d{1,6}$/, 'Prefixo deve conter apenas digitos (1 a 6).'),
      )
      .min(1, 'Indique pelo menos um prefixo.')
      .max(10, 'Maximo de 10 prefixos por regra.'),
    itemCodeStart: z.number().int('Posicao deve ser inteira.').min(0).max(EAN13_LENGTH - 1),
    itemCodeLength: z.number().int('Comprimento deve ser inteiro.').min(1).max(EAN13_LENGTH),
    valueStart: z.number().int('Posicao deve ser inteira.').min(0).max(EAN13_LENGTH - 1),
    valueLength: z.number().int('Comprimento deve ser inteiro.').min(1).max(EAN13_LENGTH),
    valueKind: z.enum(EMBEDDED_VALUE_KINDS),
    enabled: z.boolean().optional(),
  })
  .superRefine((rule, ctx) => {
    const itemEnd = rule.itemCodeStart + rule.itemCodeLength;
    const valueEnd = rule.valueStart + rule.valueLength;

    if (itemEnd > EAN13_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['itemCodeLength'],
        message: 'O codigo de artigo sai fora dos 13 digitos do codigo de barras.',
      });
    }
    if (valueEnd > EAN13_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valueLength'],
        message: 'O valor sai fora dos 13 digitos do codigo de barras.',
      });
    }
    // Half-open intervals [start, end) may not intersect. Note that digit 12
    // is the GS1 check digit, so a sensible rule stops at 12 - that is left as
    // the operator's choice rather than enforced here.
    if (rule.itemCodeStart < valueEnd && rule.valueStart < itemEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valueStart'],
        message: 'O codigo de artigo e o valor nao podem ocupar os mesmos digitos.',
      });
    }
  });

const embeddedBarcodeRulesSchema = z
  .array(embeddedBarcodeRuleSchema)
  .max(20, 'Maximo de 20 regras.')
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    rules.forEach((rule, index) => {
      if (seen.has(rule.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: `Regra duplicada: ${rule.id}.`,
        });
      }
      seen.add(rule.id);
    });
  });

/* -------------------------------------------------------------------------- */
/* EntitySettings patch                                                        */
/* -------------------------------------------------------------------------- */

const bps = z.number().int('Valor deve ser inteiro em pontos base.').min(0).max(10_000);
const minutes = z.number().int('Valor deve ser inteiro em minutos.').min(0).max(1440);
const paymentMethod = z.enum(PAYMENT_METHODS);

export const settingsPatchSchema = z
  .object({
    receiptHeader: z.string().max(600, 'Cabecalho demasiado longo.'),
    receiptFooter: z.string().max(600, 'Rodape demasiado longo.'),
    receiptShowLogo: z.boolean(),
    beepSound: z.enum(BEEP_SOUNDS),
    beepVolume: z.number().min(0, 'Volume minimo e 0.').max(1, 'Volume maximo e 1.'),
    defaultPaymentMethod: paymentMethod,
    enabledPaymentMethods: z
      .array(paymentMethod)
      .min(1, 'Active pelo menos um metodo de pagamento.')
      .transform((methods) => [...new Set(methods)]),
    customPaymentLabels: z.record(z.string().trim().max(40, 'Etiqueta demasiado longa.')),
    embeddedBarcodeRules: embeddedBarcodeRulesSchema,
    lowStockAlertsEnabled: z.boolean(),
    loyaltyEarnPerMinor: z
      .number()
      .int('Valor deve ser inteiro.')
      .positive('Deve ser maior que zero.'),
    loyaltyPointValueMinor: z.number().int('Valor deve ser inteiro.').min(0),
    vipThresholds: z.object({
      bronze: z.number().int().min(0),
      silver: z.number().int().min(0),
      gold: z.number().int().min(0),
    }),
    kdsWarnAfterMinutes: z.number().int().min(0).max(240),
    kdsAlertAfterMinutes: z.number().int().min(0).max(240),
    tipsEnabled: z.boolean(),
    tipPresetsBps: z.array(bps).max(6, 'Maximo de 6 sugestoes de gorjeta.'),
    serviceChargeBps: bps,
    autoLogoutMinutes: minutes,
    posTheme: z.enum(POS_THEMES),
  })
  .partial()
  .superRefine((patch, ctx) => {
    if (patch.vipThresholds) {
      const { bronze, silver, gold } = patch.vipThresholds;
      if (!(bronze <= silver && silver <= gold)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vipThresholds'],
          message: 'Os escaloes VIP devem crescer: bronze <= prata <= ouro.',
        });
      }
    }
  });

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/* -------------------------------------------------------------------------- */
/* Tax rates                                                                   */
/* -------------------------------------------------------------------------- */

export const taxRateSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Identificador obrigatorio.')
    .max(32, 'Identificador demasiado longo.')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Identificador so aceita letras, digitos, - e _.'),
  namePt: z.string().trim().min(1, 'Nome obrigatorio.').max(60, 'Nome demasiado longo.'),
  rateBps: bps,
});

export type TaxRateInput = z.infer<typeof taxRateSchema>;

export const putTaxRatesSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { rates: value } : value),
  z.object({
    rates: z
      .array(taxRateSchema)
      .min(1, 'Mantenha pelo menos uma taxa.')
      .max(20, 'Maximo de 20 taxas.')
      .superRefine((rates, ctx) => {
        const seen = new Set<string>();
        rates.forEach((rate, index) => {
          if (seen.has(rate.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'id'],
              message: `Taxa duplicada: ${rate.id}.`,
            });
          }
          seen.add(rate.id);
        });
      }),
  }),
);

export type PutTaxRatesBody = { rates: TaxRateInput[] };

/* -------------------------------------------------------------------------- */
/* Receipt preview                                                             */
/* -------------------------------------------------------------------------- */

export const receiptPreviewSchema = z.object({
  settings: settingsPatchSchema.optional(),
});

export type ReceiptPreviewBody = z.infer<typeof receiptPreviewSchema>;

/* -------------------------------------------------------------------------- */
/* Audit log query                                                             */
/* -------------------------------------------------------------------------- */

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Accepts an ISO timestamp or a bare yyyy-mm-dd day. */
function dateBoundary(endOfDay: boolean) {
  return z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Data invalida.')
      .transform((value) => {
        const parsed = new Date(value);
        // A day-only string lands on midnight UTC; a "to" filter should cover
        // the whole day the user picked.
        if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          parsed.setUTCHours(23, 59, 59, 999);
        }
        return parsed;
      })
      .optional(),
  );
}

export const auditQuerySchema = z.object({
  action: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  userId: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
  targetType: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()),
  targetId: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
  search: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  from: dateBoundary(false),
  to: dateBoundary(true),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export const notificationQuerySchema = z.object({
  unreadOnly: z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
  ),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export const idParamSchema = z.string().trim().min(1).max(64);

/* -------------------------------------------------------------------------- */
/* Import payload                                                              */
/* -------------------------------------------------------------------------- */

const text = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));

const id = z.string().trim().min(1).max(64);
const minor = z.number().finite().min(-1e15).max(1e15);
const quantity = z.number().finite().min(-1e9).max(1e9);

const importCategorySchema = z.object({
  id: id,
  parentId: z.union([z.string().trim().max(64), z.null()]).optional(),
  namePt: z.string().trim().min(1).max(120),
  nameEn: text(120),
  color: text(20),
  iconUrl: text(500),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

const importSupplierSchema = z.object({
  id: id,
  name: z.string().trim().min(1).max(160),
  contactName: text(120),
  phone: text(40),
  email: text(160),
  address: text(300),
  nif: text(40),
  paymentTerms: text(120),
  notes: text(1000),
  active: z.boolean().optional(),
});

const importVariantSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  barcode: text(64),
  options: z.union([z.record(z.string().max(80)), z.string().max(2000)]).optional(),
  salePriceMinor: z.union([minor, z.null()]).optional(),
  costPriceMinor: z.union([minor, z.null()]).optional(),
  minStockLevel: quantity.optional(),
  imageUrl: text(500),
  active: z.boolean().optional(),
});

const importImageSchema = z.object({
  url: z.string().trim().min(1).max(500),
  alt: text(200),
  sortOrder: z.number().int().optional(),
  isPrimary: z.boolean().optional(),
});

const importRecipeSchema = z.object({
  componentProductId: id,
  quantity: quantity,
  unit: z.string().trim().max(20).optional(),
  wastagePercentBps: z.number().int().min(0).max(10_000).optional(),
});

const importProductSchema = z.object({
  id: id,
  sku: z.string().trim().min(1).max(64),
  barcode: text(64),
  altBarcodes: z.array(z.string().trim().max(64)).optional(),
  namePt: z.string().trim().min(1).max(200),
  nameEn: text(200),
  descriptionPt: text(2000),
  descriptionEn: text(2000),
  categoryId: z.union([z.string().trim().max(64), z.null()]).optional(),
  supplierId: z.union([z.string().trim().max(64), z.null()]).optional(),
  type: z.string().trim().max(20).optional(),
  unit: z.string().trim().max(20).optional(),
  salePriceMinor: minor.optional(),
  costPriceMinor: minor.optional(),
  taxRateBps: z.number().int().min(0).max(10_000).optional(),
  trackStock: z.boolean().optional(),
  minStockLevel: quantity.optional(),
  maxStockLevel: z.union([quantity, z.null()]).optional(),
  tileColor: text(20),
  showInQuickGrid: z.boolean().optional(),
  quickGridOrder: z.number().int().optional(),
  isMenuItem: z.boolean().optional(),
  prepStation: text(20),
  available: z.boolean().optional(),
  publishOnline: z.boolean().optional(),
  onlineSlug: text(200),
  weightGrams: z.union([z.number().int().min(0), z.null()]).optional(),
  active: z.boolean().optional(),
  images: z.array(importImageSchema).max(20).optional(),
  variants: z.array(importVariantSchema).max(200).optional(),
  components: z.array(importRecipeSchema).max(100).optional(),
});

const importCustomerSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(160),
  phone: text(40),
  email: text(160),
  nif: text(40),
  address: text(300),
  notes: text(1000),
  loyaltyCardNumber: text(60),
  points: z.number().int().min(0).optional(),
  tier: z.string().trim().max(20).optional(),
  lifetimeSpendMinor: minor.optional(),
  storeCreditMinor: minor.optional(),
  orderCount: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const importPromotionSchema = z.object({
  id: id.optional(),
  code: z.string().trim().min(1).max(40),
  namePt: z.string().trim().min(1).max(120),
  nameEn: text(120),
  type: z.string().trim().max(20),
  value: z.number().int().optional(),
  categoryId: z.union([z.string().trim().max(64), z.null()]).optional(),
  productIds: z.array(z.string().trim().max(64)).optional(),
  buyQuantity: z.union([z.number().int().min(0), z.null()]).optional(),
  getQuantity: z.union([z.number().int().min(0), z.null()]).optional(),
  minSpendMinor: minor.optional(),
  usageLimit: z.union([z.number().int().min(0), z.null()]).optional(),
  usageCount: z.number().int().min(0).optional(),
  startsAt: text(40),
  endsAt: text(40),
  active: z.boolean().optional(),
});

const importLocationSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(120),
  address: text(300),
  phone: text(40),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

/**
 * The import payload. Everything is optional: a partial export (only the
 * catalogue, say) must still import cleanly. Users, password hashes and sales
 * are deliberately absent - anything of that shape in the file is ignored.
 */
export const importPayloadSchema = z.object({
  format: z.string().max(40).optional(),
  version: z.number().int().optional(),
  locations: z.array(importLocationSchema).max(500).optional(),
  categories: z.array(importCategorySchema).max(2000).optional(),
  suppliers: z.array(importSupplierSchema).max(2000).optional(),
  products: z.array(importProductSchema).max(10_000).optional(),
  customers: z.array(importCustomerSchema).max(10_000).optional(),
  promotions: z.array(importPromotionSchema).max(1000).optional(),
  settings: z.unknown().optional(),
  taxRates: z.unknown().optional(),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;
export type ImportCategory = z.infer<typeof importCategorySchema>;
export type ImportSupplier = z.infer<typeof importSupplierSchema>;
export type ImportProduct = z.infer<typeof importProductSchema>;
export type ImportCustomer = z.infer<typeof importCustomerSchema>;
export type ImportPromotion = z.infer<typeof importPromotionSchema>;
export type ImportLocation = z.infer<typeof importLocationSchema>;
