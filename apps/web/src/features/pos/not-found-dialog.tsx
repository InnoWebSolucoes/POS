import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PackagePlus, ScanBarcode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-store';

export interface NotFoundDialogProps {
  code: string | null;
  onOpenChange: (open: boolean) => void;
}

/** A miss is not an error: offer to create the product and carry on. */
export function NotFoundDialog({ code, onOpenChange }: NotFoundDialogProps) {
  const { t } = useTranslation();
  const can = useAuth((s) => s.can);

  if (!code) return null;

  return (
    <Dialog open={Boolean(code)} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('pos.productNotFound', 'Produto nao encontrado')}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('pos.productNotFoundBody', 'O codigo {{code}} nao existe no catalogo. Deseja criar este produto?', {
              code,
            })}
          </p>
          <p className="tabular flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-lg font-semibold text-foreground">
            <ScanBarcode className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="break-all">{code}</span>
          </p>
          {!can('product:write') && (
            <p className="text-sm text-muted-foreground">
              Sem permissao para criar produtos. Chame um responsavel.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close', 'Fechar')}
          </Button>
          {can('product:write') && (
            <Button asChild>
              <Link to={`/produtos/novo?barcode=${encodeURIComponent(code)}`}>
                <PackagePlus className="size-5" aria-hidden="true" />
                {t('pos.createProduct', 'Criar produto')}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NotFoundDialog;
