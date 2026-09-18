import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Mail, MessageCircle, Printer, ShoppingBag } from 'lucide-react';
import type { EntityDto, EntitySettings, SaleDto } from '@pos/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { ReceiptView } from './receipt-view';
import type { SendReceiptResponse } from './types';

export interface ReceiptDialogProps {
  sale: SaleDto | null;
  entity: EntityDto | null;
  settings: EntitySettings;
  onClose: () => void;
}

/** Shown the moment a sale lands: print it, send it, or start the next one. */
export function ReceiptDialog({ sale, entity, settings, onClose }: ReceiptDialogProps) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const send = useMutation({
    mutationFn: (body: { phone?: string; email?: string }) =>
      api.post<SendReceiptResponse>(`/api/sales/${sale?.id ?? ''}/send-receipt`, body),
    onSuccess: (result, variables) => {
      if (variables.phone && result.whatsappUrl) {
        window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
        toast.success('Recibo preparado para WhatsApp');
        return;
      }
      // This deployment has no mail transport; the API says so plainly.
      toast.warning('Recibo registado', result.message);
    },
    onError: (error) => toast.error('Nao foi possivel enviar', (error as Error).message),
  });

  if (!sale) return null;

  return (
    <Dialog open={Boolean(sale)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('pos.saleComplete', 'Venda Concluida')}</DialogTitle>
          <p className="tabular text-sm text-muted-foreground">
            {sale.receiptNumber} - {money(sale.totalMinor)}
          </p>
        </DialogHeader>

        <DialogBody className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="rounded-xl border border-border">
            <ReceiptView sale={sale} entity={entity} settings={settings} />
          </div>

          <div className="no-print space-y-4">
            <Button size="lg" block leftIcon={<Printer />} onClick={() => window.print()}>
              {t('common.print', 'Imprimir')}
            </Button>

            <div className="space-y-2">
              <Label htmlFor="receipt-phone">{t('pos.sendWhatsapp', 'Enviar por WhatsApp')}</Label>
              <Input
                id="receipt-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+244 923 456 789"
                autoComplete="off"
              />
              <Button
                variant="outline"
                block
                leftIcon={<MessageCircle />}
                disabled={!phone.trim()}
                loading={send.isPending && Boolean(send.variables?.phone)}
                onClick={() => send.mutate({ phone: phone.trim() })}
              >
                {t('pos.sendWhatsapp', 'Enviar por WhatsApp')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt-email">{t('pos.sendEmail', 'Enviar por email')}</Label>
              <Input
                id="receipt-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="cliente@exemplo.ao"
                autoComplete="off"
              />
              <Button
                variant="outline"
                block
                leftIcon={<Mail />}
                disabled={!email.trim()}
                loading={send.isPending && Boolean(send.variables?.email)}
                onClick={() => send.mutate({ email: email.trim() })}
              >
                {t('pos.sendEmail', 'Enviar por email')}
              </Button>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="no-print">
          <Button size="xl" block leftIcon={<ShoppingBag />} onClick={onClose}>
            {t('pos.newSale', 'Nova Venda')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReceiptDialog;
