import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Barcode,
  Building2,
  DatabaseBackup,
  Gift,
  Percent,
  Receipt,
  ScrollText,
  Store,
  Utensils,
} from 'lucide-react';

import { Button, EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

import { useSettings } from './settings-queries';
import { BackupTab } from './components/backup-tab';
import { BarcodeTab } from './components/barcode-tab';
import { BusinessTab } from './components/business-tab';
import { LoyaltyTab } from './components/loyalty-tab';
import { ReceiptTab } from './components/receipt-tab';
import { RegisterTab } from './components/register-tab';
import { RestaurantTab } from './components/restaurant-tab';
import { TaxesTab } from './components/taxes-tab';

const TAB_PARAM = 'sep';

const TABS = [
  { value: 'negocio', label: 'Negocio', icon: Building2 },
  { value: 'impostos', label: 'Impostos', icon: Percent },
  { value: 'recibo', label: 'Recibo', icon: Receipt },
  { value: 'caixa', label: 'Caixa', icon: Store },
  { value: 'codigos', label: 'Codigos de barras', icon: Barcode },
  { value: 'fidelizacao', label: 'Fidelizacao', icon: Gift },
  { value: 'restaurante', label: 'Restaurante', icon: Utensils },
  { value: 'backup', label: 'Copias de seguranca', icon: DatabaseBackup },
] as const;

type TabValue = (typeof TABS)[number]['value'];

const isTab = (value: string | null): value is TabValue =>
  TABS.some((tab) => tab.value === value);

/**
 * The configuration screen.
 *
 * It edits two records at once: the Entity row (branding, currency, pricing
 * mode) and the settings blob (everything else). Each tab saves only its own
 * slice, so a half-filled form can never overwrite a neighbour's fields.
 */
export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const can = useAuth((s) => s.can);

  const canWriteSettings = can('settings:write');
  const canWriteEntity = can('entity:write');

  const query = useSettings();

  const active: TabValue = isTab(params.get(TAB_PARAM)) ? (params.get(TAB_PARAM) as TabValue) : 'negocio';

  const selectTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set(TAB_PARAM, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col p-4 sm:p-6">
      <PageHeader
        title="Definicoes"
        description="Como este negocio vende, cobra, imprime e guarda os seus dados."
        actions={
          can('audit:read') ? (
            <Button variant="outline" leftIcon={<ScrollText />} asChild>
              <Link to="/definicoes/auditoria">Registo de auditoria</Link>
            </Button>
          ) : undefined
        }
      />

      {query.isLoading && <SettingsSkeleton />}

      {query.isError && (
        <div className="panel">
          <EmptyState
            icon={AlertTriangle}
            title="Nao foi possivel carregar as definicoes"
            description={
              query.error instanceof ApiRequestError
                ? query.error.isOffline
                  ? 'Sem ligacao ao servidor.'
                  : query.error.message
                : 'Ocorreu um erro inesperado.'
            }
            action={{ label: 'Tentar novamente', onClick: () => void query.refetch() }}
          />
        </div>
      )}

      {query.data && (
        <Tabs value={active} onValueChange={selectTab}>
          <TabsList variant="underline" className="mb-2">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="negocio">
            <BusinessTab entity={query.data.entity} canWrite={canWriteEntity} />
          </TabsContent>

          <TabsContent value="impostos">
            <TaxesTab entity={query.data.entity} canWrite={canWriteSettings && canWriteEntity} />
          </TabsContent>

          <TabsContent value="recibo">
            <ReceiptTab
              entity={query.data.entity}
              settings={query.data.settings}
              canWrite={canWriteSettings}
            />
          </TabsContent>

          <TabsContent value="caixa">
            <RegisterTab settings={query.data.settings} canWrite={canWriteSettings} />
          </TabsContent>

          <TabsContent value="codigos">
            <BarcodeTab settings={query.data.settings} canWrite={canWriteSettings} />
          </TabsContent>

          <TabsContent value="fidelizacao">
            <LoyaltyTab settings={query.data.settings} canWrite={canWriteSettings} />
          </TabsContent>

          <TabsContent value="restaurante">
            <RestaurantTab settings={query.data.settings} canWrite={canWriteSettings} />
          </TabsContent>

          <TabsContent value="backup">
            <BackupTab canWrite={canWriteSettings} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-6 border-b border-border pb-3">
        {[0, 1, 2, 3, 4].map((tab) => (
          <Skeleton key={tab} className="h-5 w-24" />
        ))}
      </div>
      <div className="panel p-5">
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((field) => (
            <div key={field} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="panel p-5">
        <Skeleton className="mb-4 h-6 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
