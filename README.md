# POS

A multi-tenant Point of Sale system for **retail / supermarket**, **restaurant** and **online store**, sharing one backend for inventory, sales, analytics and users.

Built for small and medium businesses in Angola and Portuguese-speaking Africa: the interface is European Portuguese (pt-PT) by default with an English toggle, and the default currency is the Angolan Kwanza (AOA), with multi-currency support.

---

## Quick start

No Docker, no PostgreSQL server, no configuration. Local development runs on a SQLite file.

```bash
npm install
npm run setup     # env files, shared build, database, demo data
npm run dev       # API on :4000, web on :5173
```

Open <http://localhost:5173>. The seed prints login credentials; the super admin is `admin@pos.local` / `admin123`.

To reset and reseed at any point:

```bash
npm run db:reset
```

---

## What's in the box

| Module | Highlights |
|---|---|
| **Catalogue** | SKUs, multi-format barcodes, PT/EN names, hierarchical categories, images, per-product tax rates, cost vs. sale price |
| **Variants** | Size x colour matrix generation — one SKU, barcode and stock count per combination |
| **Weighted goods** | `weighted` products priced per kg, manual weight entry, and EAN-13 scale barcodes whose digits encode the weight or price |
| **Composites** | Bill of materials — selling a burger deducts bun, patty and cheese from stock |
| **Stock** | Goods receipt with cost capture, adjustments with reason codes, transfers, guided stocktakes, low-stock alerts, purchase orders |
| **Register** | Always-listening barcode capture, synthesised beep, split payments, hold & recall, line and order discounts, promo codes |
| **Receipts** | Digital only — on-screen, WhatsApp/email share, or the browser print dialog against a 80mm print stylesheet |
| **Restaurant** | Drag-and-drop floor plan, table status, modifiers, courses and straight-fire, kitchen display, split bills, tips |
| **Online store** | Public storefront, cart, checkout, order fulfilment, BOPIS, and real-time stock shared with the physical register |
| **Reporting** | P&L with COGS and margin, sales by category/product/staff/payment, hourly heatmap, dead stock, CSV and PDF export |
| **Loyalty** | Points, redemption, VIP tiers, store credit |
| **Platform** | JWT auth, server-enforced RBAC, immutable audit log, WebSocket sync, offline queue, PWA install |

---

## Architecture

```
packages/shared/     @pos/shared  the contract both sides import
  constants.ts       every string union (roles, statuses, payment methods) + socket event names
  permissions.ts     the permission list and the role -> permission matrix
  money.ts           integer-minor-unit arithmetic: computeLine, computeSale, allocate, margin
  barcode.ts         EAN-13 check digits, embedded weight/price parsing, scanner burst detection
  types.ts           the DTOs the API returns and the UI consumes

apps/api/            Express 4 + Prisma 6 + Socket.io (ESM)
  prisma/schema.prisma
  src/lib/           the shared services every module builds on
  src/modules/<x>/   one folder per domain, each exporting a router

apps/web/            React 18 + Vite + Tailwind + Radix
  src/lib/           api client, auth store, i18n, formatting, sound, offline queue
  src/components/ui/ the primitive library
  src/features/<x>/  one folder per screen area
```

### Three rules that hold the system together

**1. Money is never a float.** Every monetary value is an integer in the smallest currency unit — centimos. The database stores `BigInt`, the API serialises to `Number` (safe to 9×10¹⁵ centimos), and formatting happens at the last possible moment. Tax rates and percentage discounts are integers in **basis points**, so IVA 14% is `1400`. All arithmetic lives in `packages/shared/src/money.ts`, including a largest-remainder `allocate()` so a split bill always adds back up to the total.

**2. Stock only moves through one function.** Sales, refunds, receipts, adjustments, transfers, stocktakes and recipe consumption all call `applyStockChange()` in `apps/api/src/lib/inventory.ts`. It updates the per-location level, the denormalised rollups and writes an append-only `StockMovement` row. Nothing else is allowed to write a quantity, which is what makes the movement ledger a complete account of how a product reached its current count.

**3. Authorisation is server-side.** The UI hides what you cannot do, but every protected route calls `requirePermission(...)`, and permissions are recomputed from the user's *current* role on every request — so revoking access takes effect immediately rather than when the token expires. Cashiers never receive cost price, margin or COGS fields at all; they are stripped from the response, not hidden in CSS.

### Portable schema

The Prisma schema is written to run unchanged on **SQLite** (local development) and **PostgreSQL** (production): no Prisma enums, no scalar lists, no `Json` columns, no native type attributes. String unions live in `@pos/shared` instead, and JSON is stored as text. Switch providers with:

```bash
node scripts/set-db-provider.mjs postgresql
```

One consequence worth knowing: both engines treat `NULL`s as distinct inside a unique index, so tables that need "one row per product per optional variant" carry a `variantKey` column (`variantId ?? ''`) and the unique constraint uses that.

---

## The barcode scanner

A USB or Bluetooth scanner in HID mode is just a very fast keyboard — it types the barcode and presses Enter. There is no driver and no integration code.

`useScanner()` listens globally rather than depending on an input keeping focus, because focus wanders the moment a cashier touches anything. Human typing is filtered out by timing: nobody types a dozen characters with under 35ms between *every* keystroke.

Scale barcodes are handled by `parseScan()`. An EAN-13 starting with a GS1 restricted-distribution prefix (20–29) carries a local item code plus either a weight or a price; the exact layout differs between shops, so it is a per-entity rule in settings, defaulting to the common Portuguese/Angolan schemes.

The beep is synthesised with the Web Audio API rather than shipped as a file — nothing to download, nothing to cache, and no latency on a register that scans hundreds of items an hour.

---

## Offline mode

Internet in Angola is not a given, and a register that stops selling when the line drops is worse than no register at all.

The catalogue is mirrored into IndexedDB for lookups, and completed sales are queued locally and replayed when connectivity returns. Replay is safe because every queued sale carries an `idempotencyKey`: the server returns the already-posted sale rather than creating a second one. A sale the server permanently rejects is flagged for a human instead of blocking the queue behind it.

---

## Commands

| Command | Does |
|---|---|
| `npm run dev` | API and web together |
| `npm run build` | Build all three packages |
| `npm run typecheck` | TypeScript across the monorepo |
| `npm run db:push` | Apply the schema |
| `npm run db:seed` | Demo data |
| `npm run db:reset` | Drop, recreate, reseed |
| `npm run db:studio` | Prisma Studio |
| `npm test` | API tests |

---

## Production

```bash
cp .env.example .env     # set JWT_SECRET and the Postgres credentials
docker compose up -d --build
```

Brings up PostgreSQL, the API, an nginx-served web build, and a nightly `pg_dump` into `scripts/backup/` with 14-day retention.

`JWT_SECRET` is required and must be at least 32 characters — the API refuses to start in production without it.

---

## Hardware

Everything runs in a browser on a tablet or computer. There is no cash drawer, no receipt printer, no scale, no card terminal and no pole display.

The only physical hardware is a **USB or Bluetooth barcode scanner** in keyboard-emulation mode. Payments are recorded by selecting a method and confirming, weights are typed or read from a scale barcode, receipts are digital, and the kitchen display is just another browser tab.
