# HHG Oasis — Architecture Upgrade Plan (post-audit)

**Date:** 2026-10-12  
**Rule:** additive, migration-safe, reuse existing AppCustomer / SERVICE_USE / desk / Mía Ơi.

## Audit snapshot (keep)

| Area | Existing | Decision |
|------|----------|----------|
| Canonical ID | `AppCustomer.id` (cuid) | Keep. Relations use `id` only. |
| Lookup | `phoneNormalized` unique | Keep. |
| Display | `customerCode`, `phoneLast4`/`shortId` | Keep as display/recovery — **not** identity. |
| Remember device | `hhg_device_token` → `AppCustomerDevice` | Keep. Resolve does **not** create SERVICE_USE. |
| Returning confirm | UI “Xác nhận sử dụng” → `/api/checkin/confirm` | Keep. |
| Dedup | 60s `recordServiceUsage` | Keep initially. |
| Staff auth | bcryptjs + `hhg_session` JWT + `requireDeskZone` | Keep; harden later. |
| Desk | `/desk` + 4s poll + `adminAllplace` | Keep shell; evolve queue. |
| Orders | `AppOrder` + hardcoded catalogs | Unify in Phase 2; one model. |
| Booking/Resource | **Absent** (Oasis-Sport = Sheets silo) | Phase 3–4. |
| CRM vs App | Separate; desk phone-match MEMBER badge | Do not merge yet. |

## Phases

1. **Foundation (done):** event `operationalStatus`, journey API, account TODAY/HISTORY, desk ACK per visit.
2. **Orders (done MVP):** customer self-order `/order/miaoi` → same `AppOrder`; staff desk unchanged; idempotency key; origin metadata.
3. **Resources (done MVP):** `AppResource` + seed (6 courts / 6 beds / 30 tables / VIP); desk grid UI; LONG_NUONG zone.
4. **Booking (done MVP):** `AppBooking` + staff create API + Oasis-Sport ingest + auto-match on QR confirm; upcoming in account.
5. **Ops (done MVP):** `AppAuditLog`, desk poll 2s, `AppResourceSession` start/complete.

## Deliberately NOT changing now

- QR URL shape `/s/{token}`
- Desk zone usernames
- Control Tower task/AI modules
- Oasis-Sport Sheets rewrite
- Dropping `adminConfirmedAt` (kept; event status becomes source of truth for NEW)
