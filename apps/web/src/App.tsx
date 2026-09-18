import { Suspense, lazy, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ROLE_HOME, type Permission } from '@pos/shared';

import { useAuth } from './lib/auth-store';
import { configureFormatting } from './lib/format';
import { useTheme } from './lib/theme';
import { connectSocket, disconnectSocket } from './lib/socket';
import { setLocale, storedLocale } from './lib/i18n';
import { Spinner } from './components/ui/spinner';
import { Toaster } from './components/ui/toaster';

/* ---------------------------------------------------------------- shells -- */
import AppShell from './components/layout/app-shell';
import PosShell from './components/layout/pos-shell';

/* ----------------------------------------------------------------- pages -- */
const LoginPage = lazy(() => import('./features/auth/login-page'));
const PinLoginPage = lazy(() => import('./features/auth/pin-login-page'));
const RegisterPage = lazy(() => import('./features/auth/register-page'));

const DashboardPage = lazy(() => import('./features/dashboard/dashboard-page'));

const PosPage = lazy(() => import('./features/pos/pos-page'));
const ReturnsPage = lazy(() => import('./features/pos/returns-page'));

const FloorPlanPage = lazy(() => import('./features/restaurant/floor-plan-page'));
const FloorPlanEditorPage = lazy(() => import('./features/restaurant/floor-plan-editor-page'));
const OrderPage = lazy(() => import('./features/restaurant/order-page'));
const RestaurantOrdersPage = lazy(() => import('./features/restaurant/orders-page'));

const KdsPage = lazy(() => import('./features/kds/kds-page'));

const ProductsPage = lazy(() => import('./features/catalog/products-page'));
const ProductEditorPage = lazy(() => import('./features/catalog/product-editor-page'));
const CategoriesPage = lazy(() => import('./features/catalog/categories-page'));
const ModifiersPage = lazy(() => import('./features/catalog/modifiers-page'));

const InventoryPage = lazy(() => import('./features/inventory/inventory-page'));
const ReceiveStockPage = lazy(() => import('./features/inventory/receive-stock-page'));
const StockAdjustPage = lazy(() => import('./features/inventory/stock-adjust-page'));
const StockTakePage = lazy(() => import('./features/inventory/stock-take-page'));
const MovementsPage = lazy(() => import('./features/inventory/movements-page'));
const TransfersPage = lazy(() => import('./features/inventory/transfers-page'));

const SuppliersPage = lazy(() => import('./features/suppliers/suppliers-page'));
const PurchaseOrdersPage = lazy(() => import('./features/suppliers/purchase-orders-page'));

const TransactionsPage = lazy(() => import('./features/sales/transactions-page'));
const SaleDetailPage = lazy(() => import('./features/sales/sale-detail-page'));

const CustomersPage = lazy(() => import('./features/customers/customers-page'));
const CustomerDetailPage = lazy(() => import('./features/customers/customer-detail-page'));

const PromotionsPage = lazy(() => import('./features/promotions/promotions-page'));

const ReportsPage = lazy(() => import('./features/reports/reports-page'));
const ProfitLossPage = lazy(() => import('./features/reports/profit-loss-page'));

const SettingsPage = lazy(() => import('./features/settings/settings-page'));
const UsersPage = lazy(() => import('./features/users/users-page'));
const AuditLogPage = lazy(() => import('./features/settings/audit-log-page'));

const OnlineOrdersPage = lazy(() => import('./features/online/online-orders-page'));
const EntitiesPage = lazy(() => import('./features/admin/entities-page'));

const StorefrontPage = lazy(() => import('./features/storefront/storefront-page'));
const StorefrontProductPage = lazy(() => import('./features/storefront/storefront-product-page'));
const StorefrontCartPage = lazy(() => import('./features/storefront/storefront-cart-page'));
const StorefrontCheckoutPage = lazy(() => import('./features/storefront/storefront-checkout-page'));
const StorefrontOrderPage = lazy(() => import('./features/storefront/storefront-order-page'));

/* ------------------------------------------------------------------------- */

function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-background">
      <Spinner className="size-8" />
    </div>
  );
}

function RequireAuth({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: Permission;
}) {
  const status = useAuth((s) => s.status);
  const can = useAuth((s) => s.can);
  const user = useAuth((s) => s.user);
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (permission && !can(permission)) {
    // Send them somewhere they are actually allowed to be, rather than a wall.
    return <Navigate to={user ? ROLE_HOME[user.role] : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  if (status === 'loading') return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role]} replace />;
}

/**
 * The catch-all deliberately renders instead of redirecting.
 *
 * Sending an unknown path back to the role's home screen looks tidy until that
 * home screen is itself a path that does not resolve - then the router bounces
 * between the two forever and the user just sees a white page with no error.
 * A dead end that says so is far easier to diagnose than a silent loop.
 */
function NotFoundPage() {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;

  const home = user ? ROLE_HOME[user.role] : '/login';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-6xl font-semibold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold text-foreground">Pagina nao encontrada</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        O endereco <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{location.pathname}</code>{' '}
        nao corresponde a nenhuma pagina.
      </p>
      <Link
        to={home}
        className="mt-2 inline-flex min-h-touch items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        Voltar ao inicio
      </Link>
    </div>
  );
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const status = useAuth((s) => s.status);
  const entity = useAuth((s) => s.entity);
  const applyBrand = useTheme((s) => s.applyBrand);

  useEffect(() => {
    void bootstrap();
    setLocale(storedLocale());
  }, [bootstrap]);

  // Entity branding, currency and locale drive formatting everywhere.
  useEffect(() => {
    if (!entity) return;
    configureFormatting(entity.currency, entity.locale);
    applyBrand(entity.accentColor);
  }, [entity, applyBrand]);

  useEffect(() => {
    if (status === 'authenticated') connectSocket();
    else disconnectSocket();
  }, [status]);

  return (
    <>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pin" element={<PinLoginPage />} />
          <Route path="/registar" element={<RegisterPage />} />

          {/* Customer-facing storefront - no staff login required */}
          <Route path="/loja/:entitySlug" element={<StorefrontPage />} />
          <Route path="/loja/:entitySlug/produto/:productId" element={<StorefrontProductPage />} />
          <Route path="/loja/:entitySlug/carrinho" element={<StorefrontCartPage />} />
          <Route path="/loja/:entitySlug/checkout" element={<StorefrontCheckoutPage />} />
          <Route path="/loja/:entitySlug/encomenda/:orderNumber" element={<StorefrontOrderPage />} />

          {/* Full-screen tablet surfaces: their own chrome, no sidebar */}
          <Route
            path="/pos"
            element={
              <RequireAuth permission="sale:create">
                <PosShell>
                  <PosPage />
                </PosShell>
              </RequireAuth>
            }
          />
          <Route
            path="/pos/devolucoes"
            element={
              <RequireAuth permission="sale:refund">
                <PosShell>
                  <ReturnsPage />
                </PosShell>
              </RequireAuth>
            }
          />
          <Route
            path="/restaurante/sala"
            element={
              <RequireAuth permission="restaurant:table">
                <PosShell>
                  <FloorPlanPage />
                </PosShell>
              </RequireAuth>
            }
          />
          <Route
            path="/restaurante/sala/editor"
            element={
              <RequireAuth permission="restaurant:floorplan">
                <PosShell>
                  <FloorPlanEditorPage />
                </PosShell>
              </RequireAuth>
            }
          />
          <Route
            path="/restaurante/mesa/:tableId"
            element={
              <RequireAuth permission="restaurant:order">
                <PosShell>
                  <OrderPage />
                </PosShell>
              </RequireAuth>
            }
          />
          <Route
            path="/restaurante/pedido/:orderId"
            element={
              <RequireAuth permission="restaurant:order">
                <PosShell>
                  <OrderPage />
                </PosShell>
              </RequireAuth>
            }
          />
          <Route
            path="/restaurante/pedidos"
            element={
              <RequireAuth permission="restaurant:order">
                <PosShell>
                  <RestaurantOrdersPage />
                </PosShell>
              </RequireAuth>
            }
          />
          <Route
            path="/kds"
            element={
              <RequireAuth permission="restaurant:kds">
                <KdsPage />
              </RequireAuth>
            }
          />

          {/* Back office */}
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/produtos" element={<ProductsPage />} />
            <Route path="/produtos/novo" element={<ProductEditorPage />} />
            <Route path="/produtos/:productId" element={<ProductEditorPage />} />
            <Route path="/categorias" element={<CategoriesPage />} />
            <Route path="/opcoes" element={<ModifiersPage />} />

            <Route path="/stock" element={<InventoryPage />} />
            <Route path="/stock/entrada" element={<ReceiveStockPage />} />
            <Route path="/stock/ajuste" element={<StockAdjustPage />} />
            <Route path="/stock/inventario" element={<StockTakePage />} />
            <Route path="/stock/movimentos" element={<MovementsPage />} />
            <Route path="/stock/transferencias" element={<TransfersPage />} />

            <Route path="/fornecedores" element={<SuppliersPage />} />
            <Route path="/encomendas" element={<PurchaseOrdersPage />} />

            <Route path="/transaccoes" element={<TransactionsPage />} />
            <Route path="/transaccoes/:saleId" element={<SaleDetailPage />} />

            <Route path="/clientes" element={<CustomersPage />} />
            <Route path="/clientes/:customerId" element={<CustomerDetailPage />} />

            <Route path="/promocoes" element={<PromotionsPage />} />

            <Route path="/relatorios" element={<ReportsPage />} />
            <Route path="/relatorios/resultados" element={<ProfitLossPage />} />

            <Route path="/loja-online/encomendas" element={<OnlineOrdersPage />} />

            <Route path="/utilizadores" element={<UsersPage />} />
            <Route path="/definicoes" element={<SettingsPage />} />
            <Route path="/definicoes/auditoria" element={<AuditLogPage />} />

            <Route path="/admin/entidades" element={<EntitiesPage />} />
          </Route>

          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}
