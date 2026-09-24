# Payment Reconciliation (Kwikship)

Reconciles Kwikship's MIS payment file against the Kwikship Shipments API and your Schedule B
rate card: verifies payment method, delivery status, and zone, then recalculates the expected
forward/RTO/COD freight and GST to flag any discrepancy against what Kwikship actually billed.

Stack: **P**ostgres, **E**xpress, **R**eact, **N**ode — all TypeScript.

## How the numbers are calculated

Validated against 23,137 real rows from `Pokonut_AWB_July2026.xlsx`: **99.49% exact-paisa match**,
remainder within ₹0.47 (rounding noise). Re-run the check yourself any time:

```bash
cd server
npm run validate:formula -- "<path-to-mis-file.xlsx>" "<path-to-schedule-b.xlsx>"
```

Formula (`server/src/services/rateCalculator.ts`):
1. `weightMultiplier = ceil(weight / baseWeightSlab)` — weight slabs are 0.5kg.
2. `forwardFreight = weightMultiplier × rate[courierGroup][mode][Forward][zone]`
3. `rtoFreight = weightMultiplier × rate[courierGroup][mode][RTO][zone]` — only if the shipment is RTO.
4. `codCharge = MAX(codFlat, codPercent × collectableAmount)` — only if payment is COD **and** the
   shipment is *not* RTO (nothing was ever collected on an RTO, so no COD handling fee applies).
5. `grossFreight = forwardFreight + rtoFreight + codCharge`
6. `totalFreight = grossFreight × 1.18` (18% GST)

`courierGroup` is `BLUEDART` if the courier name is exactly "Bluedart" (parenthetical labels like
`"ALL (Except Bluedart)"` are correctly excluded), otherwise `ALL`.

## What gets verified against what

The Kwikship API has no single endpoint with everything needed, and no "mode" (Surface/Air/NDD)
field at all — so each input is taken from whichever source is authoritative for it:

| Field | Source of truth | Why |
|---|---|---|
| Order status, payment method, pincodes | `GET /api/v1/shipments/:awb` (API) | MIS is the thing being audited, not trusted blindly |
| Zone | Calculated from API pincodes + your uploaded zone reference | Zone disputes are the most common billing issue |
| Weight | API (`shipments/:awb` detail) | Ground truth; MIS-declared weight is compared against it and flagged if different |
| Transport mode (Surface/Air/NDD) | MIS file | The API does not expose this field at all |
| Freight amounts | Calculated from the above + your rate card | Compared against MIS's own reported freight to find the discrepancy |

Each reconciled row gets one headline `match_status` (`MATCHED`, `PAYMENT_MISMATCH`,
`STATUS_MISMATCH`, `ZONE_MISMATCH`, `WEIGHT_MISMATCH`, `FREIGHT_MISMATCH`, `NO_API_DATA`,
`RATE_NOT_FOUND`, `ZONE_NOT_FOUND`) plus individual boolean flags per dimension so the UI can
filter on any of them independently. Freight is only flagged as mismatched beyond a ₹1 tolerance
(rounding noise from the source data goes up to ₹0.47).

## Setup

### 1. Database

PostgreSQL 18 must already be running locally (installer default port 5432). Create a dedicated
database and user (don't reuse the `postgres` superuser):

```sql
CREATE DATABASE payment_reco;
CREATE USER payment_reco_app WITH PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE payment_reco TO payment_reco_app;
\c payment_reco
GRANT ALL ON SCHEMA public TO payment_reco_app;
```

### 2. Backend

```bash
cd server
cp .env.example .env
# edit .env: DATABASE_URL, KWIKSHIP_APP_ID, KWIKSHIP_APP_SECRET
npm install
npm run migrate
npm run dev
```

Server runs on http://localhost:4000.

Kwikship credentials: Dashboard → Admin → Account → API Keys.

### 3. Frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Opens on http://localhost:5173.

## Deploying the backend and database to Render

`render.yaml` defines a Postgres database and the API (`server/`). In Render: **New > Blueprint**, pick this
repo and the branch, then fill in the prompted values (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `KWIKSHIP_APP_ID`,
`KWIKSHIP_APP_SECRET`, `CLIENT_ORIGIN`). On every start the API runs the migrations (idempotent) and creates
the first admin if the users table is empty. Health check: `/api/health`.

- `NODE_ENV=production` makes the session cookie `Secure; SameSite=None` so a client on another host can log in.
  The client must therefore be served over HTTPS and its URL listed in `CLIENT_ORIGIN`.
- When the client is built, point it at the API: `VITE_API_BASE_URL=https://<your-api>.onrender.com/api`.
- The new database starts empty: re-upload the zone maps, rate card and shipment data from the app.

## Using the app

1. **Zone Reference** — upload your full pincode→zone file for each hub (Bangalore 560076,
   Pinjore 134102). Re-uploading a hub's file fully replaces its map.
2. **Rate Card** — upload Schedule B. Re-uploading deactivates the previous version and activates
   the new one for all future runs.
3. **Sync from Kwikship** *(needs API credentials)* — pick a date range covering the shipments in
   your MIS file and run the sync. This calls the shipments list endpoint, then the detail endpoint
   per AWB (chosen for completeness over speed) — expect it to take a while for large ranges. Date
   ranges over 30 days are automatically chunked to match the API's limit.

   **Upload Shipment Data** *(no API credentials needed)* — a manual alternative: export a
   "shipment report" from your Kwikship dashboard and upload it directly, same column format
   (AWB, Order Code, Shipper Name, Status, Weight, Payment Mode, Total Amount, City, State,
   Pincode, Pickup Address). Pickup pincode is automatically extracted from the end of the
   free-text "Pickup Address" field (e.g. `"...ghatiwala pinjore, 134102"` → `134102`), and Weight
   is auto-detected as grams vs kg (values above 20 are treated as grams). Both this and the API
   sync write into the same `shipments` table — reconciliation doesn't care which one populated a
   given AWB, and each result row records which source (`api` or `upload`) it came from.
4. **MIS Upload** — upload the Kwikship MIS payment file, then click "Run reconciliation".
5. **Reconciliation Runs** — view the summary, breakdown chart, filterable per-AWB table (click a
   row to expand the full forward/RTO/COD/GST breakdown), and export to CSV.

## Known limitations / things to revisit

- No authentication — this is built for local/internal use only. Add auth before exposing it
  beyond your own machine.
- The Kwikship API has no "mode" field, so transport mode for rate lookups always comes from the
  MIS file itself; it cannot be independently cross-checked the way status/payment/pincode can.
- `POST /api/sync` runs synchronously in the request; very large date ranges may need the server
  timeout (currently 15 minutes, see `server/src/server.ts`) raised further, or the endpoint moved
  to a background job if this becomes a regular pain point.
- GST is hardcoded at 18% in `rateCalculator.ts` — move it to the rate card table if it ever varies
  by courier or mode.
