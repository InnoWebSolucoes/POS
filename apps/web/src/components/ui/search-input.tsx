import * as React from 'react';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { inputClassName } from './input';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  /** Controlled text. Leave it out and the component keeps its own. */
  value?: string;
  defaultValue?: string;
  /** Fired once the typing stops. */
  onSearch?: (query: string) => void;
  /** Debounce window in ms. */
  delay?: number;
  /** Fired on every keystroke, undebounced. */
  onValueChange?: (query: string) => void;
}

/**
 * Search box with the magnifier, an always-visible clear button (no hover
 * reveal - there is no hover on a tablet) and the debounce built in.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    className,
    value,
    defaultValue = '',
    onSearch,
    onValueChange,
    delay = 250,
    placeholder = 'Procurar...',
    onKeyDown,
    ...props
  },
  ref,
) {
  const controlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue);
  const query = controlled ? value : internal;

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const onSearchRef = React.useRef(onSearch);
  const lastEmitted = React.useRef(controlled ? value : defaultValue);

  React.useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  React.useEffect(() => {
    if (query === lastEmitted.current) return;
    const timer = setTimeout(() => {
      lastEmitted.current = query;
      onSearchRef.current?.(query);
    }, delay);
    return () => clearTimeout(timer);
  }, [query, delay]);

  const setQuery = (next: string) => {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  };

  const clear = () => {
    setQuery('');
    lastEmitted.current = '';
    onSearchRef.current?.('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-5 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={(node) => {
          inputRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.preventDefault();
            clear();
          }
          onKeyDown?.(event);
        }}
        className={cn(
          inputClassName,
          'pl-11 pr-12 [&::-webkit-search-cancel-button]:appearance-none',
          className,
        )}
        {...props}
      />
      {query.length > 0 && (
        <button
          type="button"
          onClick={clear}
          aria-label="Limpar procura"
          className={cn(
            'absolute inset-y-0 right-0 my-auto flex size-11 items-center justify-center rounded-lg text-muted-foreground',
            'transition-colors hover:text-foreground',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  );
});

export default SearchInput;
