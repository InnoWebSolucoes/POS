import * as React from 'react';

import { Input, Label, SwitchField, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

import type { CustomerFormValues } from '../customer-types';

export interface CustomerFormProps {
  values: CustomerFormValues;
  onChange: (patch: Partial<CustomerFormValues>) => void;
  /** Field-level messages from ApiRequestError.fieldError(path). */
  fieldError?: (path: string) => string | undefined;
  disabled?: boolean;
  /** The Dados tab shows the active switch; the create sheet does not. */
  showActive?: boolean;
  idPrefix?: string;
  className?: string;
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

function Field({ id, label, required, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The customer profile fields. Shared by the create/edit sheet on the list and
 * by the Dados tab on the detail page, so the two can never drift apart.
 */
export function CustomerForm({
  values,
  onChange,
  fieldError,
  disabled = false,
  showActive = false,
  idPrefix = 'customer',
  className,
}: CustomerFormProps) {
  const err = (path: string) => fieldError?.(path);
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Field id={id('name')} label="Nome" required error={err('name')}>
        <Input
          id={id('name')}
          value={values.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Nome do cliente"
          autoComplete="off"
          aria-invalid={Boolean(err('name'))}
          disabled={disabled}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('phone')} label="Telefone" error={err('phone')}>
          <Input
            id={id('phone')}
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="+244 923 456 789"
            autoComplete="off"
            aria-invalid={Boolean(err('phone'))}
            disabled={disabled}
          />
        </Field>

        <Field id={id('email')} label="Email" error={err('email')}>
          <Input
            id={id('email')}
            type="email"
            inputMode="email"
            value={values.email}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="cliente@exemplo.ao"
            autoComplete="off"
            aria-invalid={Boolean(err('email'))}
            disabled={disabled}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={id('nif')}
          label="NIF"
          error={err('nif')}
          hint="Obrigatorio para facturas com contribuinte"
        >
          <Input
            id={id('nif')}
            value={values.nif}
            onChange={(event) => onChange({ nif: event.target.value })}
            autoComplete="off"
            aria-invalid={Boolean(err('nif'))}
            disabled={disabled}
          />
        </Field>

        <Field
          id={id('card')}
          label="Cartao de fidelizacao"
          error={err('loyaltyCardNumber')}
          hint="Deixe vazio para emitir um numero automatico"
        >
          <Input
            id={id('card')}
            value={values.loyaltyCardNumber}
            onChange={(event) => onChange({ loyaltyCardNumber: event.target.value })}
            className="tabular"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(err('loyaltyCardNumber'))}
            disabled={disabled}
          />
        </Field>
      </div>

      <Field id={id('address')} label="Morada" error={err('address')}>
        <Textarea
          id={id('address')}
          rows={2}
          value={values.address}
          onChange={(event) => onChange({ address: event.target.value })}
          aria-invalid={Boolean(err('address'))}
          disabled={disabled}
        />
      </Field>

      <Field id={id('notes')} label="Notas" error={err('notes')}>
        <Textarea
          id={id('notes')}
          rows={3}
          value={values.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Preferencias, alergias, condicoes de pagamento..."
          aria-invalid={Boolean(err('notes'))}
          disabled={disabled}
        />
      </Field>

      {showActive && (
        <SwitchField
          label="Cliente activo"
          description="Um cliente inactivo deixa de aparecer na pesquisa do registo."
          checked={values.active}
          onCheckedChange={(checked) => onChange({ active: checked })}
          disabled={disabled}
        />
      )}
    </div>
  );
}

export default CustomerForm;
