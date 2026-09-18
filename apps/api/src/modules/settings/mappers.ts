import type { AuditLog, Entity, Notification } from '@prisma/client';
import type {
  CostingMethod,
  EntityDto,
  EntityMode,
  Locale,
  NotificationPayload,
  PricingMode,
  Role,
} from '@pos/shared';

/**
 * Local DTO mappers. The settings screen needs the entity record alongside the
 * settings blob, so the mapping lives here rather than reaching into another
 * module's folder.
 */
export function toEntityDto(entity: Entity): EntityDto {
  return {
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    mode: entity.mode as EntityMode,
    nif: entity.nif,
    address: entity.address,
    phone: entity.phone,
    email: entity.email,
    logoUrl: entity.logoUrl,
    accentColor: entity.accentColor,
    currency: entity.currency,
    locale: entity.locale as Locale,
    pricingMode: entity.pricingMode as PricingMode,
    costingMethod: entity.costingMethod as CostingMethod,
    defaultTaxRateBps: entity.defaultTaxRateBps,
    active: entity.active,
    createdAt: entity.createdAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                   */
/* -------------------------------------------------------------------------- */

export interface AuditLogDto {
  id: string;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  /** The stored JSON text, parsed back into a value for the client. */
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export function toAuditLogDto(row: AuditLog): AuditLogDto {
  return {
    id: row.id,
    entityId: row.entityId,
    userId: row.userId,
    userName: row.userName,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    details: parseDetails(row.details),
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The column holds JSON text; anything unparseable is handed back as a string. */
export function parseDetails(value: string | null): unknown {
  if (value === null || value === '') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export type NotificationDto = NotificationPayload & {
  entityId: string;
  role: Role | null;
  read: boolean;
  readAt: string | null;
};

export function toNotificationDto(row: Notification): NotificationDto {
  const dto: NotificationDto = {
    id: row.id,
    entityId: row.entityId,
    level: (['info', 'warning', 'error', 'success'].includes(row.level)
      ? row.level
      : 'info') as NotificationPayload['level'],
    titlePt: row.titlePt,
    titleEn: row.titleEn,
    role: (row.role as Role | null) ?? null,
    read: row.readAt !== null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };

  if (row.bodyPt !== null) dto.bodyPt = row.bodyPt;
  if (row.bodyEn !== null) dto.bodyEn = row.bodyEn;
  if (row.link !== null) dto.link = row.link;

  return dto;
}
