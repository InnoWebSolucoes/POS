import type { FulfilmentMethod, LocationDto, Paginated, PaymentGateway } from '@pos/shared';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

import type {
  CartDto,
  CatalogueParams,
  PickupPointDto,
  PlaceOrderResponse,
  PublicOrderStatusDto,
  ShippingAddressInput,
  StorefrontCategoryDto,
  StorefrontEntityDto,
  StorefrontProductDetailDto,
  StorefrontProductDto,
} from './types';

/**
 * The public side of /api/online.
 *
 * Every call here is anonymous on purpose: the tenant comes from the slug in
 * the URL, and sending a staff token would only invite the API to answer as a
 * member of staff. The one exception is the pickup-point list, which has no
 * public endpoint yet (see loadPickupPoints).
 */
const ANON = { anonymous: true } as const;

const BASE = '/api/online';

function slugPath(slug: string, suffix = ''): string {
  return `${BASE}/storefront/${encodeURIComponent(slug)}${suffix}`;
}

/** Order numbers carry a slash ("WEB2026/000123"); the API accepts both segments. */
function orderPath(orderNumber: string): string {
  const segments = orderNumber
    .split('/')
    .map((part) => encodeURIComponent(part.trim()))
    .filter(Boolean);
  return `${BASE}/orders/${segments.join('/')}`;
}

/* -------------------------------------------------------------------------- */
/* Query keys                                                                  */
/* -------------------------------------------------------------------------- */

export const storefrontKeys = {
  root: (slug: string) => ['storefront', slug] as const,
  shop: (slug: string) => qk.storefront(slug, { part: 'shop' }),
  categories: (slug: string) => qk.storefront(slug, { part: 'categories' }),
  products: (slug: string, params: CatalogueParams) =>
    qk.storefront(slug, { part: 'products', ...params }),
  product: (slug: string, idOrSlug: string) => qk.storefront(slug, { part: 'product', idOrSlug }),
  cart: (slug: string) => qk.storefront(slug, { part: 'cart' }),
  pickupPoints: (slug: string) => qk.storefront(slug, { part: 'pickup-points' }),
  order: (slug: string, orderNumber: string, contact: string) =>
    qk.storefront(slug, { part: 'order', orderNumber, contact }),
};

/* -------------------------------------------------------------------------- */
/* Shop, catalogue                                                             */
/* -------------------------------------------------------------------------- */

export async function loadShop(slug: string): Promise<StorefrontEntityDto> {
  const response = await api.get<{ data: StorefrontEntityDto }>(slugPath(slug), undefined, ANON);
  return response.data;
}

export async function loadCategories(slug: string): Promise<StorefrontCategoryDto[]> {
  const response = await api.get<{ data: StorefrontCategoryDto[] }>(
    slugPath(slug, '/categories'),
    undefined,
    ANON,
  );
  return response.data;
}

export function loadProducts(
  slug: string,
  params: CatalogueParams & { page: number; pageSize: number },
): Promise<Paginated<StorefrontProductDto>> {
  return api.get<Paginated<StorefrontProductDto>>(
    slugPath(slug, '/products'),
    {
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      categoryId: params.categoryId,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      inStock: params.inStock ? 'true' : undefined,
      sort: params.sort,
    },
    ANON,
  );
}

export async function loadProduct(
  slug: string,
  idOrSlug: string,
): Promise<StorefrontProductDetailDto> {
  const response = await api.get<{ data: StorefrontProductDetailDto }>(
    slugPath(slug, `/products/${encodeURIComponent(idOrSlug)}`),
    undefined,
    ANON,
  );
  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

export async function createCart(entitySlug: string, sessionId: string): Promise<CartDto> {
  const response = await api.post<{ data: CartDto }>(
    `${BASE}/cart`,
    { entitySlug, sessionId },
    ANON,
  );
  return response.data;
}

export async function loadCart(cartId: string): Promise<CartDto> {
  const response = await api.get<{ data: CartDto }>(
    `${BASE}/cart/${encodeURIComponent(cartId)}`,
    undefined,
    ANON,
  );
  return response.data;
}

export async function addCartItem(
  cartId: string,
  input: { productId: string; variantId?: string | null; quantity: number },
): Promise<CartDto> {
  const response = await api.post<{ data: CartDto }>(
    `${BASE}/cart/${encodeURIComponent(cartId)}/items`,
    input,
    ANON,
  );
  return response.data;
}

export async function updateCartItem(
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<CartDto> {
  const response = await api.patch<{ data: CartDto }>(
    `${BASE}/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`,
    { quantity },
    ANON,
  );
  return response.data;
}

export async function removeCartItem(cartId: string, itemId: string): Promise<CartDto> {
  const response = await api.delete<{ data: CartDto }>(
    `${BASE}/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`,
    undefined,
    ANON,
  );
  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                    */
/* -------------------------------------------------------------------------- */

export interface PlaceOrderInput {
  entitySlug: string;
  cartId: string;
  fulfilmentMethod: FulfilmentMethod;
  pickupLocationId?: string;
  shippingAddress?: ShippingAddressInput;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  paymentGateway: PaymentGateway;
  note?: string | null;
}

export function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResponse> {
  return api.post<PlaceOrderResponse>(`${BASE}/orders`, input, ANON);
}

/**
 * Pickup points.
 *
 * There is no public endpoint for the store list, so this reads the staff one
 * and is expected to fail for an ordinary shopper - the checkout degrades to
 * "contacte a loja" rather than inventing counters that may not exist.
 */
export async function loadPickupPoints(entityId: string): Promise<PickupPointDto[]> {
  const rows = await api.get<LocationDto[]>(`/api/entities/${encodeURIComponent(entityId)}/locations`, {
    active: true,
  });
  return rows
    .filter((row) => row.active)
    .map((row) => ({ id: row.id, name: row.name, address: row.address, phone: null }));
}

/* -------------------------------------------------------------------------- */
/* Order tracking                                                              */
/* -------------------------------------------------------------------------- */

export async function lookupOrder(
  entitySlug: string,
  orderNumber: string,
  contact: { email?: string; phone?: string },
): Promise<PublicOrderStatusDto> {
  const response = await api.get<{ data: PublicOrderStatusDto }>(
    orderPath(orderNumber),
    { entitySlug, email: contact.email, phone: contact.phone },
    ANON,
  );
  return response.data;
}
