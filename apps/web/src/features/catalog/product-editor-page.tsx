import * as React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';

import { ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { qk } from '@/lib/query';
import {
  Badge,
  Button,
  ConfirmDialog,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@/components/ui';
import { catalogApi, invalidateProducts, type ProductFull } from './catalog-api';
import {
  useCategoriesQuery,
  useModifierGroupsQuery,
  useSuppliersQuery,
  useTaxRatesQuery,
} from './catalog-hooks';
import { CatalogPage, FormError, NoAccess, QueryError } from './components/catalog-page';
import { CodigosTab } from './editor/codigos-tab';
import { GeralTab } from './editor/geral-tab';
import { ImagensTab } from './editor/imagens-tab';
import { OnlineTab } from './editor/online-tab';
import { PrecosTab } from './editor/precos-tab';
import { ReceitaTab } from './editor/receita-tab';
import { RestauranteTab } from './editor/restaurante-tab';
import { StockTab } from './editor/stock-tab';
import { VariantesTab } from './editor/variantes-tab';
import {
  emptyForm,
  formFromProduct,
  tabForField,
  toPayload,
  useProductForm,
  validate,
} from './editor/use-product-form';

/** Turns ApiRequestError.details into the flat map the tabs read. */
function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError) || !error.details) return {};
  const out: Record<string, string> = {};
  for (const [path, messages] of Object.entries(error.details)) {
    const first = messages[0];
    if (first) out[path] = first;
  }
  return out;
}

export default function ProductEditorPage() {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const [searchParams] = useSearchParams();

  const can = useAuth((state) => state.can);
  const entity = useAuth((state) => state.entity);
  const canRead = can('product:read');
  const canWrite = can('product:write');
  const canSeeCost = can('product:cost');
  const canSeeSuppliers = can('supplier:read');

  const creating = !productId;

  const productQuery = useQuery({
    queryKey: qk.product(productId ?? ''),
    queryFn: () => catalogApi.getProduct(productId as string),
    enabled: canRead && Boolean(productId),
  });

  const categoriesQuery = useCategoriesQuery(true);
  const suppliersQuery = useSuppliersQuery();
  const taxRatesQuery = useTaxRatesQuery();
  const modifierGroupsQuery = useModifierGroupsQuery(canRead);

  const defaultTaxRateBps =
    taxRatesQuery.data?.defaultTaxRateBps ?? entity?.defaultTaxRateBps ?? 0;

  const { form, patch, reset, dirty } = useProductForm(
    emptyForm({
      taxRateBps: defaultTaxRateBps,
      barcode: searchParams.get('barcode') ?? undefined,
    }),
  );

  const [tab, setTab] = React.useState('geral');
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const loadedId = React.useRef<string | null>(null);

  // Fill the form once the product arrives, and again after a save replaces it.
  React.useEffect(() => {
    const product = productQuery.data;
    if (!product) return;
    if (loadedId.current === product.id && dirty) return;
    loadedId.current = product.id;
    reset(formFromProduct(product));
  }, [productQuery.data, reset, dirty]);

  // A brand-new product starts on the entity's default tax rate - applied once,
  // so a later refetch never overwrites what the user chose.
  const taxDefaultApplied = React.useRef(false);
  React.useEffect(() => {
    if (!creating || taxDefaultApplied.current || !taxRatesQuery.data) return;
    taxDefaultApplied.current = true;
    patch({ taxRateBps: taxRatesQuery.data.defaultTaxRateBps });
  }, [creating, taxRatesQuery.data, patch]);

  const product: ProductFull | null = productQuery.data ?? null;

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form, canSeeCost);
      return product
        ? catalogApi.updateProduct(product.id, payload)
        : catalogApi.createProduct(payload);
    },
    onSuccess: (saved) => {
      setServerErrors({});
      invalidateProducts(saved.id);
      reset(formFromProduct(saved));
      loadedId.current = saved.id;
      toast.success(creating ? 'Produto criado' : 'Produto guardado', saved.namePt);
      if (creating) navigate(`/produtos/${saved.id}`, { replace: true });
    },
    onError: (error) => {
      const errors = fieldErrors(error);
      setServerErrors(errors);
      const firstPath = Object.keys(errors)[0];
      if (firstPath) setTab(tabForField(firstPath));
    },
  });

  const remove = useMutation({
    mutationFn: () => catalogApi.deleteProduct(product?.id ?? ''),
    onSuccess: () => {
      invalidateProducts(product?.id);
      toast.success('Produto eliminado');
      navigate('/produtos');
    },
    onError: (error) =>
      toast.error(
        'Nao foi possivel eliminar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      ),
  });

  const validation = validate(form);
  const errors = { ...(submitted ? validation.errors : {}), ...serverErrors };

  const submit = () => {
    setSubmitted(true);
    const result = validate(form);
    if (Object.keys(result.errors).length > 0) {
      if (result.firstTab) setTab(result.firstTab);
      toast.warning('Faltam dados', 'Corrija os campos assinalados antes de guardar.');
      return;
    }
    save.mutate();
  };

  if (!canRead) return <NoAccess what="este produto" />;

  if (productQuery.isError) {
    return (
      <CatalogPage title="Produto" breadcrumbs={[{ label: 'Produtos', to: '/produtos' }]}>
        <QueryError
          error={productQuery.error}
          onRetry={() => void productQuery.refetch()}
          title="Nao foi possivel carregar o produto"
        />
      </CatalogPage>
    );
  }

  if (productQuery.isLoading) {
    return (
      <CatalogPage title="A carregar..." breadcrumbs={[{ label: 'Produtos', to: '/produtos' }]}>
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </CatalogPage>
    );
  }

  // Restaurante and Online stay visible in every mode: a retail shop still sells
  // online, and the quick grid lives on the restaurant tab. Only the recipe is
  // genuinely meaningless outside a composite product.
  const showRecipe = form.type === 'composite';
  const showRestaurant = true;
  const showOnline = true;

  return (
    <CatalogPage
      title={creating ? 'Novo produto' : form.namePt || 'Produto'}
      breadcrumbs={[
        { label: 'Produtos', to: '/produtos' },
        { label: creating ? 'Novo' : form.namePt || 'Produto' },
      ]}
      description={
        product ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular">{product.sku}</span>
            {!product.active && (
              <Badge variant="muted" size="sm">
                Inactivo
              </Badge>
            )}
            {dirty && (
              <Badge variant="warning" size="sm" dot>
                Alteracoes por guardar
              </Badge>
            )}
          </span>
        ) : (
          'Preencha o essencial no separador Geral; o resto pode ficar para depois.'
        )
      }
      actions={
        <>
          <Button variant="ghost" leftIcon={<ArrowLeft />} onClick={() => navigate('/produtos')}>
            Voltar
          </Button>
          {canWrite && product && (
            <Button
              variant="outline"
              leftIcon={<Trash2 />}
              onClick={() => setConfirmDelete(true)}
            >
              Eliminar
            </Button>
          )}
          {canWrite && (
            <Button
              leftIcon={<Save />}
              onClick={submit}
              loading={save.isPending}
              loadingLabel="A guardar..."
            >
              Guardar
            </Button>
          )}
        </>
      }
    >
      {save.isError && <FormError error={save.error} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="underline">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="precos">Precos</TabsTrigger>
          <TabsTrigger value="codigos">Codigos</TabsTrigger>
          <TabsTrigger value="imagens">Imagens</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="variantes">Variantes</TabsTrigger>
          {showRecipe && <TabsTrigger value="receita">Receita</TabsTrigger>}
          {showRestaurant && <TabsTrigger value="restaurante">Restaurante</TabsTrigger>}
          {showOnline && <TabsTrigger value="online">Online</TabsTrigger>}
        </TabsList>

        <TabsContent value="geral">
          <GeralTab
            form={form}
            patch={patch}
            errors={errors}
            categories={categoriesQuery.data ?? []}
          />
        </TabsContent>

        <TabsContent value="precos">
          <PrecosTab
            form={form}
            patch={patch}
            errors={errors}
            taxRates={taxRatesQuery.data?.rates ?? []}
            canSeeCost={canSeeCost}
            pricingMode={entity?.pricingMode ?? 'inclusive'}
          />
        </TabsContent>

        <TabsContent value="codigos">
          <CodigosTab form={form} patch={patch} errors={errors} />
        </TabsContent>

        <TabsContent value="imagens">
          <ImagensTab form={form} patch={patch} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="stock">
          <StockTab
            form={form}
            patch={patch}
            errors={errors}
            suppliers={suppliersQuery.data ?? []}
            canSeeSuppliers={canSeeSuppliers}
            product={product}
          />
        </TabsContent>

        <TabsContent value="variantes">
          <VariantesTab product={product} canWrite={canWrite} canSeeCost={canSeeCost} />
        </TabsContent>

        {showRecipe && (
          <TabsContent value="receita">
            <ReceitaTab
              form={form}
              patch={patch}
              errors={errors}
              product={product}
              canWrite={canWrite}
              canSeeCost={canSeeCost}
            />
          </TabsContent>
        )}

        {showRestaurant && (
          <TabsContent value="restaurante">
            <RestauranteTab
              form={form}
              patch={patch}
              modifierGroups={modifierGroupsQuery.data ?? []}
              modifierGroupsLoading={modifierGroupsQuery.isLoading}
            />
          </TabsContent>
        )}

        {showOnline && (
          <TabsContent value="online">
            <OnlineTab
              form={form}
              patch={patch}
              errors={errors}
              entitySlug={entity?.slug ?? null}
            />
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Eliminar "${form.namePt}"?`}
        description="O produto deixa de aparecer na caixa e no catalogo. O historico de vendas mantem-se."
        confirmLabel="Eliminar"
        onConfirm={() => remove.mutate()}
      />
    </CatalogPage>
  );
}
