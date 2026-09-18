import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Input,
  Label,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SwitchField,
  Textarea,
  toast,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

import { createSupplier, suppliersRoot, updateSupplier } from '../api';
import type { SupplierDto, SupplierInput } from '../types';

const EMPTY: SupplierInput = {
  name: '',
  contactName: null,
  phone: null,
  email: null,
  address: null,
  nif: null,
  paymentTerms: null,
  notes: null,
  active: true,
};

function fromSupplier(supplier: SupplierDto | null): SupplierInput {
  if (!supplier) return { ...EMPTY };
  return {
    name: supplier.name,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    nif: supplier.nif,
    paymentTerms: supplier.paymentTerms,
    notes: supplier.notes,
    active: supplier.active,
  };
}

interface SupplierFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDto | null;
}

export function SupplierFormSheet({ open, onOpenChange, supplier }: SupplierFormSheetProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<SupplierInput>(() => fromSupplier(supplier));

  React.useEffect(() => {
    if (open) setForm(fromSupplier(supplier));
  }, [open, supplier]);

  const mutation = useMutation({
    mutationFn: (input: SupplierInput) =>
      supplier ? updateSupplier(supplier.id, input) : createSupplier(input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: suppliersRoot });
      toast.success(supplier ? 'Fornecedor actualizado' : 'Fornecedor criado', saved.name);
      onOpenChange(false);
    },
  });

  const error = mutation.error instanceof ApiRequestError ? mutation.error : null;
  const set = <K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const text = (key: keyof SupplierInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(key, (event.target.value || null) as SupplierInput[typeof key]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    mutation.mutate({ ...form, name: form.name.trim() });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{supplier ? 'Editar fornecedor' : 'Novo fornecedor'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            {error && !error.details && (
              <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error.message}</p>
            )}

            <Field label="Nome" required error={error?.fieldError('name')}>
              <Input
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="Nome do fornecedor"
                autoFocus
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contacto" error={error?.fieldError('contactName')}>
                <Input value={form.contactName ?? ''} onChange={text('contactName')} placeholder="Pessoa de contacto" />
              </Field>
              <Field label="Telefone" error={error?.fieldError('phone')}>
                <Input
                  value={form.phone ?? ''}
                  onChange={text('phone')}
                  inputMode="tel"
                  placeholder="+244 900 000 000"
                />
              </Field>
              <Field label="Email" error={error?.fieldError('email')}>
                <Input
                  value={form.email ?? ''}
                  onChange={text('email')}
                  type="email"
                  inputMode="email"
                  placeholder="geral@fornecedor.ao"
                />
              </Field>
              <Field label="NIF" error={error?.fieldError('nif')}>
                <Input value={form.nif ?? ''} onChange={text('nif')} placeholder="5417..." />
              </Field>
            </div>

            <Field label="Condicoes de pagamento" error={error?.fieldError('paymentTerms')}>
              <Input
                value={form.paymentTerms ?? ''}
                onChange={text('paymentTerms')}
                placeholder="30 dias, pronto pagamento..."
              />
            </Field>

            <Field label="Morada" error={error?.fieldError('address')}>
              <Textarea value={form.address ?? ''} onChange={text('address')} rows={2} />
            </Field>

            <Field label="Notas" error={error?.fieldError('notes')}>
              <Textarea value={form.notes ?? ''} onChange={text('notes')} rows={3} />
            </Field>

            <SwitchField
              label="Fornecedor activo"
              description="Os inactivos deixam de aparecer nas novas encomendas."
              checked={form.active}
              onCheckedChange={(checked) => set('active', checked)}
            />
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!form.name.trim()}>
              Guardar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
