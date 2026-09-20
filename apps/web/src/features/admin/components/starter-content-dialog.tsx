import * as React from 'react';
import { AlertTriangle, Boxes, CheckCircle2, MapPin, Sparkles, Tags, Users } from 'lucide-react';
import type { EntityDto } from '@pos/shared';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingBlock,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { number as formatNumber } from '@/lib/format';

import { useEntitySetupState, useSeedStarterContent } from '../entity-queries';
import { MODE_STARTER_HINTS } from '../entity-types';

/**
 * The starter catalogue, offered to a client who already exists.
 *
 * Same content the wizard can seed at creation time, for the case where the
 * client signed themselves up at /registar and is now looking at an empty
 * product. It only ever appears as an option while the business has no products
 * of its own - the API refuses outright once it does, and this panel says so
 * before the operator taps anything.
 *
 * Counts only, never takings: what a client sells is theirs.
 */

export interface StarterContentDialogProps {
  /** The client being set up; null keeps the dialog closed. */
  entity: EntityDto | null;
  onOpenChange: (open: boolean) => void;
}

export function StarterContentDialog({ entity, onOpenChange }: StarterContentDialogProps) {
  const setup = useEntitySetupState(entity?.id ?? null);
  const seed = useSeedStarterContent();

  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (entity) setSeeded(false);
  }, [entity]);

  const run = () => {
    if (!entity) return;
    seed.mutate(entity.id, {
      onSuccess: (summary) => {
        setSeeded(true);
        toast.success(
          'Catalogo de exemplo criado',
          `${summary.categories} categorias e ${summary.products} produtos em ${entity.name}.`,
        );
      },
      onError: (cause) => {
        const message = cause instanceof ApiRequestError ? cause.message : 'Tente novamente.';
        toast.error('Nao foi possivel criar o catalogo', message);
      },
    });
  };

  const state = setup.data;
  const canSeed = state?.canSeedStarter === true;

  return (
    <Dialog open={entity !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catalogo de exemplo</DialogTitle>
          <DialogDescription>
            Um ponto de partida para {entity?.name ?? 'este negocio'}, para o cliente ter algo em
            que tocar no primeiro dia.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {setup.isLoading && <LoadingBlock label="A ver como esta o negocio..." />}

          {setup.isError && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Nao foi possivel ler o estado deste negocio.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void setup.refetch()}
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          )}

          {state && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Counter icon={Boxes} label="Produtos" value={state.productCount} />
                <Counter icon={Tags} label="Categorias" value={state.categoryCount} />
                <Counter icon={Users} label="Utilizadores" value={state.userCount} />
                <Counter icon={MapPin} label="Localizacoes" value={state.locationCount} />
              </div>

              {!state.hasAdmin && (
                <div className="flex items-start gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
                  <p className="text-sm text-foreground">
                    Este negocio ainda nao tem ninguem que possa entrar. Crie um administrador antes
                    de o entregar ao cliente.
                  </p>
                </div>
              )}

              {seeded ? (
                <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                  <p className="text-sm text-foreground">
                    Catalogo criado. O cliente ja pode abrir a caixa e experimentar uma venda.
                  </p>
                </div>
              ) : canSeed ? (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
                  <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Vai criar {MODE_STARTER_HINTS[state.mode]}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Sao dados normais - o cliente pode renomear ou apagar tudo. O stock inicial
                      entra pelo registo de movimentos, como qualquer outra entrada.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
                  <AlertTriangle
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    Este negocio ja tem {formatNumber(state.productCount)} produto(s) proprios. O
                    catalogo de exemplo so pode ser criado num negocio vazio, para nunca misturar
                    dados de demonstracao com o trabalho real do cliente.
                  </p>
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            {seeded ? 'Fechar' : 'Cancelar'}
          </Button>
          {!seeded && (
            <Button
              size="lg"
              leftIcon={<Sparkles />}
              disabled={!canSeed}
              loading={seed.isPending}
              loadingLabel="A criar..."
              onClick={run}
            >
              Criar catalogo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Counter({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="tabular text-base font-bold leading-none text-foreground">
          {formatNumber(value)}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default StarterContentDialog;
