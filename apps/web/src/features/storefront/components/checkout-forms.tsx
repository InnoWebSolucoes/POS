import * as React from 'react';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Checkout forms: where the parcel goes and who to call about it.
 *
 * Field names match the API body exactly (shippingAddress.recipient and so
 * on), so a 422 from the server can be shown under the field that caused it
 * instead of as a banner nobody can act on.
 */

/** Angola's provinces, written without accents like the rest of the source. */
export const PROVINCES = [
  'Bengo',
  'Benguela',
  'Bie',
  'Cabinda',
  'Cuando Cubango',
  'Cuanza Norte',
  'Cuanza Sul',
  'Cunene',
  'Huambo',
  'Huila',
  'Luanda',
  'Lunda Norte',
  'Lunda Sul',
  'Malanje',
  'Moxico',
  'Namibe',
  'Uige',
  'Zaire',
] as const;

export interface AddressFormValue {
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
}

export const EMPTY_ADDRESS: AddressFormValue = {
  recipient: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
};

export interface ContactFormValue {
  name: string;
  email: string;
  phone: string;
}

export const EMPTY_CONTACT: ContactFormValue = { name: '', email: '', phone: '' };

export type FieldErrors = Record<string, string | undefined>;

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function Field({ id, label, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function AddressForm({
  value,
  onChange,
  errors = {},
}: {
  value: AddressFormValue;
  onChange: (value: AddressFormValue) => void;
  errors?: FieldErrors;
}) {
  const patch = (next: Partial<AddressFormValue>) => onChange({ ...value, ...next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        id="recipient"
        label="Destinatario"
        required
        error={errors['shippingAddress.recipient']}
        className="sm:col-span-2"
      >
        <Input
          id="recipient"
          value={value.recipient}
          autoComplete="name"
          onChange={(event) => patch({ recipient: event.target.value })}
        />
      </Field>

      <Field id="address-phone" label="Telefone" required error={errors['shippingAddress.phone']}>
        <Input
          id="address-phone"
          value={value.phone}
          inputMode="tel"
          autoComplete="tel"
          placeholder="923 000 000"
          onChange={(event) => patch({ phone: event.target.value })}
        />
      </Field>

      <Field id="city" label="Cidade" required error={errors['shippingAddress.city']}>
        <Input
          id="city"
          value={value.city}
          autoComplete="address-level2"
          onChange={(event) => patch({ city: event.target.value })}
        />
      </Field>

      <Field
        id="line1"
        label="Morada"
        required
        error={errors['shippingAddress.line1']}
        className="sm:col-span-2"
      >
        <Input
          id="line1"
          value={value.line1}
          autoComplete="address-line1"
          placeholder="Rua, numero"
          onChange={(event) => patch({ line1: event.target.value })}
        />
      </Field>

      <Field
        id="line2"
        label="Complemento"
        hint="Bairro, predio, ponto de referencia"
        error={errors['shippingAddress.line2']}
        className="sm:col-span-2"
      >
        <Input
          id="line2"
          value={value.line2}
          autoComplete="address-line2"
          onChange={(event) => patch({ line2: event.target.value })}
        />
      </Field>

      <Field id="province" label="Provincia" error={errors['shippingAddress.province']}>
        <Select
          value={value.province || undefined}
          onValueChange={(province) => patch({ province })}
        >
          <SelectTrigger id="province">
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            {PROVINCES.map((province) => (
              <SelectItem key={province} value={province}>
                {province}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

export function ContactForm({
  value,
  onChange,
  errors = {},
}: {
  value: ContactFormValue;
  onChange: (value: ContactFormValue) => void;
  errors?: FieldErrors;
}) {
  const patch = (next: Partial<ContactFormValue>) => onChange({ ...value, ...next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        id="contact-name"
        label="Nome"
        required
        error={errors.guestName}
        className="sm:col-span-2"
      >
        <Input
          id="contact-name"
          value={value.name}
          autoComplete="name"
          onChange={(event) => patch({ name: event.target.value })}
        />
      </Field>

      <Field
        id="contact-email"
        label="Email"
        error={errors.guestEmail}
        hint="Para receber a confirmacao"
      >
        <Input
          id="contact-email"
          type="email"
          value={value.email}
          inputMode="email"
          autoComplete="email"
          onChange={(event) => patch({ email: event.target.value })}
        />
      </Field>

      <Field
        id="contact-phone"
        label="Telefone"
        error={errors.guestPhone}
        hint="Email ou telefone, pelo menos um"
      >
        <Input
          id="contact-phone"
          value={value.phone}
          inputMode="tel"
          autoComplete="tel"
          placeholder="923 000 000"
          onChange={(event) => patch({ phone: event.target.value })}
        />
      </Field>
    </div>
  );
}
