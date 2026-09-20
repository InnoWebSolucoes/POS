import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, Rocket, X } from 'lucide-react';

import { Button, Card, CardContent, CardHeader, Progress } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

import { GuidedEmpty } from './guided-empty';
import { StarterOffer } from './starter-offer';
import { useSetupSteps, type SetupStep } from './setup-steps';

/**
 * First-run guidance on the dashboard.
 *
 * A client who signed up ten minutes ago lands on a painel of zeros and has no
 * idea which of thirty screens comes first. This card answers that, and only
 * that: the remaining jobs in the order they make sense, each one linking
 * straight to the screen that does it.
 *
 * Three rules keep it from becoming a nag:
 *  - it reads the real account, so a step done from anywhere ticks itself off;
 *  - it disappears for good once everything is done, or once dismissed;
 *  - while it is not on screen it costs nothing - no queries are issued at all.
 *
 * Rows the signed-in member has no permission for are never rendered, because
 * sending a cashier to /definicoes only to bounce them back looks like a bug.
 */

const DISMISS_PREFIX = 'pos.onboarding.dismissed.';

function readDismissed(entityId: string | null): boolean {
  if (!entityId) return false;
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${entityId}`) === '1';
  } catch {
    // Private browsing: the card simply comes back next session.
    return false;
  }
}

function writeDismissed(entityId: string | null): void {
  if (!entityId) return;
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${entityId}`, '1');
  } catch {
    /* nothing to do - dismissal just does not survive the session */
  }
}

/* -------------------------------------------------------------------------- */
/* A row                                                                       */
/* -------------------------------------------------------------------------- */

function StepRow({ step }: { step: SetupStep }) {
  const Icon = step.icon;

  return (
    <li>
      <Link
        to={step.to}
        aria-label={step.done ? `${step.label} - concluido` : `${step.label} - ${step.cta}`}
        className={cn(
          'flex min-h-touch items-center gap-3 rounded-xl border p-3 transition-colors',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          step.done
            ? 'border-border bg-muted/40'
            : 'border-border bg-card hover:bg-muted active:scale-[0.99]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            step.done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
          )}
        >
          {step.done ? <Check className="size-5" /> : <Icon className="size-5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm font-semibold',
              step.done ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {step.label}
          </span>
          {!step.done && (
            <span className="block text-xs leading-snug text-muted-foreground">{step.help}</span>
          )}
        </span>

        {step.done ? (
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-success">
            Feito
          </span>
        ) : (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

export interface SetupChecklistProps {
  /**
   * Where the card is allowed to appear. The shell mounts it once, above the
   * page, and the card itself decides to stay out of the way everywhere else.
   */
  onPaths?: string[];
  /** Overrides the gutter that lines the card up with the page beneath it. */
  className?: string;
}

export function SetupChecklist({
  onPaths = ['/dashboard'],
  className = 'px-4 pt-4 sm:px-6 sm:pt-6',
}: SetupChecklistProps) {
  const { pathname } = useLocation();
  const status = useAuth((state) => state.status);
  const entity = useAuth((state) => state.entity);
  const entityId = entity?.id ?? null;

  const [dismissed, setDismissed] = React.useState(() => readDismissed(entityId));

  // A super admin switching tenant is a different account with its own answer.
  React.useEffect(() => {
    setDismissed(readDismissed(entityId));
  }, [entityId]);

  const onPath = onPaths.includes(pathname);
  const active = status === 'authenticated' && Boolean(entityId) && onPath && !dismissed;

  const setup = useSetupSteps(active);
  const complete = setup.total > 0 && setup.doneCount === setup.total;

  // Once the account is genuinely set up the card is finished for good, so we
  // record that and stop asking the server the same seven questions forever.
  React.useEffect(() => {
    if (!active || !setup.settled || !setup.trustworthy || !complete) return;
    writeDismissed(entityId);
    setDismissed(true);
  }, [active, complete, entityId, setup.settled, setup.trustworthy]);

  const dismiss = React.useCallback(() => {
    writeDismissed(entityId);
    setDismissed(true);
  }, [entityId]);

  if (!active || !setup.settled || setup.total === 0 || complete) return null;

  const percent = Math.round((setup.doneCount / setup.total) * 100);

  // The shortcut is only worth offering while the shelves are still empty.
  const needsCatalogue = setup.steps.some((step) => step.key === 'products' && !step.done);

  return (
    <div className={cn(className)}>
      <Card className="border-primary/30">
        <CardHeader className="flex-row items-start gap-3 pb-4">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Rocket className="size-5" />
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-base font-semibold leading-tight tracking-tight text-foreground">
              Primeiros passos
            </h2>
            <p className="text-sm text-muted-foreground">
              Trate destes pontos e o seu negocio fica pronto a vender. Pode fechar esta caixa a
              qualquer momento.
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label="Dispensar os primeiros passos"
          >
            <X />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="tabular text-sm font-semibold text-foreground">
                {setup.doneCount} de {setup.total} concluidos
              </p>
              <p className="tabular text-xs font-semibold text-muted-foreground">{percent}%</p>
            </div>
            <Progress
              value={percent}
              tone="primary"
              aria-label={`${setup.doneCount} de ${setup.total} passos concluidos`}
            />
          </div>

          {setup.doneCount === 0 && setup.next && (
            <GuidedEmpty
              size="sm"
              icon={Rocket}
              title="Bem-vindo. Vamos por partes."
              description="Ainda nao ha nada configurado neste negocio. Siga a lista por ordem - cada passo abre o ecra que o resolve e demora poucos minutos."
              action={{ label: setup.next.cta, to: setup.next.to, icon: ArrowRight }}
              className="rounded-xl border border-dashed border-border"
            />
          )}

          {needsCatalogue && <StarterOffer />}

          <ul className="grid gap-2 xl:grid-cols-2">
            {setup.steps.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default SetupChecklist;
