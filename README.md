# DeepKamal — full working app

SQLite-backed operations + customer/partner marketplace for DeepKamal Electrical & Fire Safety.

## The server issue (and fix)

If you see **`EADDRINUSE: address already in use :::3000`**, an old Node process is still holding port 3000.

**Fixed:** `npm start` and `npm run dev` now **free port 3000 automatically**, then start the app.

## How to run (do this)

In the project folder:

```powershell
npm start
```

Or double-click **`START.bat`**.

Then open **only**:

**http://localhost:3000**

Do **not** use VS Code Live Server or open `index.html` as a file — that has no database/API.

### Dev mode (auto-reload)

```powershell
npm run dev
```

## Logins

Password for all: **`DeepKamal@1`**

| Role | Email |
|------|-------|
| Owner | `owner@deepkamal.in` |
| Manager | `manager@deepkamal.in` |
| Partner | `partner@deepkamal.in` |
| Customer | `customer@deepkamal.in` |

Tap the role buttons on the login screen for one-click sign-in.

## What works

- SQLite database (`data/deepkamal.db`) — **not Supabase** (run `npm run supabase:check` or see `.env.example`)
- Colour-coded cables + Code128 barcodes
- **Dispatch / tickets** with partner GPS + photo evidence
- **Detailed GST quotations** → approve → auto ticket + material issue
- **Inventory** receive / issue to site
- **Payroll**: attendance accrues wages → claim → approve → pay
- **Payments** on quotations (advance / balance)
- **AMC due** alerts, site works, banks, feedback
- Customer: services, **quotes**, bookings
- PWA shell cache (API/HTML never cached)

### Clean dummy / test data

```powershell
npm run purge-dummy
```

## Check database

```powershell
npm run db:check
```

Or Owner → **Database** in the sidebar → **Test write**.
