# HHG Oasis · Customer App

Independent customer MVP (digital access pass). Does **not** modify Admin/Staff Flutter apps.

## 1. Folder structure

```text
customer-app/
  src/app/                 # pages + API routes
  src/components/          # Shell, BottomNav, QrScanner
  src/lib/                 # prisma, session, password, account, services
  README.md
prisma/schema.prisma       # AppCustomer / AppService / AppServiceEvent (shared DB)
prisma/seed-customer-app.ts
```

## 2. Database schema (shared Postgres)

| Table | Model | Role |
|---|---|---|
| `app_customers` | `AppCustomer` | Customer ID, username, password_hash |
| `app_customer_sessions` | `AppCustomerSession` | Device session tokens |
| `app_services` | `AppService` | Service points (OLYMPIC_POOL…) |
| `app_service_events` | `AppServiceEvent` | Append-only usage events |

Dashboard counts = `GROUP BY serviceId` on events (no stored counters).

## 3. Routes / pages

| Path | Purpose |
|---|---|
| `/` | Bootstrap: session → home, else auto-create account → `/welcome` |
| `/welcome` | Show Customer ID + temp password |
| `/login` | Sign in / Create New Customer |
| `/home` | Dashboard + Scan CTA + activity counts |
| `/scan` | Camera QR scanner |
| `/scan/[serviceCode]` | Confirm use |
| `/success` | Confirmed |
| `/activity` | Timeline history |
| `/account` | ID / username / logout |
| `/account/password` | Change password |
| `/dev/qr` | Developer QR grid |

## 4. API endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/bootstrap` | Auto-create account + session |
| POST | `/api/auth/login` | Username/Customer ID + password |
| POST | `/api/auth/logout` | Clear cookie + session row |
| GET | `/api/auth/me` | Current customer |
| POST | `/api/auth/change-password` | Hash new password |
| GET | `/api/dashboard` | Visit counts by service |
| GET | `/api/events` | History |
| POST | `/api/events/confirm` | Validate service + create event (45s dedupe) |
| GET | `/api/services` | Active services + scan URLs |

## 5–8. Logic summary

- **Account creation:** server generates `CUS-XXXXXX` + temp password, stores **hash only**, sets httpOnly session cookie + `app_customer_sessions` row.
- **Auth:** JWT in cookie `hhg_customer_session`, verified against DB session + ACTIVE status.
- **QR generation:** `/dev/qr` encodes `NEXT_PUBLIC_CUSTOMER_APP_URL/scan/SERVICE_CODE` only.
- **Scan/confirm:** client extracts service code → confirm API validates ACTIVE service → writes `SERVICE_USE` event; rejects duplicates within 45s.

## 9. Run locally

```bash
# From repo root (needs reachable DATABASE_URL)
npx prisma db push
npm run db:seed-customer-app

cd customer-app
# .env should include DATABASE_URL + HHG_SESSION_SECRET or CUSTOMER_SESSION_SECRET
npm install
npm run dev
```

## 10–12. URLs & demo & env

- App: http://localhost:3001  
- Dev QR: http://localhost:3001/dev/qr  
- Demo: **CUS-DEMO01** / **Demo123!**  

Env: `DATABASE_URL`, `CUSTOMER_SESSION_SECRET` (or `HHG_SESSION_SECRET`), optional `NEXT_PUBLIC_CUSTOMER_APP_URL`.
