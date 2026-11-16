# Plasgain Pricing Analysis

Standalone, local-first Next.js application for one-time customer pricing review. It does not connect to the Sales Intelligence database and has no Ostendo write operation.

## Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and set the values below. Use a dedicated Ostendo API key limited to read permissions where the ERP supports it.
3. Run `npm run dev` and open `http://localhost:3000`.
4. Sign in with `APP_PASSWORD`, upload `UCS_Customer_Price_List_Final.xlsx`, review validation, and start extraction.
5. Leave the browser open while batches run. If interrupted, use **Resume extraction**. The previous complete dataset stays active until a new extraction finishes.
6. Review historical prices, edit each customer/item discount, approve and lock individual values, then download the XLSX workbook from **Export**.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `APP_PASSWORD` | At least 8 characters; signs the HTTP-only application session. |
| `OSTENDO_API_URL` | `https://plasgain.southeastit.com.au:8843` (the verified host and port are enforced in code). |
| `OSTENDO_API_KEY` | Server-only Ostendo key. Never put it in browser code or source control. |
| `DATA_DIR` | Directory for the persistent JSON snapshot and reviewed discounts; defaults to `./data`. Back it up. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire Firebase service account JSON; sensitive, server-only. Enables Firestore storage on Vercel or locally. |
| `FIREBASE_PROJECT_ID` | For local Google Application Default Credentials or emulator use. Not needed with service account JSON. |
| `DATABASE_URL` | Optional alternative: serverless Postgres connection string. Firebase takes precedence when configured. |

Run `npm test` for workbook parsing, dates, calculations and XLSX creation; run `npm run build` for a production build. Production serving uses `npm start` after the build.

## Verified Ostendo integration

Inspected the existing private `travismaher2241/SalesIntelligence` repository, specifically `api/ostendo/client.ts` and `api/ostendo/sync.ts`, without changing it. Its client uses HTTPS `GET /tabledata` with query parameters `configuration=0`, `tablename`, `apikey`, `format=json`, and an optional percent-encoded `condition`; it rejects off-host redirects. Its sync reads `CUSTOMERMASTER`, `SALESINVOICEHEADER` and `SALESINVOICELINES`. Customer codes are `CUSTOMER`; invoice identification is `INVOICENUMBER`; dates are `INVOICEDATE`; item codes are `LINECODE`; quantities are `INVOICEQTY`; GST-exclusive AUD line value is `LOCALEXTENDEDNETTPRICE`. It documents `LOCALINVOICENETTAMOUNT` and `LOCALINVOICEFREIGHTAMOUNT` for header reconciliation. The repository reports that an unfiltered customer query returned 860 rows, that ISO single-day invoice date equality works, and that invoice-number equality works for lines. It contains no verified general pagination parameter, so this application does not invent one.

The extraction queries one day at a time within the rolling 12-month window, then queries lines per invoice number. All line queries are bounded to invoices found in the window. The code rejects large single responses (500 headers or lines, 5,000 customers) rather than silently accepting a likely cap. This is a conservative guard, not a substitute for a verified Ostendo count or pagination contract. If the ERP has a lower undocumented response cap, completeness must be checked against source counts before business use. A failed query leaves the draft paused and does not replace the prior complete dataset.

All ERP calls are in `lib/ostendo.ts`. That module hard-codes the three allowed tables and the `GET` method. Callers cannot supply a table or operation name from the browser. There are no POST, PUT, PATCH or DELETE requests to Ostendo. Application imports, discounts and approvals are written only to `DATA_DIR`. A read-only Ostendo account/key should still be configured as a second control; its permission scope could not be checked without live access.

## Pricing logic and limits

- Source products come from row 6 onward, with headings on row 5. Original item-code text, including leading zeros when stored as text or a zero-mask numeric format, is preserved. Duplicate and invalid codes remain visible and block extraction.
- The window begins on the same calendar date 12 months before extraction and ends on the extraction date in Australia/Sydney. Headers are independently checked against the requested day.
- Credit documents, reversed/cancelled headers, and lines with nonpositive quantity or value are excluded from genuine purchases. Duplicate invoice line numbers cause the extraction to stop.
- An invoice's local net amount must reconcile to all local net line amounts plus freight within AUD 0.05. Unreconciled invoice lines are excluded and listed as exceptions because an invoice-level adjustment cannot safely be assigned to products.
- A qualifying price is `LOCALEXTENDEDNETTPRICE / INVOICEQTY`. The latest eligible date, then invoice number, then line number determines the last price. Distinct invoice numbers determine frequency. No sale in the window remains explicitly blank.
- Master price is UCS price × 1.35. Historical implied discount is `(1 − last price / master price) × 100`. Proposed selling price is `master price × (1 − entered discount / 100)`. An implied discount is never approved automatically. Negative implied discounts are retained.

The application has not been connected to live Ostendo in this workspace, so field meanings and price calculations have not yet been checked against selected original invoices. Before approving the final pricing structure, reconcile several known invoices, including a freight invoice, a credit, and an invoice with a discount, against the Ostendo screen. Confirm that all expected customer and invoice counts are present. The **Exceptions & Validation** sheet records excluded or questionable records.

## Hosting and data retention

For local development without Firebase or `DATABASE_URL`, the app uses `DATA_DIR` and runs as a single instance. On Vercel, configure Firebase Firestore (recommended below) or the existing Postgres alternative. Temporary Vercel files cannot retain pricing reviews.

### Firebase setup on Vercel

1. Sign in at https://console.firebase.google.com/ using your Google account and create or select a project. This does not change the app's password sign-in to Google sign-in.
2. Open **Build → Firestore Database → Create database**. Choose **Standard edition**, the **(default)** database, a suitable region, and **Production mode**. Keep browser/client access denied; this app accesses Firestore only through its authenticated server routes.
3. Open **Project settings → Service accounts → Firebase Admin SDK → Generate new private key**. Download the JSON securely. This key gives server access to your project; never commit it, upload it to the app, or send it in chat.
4. In **Vercel → Project → Settings → Environment Variables**, add **FIREBASE_SERVICE_ACCOUNT_JSON** as a **Sensitive** variable for **Production**. Paste the **entire contents of the downloaded JSON file**, not the filename or the Firebase browser API key. Add it separately for Preview only if you want preview deployments to access this database.
5. Keep `APP_PASSWORD` (at least 8 characters), `OSTENDO_API_URL`, and `OSTENDO_API_KEY` configured separately. No `DATABASE_URL` is needed with Firebase.
6. Redeploy and wait for **Ready**. Sign in and upload your workbook. Firestore documents are created automatically on the first save; no schema setup is needed.

Firestore stores compressed pricing state in chunks below its document size limit, using transactions and revision checks to reject overlapping updates. The current limit is **8 MB compressed per complete state**, including extraction drafts. Back up the database. Firebase reads/writes are subject to Google's quotas and billing. Local developers can use `FIREBASE_PROJECT_ID` with Application Default Credentials, or set `FIRESTORE_EMULATOR_HOST` and `FIREBASE_PROJECT_ID` for the Firestore emulator. Never set `FIRESTORE_EMULATOR_HOST` in production.

Existing Postgres deployments can continue using `DATABASE_URL`; the `pricing_state` table is created automatically. Firebase takes precedence when configured. Existing Postgres or local data is not automatically migrated to Firebase; export/back up existing reviews before switching. Each backend is private server storage, not a browser-accessible public database.

The XLSX export is for manual review and a separately authorised pricing process. It is not an Ostendo import template and the app cannot send prices to Ostendo.



Firestore integration tests: start the Firebase Firestore emulator, then run `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx --test tests/firestore.test.ts`. They use the isolated `demo-plasgain-storage` project and delete their test state. Without an emulator, this suite is explicitly skipped.
