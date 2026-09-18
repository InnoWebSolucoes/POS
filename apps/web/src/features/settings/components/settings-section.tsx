import * as React from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';

import { Button, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * The furniture every settings tab is built from: a titled card, a labelled
 * field and the sticky save bar. Kept in one file so the eight tabs cannot
 * drift apart visually.
 */

export interface SettingsSectionProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function SettingsSection({
  title,
  description,
  children,
  className,
  actions,
}: SettingsSectionProps) {
  return (
    <section className={cn('panel p-5', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Two columns on a tablet in landscape, one in portrait. */
export function FieldGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Callouts                                                                    */
/* -------------------------------------------------------------------------- */

export type CalloutTone = 'info' | 'warning' | 'success';

const TONE_STYLES: Record<CalloutTone, string> = {
  info: 'border-border bg-muted/50 text-muted-foreground',
  warning: 'border-warning/40 bg-warning/10 text-foreground',
  success: 'border-success/40 bg-success/10 text-foreground',
};

const TONE_ICONS: Record<CalloutTone, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: Check,
};

export function Callout({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = TONE_ICONS[tone];
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4 text-sm', TONE_STYLES[tone], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className={cn(title && 'mt-1')}>{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Save bar                                                                    */
/* -------------------------------------------------------------------------- */

export interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  /** Hides the buttons entirely for a read-only viewer. */
  canSave: boolean;
  label?: string;
}

/**
 * Sits at the bottom of every editable tab. It stays out of the way until
 * something changed, so nobody has to hunt for a disabled button.
 */
export function SaveBar({ dirty, saving, onSave, onReset, canSave, label }: SaveBarProps) {
  if (!canSave) {
    return (
      <p className="text-sm text-muted-foreground">
        Nao tem permissao para alterar estas definicoes.
      </p>
    );
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {dirty && (
        <p className="mr-auto text-sm text-muted-foreground">
          {label ?? 'Existem alteracoes por guardar.'}
        </p>
      )}
      <Button variant="outline" size="lg" onClick={onReset} disabled={!dirty || saving}>
        Repor
      </Button>
      <Button size="lg" onClick={onSave} loading={saving} disabled={!dirty}>
        Guardar alteracoes
      </Button>
    </div>
  );
}
