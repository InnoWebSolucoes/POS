import type { Entity, Location } from '@prisma/client';
import type {
  CostingMethod,
  EntityDto,
  EntityMode,
  Locale,
  LocationDto,
  PricingMode,
} from '@pos/shared';

/** The relation counts the admin list shows as tiles. */
export interface EntityCounts {
  locations?: number;
  users?: number;
}

export type EntityWithCounts = Entity & { _count?: EntityCounts };

export function toEntityDto(entity: EntityWithCounts): EntityDto {
  const dto: EntityDto = {
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

  if (entity._count) {
    dto.locationCount = entity._count.locations ?? 0;
    dto.userCount = entity._count.users ?? 0;
  }

  return dto;
}

export function toLocationDto(location: Location): LocationDto {
  return {
    id: location.id,
    entityId: location.entityId,
    name: location.name,
    address: location.address,
    isDefault: location.isDefault,
    active: location.active,
  };
}
