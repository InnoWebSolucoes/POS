import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted-foreground', className)} aria-label="A carregar" />;
}

export function LoadingBlock({ label = 'A carregar...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
      <Spinner className="size-6" />
      <span>{label}</span>
    </div>
  );
}

export default Spinner;
