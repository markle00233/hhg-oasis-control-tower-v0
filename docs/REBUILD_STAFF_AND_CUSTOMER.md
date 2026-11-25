# Staff and customer rebuild

**Date:** 2026-11-23  
**Status:** Design, full pass. No migration in this document.  
**Replaces, for the resort day:** the guest app, the desk, and Staff CRM as three products.  
**Leaves alone:** Control Tower (projects, expenses, decisions, AI inbox). It is a separate tool and is not on the order path.

This is the operating design for one database and two clients. The guest phone and the staff counter edit the same customer, the same check-in, and the same bill. Section 3 is the recheck of every current guest, desk, and Staff CRM feature. The references are iPOS FABi, Toast, Zenoti, CourtReserve, Haidilao, and Starbucks. FABi is not installed and not called at runtime.

---

## 1. Decision

Own the bill. A guest order or a staff walk-in inserts one bill row and returns. The counter hears about that row through a wake-up, not through a timer. Payment, the kitchen ticket, the court, and the membership all hang off that bill.

Shared zone logins (`MIAOI`, `PICKLEBALL`, and the rest) go away. Each person has an account. A manager publishes vouchers and discount caps. A staff member applies them. A report is a choice of columns over that day’s bills.

---

## 2. What is slow today

Two clocks run in series. Together they are the 5–8 seconds staff wait for an order.

1. **The create call does too much before it answers.** `POST /api/me/cart` checks vouchers, points, and membership price, writes the cart, then burns the voucher. Several libraries load only after the request has started. The phone does not get an id until all of that finishes.
2. **The counter looks on a timer.** With nothing waiting, the desk reloads every 10 seconds. With a bill already pending, every 4 seconds. Each reload reads up to 500 carts and 500 check-ins (`GET /api/crm/desk`). A new order is invisible until that read returns.

A shorter timer does not fix it. The read is still heavy, and the counter still learns about the order only when a poll finishes.

Other breaks to not copy into the new app:

- Vouchers are a list in source code (`src/lib/hhg-vouchers.ts`), duplicated in the guest app. A manager cannot change one without a deploy. The Olympic list is empty on the merged counter because the code accepts `OLYMPIC_POOL` and the desk asks for `MIA_OLYMPIC`.
- The desk signs in as the zone, so a discount cannot be tied to a person.
- Staff CRM keeps a second customer and a second check-in. A visit recorded there never appears on the desk.
- Guest Activity ignores live bills. Pending carts have a cancel API and no button. Lòng Nướng has a table map and it is switched off.

---

## 3. Whole system, feature by feature

Rechecked from the guest app, the desk (`src/app/desk`), and Staff CRM (`hhgoasistonghop`). Verdicts: **keep** (same behavior on the new records), **change** (keep the job, fix the path), **drop** (no screen in the new app).

### 3.1 Guest

| Feature today | Verdict | In the new app |
|---|---|---|
| Phone login and register | keep | Same customer row the counter searches. |
| Home: points, membership, live cards, shortcuts | change | Live cards are open bills. Shortcuts stay: pool, court, tournament, spa, Mía, Lòng Nướng, swim. |
| Marketing offers on Home | change | They are voucher templates a manager publishes, not a second hardcoded list. |
| Membership upgrade | change | A bill line. The plan turns on at `paid`. The same-day 10% is a rule on that line, not a voucher. |
| My QR and voucher QR (`/qr`, `/v`) | keep | Identity opens the customer. A voucher QR is one published template. |
| Zone scan and check-in (`/s`, identify, confirm, remember) | change | Writes the same check-in the board shows. “Không phải tôi” forgets the device only. Today it also logs the guest out. |
| Olympic, spa, and VIP Resort menus | keep | VIP Resort is a catalog on the Mía · pool counter, which is already how the desk treats it. It is not a sixth till. |
| Mía order | change | Adds lines to the open bill in that zone, origin `app`. The same bill can also be filled at the counter, by a call, or from the table QR. |
| Pickleball booking | change | Holds a slot for 15 minutes. One booking per court and start. |
| Lòng Nướng booking | change | A queue ticket, or a free table when one is open. Pre-order lines stay on hold until the party is called. The current page sends no table because the map is off. |
| Swim catalog and balances | keep | The phone reads remaining lessons. Purchase is a counter bill. |
| Tournaments: list, join, cancel, `/t` check-in | keep | Roster and event voucher live on the same event the desk runs. |
| Activity | change | Today shows live bills, then history. The guest can cancel an `open` bill. The current page shows history only. |
| Messages | change | Becomes the notification list on Today (section 8). Tournament delays and membership expiry are two kinds. No chat, and no separate tab. |
| Account: points, wallet, logout | keep | |
| Journey, `/success`, `/q` as its own page, bootstrap, dev QR, unused `POST /api/miaoi/orders`, and `POST /api/events/confirm` | drop | No screen is rebuilt for them. Every order uses the one bill write. |

### 3.2 Desk

| Feature today | Verdict | In the new app |
|---|---|---|
| Shared zone login (`MIAOI`, `PICKLEBALL`, …) | change | The person signs in, then opens an assigned zone. |
| Live board, approve, reject | change | Open bills, woken on insert. Send accepts. Void rejects, with a reason. |
| Walk-in “Tạo đơn” | keep | Staff may start a new bill even when the guest already has one. Origin `counter`. |
| Phone call | add | There is no call-taking screen today. The call is recorded, a draft bill is proposed, and staff confirm it before it can be sent (section 5.7). |
| Mía lines and points redeem | keep | Points are a tender on eligible lines. |
| Pool tickets and swim bonus | keep | Bonus sessions show on the customer and can be a line. |
| Spa order, in use, finish | keep | `paid` means in use. `closed` is the current “Đã dùng”. |
| Pickleball grid, revise, walk-in | keep | Revise moves the hold. Paid occupies the court. |
| Lòng Nướng table map | change | The map is turned on. Move and merge write the table onto the bill. |
| Swim student list | keep | Its own screen, not the food board. |
| Tournament desk | keep | Create, check-in, review, voucher scan. |
| Calendar | change | A month of bills and bookings. Opening it must not pause new orders. Today the live poll stops while the calendar is open. |
| VIP subscriber list | change | An office filter for active memberships. It no longer needs a separate admin tile. |
| Bill photo | change | Optional evidence on a transfer. The payment is the tender, not the photo. |
| Day PDF | change | The shift-close and items-sold presets. |
| Offer wallet at the counter | change | Published templates. Zone aliases include `MIA_OLYMPIC`, so pool vouchers show on the merged counter. |
| Customer search | keep | One page of matches. The trigram index stays. |
| No-show and expiry maintenance | change | A server schedule. Each open browser no longer posts every minute. |
| `PATCH /api/crm/desk/[id]` | drop | Nothing calls it, and the zone filter would miss the guest’s service code. |

### 3.3 Staff CRM

| Feature today | Verdict | In the new app |
|---|---|---|
| Dashboard and area pages | change | Office Today: visits and paid totals by zone, from bills and check-ins. |
| Customer list, profile, notes, family | keep | One customer table. Search is paged. |
| Register and renew a plan | change | A bill. Active at `paid`. The contract is created then, including when the plan is added to an existing customer. Today a draft is created only on new customer. |
| Check-in page | change | Search, then the same check-in the counter shows. Viewers who cannot write do not see a save button. The list is not capped at 200 names. |
| Receipts and print | change | One print of the paid plan. The membership print and the Word draft stop being two paths. |
| Service catalog and plan settings | keep | Office catalog, including the sold-out flag. |
| Nội bộ sales by staff, behind a password | change | “Sold by” on the membership bill, visible in the report. The password gate and the admin-only unlock go away. |
| Static day stats, behind the same password | change | The “my shift” preset. |
| Feature flags stored on the session | change | Rights are read on the action. |
| Promotions page, not in the menu | change | Granting a promotion is granting a voucher template to a customer. |
| Notices bell | change | A notification row when a plan is paid (section 8). The bell’s timer goes away. |
| Customers quiet for 15 days | keep | An office filter on the last check-in. |
| `/memberships` redirect | drop | The customer file is the membership screen. |

### 3.4 What the recheck changes in the design

- The phone adds to an open bill. Staff can still open another. Section 5.3.
- “Không phải tôi” must not end the guest session.
- The calendar and the live board are separate. A month view cannot block a new order.
- Spa finish, pool bonus, points, walk-in, tournament desk, family, notes, and the 15-day quiet list all stay. They were under-specified when the design focused on the till and on reports.
- Control Tower is untouched. It is not a resort-day feature.
- One zone code per counter. Guest orders that today use `MIA_OI` or `OLYMPIC_POOL` are stored as `MIA_OLYMPIC`. Section 5.5.
- Counter, app, and table create an `open` bill. A recorded call stays a `draft` until staff confirm it. Sections 5.6 and 5.7.

---

## 4. Comparison

| Job | FABi (iPOS) | Toast | Zenoti | CourtReserve | This rebuild |
|---|---|---|---|---|---|
| Order reaches the kitchen | Print on send, separate from payment | Send, Stay, and Hold on the check | Invoice lines, then close | POS cart, then checkout | Bill status `open` → `sent` → `paid`. Send fires the kitchen. Pay is a later step. |
| Who may discount | Manager PIN, reason on the void | Setup (6.1) is separate from apply (3.1). A manager passcode covers a manager-level code | Discounts are created at org level, then chosen at the till. A manual discount replaces the membership percent | Admin builds discount buttons. A sub-admin without permission needs an admin PIN | Manager publishes the voucher and the cap. Staff apply inside the cap. Over the cap needs a manager on that counter. |
| Member price | Member lookup on the bill | Promo code on the check or in the guest order | Membership is a line on the invoice. It activates when the invoice closes | Member status can block a charge | VIP percent is computed from the customer. The plan turns on when its bill is paid. |
| Court or table hold | Table on the check | Table service check | Appointment, then invoice | Unpaid online booking is held 15 minutes, then released | Unpaid court or table hold expires. A unique slot stops two guests taking the same court. |
| Shift close | Cash count, revenue per staff | Open checks must be closed or transferred. Cash is declared | Register handover | POS payment types are configured | A shift cannot close while that person still has an open bill. Cash is counted against tenders. |
| Reports | Shift, payment mix, voids, items | Shift review per employee | Invoice and redemption reports | POS discounts show on the cart | Column picker over the day’s bills. A closed shift stays still. |
| Guest wait | Local POS, so the till does not poll a cloud | Orders Hub for online orders. KDS stays up on the store network if the cloud drops | Front desk sells on the open invoice | Player pays inside the hold window | Insert, return, wake the counter. A LAN print agent only if the upstairs link is the slow part. |

Sources: iPOS FABi feature list (huongdan.ipos.vn, 5 Nov 2026), Toast order screen, permissions, and shift review, Zenoti “sell memberships from POS” and POS discount actions, CourtReserve POS discount PIN and public booking payment hold.

### 4.1 Haidilao, Starbucks, and what to take

| Brand | What they run | Take | Leave |
|---|---|---|---|
| FABi | Till: shift, kitchen print, voucher, void with a reason, cash count | The bill, the shift, and the kitchen ticket. Already in this design. | Their cloud POS as a second system. Delivery, VAT filing, recipe stock. |
| Haidilao | Super App and WeChat for queue, reserve, and pre-order (2018 annual results). Guests also walk in, call the store, and order on a pad at the table. All of those land on one check. A queue voucher can be checked away from the door. | The same four ways onto one bill: at the counter, in the app, from the table QR, and from a recorded call that staff confirm before it is an order. Section 5.6 and 5.7. | A separate order system per channel. Robots, manicure booking, retail goods, delivery, and a paid tier that skips the line. |
| Starbucks | Mobile order shows sold-out items and a pickup estimate before the guest confirms. The store receives the order immediately. The phone is told when it is ready. Favorites reorder the last drink. | Sold-out on the cached menu. A prep estimate from a count of tickets not yet marked ready. `readyAt` on the bill, pushed to the phone. “Order again” copies the last paid lines in that zone. | Pay-in-app and a store picker. This resort has one site, and payment stays cash or transfer at the counter until a provider is added. |
| Marriott Bonvoy | One profile across outlets. | Already the plan: one customer, one points balance, every zone. | A second points currency per zone. |

The queue and the “ready” mark are small rows. They exist so a wait list and a pickup screen do not load bill lines. Haidilao’s queue check is a ticket, not the menu. Starbucks’ estimate is shown before the order is sent, from how busy that store already is.

What those products refuse to be, and this app also refuses: a delivery marketplace, a recipe warehouse, a retail shop, and a free-form SQL report builder. VAT and the legal e-invoice stay with a provider (MISA or M-Invoice). The bill stores the invoice id when that provider is added.

---

## 5. Structure

```
Guest phone                         Staff client
  login, home, check-in               Counter (one zone, one shift, bell)
  order, book, today, account         Office (customers, plans, reports, bell)
            \                       /
             \                     /
              one database
                Customer, Person
                Check-in, Queue ticket
                Bill → lines, tenders, discounts
                Shift, Menu item, Voucher template
                Notification
```

### 5.1 Records

| Record | Role |
|---|---|
| Customer | Phone, name, points, membership, family. One row. Phone lookup uses `phoneNormalized`. |
| Check-in | A visit to a zone, from a printed QR or from staff. A bill may attach to it. |
| Bill | The check. Zone, table or court, status, origin, who sent it, who took payment. |
| Bill line | Item, qty, note, topping parent, void reason. |
| Tender | Cash (received and change) or transfer. The sum pays the bill. |
| Discount | A copy of the voucher or the manual amount, staff id, manager id if the cap was passed. |
| Shift | One open shift per person per counter. Close freezes that slice of the day. |
| Menu item | Price, zone, sold-out flag. Guest and desk both hide a sold-out item. |
| Voucher template | Manager-edited rule. A paid bill keeps its own copy. |
| Person | Login, role, zones, discount cap. |
| Notification | One stored event for one customer or one staff person. See section 8. |
| Queue ticket | Lòng Nướng wait list. Party size and status only: waiting, called, seated, cancelled. Seating attaches a bill. |

### 5.2 Bill status

| Status | Meaning |
|---|---|
| `draft` | A phone call was turned into proposed lines. The kitchen cannot see it. The guest is not told the order is placed. Staff must confirm or edit it. |
| `open` | Lines can still be added. Kitchen has not been fired. A court or table is only held. An app, counter, or table order is created here. A call reaches here only after staff confirm the draft. |
| `sent` | Mía and Lòng Nướng have printed. Pool, spa, and courts are accepted. More lines can be added and sent again. Mía sets `readyAt` when the drinks are made. The status stays `sent` until payment. |
| `paid` | Tenders cover the total. The court or table is occupied. A membership on the bill becomes active. |
| `closed` | The visit ended: table cleared, court finished, spa done. |
| `void` | The whole bill was cancelled with a reason and a manager. |

Held lines stay on an `open` or `sent` bill and do not print until they are sent. That is Toast’s Hold, and it is how a resort paces a meal.

### 5.3 One open bill per guest per zone

If the guest already has an `open` or `sent` bill in that zone, the next order from the phone adds lines to it. Staff can still start a second bill on purpose (a walk-in round, or a split party). The current desk already allows that. The phone must not create a second cart on every tap.

### 5.4 Membership turns on when the bill is paid

Selling a plan puts a membership line on the bill. VIP price, family, and the contract draft appear when that bill reaches `paid`. They do not apply to the same bill that is selling the plan, unless a manager turns stacking on for that template. Zenoti’s default is the same idea: a manual discount replaces the automatic member discount, and the plan is inactive until the invoice closes.

Points redeem stays an automatic rule on the customer, not a voucher the manager retypes.

### 5.5 Rules that apply on every screen

| Rule | Behavior |
|---|---|
| Zone code | Five counters: `MIA_OLYMPIC` (Mía drinks, pool tickets, VIP Resort catalog), `PICKLEBALL`, `SPA`, `LONG_NUONG`, `SWIM_LESSON`. Tournaments are a desk on top of pickleball, not a sixth service code. Old codes (`MIA_OI`, `OLYMPIC_POOL`, `SAUNA`, `VIP_RESORT`) are accepted at the door and stored as the counter code. |
| Points | Earned once, when a bill is paid, on the amount after discounts. A void writes the reversing entry. A check-in does not add points. Redeeming points is a tender on eligible lines. |
| Voucher use | The open bill shows the discount. The use count drops at `paid`. Cancelling an `open` bill puts nothing back because nothing was taken. |
| Check-in | A second confirm for the same customer and zone within 60 seconds returns the check-in already written. |
| Guest cancel | The guest can cancel while the bill is `open`. After `sent`, only staff can void, with a reason. |
| Walk-in without a phone | Staff create a customer with no login. That row can hold a bill. It does not appear in account search. |
| Reprint | Any paid or sent bill prints again from its saved lines. The print is not a second record. |
| Transfer | On shift close, an open bill can move to another person on that same shift. It cannot move across zones. |
| Viewer | Can open office lists and reports for assigned zones. Save, send, void, and discount stay off. |
| Family | Edited on the customer file in the office. The phone shows the member’s own plan, not a family editor. |

### 5.6 How an order is placed

Haidilao takes the same meal from a walk-in, a phone call, the app, or the pad on the table. This resort does the same. Counter, app, and table set `origin` and use the one write in section 10.1. A call saves the recording first. Confirm is the write that makes it an order (section 5.7). There is no second order API, and no tablet app.

| Way | Who acts | What is written |
|---|---|---|
| At the counter | Staff, guest standing there | `origin = counter`. The bill sheet. A walk-in with no phone still gets a bill. |
| In the app | Guest, before or during the visit | `origin = app`. Mía, pool, spa, a court hold, or a Lòng Nướng pre-order on a queue ticket. |
| On a call | Guest on the resort phone. The call is recorded. | `origin = call`. A `draft` bill is proposed from the recording. Staff check it, then confirm. Section 5.7. |
| At the table | Guest scans the QR on that table | `origin = table`. The QR carries the zone and the table. Lines join the open bill for that table. |

A counter order for someone who has an account shows on their Today list, and they get an “order recorded” notification (section 8.2). A call does not, until staff confirm the draft. They can add more from the app onto a bill while it is still `open`. After `sent`, only staff change it.

Pre-order lines from the app or from a call stay on hold until the party is seated or the counter sends them. Payment is still cash or transfer at the counter for every origin.

### 5.7 A recorded call becomes a draft

The caller hears that the call is recorded so the order can be written down. When the call ends, the audio is stored and a transcript is made off the order path. Proposed lines are matched to the menu for that zone and saved as a bill with status `draft` and `origin = call`. The customer is attached when the number matches an account. If it does not, the draft waits with the number on it until staff pick the customer.

Staff open the draft beside the transcript and the recording. They can change quantities, swap an item, or drop a line the transcript got wrong. Confirm moves the bill to `open`. That is the moment the guest is notified, and the moment the bill can be held or sent. Reject discards the draft and keeps the recording until the end of that business day.

The audio file stays off the board query, the same way a transfer photo does. The board only needs a count of drafts waiting. The transcript job does not run inside the request that saves the recording. A failed transcript still leaves the recording, and staff type the lines themselves before confirm.

---

## 6. Staff

Two rooms, one client.

### 6.1 Counter

The person picks a zone they are allowed to open and starts a shift. The board lists `open` and `sent` bills and today’s check-ins for that zone. Drafts are a separate count, not part of that list. The list is one indexed read, used when the shift starts and when someone hits refresh.

| Screen | What it does |
|---|---|
| Mía and pool | One counter. Drinks and tickets are lines. Send prints the bar ticket. Mark ready when the drinks are made. Swim bonus shows on the customer. |
| Pickleball | Court grid. A guest hold and a walk-in are the same row. Paid starts the court. |
| Spa | Service lines, then in use, then closed. No kitchen ticket. |
| Lòng Nướng | Queue ticket, then the floor. Call the party, seat them, attach the bill. Move and merge write the table id. Send prints the kitchen. Pre-order lines stay held until the party is called. |
| Swim | Student list. A package line adds sessions when the bill is paid. |
| Tournaments | Create, check in, redeem the event voucher as a discount on a bill. |
| Bill sheet | Add lines for a guest at the counter. For a call, review the draft and the recording, then confirm. Hold, send, take cash or transfer, void, reprint. The origin is visible on the bill. |
| Close shift | Every `draft` is confirmed or rejected. Every `open` or `sent` bill is paid, void, or transferred to someone on the same shift. Cash is counted against tenders. A `paid` visit, such as a spa still in use, can stay. |
| Calendar | Month of bills and bookings. It does not pause the wake-up. |
| Bell | That person’s staff notifications (section 8.3). Same on the counter and in the office. |

### 6.2 Office

| Screen | What it does |
|---|---|
| Today | Visits and paid totals by zone, from bills and check-ins. |
| Customer file | Search by name or phone, one page. Notes, points, visits, bills. Filter for no visit in 15 days. |
| Membership and family | Sell or renew. The counter prices from this same customer. |
| Contract | Printed from the plan at the moment it is paid. |
| Catalog | Plans, services, sold-out, voucher templates, discount caps. |
| Accounts | People, zones, roles. |
| Reports | Section 9. |

The old check-in page that loads the first 200 customers becomes a search that writes the same check-in the board shows.

### 6.3 Rights

Rights are read from the database on the action, not from a token cached at login. The current Staff CRM keeps feature flags in the session until the person signs in again. Toast avoids that by forcing a new sign-in. A single-row read on discount, void, and shift close is the better fit for a web counter.

| Action | Staff | Manager |
|---|---|---|
| Open a shift on an assigned zone | yes | yes |
| Add lines, send, take cash or transfer | yes | yes |
| Apply a published voucher | yes | yes |
| Manual discount within the zone cap | yes | yes |
| Manual discount over the cap, void a sent line, void a bill | asks a manager | yes |
| Create or pause a voucher, set the cap, edit the menu | no | yes |
| Close someone else’s shift, see other people’s rows | no | zones they manage |
| Create accounts | no | owner only |

A viewer is a third role: office lists and reports for assigned zones, and no save, send, void, or discount. Section 5.5.

A manager approval is that manager’s own login or PIN, recorded on the discount or the void. A shared zone password cannot approve anything.

---

## 7. Customer

The phone is a thin client. It never opens the office.

| Screen | Writes |
|---|---|
| Phone login | Finds or creates the customer. |
| Home | Reads points, membership, and live bills. Shortcuts: pool, court, tournament, spa, Mía, Lòng Nướng, swim. |
| Zone QR | Writes a check-in. Remember this phone. “Không phải tôi” forgets the device and leaves the session. A repeat within 60 seconds does not write a second visit. |
| My QR | Staff scan opens this customer. A voucher QR is one published template. |
| Order | Adds lines to the open bill in that zone, or opens one. Origin `app`. Shows the prep estimate and hides sold-out items before confirm. Order again copies the last paid lines. |
| Table QR | The card on the table. Origin `table`. Lines join that table’s open bill. |
| Book a court | Holds a free slot on the same grid staff see. |
| Book a table | Takes a queue ticket, or a free table when one is open. Pre-order lines wait on hold until the party is called. |
| Call staff | Sets a flag on the open check-in. The counter wakes. No chat thread. |
| Swim and tournaments | Reads balances. Join and event check-in. Buying sessions is a counter bill. |
| Today and account | Live bills, then the notification list, then history. Cancel is offered only while a bill is `open`. Points, card, voucher QR. |

The phone shows “Đã gửi” from the insert response. It does not spin while vouchers are reconciled. Status after that comes from the same wake-up the counter uses while the app is open. When the app is closed, section 8 delivers the same event.

---

## 8. Notifications

Both clients get the same system. A guest has a list on Today. A staff member has a bell on the counter and in the office. Each row belongs to one person. A wake-up still moves the open board. It does not replace the bell.

Today the guest Messages page builds tournament delays in the browser, and Staff CRM polls one shared ops bell (`OpsNotice`) for every account. The new row is addressed to a customer or to a staff person, written after the bill commits, and pushed if that person’s app is not open.

### 8.1 Record

| Field | Role |
|---|---|
| Who | `customerId` or `personId`. Never both, and never a chat between them. |
| Kind | A fixed list, split by audience below. |
| Text | Short title and one line. |
| Ref | The bill, queue ticket, check-in, or event. One unread row per person, kind, and ref. A second “ready” updates that person’s row. |
| Read | `readAt` when that person opens it. |

A zone event fans out to the people on shift in that zone, one row each. A manager of the zone gets a row only for the manager kinds. The board still receives a single wake so it does not depend on those rows to paint a ticket.

### 8.2 Guest

| Kind | When |
|---|---|
| Queue called | Staff call that guest’s Lòng Nướng party. |
| Order ready | Mía sets `readyAt` on their bill. |
| Bill paid, rejected, or void | Their bill reaches that status. |
| Hold ending | Five minutes before their unpaid court or table hold expires. |
| Event moved | A tournament they joined changes time. |
| Plan ending | Once, inside the week their plan expires. A daily job, not a check on every Home load. |
| Voucher granted | A manager grants them a template. |
| Order recorded | Staff confirmed a call draft, or added lines at the counter, for this account. |

### 8.3 Staff

| Kind | Who | When |
|---|---|---|
| New bill | People on shift in that zone | A bill becomes `open`, or lines are added to an `open` bill. A `draft` does not use this kind. |
| Guest called | People on shift in that zone | The guest taps call staff on a check-in. |
| Party waiting | People on shift at Lòng Nướng | A queue ticket is taken. |
| Call draft ready | People on shift in that zone | A recorded call has proposed lines waiting to be checked. |
| Approval needed | Managers of that zone | A staff member asks to pass the discount cap or to void a sent line, and no manager is on that shift to approve it in person. |
| Hold ending | People on shift in that zone | The same five-minute warning the guest receives, so the counter can release or take payment. |
| Plan paid | The person on “sold by”, and managers | A membership bill is paid. Replaces the shared ops bell. |
| Shift still open | That person | Unpaid bills are still on their shift near the business-date cutoff. |

Opening the zone board marks “new bill”, “guest called”, and “party waiting” read for the person using that screen. A call draft stays unread until that person opens it. The other kinds stay unread until they open the bell. An operating-system banner is suppressed only while that zone’s board is the focused screen. A manager in the office, or a staff member on the calendar, still gets the banner.

### 8.4 How it is delivered

1. The business write commits first. The order response does not wait for a notification.
2. The after-response step writes one row per recipient.
3. If that person already has the wake connection open, the row goes down it and the bell count moves.
4. If they do not, Web Push goes to the device subscription saved at login. Guest and staff each register their own device. A failed push does not change the bill.
5. Today, and the staff bell, load the latest 30 rows for that person when the screen opens. They do not poll. The unread count is rows with no `readAt`, refreshed when a wake arrives.

### 8.5 What this is not

No guest-to-staff chat and no marketing blast. The guest has no Messages tab. The staff have no second feed beside the bell. The kinds in 8.2 and 8.3 are the whole list until a new kind is added on purpose.

---

## 9. Vouchers, discounts, and reports

### 9.1 Voucher template

A manager edits name, zones, kind (percent, amount, or free item), minimum bill, dates, use limit, and whether the guest wallet may show it. Pausing removes it from the counter and the phone. The bill stores the title, kind, and amount that were applied, plus the template id. Changing the template the next day does not rewrite a paid bill.

### 9.2 Discount policy

One discount applies. The order of choice on a bill is:

1. VIP percent, if the membership is already active.
2. A published voucher, if the guest or the staff attaches one. It replaces the VIP percent unless the template says it may stack.
3. A manual discount. It replaces whichever of the above was on the bill, and it stores the reason.

Points are a tender against eligible lines, not a third percent off the whole bill.

### 9.3 Day report

The facts are bills, tenders, discounts, voids, and check-ins. The screen asks for:

- a business date or a range (default is the open shift’s date)
- one or more zones the person may see
- a staff filter (a staff login is already limited to their own rows)
- columns: bills, items, cash, transfer, vouchers, manual discounts, voids, check-ins, courts, packages

Presets: my shift, shift close, payment mix, discounts by staff, vouchers used, items sold. Output is the screen, CSV, or the day print.

**Business date.** A configurable cutoff, default 04:00, matches Toast’s closeout hour and FABi’s “setup start of selling day”. A bill at 01:00 belongs to the previous business date so a night service is not split across two reports.

**Freeze.** Closing a shift freezes that person’s bills for that business date. A later void is a new adjustment dated today. Yesterday’s report does not move.

**Speed.** Month and “by staff” views read a summary row written at shift close (totals by zone, staff, tender, discount). They do not scan every line of every open board. The live board and the report stay on different reads.

---

## 10. Performance

### 10.1 The path that creates an order

1. The client sends an idempotency key with the lines. A retry of the same key returns the same bill. A double tap during a slow moment cannot create two orders. The old order work already called for this key. The new write must keep it.
2. The server inserts the bill, or appends lines to the guest’s open bill in that zone, and returns the id. Target is one transaction and the response.
3. The discount preview, including VIP price and points, is written onto that row immediately after the response. The voucher use count waits until `paid` (section 5.5). The guest is not holding the button.
4. The insert notifies the zone channel (`LISTEN` / `NOTIFY`, or the same signal on a single held connection per counter). The board paints that bill. The phone learns `sent` and `paid` on that same channel and drops its 1.2 second status loop.

The full board read runs when a shift opens and when someone refreshes. It is not how a new order arrives.

### 10.2 Holds

A court or table slot has a unique key on resource and start. The unpaid hold expires (15 minutes, the CourtReserve window, is the right default). Expiry releases the slot. Two phones cannot both win the same court while the first request is still in flight.

### 10.3 What else keeps the counter fast

- Each zone’s screen is its own bundle. The Mía counter does not download the court grid.
- Customer search uses the trigram index already drafted in `prisma/sql/hot-path-indexes.sql` and returns a page.
- Bill photos, if a transfer screenshot is still attached, stay out of the board query. The current desk already strips them from the list. Keep that rule.
- Maintenance (expire holds, expire unpaid bills) runs on a schedule on the server. Today every open desk posts a maintenance call every minute.
- Menu items for a zone are cached on the phone and the counter until the sold-out flag or the price changes. The guest sees that flag before confirming, the way Starbucks shows what the store can still make.
- The prep estimate is a count of `sent` bills in that zone with no `readyAt`, times a minute value the manager sets. It is not computed inside the create transaction.
- The queue screen reads queue tickets only. Seating is the moment a ticket gains a bill id.
- “Order again” is one read of the last paid bill for that customer and zone. The submit is still the short write in section 10.1.
- “Call staff” updates the check-in and wakes the counter. It does not create a bill.
- A notification row is written after the order response, then pushed if that phone is not connected. Today does not poll for it. Section 8.
- A call recording and its transcript are stored apart from the board. Only the draft’s id and a count of drafts waiting are on the counter. Confirm is what turns the draft into an `open` bill.

### 10.4 When the cloud is the slow part

A small print agent on the counter PC can receive the kitchen ticket on the cafe network and sync the bill afterward. Toast’s kitchen screen does this during an outage. Build it only after the wake-up path is in production and a real shift still waits on the upstairs link. It is not required for the first release.

---

## 11. Build order

Each step ships the counter action and the guest action that write the same row.

| Step | Staff | Guest | Record |
|---|---|---|---|
| 1 | Shift, board, bill, cash and transfer, idempotent create, wake-up, staff bell | Login, Today, device subscription for push | Bill, Tender, Shift, Notification |
| 2 | Mía and pool lines, bar ticket on send | Order those two onto the open bill | Menu item, line |
| 3 | Board shows the scan | Zone QR and My QR | Check-in |
| 4 | Court grid and the 15-minute hold | Book a court | Slot unique key |
| 5 | Spa, Lòng Nướng queue, floor, and kitchen. Mía “ready”. Table QR. Call draft confirm | Spa order, queue ticket, table QR, call staff | Queue ticket, then the same bill |
| 6 | Swim list, tournaments | Balances, join, event check-in | Sessions, roster |
| 7 | People, voucher templates, caps, customer file, contract | Account card and voucher QR | Discount copy |
| 8 | Shift close, presets, business date | — | Frozen shift summary |

Office membership is step 7 because the counter must already price a bill from the customer before the office sells plans.

---

## 12. Out of scope

- Control Tower.
- Delivery apps, Grab, Ahamove.
- Recipe inventory and a sold-out count that decrements stock. A sold-out flag is in scope. A warehouse is not.
- A second customer database.
- Journey, the unused Mía order API, and the promotions page that has no menu entry.
- VAT calculation and e-invoice issuance, until a provider is connected. The bill has a place for the invoice id.
- A custom report writer. The column list in section 9.3 is the report.
- A full offline POS.
- Haidilao’s retail shop, delivery, and a membership tier that skips the queue.
- Pay-in-app. Cash and transfer stay at the counter until a payment provider is connected.
- A chat inbox, a marketing blast, and a notices poll. Section 8 is the notification system.
- Splitting one bill into two. A second bill is a new check started by staff (section 5.3).
- A family editor on the phone. Family is edited in the office (section 5.5).

---

## 13. Settled, and what waits

The items below are already specified in the sections named. They are not optional follow-ups.

| Decision | Where |
|---|---|
| Phone adds to the open bill; staff may start another | 5.3 |
| Hold, then send | 5.2, 6.1 |
| VIP percent and a voucher do not stack unless the template says so | 9.2 |
| Membership turns on at `paid` | 5.4 |
| Shift close requires every bill paid, void, or transferred | 6.1 |
| Unpaid court or table hold expires in 15 minutes, one booking per slot | 10.2 |
| Idempotency key on create | 10.1 |
| Shift summary for reports, business date rolls at 04:00 | 9.3 |
| Rights are read on the action | 6.3 |
| Lòng Nướng queue ticket, Mía `readyAt`, order again, call staff | 4.1, 6.1, 7 |
| Counter, app, phone call, and table QR are one bill | 5.6 |
| A recorded call becomes a draft until staff confirm it | 5.7 |
| Notifications for the guest and for each staff person | 8 |
| Points, voucher burn, zone codes, walk-in without a phone, reprint, viewer | 5.5 |

After the bill is the record, and not in the first release: a LAN print agent, an e-invoice provider, pay-in-app, and a birthday voucher that grants itself during the guest’s birthday month. The birthday rule sits on the voucher template. It does not run on the order path.
