import * as React from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { EntityDto } from '@pos/shared';

import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';

import { useCreateEntity, useSeedStarterContent } from '../entity-queries';
import {
  emptyWizard,
  wizardToPayload,
  type EntityWizardValues,
  type Handover,
} from '../entity-types';
import { HandoverPanel, type StarterState } from './handover-panel';
import { AdminStep, BusinessStep, ModeStep, ReviewStep } from './wizard-steps';

/**
 * "Novo cliente" - onboarding a business personally, in four steps.
 *
 * The same journey a client walks alone at /registar, done by the operator with
 * the client on the phone: pick the kind of business, fill in who they are, set
 * up the account they will sign in with, read it all back, commit.
 *
 * It ends on a handover panel rather than a toast, because the last step of
 * onboarding is not "a row was created" - it is the operator having the address,
 * the email and the password in hand to give to a human being. The API hashes
 * the password and never returns it, so that panel is the only place it can be
 * read, and it says so.
 */

const STEPS = [
  { key: 'mode', label: 'Tipo de negocio', hint: 'Que produto o cliente vai ter' },
  { key: 'business', label: 'Dados do negocio', hint: 'Nome, contactos, moeda e imposto' },
  { key: 'admin', label: 'Conta do administrador', hint: 'Como o cliente entra' },
  { key: 'review', label: 'Revisao', hint: 'Confirmar e criar' },
] as const;

const LAST_STEP = STEPS.length - 1;

/** Which step owns each field the API can complain about. */
const FIELD_STEPS: Record<string, number> = {
  mode: 0,
  name: 1,
  nif: 1,
  address: 1,
  phone: 1,
  email: 1,
  currency: 1,
  locale: 1,
  pricingMode: 1,
  costingMethod: 1,
  defaultTaxRateBps: 1,
  accentColor: 1,
  locationName: 1,
  adminName: 2,
  adminEmail: 2,
  adminPassword: 2,
};

export interface EntityWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (entity: EntityDto) => void;
  /** Support access into the fresh business; the page owns switchEntity. */
  onEnterEntity?: (entity: EntityDto) => Promise<void> | void;
}

export function EntityWizard({
  open,
  onOpenChange,
  onCreated,
  onEnterEntity,
}: EntityWizardProps) {
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState<EntityWizardValues>(emptyWizard);
  const [error, setError] = React.useState<ApiRequestError | null>(null);

  /** Set once the business exists; switches the sheet to the handover panel. */
  const [created, setCreated] = React.useState<EntityDto | null>(null);
  const [handover, setHandover] = React.useState<Handover | null>(null);
  const [starter, setStarter] = React.useState<StarterState>({ status: 'skipped' });
  const [entering, setEntering] = React.useState(false);

  const create = useCreateEntity();
  const seed = useSeedStarterContent();

  const reset = React.useCallback(() => {
    setStep(0);
    setValues(emptyWizard());
    setError(null);
    setCreated(null);
    setHandover(null);
    setStarter({ status: 'skipped' });
    setEntering(false);
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const patch = (next: Partial<EntityWizardValues>) => setValues((prev) => ({ ...prev, ...next }));
  const fieldError = (path: string) => error?.fieldError(path);

  /** Null means the step is complete; a string is what is still missing. */
  const stepProblem = (index: number): string | null => {
    if (index === 1) {
      if (values.name.trim().length < 2) return 'Indique o nome do negocio (minimo 2 caracteres).';
      if (!values.locationName.trim()) return 'Indique o nome da primeira localizacao.';
    }
    if (index === 2) {
      if (values.adminName.trim().length < 2) {
        return 'Indique o nome do responsavel (minimo 2 caracteres).';
      }
      const email = values.adminEmail.trim();
      if (!email) return 'Indique o email de entrada do administrador.';
      if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
        return 'O email de entrada nao parece valido.';
      }
      if (values.adminPassword.length < 8) {
        return 'A palavra-passe deve ter pelo menos 8 caracteres.';
      }
    }
    return null;
  };

  const goNext = () => {
    const problem = stepProblem(step);
    if (problem) {
      toast.error('Falta informacao', problem);
      return;
    }
    setStep((prev) => Math.min(prev + 1, LAST_STEP));
  };

  /** The starter catalogue is a separate call, so it can fail on its own. */
  const runStarter = React.useCallback(
    (entityId: string) => {
      setStarter({ status: 'pending' });
      seed.mutate(entityId, {
        onSuccess: (summary) => setStarter({ status: 'done', summary }),
        onError: (cause) =>
          setStarter({
            status: 'failed',
            message: cause instanceof ApiRequestError ? cause.message : 'Tente novamente.',
          }),
      });
    },
    [seed],
  );

  const submit = () => {
    for (let index = 0; index <= LAST_STEP; index += 1) {
      const problem = stepProblem(index);
      if (problem) {
        setStep(index);
        toast.error('Falta informacao', problem);
        return;
      }
    }

    setError(null);
    // Read before the mutation so a later reset cannot race the handover.
    const password = values.adminPassword;
    const wantsStarter = values.starterContent;

    create.mutate(wizardToPayload(values), {
      onSuccess: (entity) => {
        setCreated(entity);
        setHandover({
          entityId: entity.id,
          businessName: entity.name,
          slug: entity.slug,
          mode: entity.mode,
          loginUrl: `${window.location.origin}/login`,
          adminEmail: values.adminEmail.trim().toLowerCase(),
          adminPassword: password,
          starterContent: wantsStarter,
        });
        onCreated?.(entity);
        if (wantsStarter) runStarter(entity.id);
      },
      onError: (cause) => {
        if (cause instanceof ApiRequestError) {
          setError(cause);
          // Send the operator straight to the field the server rejected.
          const culprit = Object.keys(FIELD_STEPS).find((path) => cause.fieldError(path));
          if (culprit !== undefined) setStep(FIELD_STEPS[culprit] ?? step);
          toast.error('Nao foi possivel criar', cause.message);
          return;
        }
        toast.error('Nao foi possivel criar', 'Tente novamente.');
      },
    });
  };

  const enter = async () => {
    if (!created || !onEnterEntity) return;
    setEntering(true);
    try {
      await onEnterEntity(created);
    } finally {
      setEntering(false);
    }
  };

  const done = handover !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        size="lg"
        // While the password is on screen an accidental click outside must not
        // take it away. Escape and the close button still work.
        onInteractOutside={(event) => {
          if (done) event.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>{done ? 'Cliente criado' : 'Novo cliente'}</SheetTitle>
          <SheetDescription>
            {done
              ? 'Entregue estes dados ao cliente antes de fechar.'
              : `Passo ${step + 1} de ${STEPS.length}: ${STEPS[step]?.label ?? ''}`}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {done && handover ? (
            <HandoverPanel
              handover={handover}
              starter={starter}
              entering={entering}
              onRetryStarter={() => runStarter(handover.entityId)}
              onEnter={() => void enter()}
              onCreateAnother={reset}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <>
              <StepRail step={step} onJump={(index) => index < step && setStep(index)} />

              {step === 0 && <ModeStep values={values} patch={patch} onConfirm={goNext} />}
              {step === 1 && (
                <BusinessStep values={values} patch={patch} fieldError={fieldError} />
              )}
              {step === 2 && <AdminStep values={values} patch={patch} fieldError={fieldError} />}
              {step === 3 && <ReviewStep values={values} patch={patch} onEdit={setStep} />}
            </>
          )}
        </SheetBody>

        {!done && (
          <SheetFooter>
            {step > 0 && (
              <Button
                variant="outline"
                size="lg"
                className="mr-auto"
                leftIcon={<ArrowLeft />}
                disabled={create.isPending}
                onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
              >
                Anterior
              </Button>
            )}

            {step < LAST_STEP ? (
              <Button size="lg" rightIcon={<ArrowRight />} onClick={goNext}>
                Seguinte
              </Button>
            ) : (
              <Button
                size="lg"
                loading={create.isPending}
                loadingLabel="A criar..."
                onClick={submit}
              >
                Criar cliente
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Numbered rail with the step name, so the operator knows what is still coming. */
function StepRail({ step, onJump }: { step: number; onJump: (index: number) => void }) {
  return (
    <ol className="mb-6 flex items-stretch gap-1">
      {STEPS.map((entry, index) => {
        const state = index < step ? 'done' : index === step ? 'current' : 'todo';
        const reachable = index < step;

        return (
          <li key={entry.key} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(index)}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex w-full flex-col items-start gap-1.5 rounded-lg px-1 py-1.5 text-left transition-colors',
                'outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
                reachable ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
              )}
            >
              <span className="flex w-full items-center gap-2">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    state === 'done' && 'bg-success text-success-foreground',
                    state === 'current' && 'bg-primary text-primary-foreground',
                    state === 'todo' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {state === 'done' ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'h-1 flex-1 rounded-full',
                    index < step ? 'bg-success' : 'bg-border',
                  )}
                  aria-hidden="true"
                />
              </span>
              <span
                className={cn(
                  'block truncate text-xs font-medium',
                  state === 'current' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {entry.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default EntityWizard;
