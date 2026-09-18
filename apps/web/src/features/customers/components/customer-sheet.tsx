import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';
import type { CustomerDto } from '@pos/shared';

import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SwitchField,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

import { useCreateCustomer, useUpdateCustomer } from '../customer-queries';
import {
  customerToForm,
  emptyCustomerForm,
  formToPayload,
  type CustomerFormValues,
} from '../customer-types';
import { CustomerForm } from './customer-form';

export interface CustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates, a customer edits. */
  customer?: CustomerDto | null;
  onSaved?: (customer: CustomerDto) => void;
}

/** Create and edit share one sheet, so the fields can never drift apart. */
export function CustomerSheet({ open, onOpenChange, customer, onSaved }: CustomerSheetProps) {
  const { t } = useTranslation();
  const editing = Boolean(customer);
  const [values, setValues] = React.useState<CustomerFormValues>(emptyCustomerForm);
  const [withCard, setWithCard] = React.useState(false);
  const [error, setError] = React.useState<ApiRequestError | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setValues(customer ? customerToForm(customer) : emptyCustomerForm());
    setWithCard(false);
    setError(null);
  }, [open, customer]);

  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.id ?? '');
  const saving = create.isPending || update.isPending;

  const patch = (next: Partial<CustomerFormValues>) => setValues((prev) => ({ ...prev, ...next }));

  const handleError = (cause: unknown) => {
    if (cause instanceof ApiRequestError) {
      setError(cause);
      toast.error('Nao foi possivel guardar', cause.message);
      return;
    }
    toast.error('Nao foi possivel guardar', 'Tente novamente.');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!values.name.trim()) {
      toast.error('Nome obrigatorio', 'Indique o nome do cliente.');
      return;
    }

    const body = formToPayload(values);

    if (customer) {
      update.mutate(body, {
        onSuccess: (saved) => {
          toast.success('Cliente actualizado', saved.name);
          onSaved?.(saved);
          onOpenChange(false);
        },
        onError: handleError,
      });
      return;
    }

    create.mutate(
      { body, withCard: withCard && !values.loyaltyCardNumber.trim() },
      {
        onSuccess: (saved) => {
          toast.success(
            'Cliente criado',
            saved.loyaltyCardNumber ? `Cartao ${saved.loyaltyCardNumber}` : saved.name,
          );
          onSaved?.(saved);
          onOpenChange(false);
        },
        onError: handleError,
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</SheetTitle>
          <SheetDescription>
            {editing
              ? 'Actualize os dados de contacto e as notas do cliente.'
              : 'Registe um cliente para acumular pontos e historico de compras.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody>
            <CustomerForm
              values={values}
              onChange={patch}
              fieldError={(path) => error?.fieldError(path)}
              disabled={saving}
              showActive={editing}
              idPrefix="sheet"
            />

            {!editing && (
              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                <SwitchField
                  label={
                    <span className="flex items-center gap-2">
                      <CreditCard className="size-4" aria-hidden="true" />
                      Emitir cartao de fidelizacao
                    </span>
                  }
                  description="Gera automaticamente um numero de cartao com codigo de barras."
                  checked={withCard}
                  onCheckedChange={setWithCard}
                  disabled={saving || Boolean(values.loyaltyCardNumber.trim())}
                />
                {Boolean(values.loyaltyCardNumber.trim()) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ja indicou um numero de cartao, por isso nao sera gerado outro.
                  </p>
                )}
              </div>
            )}
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving} loadingLabel={t('common.saving')}>
              {editing ? t('common.save') : 'Criar cliente'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default CustomerSheet;
