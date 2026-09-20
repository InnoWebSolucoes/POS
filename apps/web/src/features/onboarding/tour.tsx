import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LifeBuoy } from 'lucide-react';

import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

import { ScanQuantityHint } from './hints';
import { tourSections, type TourCard } from './tour-content';

/**
 * "Como funciona" - the opt-in tour.
 *
 * It is a panel you open, read and close. Nothing about it interrupts: no
 * spotlight over the screen, no "1 de 7" that has to be finished, no reminder
 * the week after. Someone who already knows the product will never see it
 * again after the first day; someone who forgot how to split a bill finds the
 * answer in two taps and gets a button straight to the screen.
 */

/* -------------------------------------------------------------------------- */
/* A card                                                                      */
/* -------------------------------------------------------------------------- */

function TourCardView({ card, onGo }: { card: TourCard; onGo: (to: string) => void }) {
  const Icon = card.icon;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold leading-snug text-foreground">{card.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {card.body[0]} {card.body[1]}
          </p>

          {card.showScanHint && <ScanQuantityHint />}

          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            rightIcon={<ArrowRight />}
            onClick={() => onGo(card.to)}
          >
            {card.cta}
          </Button>
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* The panel                                                                   */
/* -------------------------------------------------------------------------- */

export interface TourSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TourSheet({ open, onOpenChange }: TourSheetProps) {
  const can = useAuth((state) => state.can);
  const entity = useAuth((state) => state.entity);
  const navigate = useNavigate();

  const sections = React.useMemo(
    () => tourSections(entity?.mode ?? null, can),
    [can, entity?.mode],
  );

  // Opening the screen the card describes is the whole point, so the panel gets
  // out of the way the moment it happens.
  const go = React.useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Como funciona</SheetTitle>
          <SheetDescription>
            O essencial do seu dia, explicado em poucas linhas. Carregue num botao para abrir o ecra
            que faz o trabalho.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {sections.map((section) => (
            <section key={section.key} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h2>
              <ul className="space-y-3">
                {section.cards.map((card) => (
                  <TourCardView key={card.key} card={card} onGo={go} />
                ))}
              </ul>
            </section>
          ))}

          <p className="pb-2 text-xs leading-relaxed text-muted-foreground">
            Esta janela esta sempre aqui em cima, em "Como funciona". Feche-a quando quiser - nada
            fica a meio.
          </p>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* The trigger                                                                 */
/* -------------------------------------------------------------------------- */

export interface TourButtonProps {
  /** Icon only, for the register's crowded top bar. */
  compact?: boolean;
  className?: string;
}

/**
 * The one control the shells mount. It owns its own open state so neither shell
 * has to grow a piece of onboarding state it otherwise does not care about.
 */
export function TourButton({ compact = false, className }: TourButtonProps) {
  const [open, setOpen] = React.useState(false);
  const status = useAuth((state) => state.status);

  if (status !== 'authenticated') return null;

  return (
    <>
      {compact ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Como funciona"
          className={cn('size-11', className)}
        >
          <LifeBuoy />
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          aria-label="Como funciona"
          leftIcon={<LifeBuoy />}
          className={cn('min-w-12 px-3 md:px-4', className)}
        >
          {/* The label is what makes it findable; below md the bar has no room
              for it and the aria-label carries the meaning instead. */}
          <span className="hidden md:inline">Como funciona</span>
        </Button>
      )}

      <TourSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export default TourButton;
