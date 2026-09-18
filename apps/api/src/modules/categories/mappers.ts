import type { CategoryDto } from '@pos/shared';

/** The shape every category query in this module selects. */
export interface CategoryRow {
  id: string;
  entityId: string;
  parentId: string | null;
  namePt: string;
  nameEn: string | null;
  color: string | null;
  iconUrl: string | null;
  sortOrder: number;
  active: boolean;
  _count?: { products: number };
}

/** One step of a breadcrumb. */
export interface CategoryPathNode {
  id: string;
  namePt: string;
}

export interface CategoryDetailDto extends CategoryDto {
  /** Root -> ... -> this category, so breadcrumbs work. */
  path: CategoryPathNode[];
}

export function toCategoryDto(row: CategoryRow): CategoryDto {
  const dto: CategoryDto = {
    id: row.id,
    entityId: row.entityId,
    parentId: row.parentId ?? null,
    namePt: row.namePt,
    nameEn: row.nameEn ?? null,
    color: row.color ?? null,
    iconUrl: row.iconUrl ?? null,
    sortOrder: row.sortOrder,
    active: row.active,
  };
  if (row._count) dto.productCount = row._count.products;
  return dto;
}

/** sortOrder first, then name - the order the UI renders tiles in. */
export function compareCategories(a: CategoryDto, b: CategoryDto): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.namePt.localeCompare(b.namePt, 'pt-PT');
}
