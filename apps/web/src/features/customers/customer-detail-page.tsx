import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, UserX } from 'lucide-react';

import {
  Button,
  EmptyState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

import { useCustomer, useTierConfig } from './customer-queries';
import { CustomerHeader } from './components/customer-header';
import { LoyaltyTab } from './components/loyalty-tab';
import { ProfileTab } from './components/profile-tab';
import { PurchasesTab } from './components/purchases-tab';

type TabKey = 'compras' | 'fidelizacao' | 'dados';

function BackLink() {
  const { t } = useTranslation();
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link to="/clientes">
        <ArrowLeft aria-hidden="true" />
        {t('nav.customers')}
      </Link>
    </Button>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-col gap-5 p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((cell) => (
            <Skeleton key={cell} className="h-10 w-full" />
          ))}
        </div>
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);
  const canWrite = can('customer:write');

  const [tab, setTab] = React.useState<TabKey>('compras');

  const customer = useCustomer(customerId);
  const tiers = useTierConfig();

  const notFound = customer.error instanceof ApiRequestError && customer.error.status === 404;
  const errorMessage =
    customer.error instanceof ApiRequestError
      ? customer.error.isOffline
        ? 'Sem ligacao ao servidor.'
        : customer.error.message
      : 'Ocorreu um erro inesperado.';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <BackLink />

      {customer.isLoading && <DetailSkeleton />}

      {customer.isError && (
        <div className="panel">
          <EmptyState
            icon={notFound ? UserX : AlertTriangle}
            title={notFound ? 'Cliente nao encontrado' : 'Nao foi possivel carregar o cliente'}
            description={
              notFound ? 'O cliente pode ter sido eliminado.' : errorMessage
            }
            action={
              notFound
                ? undefined
                : { label: t('common.retry'), onClick: () => void customer.refetch() }
            }
          />
        </div>
      )}

      {customer.data && (
        <>
          <CustomerHeader
            customer={customer.data}
            tierConfig={tiers.data}
            canWrite={canWrite}
            onEdit={() => setTab('dados')}
          />

          <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
            <TabsList variant="underline">
              <TabsTrigger value="compras">Compras</TabsTrigger>
              <TabsTrigger value="fidelizacao">Fidelizacao</TabsTrigger>
              <TabsTrigger value="dados">Dados</TabsTrigger>
            </TabsList>

            <TabsContent value="compras">
              <PurchasesTab customerId={customer.data.id} />
            </TabsContent>

            <TabsContent value="fidelizacao">
              <LoyaltyTab customer={customer.data} tierConfig={tiers.data} />
            </TabsContent>

            <TabsContent value="dados">
              <ProfileTab customer={customer.data} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
