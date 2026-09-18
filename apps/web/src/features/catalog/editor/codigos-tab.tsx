import * as React from 'react';
import { BadgeCheck, BadgeX, Plus, Trash2, Wand2 } from 'lucide-react';
import { detectFormat, digitsOnly, isValidEan13 } from '@pos/shared';

import { Badge, Button, Input, Label } from '@/components/ui';
import { skuSegment } from '../catalog-labels';
import { FieldError } from '../components/catalog-page';
import type { ProductForm, PatchForm } from './use-product-form';

export interface CodigosTabProps {
  form: ProductForm;
  patch: PatchForm;
  errors: Record<string, string>;
}

/** A suggestion, not a guarantee - the server still refuses a duplicate SKU. */
function suggestSku(namePt: string): string {
  const base = skuSegment(namePt).slice(0, 8) || 'PROD';
  const suffix = String(Math.floor(Math.random() * 100_000)).padStart(5, '0');
  return `${base}-${suffix}`;
}

function BarcodeStatus({ code }: { code: string }) {
  const trimmed = code.trim();
  if (!trimmed) {
    return (
      <Badge variant="muted" size="sm">
        Sera gerado automaticamente
      </Badge>
    );
  }

  const format = detectFormat(trimmed);
  const digits = digitsOnly(trimmed);

  if (digits.length === 13) {
    const valid = isValidEan13(digits);
    return (
      <Badge variant={valid ? 'success' : 'destructive'} size="sm">
        {valid ? (
          <BadgeCheck className="size-3.5" aria-hidden="true" />
        ) : (
          <BadgeX className="size-3.5" aria-hidden="true" />
        )}
        {valid ? 'EAN-13 valido' : 'Digito de controlo invalido'}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" size="sm">
      {format}
    </Badge>
  );
}

export function CodigosTab({ form, patch, errors }: CodigosTabProps) {
  const [draft, setDraft] = React.useState('');

  const addAlternate = () => {
    const value = draft.trim();
    if (!value) return;
    if (form.altBarcodes.includes(value) || value === form.barcode.trim()) {
      setDraft('');
      return;
    }
    patch({ altBarcodes: [...form.altBarcodes, value] });
    setDraft('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-sku">SKU</Label>
          <div className="flex items-center gap-2">
            <Input
              id="produto-sku"
              value={form.sku}
              onChange={(event) => patch({ sku: event.target.value.toUpperCase() })}
              aria-invalid={Boolean(errors.sku)}
              placeholder="Deixe vazio para o sistema gerar"
              className="tabular"
            />
            <Button
              variant="outline"
              leftIcon={<Wand2 />}
              onClick={() => patch({ sku: suggestSku(form.namePt) })}
            >
              Gerar
            </Button>
          </div>
          <FieldError message={errors.sku} />
          <p className="text-xs text-muted-foreground">
            Sem SKU, o servidor atribui um numero sequencial ao guardar.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-barcode">Codigo de barras principal</Label>
          <Input
            id="produto-barcode"
            value={form.barcode}
            onChange={(event) => patch({ barcode: event.target.value.trim() })}
            aria-invalid={Boolean(errors.barcode)}
            inputMode="numeric"
            placeholder="5601234567890"
            className="tabular"
          />
          <div className="flex items-center gap-2">
            <BarcodeStatus code={form.barcode} />
          </div>
          <FieldError message={errors.barcode} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-barcode-alt">Codigos alternativos</Label>
          <div className="flex items-center gap-2">
            <Input
              id="produto-barcode-alt"
              value={draft}
              onChange={(event) => setDraft(event.target.value.trim())}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                addAlternate();
              }}
              inputMode="numeric"
              placeholder="Outro codigo do mesmo produto"
              className="tabular"
            />
            <Button
              variant="outline"
              leftIcon={<Plus />}
              onClick={addAlternate}
              disabled={draft.trim().length === 0}
            >
              Juntar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Util quando o mesmo artigo chega com embalagens de fornecedores diferentes.
          </p>
        </div>

        {form.altBarcodes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Sem codigos alternativos.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {form.altBarcodes.map((code) => (
              <li
                key={code}
                className="flex min-h-touch items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="tabular flex-1 truncate text-sm">{code}</span>
                <BarcodeStatus code={code} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${code}`}
                  onClick={() =>
                    patch({ altBarcodes: form.altBarcodes.filter((value) => value !== code) })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default CodigosTab;
