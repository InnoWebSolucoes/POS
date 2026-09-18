import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2, UserMinus, UserPlus } from 'lucide-react';

import { Button, ConfirmDialog, toast } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

import { useDeleteCustomer, useUpdateCustomer } from '../customer-queries';
import {
  customerToForm,
  formToPayload,
  type CustomerDetail,
  type CustomerFormValues,
} from '../customer-types';
import { CustomerForm } from './customer-form';

export interface ProfileTabProps {
  customer: CustomerDetail;
}

/** The Dados tab: edit the profile, deactivate, and (last resort) remove. */
export function ProfileTab({ customer }: ProfileTabProps) {
  const navigate = useNavigate();
  const can = useAuth((s) => s.can);
  const canWrite = can('customer:write');

  const [values, setValues] = React.useState<CustomerFormValues>(() => customerToForm(customer));
  const [error, setError] = React.useState<ApiRequestError | null>(null);
  const [confirmActive, setConfirmActive] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    setValues(customerToForm(customer));
    setError(null);
  }, [customer]);

  const update = useUpdateCustomer(customer.id);
  const remove = useDeleteCustomer(customer.id);

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

    update.mutate(formToPayload(values), {
      onSuccess: (saved) => toast.success('Cliente actualizado', saved.name),
      onError: handleError,
    });
  };

  const toggleActive = () => {
    update.mutate(
      { active: !customer.active },
      {
        onSuccess: (saved) =>
          toast.success(saved.active ? 'Cliente reactivado' : 'Cliente desactivado', saved.name),
        onError: handleError,
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="panel flex flex-col gap-4 p-5">
        <CustomerForm
          values={values}
          onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
          fieldError={(path) => error?.fieldError(path)}
          disabled={!canWrite || update.isPending}
          idPrefix="dados"
        />

        {canWrite && (
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setValues(customerToForm(customer))}
              disabled={update.isPending}
            >
              Repor
            </Button>
            <Button
              type="submit"
              size="lg"
              leftIcon={<Save />}
              loading={update.isPending}
              loadingLabel="A guardar..."
            >
              Guardar alteracoes
            </Button>
          </div>
        )}

        {!canWrite && (
          <p className="text-sm text-muted-foreground">
            Sem permissao para editar clientes. Os dados sao apresentados apenas para consulta.
          </p>
        )}
      </form>

      {canWrite && (
        <div className="panel flex flex-col gap-3 p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Estado da conta</h2>
            <p className="text-sm text-muted-foreground">
              {customer.active
                ? 'Um cliente desactivado deixa de aparecer na pesquisa do registo, mas mantem o historico.'
                : 'Este cliente esta desactivado e nao aparece na pesquisa do registo.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={customer.active ? 'outline' : 'success'}
              size="lg"
              leftIcon={customer.active ? <UserMinus /> : <UserPlus />}
              onClick={() => setConfirmActive(true)}
              disabled={update.isPending}
            >
              {customer.active ? 'Desactivar cliente' : 'Reactivar cliente'}
            </Button>

            <Button
              variant="destructive"
              size="lg"
              leftIcon={<Trash2 />}
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
            >
              Eliminar cliente
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmActive}
        onOpenChange={setConfirmActive}
        title={customer.active ? 'Desactivar este cliente?' : 'Reactivar este cliente?'}
        description={
          customer.active
            ? `${customer.name} deixa de aparecer na pesquisa do registo. O historico e os pontos mantem-se.`
            : `${customer.name} volta a aparecer na pesquisa do registo.`
        }
        confirmLabel={customer.active ? 'Desactivar' : 'Reactivar'}
        variant={customer.active ? 'destructive' : 'success'}
        onConfirm={toggleActive}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar este cliente?"
        description={`${customer.name} deixa de estar disponivel. As vendas e o historico de pontos sao preservados.`}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success('Cliente eliminado', customer.name);
              navigate('/clientes');
            },
            onError: handleError,
          })
        }
      />
    </div>
  );
}

export default ProfileTab;
