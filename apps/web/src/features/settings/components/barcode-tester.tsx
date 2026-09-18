import * as React from 'react';
import { ScanLine } from 'lucide-react';
import { parseScan, type EmbeddedBarcodeRule } from '@pos/shared';

import { Badge, Button, Input } from '@/components/ui';
import { money, quantity as formatQuantity } from '@/lib/format';
import { useScanner } from '@/hooks/use-scanner';

import { Field, SettingsSection } from './settings-section';
import { DigitMap } from './barcode-rule-editor';
import { EAN13_LENGTH } from './barcode-rules';

/* -------------------------------------------------------------------------- */
/* Tester                                                                      */
/* -------------------------------------------------------------------------- */

export function BarcodeTester({ rules }: { rules: EmbeddedBarcodeRule[] }) {
  const [code, setCode] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // While the tester has focus a real scanner burst lands straight in the box.
  useScanner({
    enabled: focused,
    captureInInputs: true,
    onScan: (scanned) => setCode(scanned),
  });

  const result = React.useMemo(() => (code.trim() ? parseScan(code.trim(), rules) : null), [code, rules]);
  const matchedRule =
    result && result.kind === 'embedded' ? rules.find((rule) => rule.id === result.rule) : undefined;

  return (
    <SettingsSection
      title="Testar um codigo"
      description="Cole ou leia um codigo de barras e veja como as regras acima o interpretam."
    >
      <Field label="Codigo de barras" htmlFor="barcode-tester">
        <Input
          ref={inputRef}
          id="barcode-tester"
          value={code}
          inputMode="numeric"
          autoComplete="off"
          maxLength={40}
          placeholder="2100123004500"
          className="tabular text-lg"
          startAdornment={<ScanLine className="size-5" />}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setCode('2100123004500')}>
          Exemplo de peso
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCode('2000123150000')}>
          Exemplo de preco
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCode('')} disabled={!code}>
          Limpar
        </Button>
      </div>

      {!result && (
        <p className="mt-5 text-sm text-muted-foreground">
          Sem codigo para interpretar. Um codigo com 13 digitos e digito de controlo valido pode
          activar uma regra.
        </p>
      )}

      {result && (
        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {result.kind === 'embedded' ? (
              <Badge variant="success">Regra aplicada</Badge>
            ) : (
              <Badge variant="muted">Codigo normal</Badge>
            )}
            <Badge variant="outline">{result.format}</Badge>
            {matchedRule && <Badge variant="outline">{matchedRule.label || matchedRule.id}</Badge>}
          </div>

          {result.kind === 'embedded' ? (
            <>
              {matchedRule && <DigitMap rule={matchedRule} code={result.code} />}
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <ResultRow label="Codigo do artigo" value={result.itemCode} />
                <ResultRow label="Codigo preenchido" value={result.itemCodePadded} />
                {result.quantity !== undefined && (
                  <ResultRow label="Quantidade lida" value={formatQuantity(result.quantity, 'kg')} />
                )}
                {result.priceMinor !== undefined && (
                  <ResultRow label="Preco lido" value={money(result.priceMinor)} />
                )}
              </dl>
              <p className="text-xs text-muted-foreground">
                A caixa procura o produto pelo codigo de artigo e usa o valor lido em vez de pedir a
                quantidade ao operador.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra corresponde. Este codigo e procurado tal como esta no campo Codigo de
              barras do produto.
              {code.replace(/\D/g, '').length === EAN13_LENGTH && (
                <> Verifique o digito de controlo e os prefixos configurados.</>
              )}
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
