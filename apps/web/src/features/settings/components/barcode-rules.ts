import type { EmbeddedBarcodeRule } from '@pos/shared';

/** An EAN-13 is exactly 13 digits; every slice has to live inside it. */
export const EAN13_LENGTH = 13;

/** Mirrors the server's superRefine so the operator sees the problem first. */
export function ruleProblem(rule: EmbeddedBarcodeRule): string | null {
  if (!rule.label.trim()) return 'Indique um nome para a regra.';
  if (rule.prefixes.length === 0) return 'Indique pelo menos um prefixo.';
  if (rule.prefixes.some((prefix) => !/^[0-9]{1,6}$/.test(prefix))) {
    return 'Os prefixos so aceitam 1 a 6 digitos.';
  }

  const itemEnd = rule.itemCodeStart + rule.itemCodeLength;
  const valueEnd = rule.valueStart + rule.valueLength;
  if (itemEnd > EAN13_LENGTH) return 'O codigo de artigo sai fora dos 13 digitos.';
  if (valueEnd > EAN13_LENGTH) return 'O valor sai fora dos 13 digitos.';
  if (rule.itemCodeStart < valueEnd && rule.valueStart < itemEnd) {
    return 'O codigo de artigo e o valor nao podem ocupar os mesmos digitos.';
  }
  return null;
}

export function newRule(index: number): EmbeddedBarcodeRule {
  return {
    id: `regra-${index + 1}`,
    label: '',
    prefixes: ['2'],
    itemCodeStart: 2,
    itemCodeLength: 5,
    valueStart: 7,
    valueLength: 5,
    valueKind: 'weight_grams',
    enabled: true,
  };
}
