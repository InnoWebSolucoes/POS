import { useQuery } from '@tanstack/react-query';
import {
  FolderTree,
  Globe,
  LayoutGrid,
  Package,
  PackagePlus,
  ShoppingCart,
  Store,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { FloorAreaDto, Permission } from '@pos/shared';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';

/**
 * What still has to happen before a brand-new business can actually trade.
 *
 * Every step reads the real account rather than a flag we set at signup: a
 * checklist that ticks itself off because someone pressed "concluir" is a lie
 * the first time a client restores a backup or an accountant sets things up in
 * a different order. So each row asks the API the same question the screen it
 * links to would ask, and answers it from the same cache.
 *
 * The queries are deliberately cheap - `pageSize: 1` because only `total`
 * matters - and they run only while the card could be on screen.
 */

/** Every paginated endpoint returns this; the rows themselves are not needed. */
interface Counted {
  total: number;
}

export interface SetupStep {
  key: string;
  /** The job, as the owner would say it. */
  label: string;
  /** One sentence on why it matters. */
  help: string;
  /** The screen that does this job. */
  to: string;
  /** Label for the row's action. */
  cta: string;
  icon: LucideIcon;
  done: boolean;
}

export interface SetupState {
  /** Only the steps this member is allowed to do, in the order they make sense. */
  steps: SetupStep[];
  doneCount: number;
  total: number;
  /** The first step still open - the single obvious next action. */
  next: SetupStep | null;
  /** Every question asked has come back, one way or another. */
  settled: boolean;
  /** Every question asked came back successfully, so "concluido" is trustworthy. */
  trustworthy: boolean;
}

const STALE = 5 * 60_000;

/**
 * Reads the account and returns the checklist.
 *
 * `enabled` is false when the card is dismissed or off screen, and then not a
 * single request goes out - first-run guidance must never cost an experienced
 * user six requests per page load.
 */
export function useSetupSteps(enabled: boolean): SetupState {
  const can = useAuth((state) => state.can);
  const entity = useAuth((state) => state.entity);
  const mode = entity?.mode ?? null;

  /** A row appears only when the member can both do the job and see its state. */
  const allow = (...permissions: Permission[]): boolean =>
    enabled && permissions.every((permission) => can(permission));

  const wantBusiness = allow('entity:read', 'entity:write');
  const wantCatalogue = allow('product:read', 'category:write');
  const wantProducts = allow('product:read', 'product:write');
  const wantStock = allow('inventory:read', 'inventory:receive');
  const wantTeam = allow('user:read', 'user:write');
  const wantFloor = mode === 'restaurant' && allow('restaurant:table', 'restaurant:floorplan');
  const wantOnline = mode === 'online' && allow('product:read', 'product:write');
  const wantSale = allow('sale:read', 'sale:create');

  const categories = useQuery({
    queryKey: qk.categories({ scope: 'onboarding' }),
    queryFn: () => api.get<{ data: unknown[] }>('/api/categories'),
    enabled: wantCatalogue,
    staleTime: STALE,
  });

  const products = useQuery({
    queryKey: qk.products({ scope: 'onboarding' }),
    queryFn: () => api.get<Counted>('/api/products', { pageSize: 1 }),
    enabled: wantProducts,
    staleTime: STALE,
  });

  const movements = useQuery({
    queryKey: qk.movements({ scope: 'onboarding' }),
    queryFn: () => api.get<Counted>('/api/inventory/movements', { pageSize: 1 }),
    enabled: wantStock,
    staleTime: STALE,
  });

  const users = useQuery({
    queryKey: qk.users({ scope: 'onboarding' }),
    queryFn: () => api.get<Counted>('/api/users', { pageSize: 1 }),
    enabled: wantTeam,
    staleTime: STALE,
  });

  // Same key and same shape as the floor plan screen, so the two share a cache
  // entry instead of fighting over one.
  const areas = useQuery({
    queryKey: qk.floorAreas(),
    queryFn: () =>
      api.get<{ data: FloorAreaDto[] }>('/api/restaurant/areas').then((response) => response.data),
    enabled: wantFloor,
    staleTime: STALE,
  });

  const published = useQuery({
    queryKey: qk.products({ scope: 'onboarding-online' }),
    queryFn: () => api.get<Counted>('/api/products', { pageSize: 1, online: true }),
    enabled: wantOnline,
    staleTime: STALE,
  });

  const sales = useQuery({
    queryKey: qk.sales({ scope: 'onboarding' }),
    queryFn: () => api.get<Counted>('/api/sales', { pageSize: 1 }),
    enabled: wantSale,
    staleTime: STALE,
  });

  const steps: SetupStep[] = [];

  if (wantBusiness) {
    steps.push({
      key: 'business',
      label: 'Configurar o negocio',
      help: 'Nome, NIF e moeda. E o que sai impresso em cada recibo.',
      to: '/definicoes',
      cta: 'Abrir definicoes',
      icon: Store,
      done: Boolean(entity?.nif && entity.nif.trim()),
    });
  }

  if (wantCatalogue) {
    steps.push({
      key: 'categories',
      label: 'Criar as primeiras categorias',
      help: 'Agrupe os artigos para os encontrar depressa na caixa.',
      to: '/categorias',
      cta: 'Criar categorias',
      icon: FolderTree,
      done: (categories.data?.data.length ?? 0) > 0,
    });
  }

  if (wantProducts) {
    steps.push({
      key: 'products',
      label: 'Adicionar produtos',
      help: 'O que vende, com preco e codigo de barras.',
      to: '/produtos/novo',
      cta: 'Novo produto',
      icon: Package,
      done: (products.data?.total ?? 0) > 0,
    });
  }

  if (wantStock) {
    steps.push({
      key: 'stock',
      label: 'Dar entrada de stock',
      help: 'Diga quantas unidades tem de cada artigo para o stock comecar certo.',
      to: '/stock/entrada',
      cta: 'Dar entrada',
      icon: PackagePlus,
      done: (movements.data?.total ?? 0) > 0,
    });
  }

  if (wantTeam) {
    // The owner's own account is the one that is always there, so the team is
    // only really set up at the second user.
    steps.push({
      key: 'team',
      label: 'Convidar a equipa',
      help: 'Crie as contas e escolha o que cada pessoa pode ver e fazer.',
      to: '/utilizadores',
      cta: 'Abrir equipa',
      icon: UserPlus,
      done: (users.data?.total ?? 0) > 1,
    });
  }

  if (wantFloor) {
    steps.push({
      key: 'floorplan',
      label: 'Desenhar o plano de sala',
      help: 'Coloque as mesas como estao na sala para as abrir com um toque.',
      to: '/restaurante/sala/editor',
      cta: 'Abrir editor',
      icon: LayoutGrid,
      done: (areas.data ?? []).some((area) => area.tables.length > 0),
    });
  }

  if (wantOnline) {
    steps.push({
      key: 'online',
      label: 'Publicar produtos na loja',
      help: 'Escolha os artigos que aparecem na sua loja online.',
      to: '/produtos?online=true',
      cta: 'Ver produtos',
      icon: Globe,
      done: (published.data?.total ?? 0) > 0,
    });
  }

  if (wantSale) {
    steps.push({
      key: 'sale',
      label: 'Fazer a primeira venda',
      help: 'Abra a caixa e registe uma venda para ver tudo a funcionar.',
      to: '/pos',
      cta: 'Abrir caixa',
      icon: ShoppingCart,
      done: (sales.data?.total ?? 0) > 0,
    });
  }

  const asked = [
    [wantCatalogue, categories] as const,
    [wantProducts, products] as const,
    [wantStock, movements] as const,
    [wantTeam, users] as const,
    [wantFloor, areas] as const,
    [wantOnline, published] as const,
    [wantSale, sales] as const,
  ];

  // Showing "0 de 7" for a second on a fully configured account is worse than
  // showing nothing, so the card waits until every question has an answer.
  const settled = asked.every(([want, query]) => !want || query.isSuccess || query.isError);
  const trustworthy = asked.every(([want, query]) => !want || query.isSuccess);

  const doneCount = steps.filter((step) => step.done).length;

  return {
    steps,
    doneCount,
    total: steps.length,
    next: steps.find((step) => !step.done) ?? null,
    settled,
    trustworthy,
  };
}
