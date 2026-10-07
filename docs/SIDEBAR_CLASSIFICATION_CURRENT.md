# CURRENT Sidebar Classification

**Date:** 2026-09-20  
**Sources:** `docs/SYSTEM_AUDIT_CURRENT_STATE.md` + `public/index.html` / `public/app.js` / Prisma API  
**Scope:** Classify only. No sidebar restructure. No architecture change. No implementation.

Legend — Architecture TYPE ≠ HEALTH.  
Visual follows HEALTH only (LIVE→NORMAL, PARTIAL→AMBER, NOT_CONNECTED/NOT_IMPLEMENTED/MOCK/DEAD→RED).  
Component-level: a LIVE page may still contain RED child panels.

---

# Per-item analysis

### Trung tâm điều hành

**TYPE:** AGGREGATION / COMMAND CENTER  

**PRIMARY ENTITY:** none (reads many)  

**OWNS DATA?** NO  

**SOURCE OF TRUTH:** Should be `/api/dashboard` aggregates of DailyClose, Expense, Task, Project, Decision, Issue, Unit — but most visible KPI/unit/priority/risk DOM is hardcoded HTML. Only `#dashDecisions` is bound to Decision data.  

**CONNECTED TO:** Decision (REAL display); DailyClose/Expense/Task/Project (API returns, UI mostly ignores)  

**CONNECTION PURPOSE:** Command overview  

**IS CONNECTION REQUIRED FOR THIS FEATURE TO MAKE SENSE?** YES — a dashboard without sources is empty chrome. Sources exist in API; UI connection incomplete.  

**HEALTH:** MOCK at page surface (KPI/units/priorities/risks); Decision strip LIVE → overall page **PARTIAL** with MOCK islands  

**VISUAL:** RED on mock cards; NORMAL on decision strip  

**SHOULD THIS REMAIN A SEPARATE SIDEBAR PAGE?** YES  

**REASON:** Aggregation hub is a valid IA node; it is not a workflow object and must not own numbers.

---

### Dự án

**TYPE:** CORE_WORKFLOW_OBJECT  

**PRIMARY ENTITY:** Project  

**OWNS DATA?** YES (`Project` table)  

**SOURCE OF TRUTH:** Prisma via `/api/projects` + dashboard payload → `renderProjects()`  

**CONNECTED TO:** Task (`projectId`); Decision (`linkedProjectId` / name resolve); Unit (optional)  

**CONNECTION PURPOSE:** Group tasks + budget/status; decisions can attach to project  

**IS CONNECTION REQUIRED?** NO for Project to “exist” as a container — Project CRUD is valid alone. Task/Decision links improve ops but are not required for Project page to make sense.  

**HEALTH:** LIVE  

**VISUAL:** NORMAL  

**SEPARATE PAGE?** YES  

**REASON:** Real entity with create/list and relations.

---

### Công việc

**TYPE:** CORE_WORKFLOW_OBJECT  

**PRIMARY ENTITY:** Task  

**OWNS DATA?** YES (`Task` + `TaskEvent`)  

**SOURCE OF TRUTH:** Prisma via `/api/tasks` + dashboard → `renderTasks()`  

**CONNECTED TO:** Project (optional FK); Unit; Decision (bidirectional side effects); Expense (`linkedTaskId` optional); AI (confirm creates Task); Staff (same Task rows)  

**CONNECTION PURPOSE:** Execution center of ops  

**IS CONNECTION REQUIRED?** Task is the hub — can exist without Project (schema allows null `projectId`). Connection to Decision is optional per task.  

**HEALTH:** LIVE  

**VISUAL:** NORMAL  

**SEPARATE PAGE?** YES  

**REASON:** Central execution object; full list/create/detail/progress.

---

### Hộp thư AI

**TYPE:** WORKFLOW_ENTRY_POINT  

**PRIMARY ENTITY:** MessageInbox + AiTaskDraft (intake); output = Task  

**OWNS DATA?** YES for inbox/drafts; does **not** own a parallel work system  

**SOURCE OF TRUTH:** `/api/ai/inbox`, `/api/ai/drafts/[id]` → confirm creates Task  

**CONNECTED TO:** Task (confirm/merge); Unit by name on confirm  

**CONNECTION PURPOSE:** Natural-language intake → human check → Task  

**IS CONNECTION REQUIRED?** YES — without Task confirm path, AI inbox is meaningless as product. That path **exists and works**.  

**HEALTH:** LIVE (intake→Task). Gaps vs target (Workstream/User) do not demote current purpose.  

**VISUAL:** NORMAL  

**SEPARATE PAGE?** YES (as intake channel) / could nest under Công việc later — classification only: currently separate entry is coherent.  

**REASON:** Not a second task system; entry point into Task.

---

### Việc chờ quyết định

**TYPE:** CORE_WORKFLOW_OBJECT (page label sounds like a queue; entity is Decision)  

**PRIMARY ENTITY:** Decision  

**OWNS DATA?** YES (`Decision`)  

**SOURCE OF TRUTH:** Prisma `/api/decisions` → `renderDecisions()` shows **all** decisions (pending + resolved), not only `status=PENDING`. UI title says “chờ quyết định” but code loads full list.  

**CONNECTED TO:** Task (`linkedTaskId` + block/unblock on create/resolve); Project (`linkedProjectId`)  

**CONNECTION PURPOSE:** Approval gate that can block/unblock Task  

**IS CONNECTION REQUIRED?** Decision can exist unlinked (`linkedTaskId` null) — still valid. Link to Task is **required for blocking workflow** to make sense; unlinked decisions still persist.  

**HEALTH:** LIVE  

**VISUAL:** NORMAL  

**SEPARATE PAGE?** YES as Decision module. Label is slightly misleading: it is **Decision module / queue**, not a separate system. Prefer thinking: **FILTERED/QUEUE VIEW OF DECISION ENTITY** presented as its own nav item — architecture type remains CORE for the Decision object.  

**REASON:** Real CRUD + resolve side effects on Task.

---

### Doanh thu & chốt ngày

**TYPE:** INDEPENDENT_BUSINESS_DOMAIN  

**PRIMARY ENTITY:** DailyClose (+ Unit)  

**OWNS DATA?** YES (`DailyClose`)  

**SOURCE OF TRUTH:** Write = `/api/daily-closes` upsert (LIVE). Read table/metrics = hardcoded HTML (MOCK / NOT_CONNECTED to API read).  

**CONNECTED TO:** Unit (required FK); Dashboard summary fields (API computes; UI mostly unbound)  

**CONNECTION PURPOSE:** Unit daily revenue/cash capture → reporting  

**IS CONNECTION REQUIRED TO TASK?** NO — finance closing is valid without Task/Project.  

**IS CONNECTION REQUIRED TO DASHBOARD?** For ops command center yes; DailyClose domain can stand alone for finance ops.  

**HEALTH:** PARTIAL (write LIVE + read MOCK)  

**VISUAL:** AMBER page posture; RED on hardcoded table/metrics; NORMAL on save modal controls  

**SEPARATE PAGE?** YES  

**REASON:** Independent money workflow; do not red-flag merely for lack of Task link.

---

### Chi phí

**TYPE:** INDEPENDENT_BUSINESS_DOMAIN  

**PRIMARY ENTITY:** Expense  

**OWNS DATA?** YES (`Expense`)  

**SOURCE OF TRUTH:** List/create/reconcile via API = LIVE. Analytics breakdown panels = MOCK. Top metric values PARTIAL (numbers from summary, deltas HTML).  

**CONNECTED TO:** Unit; Task optional (`linkedTaskId`); AI classify optional; Dashboard expense summary  

**CONNECTION PURPOSE:** Operating cost capture / reconcile  

**IS CONNECTION REQUIRED TO TASK?** NO — Expense is valid without Task. Task link is enrichment.  

**HEALTH:** LIVE for core list/CRUD; MOCK analytics islands → overall **PARTIAL** if judging whole page; core workflow **LIVE**  

**VISUAL:** NORMAL for list + create; RED for breakdown cards; AMBER for metric chrome  

**SEPARATE PAGE?** YES  

**REASON:** Complete independent domain for expense persistence; not orphaned by missing Task.

---

### Ứng dụng Lead/Tổ trưởng

**TYPE:** ROLE / PERSON VIEW (**ROLE_VIEW OF TASK SYSTEM**)  

**PRIMARY ENTITY:** Task (same rows as Công việc)  

**OWNS DATA?** NO — no Staff/Lead table; mutates Task via PATCH  

**SOURCE OF TRUTH:** `state.tasks` from dashboard; `renderStaff()` filters `status !== DONE` (and history = DONE). **Not** filtered by user/assignment (no User model).  

**CONNECTED TO:** Task only (status buttons → `/api/tasks/[id]`)  

**CONNECTION PURPOSE:** Mobile-style presentation for execution updates  

**IS CONNECTION REQUIRED?** YES — it is meaningless without Task. Connection exists.  

**HEALTH:** LIVE for Task PATCH actions; PARTIAL for “my work” identity (shows all open tasks)  

**VISUAL:** AMBER (PARTIAL scope) — not RED for being “not a separate module”  

**SEPARATE PAGE?** UNCLEAR / currently YES as presentation — architecturally it is a **view**, not a second Task system.  

**REASON:** Explicitly not an independent business module.

---

### Báo vấn đề

**TYPE:** ORPHAN FEATURE (intended WORKFLOW_ENTRY_POINT → Task/Decision, but code stops at create)  

**PRIMARY ENTITY:** Issue  

**OWNS DATA?** YES (`Issue`) — thin  

**SOURCE OF TRUTH:** `POST /api/issues` persists; no list UI; dashboard returns issues unused  

**CONNECTED TO:** Unit only  

**CONNECTION PURPOSE (intended):** Report → triage → Task or Decision  

**IS CONNECTION REQUIRED FOR FEATURE TO MAKE SENSE?** YES — product copy promises post-submit coordination; schema/API have no `linkedTaskId` / triage.  

**HEALTH:** PARTIAL on submit; ORPHAN / NOT_CONNECTED for downstream  

**VISUAL:** AMBER form; RED on “after submit” downstream claim  

**SEPARATE PAGE?** YES as intake UI today; should not be mistaken for complete ops loop  

**REASON:** Classic orphan: persists then dead-ends.

---

### Sơ đồ hệ thống

**TYPE:** UTILITY / SYSTEM VIEW  

**PRIMARY ENTITY:** none  

**OWNS DATA?** NO  

**SOURCE OF TRUTH:** Static HTML copy  

**CONNECTED TO:** none  

**CONNECTION PURPOSE:** n/a  

**IS CONNECTION REQUIRED?** NO — docs/diagram may be independent  

**HEALTH:** DEAD / ISOLATED (no runtime consumer beyond reading static page)  

**VISUAL:** RED  

**SEPARATE PAGE?** UNCLEAR (utility may stay)  

**REASON:** Non-operational; independence is fine; currently inert.

---

# Flow traces (code)

### PROJECT → TASK → DECISION
- Project create: LIVE, no auto Task.  
- Task may set `projectId` (seed/API); create form often omits project.  
- Decision may link Task and/or Project; create with blocking Task → Task BLOCKED; resolve updates Task.  
**Status:** REAL chain when linked; optional links.

### AI INBOX → DRAFT → TASK
- POST inbox → drafts; confirm → Task; merge → TaskEvent.  
**Status:** LIVE entry flow.

### ISSUE → ?
- POST Issue OPEN → stop. No Task/Decision.  
**Status:** ORPHAN / NOT_CONNECTED downstream.

### TASK → EXPENSE?
- Optional `Expense.linkedTaskId`; docs modal lists related expenses. Not required.  
**Status:** OPTIONAL DATA link; Expense independent.

### DAILY CLOSE → FINANCE → DASHBOARD
- Close POST LIVE → DB.  
- Finance table MOCK (unbound).  
- Dashboard summary API computes from closes; KPI cards MOCK unbound.  
**Status:** Write LIVE; read path BROKEN/MOCK.

### EXPENSE → FINANCE / DASHBOARD
- Expense list LIVE; dashboard expense card HTML MOCK; expense page metrics PARTIAL.  
**Status:** Domain LIVE; aggregation display incomplete.

### LEAD/TỔ TRƯỞNG → TASK?
- Same Task entities; PATCH status. Not a separate store.  
**Status:** ROLE_VIEW OF TASK — LIVE actions, PARTIAL personalization.

### DASHBOARD → sources
- Fat `/api/dashboard`; UI consumes decisions + expense metric values partially; ignores units/dailyCloses/issues/revenue/cash for main cards.  
**Status:** AGGREGATION intent; MOCK presentation for most KPIs.

---

# Summary table

| Sidebar Item | Architecture Type | Primary Entity | Own Workflow? | Must Connect To | Current Health | Visual | Separate Page? |
|--------------|-------------------|----------------|---------------|-----------------|----------------|--------|----------------|
| Trung tâm điều hành | AGGREGATION | none | No (aggregate only) | Source modules (DailyClose, Expense, Decision, Task…) | PARTIAL (strip LIVE / KPIs MOCK) | MIXED: RED KPIs, NORMAL decisions | YES |
| Dự án | CORE_WORKFLOW_OBJECT | Project | Yes | Optional: Task, Decision | LIVE | NORMAL | YES |
| Công việc | CORE_WORKFLOW_OBJECT | Task | Yes | Optional: Project, Decision, Expense | LIVE | NORMAL | YES |
| Hộp thư AI | WORKFLOW_ENTRY_POINT | MessageInbox / AiTaskDraft → Task | Intake only | Task (exists) | LIVE | NORMAL | YES |
| Việc chờ quyết định | CORE_WORKFLOW_OBJECT (queue UI of Decision) | Decision | Yes | Optional Task/Project for blocking | LIVE | NORMAL | YES |
| Doanh thu & chốt ngày | INDEPENDENT_BUSINESS_DOMAIN | DailyClose | Yes (close cycle) | Unit; not Task | PARTIAL | AMBER + RED table | YES |
| Chi phí | INDEPENDENT_BUSINESS_DOMAIN | Expense | Yes | Unit; Task optional | LIVE core / MOCK analytics | MIXED | YES |
| Ứng dụng Lead/Tổ trưởng | ROLE_VIEW OF TASK | Task | No own domain | Task (exists) | PARTIAL (identity) | AMBER | UNCLEAR (view) |
| Báo vấn đề | ORPHAN (intended entry) | Issue | Incomplete | Task/Decision (missing) | PARTIAL + NOT_CONNECTED down | AMBER/RED | YES (intake only) |
| Sơ đồ hệ thống | UTILITY | none | No | None required | DEAD | RED | UNCLEAR |

---

# Main Operational Flow (current real)

```
AI Inbox ──confirm──► Task ◄── Project (optional)
                        │
                        ├── Decision (optional block/resolve) ──► Task status/blocker
                        │
                        └── Expense (optional linkedTaskId)

Staff / Lead app ──PATCH──► Task   (same Task store)
```

# Independent Business Flows

```
Unit + DailyClose ──upsert──► (should feed) Dashboard/Finance read
Unit + Expense ──CRUD/reconcile──► (should feed) Dashboard metrics
```

These do **not** require Task to be valid domains.

# Role / Filter Views

| Page | Reality |
|------|---------|
| Ứng dụng Lead/Tổ trưởng | ROLE_VIEW OF TASK (mobile presentation + status actions) |
| Việc chờ quyết định | Decision module; title implies pending queue; code shows all Decision rows |
| Dashboard decision strip | Filtered/aggregated display of same Decision data |

# Utilities

| Page | Reality |
|------|---------|
| Sơ đồ hệ thống | Static utility / docs — DEAD as ops |

# Orphan Features

| Feature | Why orphan |
|---------|------------|
| Issue after submit | Persists OPEN; no triage → Task/Decision; no list consumer |
| Dashboard `issues` payload | API returns; no UI consumer |

# Mock / Dead Components (RED treatment)

| Component | Why |
|-----------|-----|
| Dashboard KPI metrics | Hardcoded HTML |
| Dashboard “3 ưu tiên” | Hardcoded |
| Dashboard unit revenue cards | Hardcoded |
| Dashboard “Cần chú ý” | Hardcoded |
| Finance alert + finance metrics | Hardcoded |
| Finance close table | Hardcoded; not bound to DailyClose |
| Expense breakdown / status / unit panels | Hardcoded |
| Expense time-range filter | DEAD (no handler) |
| Role selector | NOT_IMPLEMENTED |
| Date pill / side-bottom sample | MOCK |
| Blueprint page | DEAD |
| Before/After photos | MOCK |
| Expense camera / open chứng từ | MOCK |
| Priority replace-gate | NOT_CONNECTED |
| Revenue AI suggest → DailyClose | NOT_CONNECTED |

**Not RED solely for independence:** Expense list, DailyClose save, Project, Task, Decision, AI confirm.

---

**END.** Classification only. No sidebar/menu/architecture changes.
