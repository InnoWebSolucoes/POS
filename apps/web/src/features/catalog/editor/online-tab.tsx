import * as React from 'react';
import { Globe, Wand2 } from 'lucide-react';

import { Button, Input, Label, NumericInput, SwitchField } from '@/components/ui';
import { slugify } from '../catalog-labels';
import { FieldError } from '../components/catalog-page';
import type { ProductForm, PatchForm } from './use-product-form';

export interface OnlineTabProps {
  form: ProductForm;
  patch: PatchForm;
  errors: Record<string, string>;
  /** The storefront slug of the entity, for the preview address. */
  entitySlug: string | null;
}

export function OnlineTab({ form, patch, errors, entitySlug }: OnlineTabProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <SwitchField
          label="Publicar na loja online"
          description="Torna o produto visivel na montra publica."
          checked={form.publishOnline}
          onCheckedChange={(publishOnline) =>
            patch({
              publishOnline,
              // A product going live without an address would 404 on the storefront.
              onlineSlug:
                publishOnline && !form.onlineSlug ? slugify(form.namePt) : form.onlineSlug,
            })
          }
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-slug">Endereco na loja</Label>
          <div className="flex items-center gap-2">
            <Input
              id="produto-slug"
              value={form.onlineSlug}
              onChange={(event) => patch({ onlineSlug: slugify(event.target.value) })}
              aria-invalid={Boolean(errors.onlineSlug)}
              placeholder="agua-mineral-15l"
            />
            <Button
              variant="outline"
              leftIcon={<Wand2 />}
              onClick={() => patch({ onlineSlug: slugify(form.namePt) })}
            >
              Gerar
            </Button>
          </div>
          <FieldError message={errors.onlineSlug} />
          {entitySlug && form.onlineSlug && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="size-3.5" aria-hidden="true" />
              /loja/{entitySlug}/produto/{form.onlineSlug}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="produto-peso">Peso de envio (gramas)</Label>
          <NumericInput
            id="produto-peso"
            value={form.weightGrams ?? 0}
            onValueChange={(value) => patch({ weightGrams: value > 0 ? Math.round(value) : null })}
            decimals={0}
            min={0}
          />
          <p className="text-xs text-muted-foreground">
            Usado para calcular portes. 0 deixa o produto sem peso definido.
          </p>
        </div>
      </section>

      <section>
        <p className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
          A montra usa o nome, a descricao e as imagens deste produto. Um produto sem imagem e sem
          descricao aparece na loja, mas vende muito menos.
        </p>
      </section>
    </div>
  );
}

export default OnlineTab;
