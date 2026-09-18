import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { formatDate, formatPhone } from '@/lib/format';
import { qk } from '@/lib/query';
import { api } from '@/lib/api';

import type { SupplierDto } from '../types';
import { QueryError } from './page-shell';
import { SupplierPerformanceTab } from './supplier-performance-tab';
import { SupplierProductsTab } from './supplier-products-tab';

interface SupplierDetailSheetProps {
  supplierId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (supplier: SupplierDto) => void;
}

export function SupplierDetailSheet({ supplierId, onOpenChange, onEdit }: SupplierDetailSheetProps) {
  const can = useAuth((state) => state.can);
  const [tab, setTab] = React.useState('dados');

  React.useEffect(() => {
    if (supplierId) setTab('dados');
  }, [supplierId]);

  const query = useQuery({
    queryKey: qk.suppliers({ detail: supplierId }),
    queryFn: () => api.get<SupplierDto>(`/api/suppliers/${supplierId ?? ''}`),
    enabled: Boolean(supplierId),
  });

  const supplier = query.data;

  return (
    <Sheet open={Boolean(supplierId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="truncate">{supplier?.name ?? 'Fornecedor'}</SheetTitle>
          {supplier && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={supplier.active ? 'success' : 'muted'} dot>
                {supplier.active ? 'Activo' : 'Inactivo'}
              </Badge>
              <span className="tabular text-xs text-muted-foreground">
                {supplier.productCount} produtos - {supplier.openPurchaseOrders} encomendas abertas
              </span>
            </div>
          )}
        </SheetHeader>

        <SheetBody>
          {query.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {query.isError && <QueryError error={query.error} onRetry={() => void query.refetch()} />}

          {supplier && (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList variant="underline" className="overflow-x-auto">
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="produtos">Produtos fornecidos</TabsTrigger>
                {can('report:financial') && <TabsTrigger value="desempenho">Desempenho</TabsTrigger>}
              </TabsList>

              <TabsContent value="dados">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Row label="Contacto" value={supplier.contactName} />
                  <Row label="Telefone" value={supplier.phone ? formatPhone(supplier.phone) : null} mono />
                  <Row label="Email" value={supplier.email} />
                  <Row label="NIF" value={supplier.nif} mono />
                  <Row label="Condicoes de pagamento" value={supplier.paymentTerms} />
                  <Row
                    label="Ultima compra"
                    value={supplier.lastPurchaseAt ? formatDate(supplier.lastPurchaseAt) : null}
                    mono
                  />
                  <Row label="Morada" value={supplier.address} className="sm:col-span-2" />
                  <Row label="Notas" value={supplier.notes} className="sm:col-span-2" />
                </dl>

                <div className="mt-6 flex flex-wrap gap-2">
                  {can('supplier:write') && (
                    <Button variant="outline" onClick={() => onEdit(supplier)}>
                      <Pencil /> Editar
                    </Button>
                  )}
                  {can('po:read') && (
                    <Button variant="outline" asChild>
                      <Link to={`/encomendas?supplierId=${supplier.id}`}>
                        <ClipboardList /> Ver encomendas
                      </Link>
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="produtos">
                <SupplierProductsTab supplierId={supplier.id} />
              </TabsContent>

              {can('report:financial') && (
                <TabsContent value="desempenho">
                  <SupplierPerformanceTab supplierId={supplier.id} />
                </TabsContent>
              )}
            </Tabs>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 whitespace-pre-line text-sm text-foreground ${mono ? 'tabular' : ''}`}>
        {value || <span className="text-muted-foreground">-</span>}
      </dd>
    </div>
  );
}
