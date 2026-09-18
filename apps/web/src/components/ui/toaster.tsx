import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastVariant } from './use-toast';

const ICONS: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: XCircle,
  warning: AlertTriangle,
};

const STYLES: Record<ToastVariant, string> = {
  default: 'border-border bg-card text-card-foreground',
  success: 'border-success/30 bg-success text-success-foreground',
  destructive: 'border-destructive/30 bg-destructive text-destructive-foreground',
  warning: 'border-warning/30 bg-warning text-warning-foreground',
};

/**
 * Toasts sit top-right on desktop and bottom-centre on a tablet, where the top
 * of the screen is where the cashier's hand is, not their eyes.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4
                 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end"
      role="region"
      aria-live="polite"
    >
      {toasts.map((item) => {
        const Icon = ICONS[item.variant];
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg',
              'animate-in slide-in-from-bottom-2 sm:slide-in-from-right-2',
              STYLES[item.variant],
            )}
          >
            <Icon className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{item.title}</p>
              {item.description && <p className="mt-1 text-sm opacity-90">{item.description}</p>}
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="mt-2 text-sm font-semibold underline underline-offset-2"
                >
                  {item.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default Toaster;
