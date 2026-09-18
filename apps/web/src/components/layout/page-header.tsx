import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The header every back-office screen starts with: what this page is, how you
 * got here, and the one or two things you came to do.
 *
 * Rendering it also publishes the title to the shell's top bar, so the two can
 * never drift apart - see PageTitleProvider below.
 */

export interface Crumb {
  label: string;
  /** Omit on the last crumb: the page you are already on is not a link. */
  to?: string;
}

/* -------------------------------------------------------------------------- */
/* Title plumbing                                                              */
/* -------------------------------------------------------------------------- */

interface PageTitleValue {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const PageTitleContext = React.createContext<PageTitleValue | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<string | null>(null);
  const value = React.useMemo<PageTitleValue>(() => ({ title, setTitle }), [title]);
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

/** What the shell's top bar should show, or null to fall back to the nav map. */
export function usePageTitle(): string | null {
  return React.useContext(PageTitleContext)?.title ?? null;
}

/** Publishes a title from a screen that does not render a PageHeader. */
export function useSetPageTitle(title: string | null): void {
  const context = React.useContext(PageTitleContext);
  const setTitle = context?.setTitle;

  React.useEffect(() => {
    if (!setTitle) return;
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
}

/* -------------------------------------------------------------------------- */
/* Breadcrumbs                                                                 */
/* -------------------------------------------------------------------------- */

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Percurso">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />}
              {crumb.to && !last ? (
                <Link
                  to={crumb.to}
                  className={cn(
                    'rounded-md px-1 py-1 transition-colors hover:text-foreground',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="px-1 py-1 font-medium text-foreground" aria-current={last ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* The header                                                                  */
/* -------------------------------------------------------------------------- */

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  description?: React.ReactNode;
  /** Trail above the title. The current page is usually the last crumb. */
  breadcrumbs?: Crumb[];
  /** Buttons, filters, an export menu - anything the page acts with. */
  actions?: React.ReactNode;
  /** Adds the hairline under the header. */
  separated?: boolean;
}

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader(
  { title, description, breadcrumbs, actions, separated = false, className, children, ...props },
  ref,
) {
  useSetPageTitle(title);

  return (
    <div
      ref={ref}
      className={cn('mb-6 flex flex-col gap-4', separated && 'border-b border-border pb-5', className)}
      {...props}
    >
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs crumbs={breadcrumbs} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  );
});

export default PageHeader;
