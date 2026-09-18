import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { errorMessage } from './query-error';
import type { SendReceiptResponse } from '../types';

export interface SendReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  receiptNumber: string;
  defaultPhone?: string | null;
  defaultEmail?: string | null;
  onSent: (response: SendReceiptResponse) => void;
}

export function SendReceiptDialog({
  open,
  onOpenChange,
  saleId,
  receiptNumber,
  defaultPhone,
  defaultEmail,
  onSent,
}: SendReceiptDialogProps) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!open) return;
    setPhone(defaultPhone ?? '');
    setEmail(defaultEmail ?? '');
  }, [open, defaultPhone, defaultEmail]);

  const send = useMutation({
    mutationFn: () =>
      api.post<SendReceiptResponse>(`/api/sales/${saleId}/send-receipt`, {
        phone: phone.trim() || null,
        email: email.trim() || null,
      }),
    onSuccess: (response) => {
      // No mail transport in this deployment: the server hands back a wa.me
      // link and the rendered text so the receipt still reaches the customer.
      if (response.whatsappUrl) window.open(response.whatsappUrl, '_blank', 'noopener,noreferrer');
      toast.success('Recibo preparado', response.message);
      onSent(response);
      onOpenChange(false);
    },
    onError: (error) => toast.error('Envio falhou', errorMessage(error)),
  });

  const fieldError = (path: string): string | undefined =>
    send.error instanceof ApiRequestError ? send.error.fieldError(path) : undefined;

  const canSend = phone.trim().length > 0 || email.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar recibo</DialogTitle>
          <DialogDescription>
            Recibo <span className="tabular">{receiptNumber}</span>. Indique um numero de WhatsApp,
            um email, ou ambos.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recibo-telefone">Telefone (WhatsApp)</Label>
            <Input
              id="recibo-telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+244 923 456 789"
              className="tabular"
              value={phone}
              aria-invalid={Boolean(fieldError('phone'))}
              onChange={(event) => setPhone(event.target.value)}
            />
            {fieldError('phone') && <p className="text-sm text-destructive">{fieldError('phone')}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recibo-email">Email</Label>
            <Input
              id="recibo-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="cliente@exemplo.co.ao"
              value={email}
              aria-invalid={Boolean(fieldError('email'))}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldError('email') && <p className="text-sm text-destructive">{fieldError('email')}</p>}
          </div>

          <p className="text-sm text-muted-foreground">
            Esta instalacao nao tem servidor de email: o email fica registado na venda e o recibo
            segue por WhatsApp.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            leftIcon={<MessageCircle />}
            disabled={!canSend}
            loading={send.isPending}
            loadingLabel="A enviar..."
            onClick={() => send.mutate()}
          >
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendReceiptDialog;
