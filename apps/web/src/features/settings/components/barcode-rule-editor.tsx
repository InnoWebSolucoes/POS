import * as React from 'react';
import { Trash2 } from 'lucide-react';
import type { EmbeddedBarcodeRule } from '@pos/shared';

import {
  Button,
  Input,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { cn } from '@/lib/utils';

import { VALUE_KIND_LABELS } from '../settings-types';
import { Field } from './settings-section';
import { EAN13_LENGTH, ruleProblem } from './barcode-rules';

const VALUE_KINDS: Array<EmbeddedBarcodeRule['valueKind']> = [
  'weight_grams',
  'weight_milli',
  'price_minor',
  'price_major_2dp',
];

export interface RuleEditorProps {
  rule: EmbeddedBarcodeRule;
  index: number;
  canWrite: boolean;
  onChange: (next: Partial<EmbeddedBarcodeRule>) => void;
  onRemove: () => void;
}

/* -------------------------------------------------------------------------- */
/* One rule                                                                    */
/* -------------------------------------------------------------------------- */

export function RuleEditor({
  rule,
  index,
  canWrite,
  onChange,
  onRemove,
}: RuleEditorProps) {
  const problem = ruleProblem(rule);

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Switch
            id={`rule-enabled-${index}`}
            checked={rule.enabled !== false}
            disabled={!canWrite}
            onCheckedChange={(checked) => onChange({ enabled: checked })}
            aria-label="Regra activa"
          />
          <label htmlFor={`rule-enabled-${index}`} className="text-sm font-medium text-foreground">
            {rule.enabled === false ? 'Inactiva' : 'Activa'}
          </label>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remover regra ${rule.label || rule.id}`}
          disabled={!canWrite}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Nome" htmlFor={`rule-label-${index}`}>
          <Input
            id={`rule-label-${index}`}
            value={rule.label}
            maxLength={80}
            disabled={!canWrite}
            placeholder="Peso (prefixo 21/22)"
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </Field>

        <Field
          label="Prefixos"
          htmlFor={`rule-prefixes-${index}`}
          hint="Separados por virgula, so digitos. Ex: 21, 22"
        >
          <Input
            id={`rule-prefixes-${index}`}
            value={rule.prefixes.join(', ')}
            disabled={!canWrite}
            className="tabular"
            onChange={(e) =>
              onChange({
                prefixes: e.target.value
                  .split(',')
                  .map((part) => part.trim())
                  .filter((part) => part.length > 0),
              })
            }
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Artigo: inicio" htmlFor={`rule-is-${index}`} hint="Posicao 0 a 12.">
          <NumericInput
            id={`rule-is-${index}`}
            value={rule.itemCodeStart}
            decimals={0}
            min={0}
            max={12}
            disabled={!canWrite}
            onValueChange={(value) => onChange({ itemCodeStart: Math.round(value) })}
          />
        </Field>
        <Field label="Artigo: digitos" htmlFor={`rule-il-${index}`}>
          <NumericInput
            id={`rule-il-${index}`}
            value={rule.itemCodeLength}
            decimals={0}
            min={1}
            max={13}
            disabled={!canWrite}
            onValueChange={(value) => onChange({ itemCodeLength: Math.round(value) })}
          />
        </Field>
        <Field label="Valor: inicio" htmlFor={`rule-vs-${index}`}>
          <NumericInput
            id={`rule-vs-${index}`}
            value={rule.valueStart}
            decimals={0}
            min={0}
            max={12}
            disabled={!canWrite}
            onValueChange={(value) => onChange({ valueStart: Math.round(value) })}
          />
        </Field>
        <Field label="Valor: digitos" htmlFor={`rule-vl-${index}`}>
          <NumericInput
            id={`rule-vl-${index}`}
            value={rule.valueLength}
            decimals={0}
            min={1}
            max={13}
            disabled={!canWrite}
            onValueChange={(value) => onChange({ valueLength: Math.round(value) })}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Field label="O valor representa" htmlFor={`rule-kind-${index}`}>
          <Select
            value={rule.valueKind}
            disabled={!canWrite}
            onValueChange={(value) =>
              onChange({ valueKind: value as EmbeddedBarcodeRule['valueKind'] })
            }
          >
            <SelectTrigger id={`rule-kind-${index}`} aria-label="Tipo de valor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VALUE_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {VALUE_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Identificador" htmlFor={`rule-id-${index}`} hint="Usado nos registos de leitura.">
          <Input
            id={`rule-id-${index}`}
            value={rule.id}
            maxLength={40}
            disabled={!canWrite}
            className="tabular"
            onChange={(e) => onChange({ id: e.target.value.trim() })}
          />
        </Field>
      </div>

      <div className="mt-4">
        <DigitMap rule={rule} />
      </div>

      {problem && <p className="mt-3 text-xs font-medium text-destructive">{problem}</p>}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* The 13-digit map                                                            */
/* -------------------------------------------------------------------------- */

type DigitRole = 'prefix' | 'item' | 'value' | 'other';

const ROLE_STYLE: Record<DigitRole, string> = {
  prefix: 'border-border bg-secondary text-secondary-foreground',
  item: 'border-primary/40 bg-primary/15 text-primary',
  value: 'border-success/40 bg-success/15 text-success',
  other: 'border-border bg-muted text-muted-foreground',
};

function rolesFor(rule: EmbeddedBarcodeRule): DigitRole[] {
  const prefixLength = rule.prefixes[0]?.length ?? 0;
  return Array.from({ length: EAN13_LENGTH }, (_, position) => {
    if (position >= rule.itemCodeStart && position < rule.itemCodeStart + rule.itemCodeLength) {
      return 'item';
    }
    if (position >= rule.valueStart && position < rule.valueStart + rule.valueLength) {
      return 'value';
    }
    if (position < prefixLength) return 'prefix';
    return 'other';
  });
}

export function DigitMap({ rule, code }: { rule: EmbeddedBarcodeRule; code?: string }) {
  const roles = rolesFor(rule);

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {roles.map((role, position) => (
          <span
            key={position}
            className={cn(
              'flex size-9 flex-col items-center justify-center rounded-md border text-xs font-semibold tabular',
              ROLE_STYLE[role],
            )}
            title={`Digito ${position}`}
          >
            {code ? (code[position] ?? '-') : position}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-secondary" aria-hidden="true" /> Prefixo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary/40" aria-hidden="true" /> Codigo de artigo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-success/40" aria-hidden="true" /> Valor
        </span>
      </div>
    </div>
  );
}
