import { DEFAULT_EMBEDDED_RULES, type EntitySettings } from '@pos/shared';
import { prisma, type Tx } from './prisma.js';

/**
 * Settings are stored one key per row so a single toggle can be written without
 * read-modify-write races between two managers editing different options.
 */
export const DEFAULT_SETTINGS: EntitySettings = {
  receiptHeader: '',
  receiptFooter: 'Obrigado pela sua preferencia!',
  receiptShowLogo: true,
  beepSound: 'classic',
  beepVolume: 0.6,
  defaultPaymentMethod: 'cash',
  enabledPaymentMethods: ['cash', 'card', 'multicaixa_express', 'mobile_money', 'bank_transfer'],
  customPaymentLabels: {},
  embeddedBarcodeRules: DEFAULT_EMBEDDED_RULES,
  lowStockAlertsEnabled: true,
  /** 1 point per 100 AOA => 1 point per 10000 centimos. */
  loyaltyEarnPerMinor: 10_000,
  /** 100 points = 500 AOA => 1 point is worth 500 centimos. */
  loyaltyPointValueMinor: 500,
  vipThresholds: { bronze: 5_000_000, silver: 25_000_000, gold: 100_000_000 },
  kdsWarnAfterMinutes: 8,
  kdsAlertAfterMinutes: 15,
  tipsEnabled: true,
  tipPresetsBps: [500, 1000, 1500],
  serviceChargeBps: 0,
  autoLogoutMinutes: 0,
  posTheme: 'light',
};

export async function getSettings(entityId: string, client: Tx = prisma): Promise<EntitySettings> {
  const rows = await client.setting.findMany({ where: { entityId } });
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result as unknown as EntitySettings;
}

export async function getSetting<K extends keyof EntitySettings>(
  entityId: string,
  key: K,
  client: Tx = prisma,
): Promise<EntitySettings[K]> {
  const row = await client.setting.findUnique({ where: { entityId_key: { entityId, key } } });
  if (!row) return DEFAULT_SETTINGS[key];
  try {
    return JSON.parse(row.value) as EntitySettings[K];
  } catch {
    return DEFAULT_SETTINGS[key];
  }
}

export async function setSettings(
  entityId: string,
  patch: Partial<EntitySettings>,
  client: Tx = prisma,
): Promise<EntitySettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const serialised = JSON.stringify(value);
    await client.setting.upsert({
      where: { entityId_key: { entityId, key } },
      create: { entityId, key, value: serialised },
      update: { value: serialised },
    });
  }
  return getSettings(entityId, client);
}
