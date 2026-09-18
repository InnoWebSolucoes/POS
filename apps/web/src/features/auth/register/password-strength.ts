/**
 * A hint, not a gate. The server's rule is eight characters; everything above
 * that is advice, so the meter never blocks a sign-up - it just tells the owner
 * how easy their administrator password would be to guess.
 */

export type PasswordStrength = 'weak' | 'fair' | 'strong';

export interface PasswordHint {
  strength: PasswordStrength;
  /** 0-100, for the progress bar. */
  value: number;
  label: string;
  tone: 'destructive' | 'warning' | 'success';
  /** The one thing worth improving next, or null when there is nothing to add. */
  advice: string | null;
}

export const MIN_PASSWORD_LENGTH = 8;

export function passwordHint(password: string): PasswordHint {
  const long = password.length >= 12;
  const mixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  let advice: string | null = null;
  if (password.length < MIN_PASSWORD_LENGTH) advice = 'Use pelo menos 8 caracteres.';
  else if (!hasDigit) advice = 'Junte um numero.';
  else if (!mixedCase) advice = 'Junte uma letra maiuscula.';
  else if (!long) advice = 'Com 12 caracteres fica bem mais segura.';
  else if (!hasSymbol) advice = 'Um simbolo (!, ?, #) torna-a ainda mais forte.';

  // Too short is weak no matter what else it contains.
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { strength: 'weak', value: password.length ? 25 : 0, label: 'Fraca', tone: 'destructive', advice };
  }

  const extras = [long, mixedCase, hasDigit, hasSymbol].filter(Boolean).length;
  if (extras >= 3) return { strength: 'strong', value: 100, label: 'Forte', tone: 'success', advice };
  if (extras >= 1) return { strength: 'fair', value: 65, label: 'Media', tone: 'warning', advice };
  return { strength: 'weak', value: 40, label: 'Fraca', tone: 'destructive', advice };
}
