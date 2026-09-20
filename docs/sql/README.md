# The database

47 tables. This document lists every one, what it is for, and **which screen creates rows in it** — so
you can trace any "add" button in the product down to the table it writes.

## The files here

| File | What it is |
|---|---|
| `schema.postgres.sql` | Complete PostgreSQL DDL — 47 tables, 81 indexes, 100 foreign keys |
| `schema.sqlite.sql` | The same schema for SQLite, which is what local development runs on |
| `../../apps/api/prisma/migrations/20260920000000_init/migration.sql` | The same PostgreSQL DDL as a versioned Prisma migration |

The source of truth is `apps/api/prisma/schema.prisma`. These files are generated from it — never edit
them by hand, or the next generation will silently discard your change. To regenerate after a schema
change:

```bash
npm run db:sql
```

## Applying it

**Local development** — nothing to install, SQLite from a file:

```bash
npm run db:push          # applies schema.prisma directly
npm run db:seed          # demo data
```

**Production** — PostgreSQL with versioned migrations:

```bash
node scripts/set-db-provider.mjs postgresql
# set DATABASE_URL in .env
npm run db:deploy        # prisma migrate deploy
```

Or apply the DDL straight to a database with no Prisma involved at all:

```bash
psql "$DATABASE_URL" -f docs/sql/schema.postgres.sql
```

---

## Every table, and what adds to it

### Tenancy and identity

| Table | Holds | Created by |
|---|---|---|
| `Entity` | One client business. Its `mode` (retail / restaurant / online) reshapes the whole product. | Self-service signup at `/registar`, or the operator's **Novo cliente** wizard |
| `Location` | A shop, warehouse or dining room. Stock is held per location. | Created with the entity; more via **Definicoes → Localizacoes** |
| `User` | A staff account. `permissionOverrides` holds the per-member tuning on top of the role. | **Utilizadores → Novo utilizador** |
| `RefreshToken` | Hashed refresh tokens, so a database leak cannot resume sessions. | Written on every login; never touched by a person |
| `Sequence` | Atomic counters for document numbers, so two registers cannot mint the same receipt. | Written by the server; never by a person |
| `Setting` | One row per configuration key, so two managers editing different options cannot clobber each other. | **Definicoes** |
| `AuditLog` | Append-only record of every significant action. Nothing in the codebase updates or deletes a row. | Written by the server on every mutation |
| `Notification` | Low-stock and operational alerts. | Raised by the server |

### Catalogue

| Table | Holds | Created by |
|---|---|---|
| `Category` | Hierarchical tree — Bebidas → Refrigerantes → Coca-Cola. | **Categorias → Nova categoria** |
| `Product` | The catalogue. `type` decides behaviour: standard, weighted, composite, service. | **Produtos → Novo produto** |
| `ProductImage` | Multiple photos per product; the first is the primary. | Product editor, **Imagens** tab (drag-drop, file picker, or phone camera) |
| `ProductVariant` | One row per size × colour combination, each its own SKU, barcode and stock. | Product editor, **Variantes** tab — the matrix builder |
| `RecipeComponent` | Bill of materials. Selling a burger consumes bun, patty and cheese. | Product editor, **Receita** tab |
| `ModifierGroup` | "Escolha a proteina", "Extras", "Retirar". | **Opcoes → Novo grupo** |
| `Modifier` | One choice inside a group, with its price delta. | **Opcoes**, inside a group |
| `ProductModifierGroup` | Attaches a modifier group to a menu item. | Product editor, **Restaurante** tab |
| `Supplier` | Who you buy from. | **Fornecedores → Novo fornecedor** |
| `Promotion` | Coupons and automatic discounts, including buy-X-get-Y. | **Promocoes → Nova promocao** |

### Stock

Nothing writes a quantity directly. Every one of these goes through `applyStockChange()`, which is what
keeps `StockMovement` a complete account of how a product reached its current count.

| Table | Holds | Created by |
|---|---|---|
| `InventoryLevel` | Current quantity per product per variant per location. `variantKey` exists because both engines treat NULL as distinct in a unique index. | Server, on every stock change |
| `StockMovement` | The append-only ledger — receipt, sale, refund, adjustment, transfer, stocktake, waste. | Server, on every stock change |
| `StockBatch` | Cost layers for FIFO costing and expiry tracking. | **Stock → Entrada de stock** |
| `StockReceipt` / `StockReceiptLine` | Goods arriving from a supplier, with the cost captured per line. | **Stock → Entrada de stock** |
| `StockTake` / `StockTakeLine` | A guided physical count and its variances. | **Stock → Inventario** |
| `StockTransfer` / `StockTransferLine` | Moving stock between locations. | **Stock → Transferencias** |
| `PurchaseOrder` / `PurchaseOrderLine` | Ordering from a supplier; can be generated from everything below its minimum. | **Encomendas → Nova encomenda** |

### Selling

| Table | Holds | Created by |
|---|---|---|
| `Sale` | One completed transaction. `cogsMinor` is frozen at the moment of sale so later cost changes cannot rewrite history. | The register (`/pos`), the restaurant check, and confirmed online payments |
| `SaleLine` | A line on a receipt, denormalised so editing a product never changes a past receipt. | With the sale |
| `Payment` | One row per method — a split payment is several rows against one sale. | With the sale |
| `Refund` / `RefundLine` | Returns, with a reason per line and whether it went back on the shelf. | **Devolucoes** |

### Restaurant

| Table | Holds | Created by |
|---|---|---|
| `FloorArea` | A room — Sala Principal, Esplanada — with its canvas size. | **Plano de sala → Editar disposicao** |
| `RestaurantTable` | A table: shape, position, rotation, seats, status. | The floor plan editor (drag and drop) |
| `Order` | An open check on a table. | Opening a table on the floor plan |
| `OrderItem` | A dish on the check, with modifiers, course and seat. | Tapping a menu tile |
| `KitchenTicket` | What the kitchen sees, grouped by prep station. | **Enviar** — the blue button on the check |

### Online store

| Table | Holds | Created by |
|---|---|---|
| `Cart` / `CartItem` | A shopper's basket. Guests key by session, customers by account. | The storefront |
| `WishlistItem` | Saved products. | The storefront |
| `ShippingAddress` | Where an order goes. | Checkout |
| `OnlineOrder` / `OnlineOrderLine` | A web order through its fulfilment lifecycle. Stock is deducted on confirmed payment, not at cart-add. | Storefront checkout |

### Customers

| Table | Holds | Created by |
|---|---|---|
| `Customer` | The CRM record, lifetime spend, points, tier, store credit. | **Clientes → Novo cliente**, or at the register during a sale |
| `LoyaltyTransaction` | The points ledger — earn, redeem, adjust, expire — with a running balance. | Earned automatically on a sale; adjusted in **Clientes → Fidelizacao** |

---

## Conventions worth knowing before you write SQL against this

**Money is an integer.** Every `*Minor` column is `BIGINT`, in centimos. There are no decimals and no
floats anywhere near a price. `salePriceMinor = 120000` is 1 200,00 Kz. Tax rates and percentage
discounts are integers in basis points, so `taxRateBps = 1400` is 14%.

**Quantities are `DOUBLE PRECISION`,** because weighted goods sell as 1.350 kg.

**No enums.** Every status is `TEXT`, with the permitted values defined in
`packages/shared/src/constants.ts`. This is what lets one schema file run on both SQLite and
PostgreSQL. If you add a status, add it there, not to the database.

**No `JSON` columns.** Anything structured is `TEXT` holding JSON — `altBarcodes`, `modifiers`,
`taxBreakdown`, `permissionOverrides`, `AuditLog.details`. Same reason.

**Soft deletes.** Tables with `deletedAt` are never hard-deleted. Always filter `WHERE "deletedAt" IS
NULL` or you will resurrect removed products in your reports.

**Tenancy.** Almost every table carries `entityId`. Any query you write by hand must filter on it —
the application enforces this in middleware, but raw SQL bypasses that entirely.
