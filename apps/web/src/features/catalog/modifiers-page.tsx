import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ListPlus, Plus } from 'lucide-react';
import type { ModifierGroupDto } from '@pos/shared';

import { api, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  SearchInput,
  Skeleton,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateModifierGroups } from './catalog-api';
import { useModifierGroupsQuery } from './catalog-hooks';
import { CatalogPage, NoAccess, QueryError } from './components/catalog-page';
import { ModifierGroupCard } from './components/modifier-group-card';
import { ModifierGroupDialog } from './components/modifier-group-dialog';

/** Shape of GET /api/products/menu, trimmed to what this screen reads. */
interface MenuResponse {
  categories: Array<{
    items: Array<{ id: string; namePt: string; modifierGroups: ModifierGroupDto[] }>;
  }>;
}

export default function ModifiersPage() {
  const can = useAuth((state) => state.can);
  const canRead = can('product:read');
  const canWrite = can('product:write');

  const [search, setSearch] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ModifierGroupDto | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ModifierGroupDto | null>(null);

  const groupsQuery = useModifierGroupsQuery(canRead);

  // The menu is the one endpoint that returns each item with its groups, so it
  // answers "which products use this group" without N extra requests.
  const menuQuery = useQuery({
    queryKey: qk.menu(),
    queryFn: () => api.get<MenuResponse>('/api/products/menu', { includeUnavailable: true }),
    enabled: canRead,
    staleTime: 60_000,
  });

  const usageByGroup = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const category of menuQuery.data?.categories ?? []) {
      for (const item of category.items) {
        for (const group of item.modifierGroups) {
          const bucket = map.get(group.id);
          if (bucket) bucket.push(item.namePt);
          else map.set(group.id, [item.namePt]);
        }
      }
    }
    return map;
  }, [menuQuery.data]);

  const remove = useMutation({
    mutationFn: (group: ModifierGroupDto) => catalogApi.deleteModifierGroup(group.id),
    onSuccess: () => {
      invalidateModifierGroups();
      toast.success('Grupo eliminado');
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(
        'Nao foi possivel eliminar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      );
      setPendingDelete(null);
    },
  });

  const groups = groupsQuery.data ?? [];
  const term = search.trim().toLowerCase();
  const visible = term
    ? groups.filter(
        (group) =>
          group.namePt.toLowerCase().includes(term) ||
          (group.nameEn ?? '').toLowerCase().includes(term) ||
          group.modifiers.some((modifier) => modifier.namePt.toLowerCase().includes(term)),
      )
    : groups;

  if (!canRead) return <NoAccess what="os grupos de opcoes" />;

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <CatalogPage
      title="Opcoes e modificadores"
      description="Grupos de escolhas que se juntam a um item de menu: ponto da carne, extras, remocoes."
      actions={
        canWrite ? (
          <Button leftIcon={<Plus />} onClick={openNew}>
            Novo grupo
          </Button>
        ) : null
      }
      toolbar={
        groups.length > 0 ? (
          <SearchInput
            value={search}
            onValueChange={setSearch}
            onSearch={setSearch}
            placeholder="Procurar grupo ou opcao"
            className="max-w-md"
          />
        ) : undefined
      }
    >
      {groupsQuery.isError ? (
        <QueryError
          error={groupsQuery.error}
          onRetry={() => void groupsQuery.refetch()}
          title="Nao foi possivel carregar os grupos"
        />
      ) : groupsQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={ListPlus}
            title="Sem grupos de opcoes"
            description="Crie um grupo para oferecer extras, tamanhos ou remocoes nos itens de menu."
            action={canWrite ? { label: 'Criar grupo', onClick: openNew } : undefined}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            title="Sem resultados"
            description={`Nenhum grupo corresponde a "${search}".`}
            action={{ label: 'Limpar pesquisa', onClick: () => setSearch('') }}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((group) => (
            <ModifierGroupCard
              key={group.id}
              group={group}
              usedBy={usageByGroup.get(group.id) ?? []}
              canWrite={canWrite}
              onEdit={(target) => {
                setEditing(target);
                setDialogOpen(true);
              }}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <ModifierGroupDialog open={dialogOpen} onOpenChange={setDialogOpen} group={editing} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Eliminar "${pendingDelete?.namePt ?? ''}"?`}
        description="O grupo e as suas opcoes sao removidos de todos os produtos que os usam. A accao nao pode ser anulada."
        confirmLabel="Eliminar"
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </CatalogPage>
  );
}
