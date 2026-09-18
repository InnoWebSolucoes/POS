# Working in this repo

Multi-tenant POS (retail / restaurant / online store) for Angola. pt-PT and AOA first.
npm workspaces: `packages/shared`, `apps/api`, `apps/web`.

## Before changing anything

`packages/shared/src/` is the contract between the API and the web app. Changing `constants.ts`,
`permissions.ts`, `money.ts`, `barcode.ts` or `types.ts` ripples through both sides — read the consumers
first.

## Rules that are not negotiable

**Money is an integer in minor units (centimos).** Never a float, never a decimal string doing arithmetic.
The database stores `BigInt`, the API serialises with `Number()`, the UI formats with `money()` from
`apps/web/src/lib/format.ts`. Tax rates and percentage discounts are integers in **basis points**
(IVA 14% = `1400`). All the maths lives in `packages/shared/src/money.ts` — extend it there rather than
inlining a calculation.

**Stock moves only through `applyStockChange()`** in `apps/api/src/lib/inventory.ts` (or `consumeForSale()`,
which wraps it and handles composite recipes). Never write `InventoryLevel`, `Product.stockQuantity` or
`ProductVariant.stockQuantity` directly — the `StockMovement` ledger has to stay a complete account of how
a product reached its current quantity. Call `publishStockChanges()` **after** the transaction commits,
never inside it.

**Authorisation is enforced server-side.** Every protected route: `asyncHandler` + `requireAuth` +
`requirePermission(...)`, and every query filtered by `requireEntity(req)`. Hiding a button is not access
control. Cost price, margin and COGS are *stripped from the response* for roles without `product:cost` —
gate them with `canSeeCost(req)`.

**The audit log is append-only.** Write with `auditRequest()`. Never add an update or delete path for it.

## Conventions

- ESM everywhere. Relative imports in `apps/api` carry the `.js` extension; package imports do not.
- The Prisma schema must stay portable across SQLite and PostgreSQL: no Prisma `enum`, no scalar lists,
  no `Json` columns, no `@db.` native attributes, no raw SQL. String unions live in `@pos/shared`.
  Both engines treat `NULL` as distinct in a unique index — that is why `variantKey` exists.
- Quantities are `Float` and may be fractional (1.350 kg). Round with `round3()`.
- User-facing strings are European Portuguese written **without accents**, so the source stays ASCII-safe
  ("Produto nao encontrado.", "Stock insuficiente."). The whole codebase does this.
- Tailwind: use the semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`). Do not hardcode
  hexes or palette colours like `bg-gray-100`. The fixed `tile` palette is the one exception.
- Touch first: 44px minimum tap targets, and no interaction that depends on hover.
- Prices and quantities render in monospace with tabular numerals (`.tabular`) so columns line up.

## Layout

```
apps/api/src/lib/        shared services: http, middleware, prisma, inventory, sequence, audit,
                         realtime, settings, uploads
apps/api/src/modules/x/  one folder per domain, each exporting a default router mounted in app.ts
apps/web/src/lib/        api client, auth store, i18n, format, sound, offline queue, theme
apps/web/src/components/ ui/ (primitives) and layout/ (shells)
apps/web/src/features/x/ one folder per screen area
```

## Commands

```bash
npm run dev          # api :4000 + web :5173
npm run typecheck    # all three packages
npm run db:reset     # drop, push, reseed
```

Local dev is SQLite (`apps/api/prisma/dev.db`); production is PostgreSQL via `docker compose`.
Swap with `node scripts/set-db-provider.mjs postgresql`.
