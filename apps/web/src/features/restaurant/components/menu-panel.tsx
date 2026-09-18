import { useMemo, useRef, useState } from 'react';
import { LayoutGrid, Percent, ScanLine, Search, X } from 'lucide-react';

import {
  Button,
  CategoryTile,
  EmptyState,
  Input,
  ProductTile,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TileGrid,
  toast,
} from '@/components/ui';
import { useScanner } from '@/hooks/use-scanner';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { beep, errorBeep } from '@/lib/sound';
import { cn, colorForLabel } from '@/lib/utils';

import { COURSES, courseLabel, type MenuCategory, type MenuItem } from './types';

const ALL = '__all__';
const NO_CATEGORY = '__none__';

interface LookupResponse {
  found: boolean;
  product?: { id: string } | null;
}

export interface MenuPanelProps {
  serviceName: string;
  categories: MenuCategory[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onPickItem: (item: MenuItem) => void;
  onDiscount: () => void;
  course: number;
  onCourseChange: (course: number) => void;
  seat: number | null;
  onSeatChange: (seat: number | null) => void;
  guestCount: number;
  disabled: boolean;
}

/**
 * The left two thirds of the register: category tiles on top, the items of the
 * chosen category underneath, with search and scan folded away until asked for.
 */
export function MenuPanel({
  serviceName,
  categories,
  loading,
  failed,
  onRetry,
  onPickItem,
  onDiscount,
  course,
  onCourseChange,
  seat,
  onSeatChange,
  guestCount,
  disabled,
}: MenuPanelProps) {
  const [categoryKey, setCategoryKey] = useState<string>(ALL);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const keyOf = (category: MenuCategory): string => category.id ?? NO_CATEGORY;

  const visible = useMemo(() => {
    const pool =
      categoryKey === ALL ? categories : categories.filter((category) => keyOf(category) === categoryKey);
    const items = pool.flatMap((category) => category.items);
    const text = query.trim().toLowerCase();
    if (!text) return items;
    return items.filter(
      (item) =>
        item.namePt.toLowerCase().includes(text) ||
        (item.nameEn ?? '').toLowerCase().includes(text) ||
        item.sku.toLowerCase().includes(text),
    );
  }, [categories, categoryKey, query]);

  const resolveCode = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;

    const local = categories
      .flatMap((category) => category.items)
      .find((item) => item.sku.toLowerCase() === value.toLowerCase());

    if (local) {
      setCode('');
      if (!local.available) {
        errorBeep();
        toast.error('Artigo indisponivel', local.namePt);
        return;
      }
      beep();
      onPickItem(local);
      return;
    }

    try {
      const result = await api.get<LookupResponse>('/api/products/lookup', { code: value });
      const productId = result.found ? result.product?.id : null;
      const menuItem = productId
        ? categories.flatMap((category) => category.items).find((item) => item.id === productId)
        : undefined;

      if (!menuItem) {
        errorBeep();
        toast.error('Produto nao encontrado', value);
        return;
      }
      setCode('');
      beep();
      onPickItem(menuItem);
    } catch {
      errorBeep();
      toast.error('Produto nao encontrado', value);
    }
  };

  useScanner({
    onScan: (scanned) => {
      void resolveCode(scanned);
    },
    enabled: !disabled,
    captureInInputs: true,
  });

  const seats = Array.from({ length: Math.max(guestCount, 1) }, (_, index) => index + 1);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="mr-auto truncate text-lg font-semibold text-foreground">{serviceName}</h1>

        <Select value={String(course)} onValueChange={(value) => onCourseChange(Number(value))}>
          <SelectTrigger aria-label="Prato por omissao" className="h-11 w-[9.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COURSES.map((value) => (
              <SelectItem key={value} value={String(value)}>
                {courseLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={seat === null ? 'none' : String(seat)}
          onValueChange={(value) => onSeatChange(value === 'none' ? null : Number(value))}
        >
          <SelectTrigger aria-label="Lugar por omissao" className="h-11 w-[8rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem lugar</SelectItem>
            {seats.map((value) => (
              <SelectItem key={value} value={String(value)}>
                Lugar {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={searchOpen ? 'secondary' : 'ghost'}
          size="icon"
          aria-label={searchOpen ? 'Fechar procura' : 'Procurar no menu'}
          aria-pressed={searchOpen}
          onClick={() => {
            setSearchOpen((open) => !open);
            if (searchOpen) setQuery('');
          }}
        >
          {searchOpen ? <X /> : <Search />}
        </Button>
      </header>

      {searchOpen && (
        <div className="shrink-0 border-b border-border bg-card px-4 py-3">
          <SearchInput
            autoFocus
            placeholder="Procurar no menu..."
            onSearch={setQuery}
            onValueChange={(value) => {
              if (!value) setQuery('');
            }}
          />
        </div>
      )}

      {scanOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-3">
          <Input
            ref={scanRef}
            autoFocus
            value={code}
            inputMode="numeric"
            placeholder="Codigo de barras"
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void resolveCode(code);
            }}
          />
          <Button variant="outline" onClick={() => void resolveCode(code)}>
            Procurar
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar codigo de barras"
            onClick={() => {
              setScanOpen(false);
              setCode('');
            }}
          >
            <X />
          </Button>
        </div>
      )}

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', disabled && 'pointer-events-none opacity-60')}>
        {loading ? (
          <TileGrid columns={4}>
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square min-h-[7rem] rounded-xl" />
            ))}
          </TileGrid>
        ) : failed ? (
          <EmptyState
            title="Nao foi possivel carregar o menu"
            description="Verifique a ligacao e tente novamente."
            action={{ label: 'Tentar novamente', onClick: onRetry }}
          />
        ) : (
          <div className="space-y-5">
            <TileGrid columns={4}>
              <CategoryTile
                name="Todos"
                subtitle={`${categories.reduce((sum, category) => sum + category.items.length, 0)} artigos`}
                color={colorForLabel('Todos')}
                icon={LayoutGrid}
                selected={categoryKey === ALL}
                onClick={() => setCategoryKey(ALL)}
              />
              {categories.map((category) => (
                <CategoryTile
                  key={keyOf(category)}
                  name={category.namePt}
                  count={category.items.length}
                  color={category.color ?? colorForLabel(category.namePt)}
                  selected={categoryKey === keyOf(category)}
                  onClick={() => setCategoryKey(keyOf(category))}
                />
              ))}
              <CategoryTile
                name="Scan"
                subtitle="Codigo de barras"
                color={colorForLabel('Scan')}
                icon={ScanLine}
                selected={scanOpen}
                onClick={() => {
                  setScanOpen((open) => !open);
                  setCode('');
                }}
              />
              <CategoryTile
                name="Descontos"
                subtitle="Aplicar a conta"
                color={colorForLabel('Descontos')}
                icon={Percent}
                onClick={onDiscount}
              />
            </TileGrid>

            {visible.length === 0 ? (
              <EmptyState
                size="sm"
                title={query ? 'Sem resultados' : 'Categoria sem artigos'}
                description={query ? `Nada corresponde a "${query}".` : undefined}
              />
            ) : (
              <TileGrid columns={4}>
                {visible.map((item) => (
                  <ProductTile
                    key={item.id}
                    name={item.namePt}
                    price={money(item.salePriceMinor)}
                    imageUrl={item.imageUrl}
                    color={item.tileColor ?? undefined}
                    disabled={!item.available}
                    soldOutLabel="Indisponivel"
                    onClick={() => onPickItem(item)}
                  />
                ))}
              </TileGrid>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default MenuPanel;
