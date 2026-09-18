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

import { useCreateEntity } from '../entity-queries';
import { emptyWizard, wizardToPayload, type EntityWizardValues } from '../entity-types';
import { AdminStep, BusinessStep, ModeStep, RegionalStep } from './wizard-steps';

const STEPS = ['Negocio', 'Modo', 'Moeda e imposto', 'Administrador'] as const;

export interface EntityWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (entity: EntityDto) => void;
}

/**
 * Provisioning a tenant in four steps. The API creates the entity, its first
 * location and its administrator in one transaction, so this form is the only
 * chance to get the admin account in at the same time.
 */
export function EntityWizard({ open, onOpenChange, onCreated }: EntityWizardProps) {
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState<EntityWizardValues>(emptyWizard);
  const [error, setError] = React.useState<ApiRequestError | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setValues(emptyWizard());
    setError(null);
  }, [open]);

  const create = useCreateEntity();
  const patch = (next: Partial<EntityWizardValues>) => setValues((prev) => ({ ...prev, ...next }));
  const fieldError = (path: string) => error?.fieldError(path);

  /** Null means the step is complete; a string is what is still missing. */
  const stepProblem = (index: number): string | null => {
    if (index === 0) {
      if (values.name.trim().length < 2) return 'Indique o nome do negocio (minimo 2 caracteres).';
      if (!values.locationName.trim()) return 'Indique o nome da primeira localizacao.';
    }
    if (index === 3) {
      const wantsAdmin = Boolean(values.adminEmail.trim() || values.adminPassword);
      if (wantsAdmin && !values.adminEmail.trim()) return 'Indique o email do administrador.';
      if (wantsAdmin && values.adminPassword.length < 8) {
        return 'A palavra-passe do administrador deve ter pelo menos 8 caracteres.';
      }
    }
    return null;
  };

  const next = () => {
    const problem = stepProblem(step);
    if (problem) {
      toast.error('Falta informacao', problem);
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const submit = () => {
    for (let index = 0; index < STEPS.length; index += 1) {
      const problem = stepProblem(index);
      if (problem) {
        setStep(index);
        toast.error('Falta informacao', problem);
        return;
      }
    }

    setError(null);
    create.mutate(wizardToPayload(values), {
      onSuccess: (entity) => {
        toast.success('Entidade criada', `${entity.name} (${entity.slug})`);
        onCreated?.(entity);
        onOpenChange(false);
      },
      onError: (cause) => {
        if (cause instanceof ApiRequestError) {
          setError(cause);
          toast.error('Nao foi possivel criar', cause.message);
          return;
        }
        toast.error('Nao foi possivel criar', 'Tente novamente.');
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Nova entidade</SheetTitle>
          <SheetDescription>
            Passo {step + 1} de {STEPS.length}: {STEPS[step]}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <ol className="mb-6 flex items-center gap-2">
            {STEPS.map((label, index) => (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    index < step && 'bg-success text-success-foreground',
                    index === step && 'bg-primary text-primary-foreground',
                    index > step && 'bg-muted text-muted-foreground',
                  )}
                >
                  {index < step ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                </span>
                {index < STEPS.length - 1 && (
                  <span
                    className={cn(
                      'h-0.5 flex-1 rounded-full',
                      index < step ? 'bg-success' : 'bg-border',
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>

          {step === 0 && <BusinessStep values={values} patch={patch} fieldError={fieldError} />}
          {step === 1 && <ModeStep values={values} patch={patch} />}
          {step === 2 && <RegionalStep values={values} patch={patch} />}
          {step === 3 && <AdminStep values={values} patch={patch} fieldError={fieldError} />}
        </SheetBody>

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

          {step < STEPS.length - 1 ? (
            <Button size="lg" rightIcon={<ArrowRight />} onClick={next}>
              Seguinte
            </Button>
          ) : (
            <Button size="lg" loading={create.isPending} onClick={submit}>
              Criar entidade
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default EntityWizard;
