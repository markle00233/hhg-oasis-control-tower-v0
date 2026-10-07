/* HHG Oasis — live UI wired to Prisma (post-handoff merge) */
(function () {
  if (window.gsap && window.Flip) {
    try {
      gsap.registerPlugin(Flip);
    } catch (_) {}
  }

  const titles = {
    dashboard: ["QUẢN TRỊ HHG", "Tổng quan"],
    projects: ["CÔNG VIỆC", "Task"],
    adminOps: ["ADMINISTRATION", "Leaders"],
    staffOps: ["CÔNG VIỆC", "Lịch của tôi"],
    tasks: ["DEBUG", "Công việc (cũ)"],
    ai: ["DEBUG", "Hộp thư AI"],
    decisions: ["CÔNG VIỆC", "Quyết định"],
    finance: ["VẬN HÀNH", "Chốt ngày"],
    expenses: ["VẬN HÀNH", "Chi phí"],
    docs: ["VẬN HÀNH", "Kho tài liệu"],
    staff: ["DEBUG", "Lead / Tổ trưởng"],
    issue: ["CÔNG VIỆC", "Vấn đề"],
    blueprint: ["DEBUG", "Sơ đồ hệ thống"],
  };

  const CORE_VIEWS = new Set([
    "dashboard",
    "projects",
    "adminOps",
    "staffOps",
    "issue",
    "decisions",
    "finance",
    "expenses",
    "docs",
  ]);

  const DEFERRED_VIEWS = new Set(["ai", "staff", "blueprint", "tasks"]);

  const DEFAULT_TASK_STEPS = [
    "Khởi động & chuẩn bị",
    "Triển khai chính",
    "Kiểm tra & chỉnh sửa",
    "Hoàn tất & bàn giao",
  ];

  function isDebugMode() {
    return document.body.classList.contains("hhg-debug");
  }

  function enableDebugModeIfRequested() {
    const q = new URLSearchParams(location.search);
    if (q.get("debug") === "1" || localStorage.getItem("hhg_debug") === "1") {
      document.body.classList.add("hhg-debug");
      if (q.get("debug") === "1") localStorage.setItem("hhg_debug", "1");
    }
    if (q.get("debug") === "0") {
      localStorage.removeItem("hhg_debug");
      document.body.classList.remove("hhg-debug");
    }
  }

  const statusVi = {
    TODO: "Chưa bắt đầu",
    DOING: "Đang làm",
    BLOCKED: "Bị chặn",
    PAUSED: "Tạm dừng",
    IN_REVIEW: "Chờ duyệt",
    DONE: "Hoàn tất",
    WAITING: "Đang chờ",
    PENDING: "Chờ quyết định",
    APPROVED: "Đã duyệt",
    NEEDS_INFO: "Cần bổ sung",
    REJECTED: "Từ chối",
    PROVISIONAL: "Tạm ghi nhận",
    RECONCILED: "Đã đối chiếu",
    LOCKED: "Đã chốt",
  };

  const quadrantVi = {
    DO_NOW: "DO NOW",
    PLAN: "PLAN",
    QUICK_ACTION: "QUICK ACTION",
    BACKLOG: "BACKLOG",
  };

  let state = {
    tasks: [],
    projects: [],
    decisions: [],
    expenses: [],
    documents: [],
    units: [],
    dailyCloses: [],
    issues: [],
    summary: null,
    opsDate: null,
    drafts: [],
    messageId: null,
    currentTaskId: null,
    currentProjectId: null,
    pendingProofStep: null,
    currentExpenseId: null,
    lastExpenseSuggest: null,
    taskFilter: "all",
    projectScope: "mine",
    projectFilter: "all",
    taskDetailTab: "steps",
    docView: "all",
    overviewOwner: null, // username / owner key đang xem trên Tổng quan
    staffTab: "tasks",
    selectedIssueCat: "BROKEN",
    issuePhotoName: null,
    expenseFromProjectId: null,
    adminLeaderUserId: null,
    adminScheduleDate: null,
    adminAssignMode: false,
    staffScheduleDate: null,
    adminStripStart: null,
    staffStripStart: null,
    capabilities: {
      canReconcileExpense: false,
      canResolveAnyDecision: false,
      isAdmin: false,
    },
    auth: {
      authenticated: false,
      user: null,
      assignments: [],
      directory: [],
      pendingUsername: null,
      loginSubmitting: false,
    },
  };

  window.currentTaskId = null;
  window.currentTaskKey = null; // alias for demo HTML

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(v) {
    const n = Number(v || 0);
    if (!n) return "—";
    return (
      (n / 1e6).toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " triệu"
    );
  }

  const sourceLabel = {
    MANUAL: "Nhập tay",
    POS: "Import POS",
    EXCEL: "File Excel",
    FINANCE: "Finance tổng hợp",
    AUTO: "Tự động",
  };

  function closeStatusVi(s) {
    if (s === "PROVISIONAL") return "Tạm ghi nhận";
    if (s === "RECONCILED") return "Đã đối chiếu";
    if (s === "LOCKED") return "Đã chốt";
    return s || "—";
  }

  function parseDeadline(d) {
    if (!d) return null;
    const iso = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    const vn = String(d).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    if (vn) return new Date(+(vn[3] || 2026), +vn[2] - 1, +vn[1]);
    return null;
  }

  function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  function markLive(el) {
    if (!el) return;
    el.classList.remove("health-mock", "health-not-connected", "health-partial", "health-dead");
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
  }
  window.showToast = showToast;

  const busyLocks = new Set();

  function resolveActionButton(ev) {
    if (!ev) return document.activeElement?.closest?.("button") || null;
    if (ev.currentTarget?.tagName === "BUTTON") return ev.currentTarget;
    return (
      ev.target?.closest?.("button") ||
      document.activeElement?.closest?.("button") ||
      null
    );
  }

  async function withBusy(evOrBtn, fn, opts = {}) {
    const btn =
      evOrBtn && evOrBtn.tagName === "BUTTON"
        ? evOrBtn
        : resolveActionButton(evOrBtn);
    const lockKey = opts.lockKey || btn || Symbol("busy");
    if (busyLocks.has(lockKey)) return;
    if (btn?.dataset?.busy === "1") return;
    busyLocks.add(lockKey);
    const prevHtml = btn ? btn.innerHTML : null;
    const prevDisabled = btn ? btn.disabled : false;
    if (btn) {
      btn.dataset.busy = "1";
      btn.disabled = true;
      btn.classList.add("loading");
      if (opts.label !== false) {
        btn.innerHTML = `<span class="btn-spin" aria-hidden="true"></span><span>${esc(
          opts.label || "Đang xử lý…"
        )}</span>`;
      }
    }
    try {
      return await fn(btn);
    } finally {
      busyLocks.delete(lockKey);
      if (btn) {
        btn.dataset.busy = "0";
        btn.disabled = prevDisabled;
        btn.classList.remove("loading");
        if (prevHtml != null) btn.innerHTML = prevHtml;
      }
    }
  }
  window.withBusy = withBusy;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !String(path).startsWith("/api/auth/")) {
      await handleUnauthorized(data.error);
      throw new Error(data.error || "Vui lòng chọn tài khoản để tiếp tục.");
    }
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    return data;
  }

  function avatarInitials(name) {
    const raw = String(name || "").trim();
    if (!raw) return "HH";
    const parts = raw.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    const token = parts[0].replace(/[^A-Za-z0-9]/g, "");
    if (token.length >= 2) return token.slice(0, 2).toUpperCase();
    return (token + "X").slice(0, 2).toUpperCase();
  }

  function isAuthenticated() {
    return !!(state.auth.authenticated && state.auth.user);
  }

  function setAuthFromPayload(payload) {
    if (payload?.authenticated && payload.user) {
      state.auth.authenticated = true;
      state.auth.user = payload.user;
      state.auth.assignments = payload.assignments || [];
      // Standard users are locked to their own task scope
      if (payload.user.systemRole !== "SYSTEM_ADMIN") {
        state.overviewOwner = "user:" + payload.user.username;
        document.body.classList.remove("hhg-admin");
        document.body.classList.add("hhg-staff");
      } else {
        document.body.classList.add("hhg-admin");
        document.body.classList.remove("hhg-staff");
      }
      document.body.classList.remove("hhg-overview");
    } else {
      state.auth.authenticated = false;
      state.auth.user = null;
      state.auth.assignments = [];
      document.body.classList.add("hhg-overview");
      document.body.classList.remove("hhg-admin");
      document.body.classList.remove("hhg-staff");
    }
    renderAccountSwitcher();
    renderDashboard();
    renderProjects();
    renderAdminOps();
    renderStaffOps();
  }

  function isSystemAdmin() {
    return state.auth.user?.systemRole === "SYSTEM_ADMIN";
  }

  /** Owner key that currently scopes Task list / dashboard focus */
  function scopedOwnerKey() {
    const user = state.auth.user;
    if (user && !isSystemAdmin()) return "user:" + user.username;
    return state.overviewOwner || null;
  }

  function projectStatusVi(s) {
    const m = {
      TODO: "Chưa làm",
      DOING: "Đang làm",
      WAITING: "Đang chờ",
      BLOCKED: "Bị chặn",
      PAUSED: "Tạm dừng",
      IN_REVIEW: "Chờ duyệt",
      DONE: "Hoàn tất",
      ON_TRACK: "Đang làm",
      AT_RISK: "Đang chờ",
    };
    return m[s] || s || "—";
  }

  function quadrantLabel(p) {
    const q = p.quadrant || p.viewerContext?.quadrant;
    return q ? quadrantVi[q] || q : null;
  }

  function awaitingAck(p) {
    return !!(p.viewerContext?.awaitingAcknowledgement || (p.status === "TODO" && !p.acknowledgedAt));
  }

  function currentUserId() {
    return state.auth.user?.id || null;
  }

  function memberRoleOn(p) {
    const uid = currentUserId();
    if (!uid) return null;
    const m = (p.members || []).find((x) => x.userId === uid);
    return m?.role || null;
  }

  function isPrimaryOn(p) {
    const role = memberRoleOn(p);
    if (role === "PRIMARY") return true;
    const user = state.auth.user;
    if (!user) return false;
    return ownerMatchesAccount(p.owner, user);
  }

  function isCollabOn(p) {
    return memberRoleOn(p) === "COLLABORATOR";
  }

  function isMemberOn(p) {
    return !!(memberRoleOn(p) || isPrimaryOn(p));
  }

  function visibleProjects() {
    let list = (state.projects || []).slice();
    const scope = state.projectScope || "mine";

    if (scope === "review") {
      list = list.filter(
        (p) =>
          p.status === "IN_REVIEW" &&
          (isSystemAdmin() ||
            p.reviewerUserId === currentUserId() ||
            p.viewerContext?.isReviewer)
      );
    } else if (!isAuthenticated()) {
      list = [];
    } else if (!isSystemAdmin()) {
      list = list.filter((p) => isMemberOn(p) || p.viewerContext?.isReviewer);
      if (scope === "mine") list = list.filter((p) => isPrimaryOn(p));
      else if (scope === "collab") list = list.filter((p) => isCollabOn(p));
    } else {
      const key = scopedOwnerKey();
      if (key) list = workItemsForOwner(key);
      if (!key) {
        if (scope === "mine") list = list.filter((p) => isPrimaryOn(p));
        else if (scope === "collab") list = list.filter((p) => isCollabOn(p));
      }
    }

    const f = state.projectFilter || "all";
    if (f === "overdue") {
      list = list.filter(
        (p) =>
          (p.deadlineRisk === "OVERDUE" || deadlineStatus(p.deadline).tone === "late") &&
          p.status !== "DONE"
      );
    } else if (f === "critical") {
      list = list.filter((p) => p.deadlineRisk === "CRITICAL");
    } else if (f === "atrisk") {
      list = list.filter((p) => p.deadlineRisk === "AT_RISK");
    } else if (f === "blocked") {
      list = list.filter((p) => p.status === "BLOCKED");
    } else if (f === "awaiting_ack") {
      list = list.filter((p) => awaitingAck(p));
    } else if (f === "done") {
      list = list.filter((p) => p.status === "DONE");
    }

    const q = String(document.getElementById("projectSearch")?.value || "")
      .trim()
      .toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          String(p.name || "").toLowerCase().includes(q) ||
          String(p.id || "").toLowerCase().includes(q) ||
          String(p.owner || "").toLowerCase().includes(q)
      );
    }
    return list;
  }

  async function loadAuthState() {
    const me = await api("/api/auth/me");
    setAuthFromPayload(me);
    return me;
  }

  async function loadAccountDirectory() {
    const data = await api("/api/users");
    state.auth.directory = data.users || [];
    renderAccountSwitcher();
    renderDashboard();
    return state.auth.directory;
  }

  function renderAccountSwitcher() {
    const label = document.getElementById("accountTriggerLabel");
    const avatar = document.getElementById("accountAvatar");
    const menu = document.getElementById("accountMenu");
    if (!label || !avatar || !menu) return;

    const user = state.auth.user;
    if (user) {
      label.textContent = user.displayName || user.username;
      avatar.textContent = avatarInitials(user.displayName || user.username);
    } else {
      label.textContent = "Tổng quan HHG Oasis";
      avatar.textContent = "HH";
    }

    const directory = state.auth.directory || [];
    const standard = directory.filter((u) => u.systemRole !== "SYSTEM_ADMIN");
    const admins = directory.filter((u) => u.systemRole === "SYSTEM_ADMIN");
    const currentId = user?.id || null;
    const overviewActive = !user;

    const row = (u, sub) => {
      const active = currentId && u.id === currentId;
      return `<button type="button" class="account-menu-item${
        active ? " active" : ""
      }" data-account-username="${esc(u.username)}" role="option" aria-selected="${
        active ? "true" : "false"
      }">
        <span class="avatar">${esc(avatarInitials(u.displayName || u.username))}</span>
        <span class="meta"><b>${esc(u.displayName || u.username)}</b><small>${esc(
        sub || u.username
      )}</small></span>
        <span class="check">${active ? "✓" : ""}</span>
      </button>`;
    };

    menu.innerHTML =
      `<div class="account-menu-section">Tổng quan</div>` +
      `<button type="button" class="account-menu-item${
        overviewActive ? " active" : ""
      }" data-account-action="overview" role="option" aria-selected="${
        overviewActive ? "true" : "false"
      }">
        <span class="avatar">HH</span>
        <span class="meta"><b>Tổng quan HHG Oasis</b><small>Đọc · không đăng nhập</small></span>
        <span class="check">${overviewActive ? "✓" : ""}</span>
      </button>` +
      `<div class="account-menu-divider"></div>` +
      `<div class="account-menu-section">Tài khoản</div>` +
      (standard.length
        ? standard.map((u) => row(u, "STANDARD_USER")).join("")
        : `<div class="account-menu-item" style="cursor:default;opacity:.7"><span class="meta"><b>Chưa có tài khoản</b><small>Seed users trước</small></span></div>`) +
      `<div class="account-menu-divider"></div>` +
      `<div class="account-menu-section">Hệ thống</div>` +
      (admins.length
        ? admins.map((u) => row(u, "SYSTEM_ADMIN")).join("")
        : `<div class="account-menu-item" style="cursor:default;opacity:.7"><span class="meta"><b>Chưa có ADMINISTRATION</b></span></div>`);

    menu.querySelectorAll("[data-account-action='overview']").forEach((btn) =>
      btn.addEventListener("click", () => {
        closeAccountSelector();
        logoutToOverview();
      })
    );
    menu.querySelectorAll("[data-account-username]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const username = btn.getAttribute("data-account-username");
        closeAccountSelector();
        if (user && user.username === username) return;
        openPasswordGate(username);
      })
    );
  }

  function openAccountSelector() {
    const menu = document.getElementById("accountMenu");
    const trigger = document.getElementById("accountTrigger");
    if (!menu || !trigger) return;
    menu.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function closeAccountSelector() {
    const menu = document.getElementById("accountMenu");
    const trigger = document.getElementById("accountTrigger");
    menu?.classList.remove("open");
    trigger?.setAttribute("aria-expanded", "false");
  }

  function toggleAccountSelector() {
    const menu = document.getElementById("accountMenu");
    if (menu?.classList.contains("open")) closeAccountSelector();
    else openAccountSelector();
  }

  function openPasswordGate(username) {
    const u =
      (state.auth.directory || []).find((x) => x.username === username) || {
        username,
        displayName: username,
      };
    state.auth.pendingUsername = u.username;
    state.auth.loginSubmitting = false;
    document.getElementById("pwGateName").textContent = u.displayName || u.username;
    document.getElementById("pwGateSub").textContent = u.username;
    document.getElementById("pwGateAvatar").textContent = avatarInitials(
      u.displayName || u.username
    );
    const input = document.getElementById("pwGateInput");
    if (input) {
      input.type = "password";
      input.value = "";
    }
    const toggle = document.getElementById("pwGateToggle");
    if (toggle) toggle.textContent = "Hiện";
    const err = document.getElementById("pwGateError");
    if (err) err.textContent = "";
    const submit = document.getElementById("pwGateSubmit");
    if (submit) {
      submit.disabled = false;
      submit.classList.remove("loading");
      submit.textContent = "Vào tài khoản";
    }
    document.getElementById("passwordGateModal")?.classList.add("show");
    setTimeout(() => input?.focus(), 30);
  }

  window.closePasswordGate = function () {
    const input = document.getElementById("pwGateInput");
    if (input) input.value = "";
    state.auth.pendingUsername = null;
    state.auth.loginSubmitting = false;
    document.getElementById("passwordGateModal")?.classList.remove("show");
    const err = document.getElementById("pwGateError");
    if (err) err.textContent = "";
  };

  window.togglePasswordVisibility = function () {
    const input = document.getElementById("pwGateInput");
    const toggle = document.getElementById("pwGateToggle");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    if (toggle) toggle.textContent = show ? "Ẩn" : "Hiện";
  };

  async function loginAs(username, password) {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setAuthFromPayload(data);
    return data;
  }

  window.submitPasswordGate = async function () {
    if (state.auth.loginSubmitting) return;
    const username = state.auth.pendingUsername;
    const input = document.getElementById("pwGateInput");
    const password = input?.value || "";
    const err = document.getElementById("pwGateError");
    const submit = document.getElementById("pwGateSubmit");
    if (!username) return;
    if (!password) {
      if (err) err.textContent = "Vui lòng nhập mật khẩu.";
      return;
    }
    state.auth.loginSubmitting = true;
    if (submit) {
      submit.disabled = true;
      submit.classList.add("loading");
      submit.textContent = "Đang xác thực…";
    }
    if (err) err.textContent = "";
    try {
      await loginAs(username, password);
      if (input) input.value = "";
      closePasswordGate();
      state.overviewOwner = "user:" + username;
      renderDashboard();
      renderProjects();
      setView("projects");
      showToast("Đã vào tài khoản · chỉ hiện Task của " + username);
    } catch (e) {
      if (input) input.value = "";
      if (err)
        err.textContent =
          e.message || "Tài khoản hoặc mật khẩu không đúng.";
      // Failed switch must keep current session — do not touch auth.user
      await loadAuthState().catch(() => {});
    } finally {
      state.auth.loginSubmitting = false;
      if (submit) {
        submit.disabled = false;
        submit.classList.remove("loading");
        submit.textContent = "Vào tài khoản";
      }
    }
  };

  async function logoutToOverview() {
    if (!isAuthenticated()) {
      setAuthFromPayload({ authenticated: false, user: null });
      state.overviewOwner = null;
      renderDashboard();
      renderProjects();
      setView("dashboard");
      closeAccountSelector();
      return;
    }
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (_) {
      /* still clear client */
    }
    setAuthFromPayload({ authenticated: false, user: null, assignments: [] });
    state.overviewOwner = null;
    renderDashboard();
    renderProjects();
    setView("dashboard");
    showToast("Tổng quan · chọn tài khoản để xem Task của người đó");
  }

  async function handleUnauthorized(serverMsg) {
    setAuthFromPayload({ authenticated: false, user: null, assignments: [] });
    showToast(serverMsg || "Vui lòng chọn tài khoản để tiếp tục.");
    openAccountSelector();
  }

  function requireAuthenticatedAction(callback) {
    if (isAuthenticated()) {
      return callback();
    }
    showToast("Vui lòng chọn tài khoản để tiếp tục.");
    openAccountSelector();
    return false;
  }
  window.requireAuthenticatedAction = requireAuthenticatedAction;
  window.openAccountSelector = openAccountSelector;
  window.openPasswordGate = openPasswordGate;
  window.logoutToOverview = logoutToOverview;

  function closeMobileMenu() {
    const t = document.getElementById("mobileMenuToggle");
    if (t) t.checked = false;
  }

  window.setView = function (id) {
    if (id === "tasks" && !isDebugMode()) {
      id = "projects";
    }
    // Tổng quan Oasis: không mở Task / Vấn đề / Quyết định
    if (
      !isAuthenticated() &&
      (id === "projects" ||
        id === "issue" ||
        id === "decisions" ||
        id === "tasks" ||
        id === "adminOps" ||
        id === "staffOps")
    ) {
      showToast("Đăng nhập tài khoản để mở mục Công việc");
      id = "dashboard";
    }
    if (id === "adminOps" && !isSystemAdmin()) {
      showToast("Chỉ ADMINISTRATION mới mở Leaders");
      id = "staffOps";
    }
    if (id === "staffOps" && isSystemAdmin()) {
      id = "adminOps";
    }
    if (DEFERRED_VIEWS.has(id) && !isDebugMode()) {
      showToast("Module này chưa mở trong bản MVP.");
      id = "dashboard";
    }
    if (!CORE_VIEWS.has(id) && !DEFERRED_VIEWS.has(id)) id = "dashboard";
    const r = document.getElementById("vr-" + id);
    if (r) r.checked = true;
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
    document
      .querySelectorAll(".nav [data-view]")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === id));
    if (titles[id]) {
      document.getElementById("eyebrow").textContent = titles[id][0];
      document.getElementById("pageTitle").textContent = titles[id][1];
    }
    history.replaceState(null, "", "?view=" + id);
    closeMobileMenu();
    window.scrollTo(0, 0);
    if (id === "docs") loadDocuments();
    if (id === "projects") renderProjects();
    if (id === "adminOps") {
      closeAdminLeaderSchedule(true);
      renderAdminOps();
    }
    if (id === "staffOps") renderStaffOps();
  };

  function tagStatus(s) {
    if (["DONE", "APPROVED", "LOCKED", "RECONCILED"].includes(s)) return "green";
    if (["BLOCKED", "REJECTED"].includes(s)) return "red";
    if (["WAITING", "PENDING", "NEEDS_INFO", "PROVISIONAL"].includes(s))
      return "amber";
    if (s === "DOING") return "blue";
    return "gray";
  }

  function renderTasks() {
    const tb = document.getElementById("taskTableBody");
    if (!tb) return;
    let list = state.tasks.slice();
    const f = state.taskFilter || "all";
    if (f === "p01") list = list.filter((t) => t.priority === "P0" || t.priority === "P1");
    else if (f === "overdue") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      list = list.filter((t) => {
        if (t.status === "DONE") return false;
        const d = parseDeadline(t.deadline);
        return d && d < today;
      });
    }
    else if (f === "blocked") list = list.filter((t) => t.status === "BLOCKED" || t.status === "WAITING");
    else if (f === "ba")
      list = list.filter(
        (t) =>
          /đèn|ảnh|trước|sau|biển|pickle|ổ điện|sửa/i.test(t.title) ||
          (t.progress || 0) > 0
      );

    tb.innerHTML = list.length
      ? list
          .map((t) => {
            return `<tr data-id="${t.id}">
        <td class="task-title"><b>${esc(t.title)}</b><small>${esc(t.code || "")}${t.project ? " · " + esc(t.project.name) : ""}</small></td>
        <td>${esc(t.unit?.name || "—")}</td>
        <td><span class="tag ${t.priority === "P1" || t.priority === "P0" ? "amber" : "gray"}">${t.priority}</span></td>
        <td>${esc(t.owner || "—")}</td>
        <td>${esc(t.deadline || "—")}</td>
        <td><span class="tag ${tagStatus(t.status)}">${statusVi[t.status] || t.status}</span></td>
        <td>${t.cost != null ? money(t.cost) : "—"}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="7" style="padding:16px;color:var(--muted)">Không có việc trong bộ lọc này.</td></tr>`;
    tb.querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", () => openTaskDetail(tr.dataset.id))
    );

    const sel = document.getElementById("decisionTask");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML =
        `<option value="">— Không gắn công việc —</option>` +
        state.tasks
          .map(
            (t) =>
              `<option value="${t.id}">${esc(t.code || t.id.slice(0, 8))} · ${esc(t.title)}</option>`
          )
          .join("");
      sel.value = cur;
    }
  }

  function renderStaff() {
    const list = document.getElementById("staffTaskList");
    const hist = document.getElementById("staffHistory");
    const hello = document.getElementById("staffHello");
    if (!list) return;

    if (state.staffTab === "history") {
      list.style.display = "none";
      if (hist) {
        hist.style.display = "block";
        const done = state.tasks.filter((t) => t.status === "DONE");
        hist.innerHTML =
          `<div class="hello"><small>Lịch sử</small><h3>${done.length} việc đã xong</h3></div>` +
          (done.length
            ? done
                .map(
                  (t) => `<div class="staff-task" data-open-id="${t.id}">
              <div class="top"><div><h3>${esc(t.title)}</h3>
              <p>${esc(t.unit?.name || "")} · ${statusVi[t.status] || t.status}</p></div>
              <span class="tag green">Hoàn tất</span></div></div>`
                )
                .join("")
            : `<p style="font-size:12px;color:var(--muted)">Chưa có việc hoàn tất.</p>`);
        hist.querySelectorAll("[data-open-id]").forEach((el) => {
          el.addEventListener("click", () => openTaskDetail(el.dataset.openId));
        });
      }
      return;
    }

    if (hist) hist.style.display = "none";
    list.style.display = "block";
    const open = state.tasks.filter((t) => t.status !== "DONE");
    if (hello)
      hello.innerHTML = `<small>Hôm nay</small><h3>Còn ${open.length} việc cần xử lý</h3>`;
    list.innerHTML = open.length
      ? open
          .map((t, i) => {
            const tag = i === 0 ? "amber" : "gray";
            const label = i === 0 ? "Làm trước" : "Tiếp theo";
            return `<div class="staff-task" data-open-id="${t.id}">
        <div class="top"><div><h3>${esc(t.title)}</h3>
        <p>${esc(t.deadline || "")} · ${esc(t.unit?.name || "")}</p></div>
        <span class="tag ${tag}">${label}</span></div>
        <div class="staff-actions">
          <button type="button" class="start" data-act="DOING" data-id="${t.id}">BẮT ĐẦU</button>
          <button type="button" class="done" data-act="DONE" data-id="${t.id}">ĐÃ XONG</button>
          <button type="button" class="problem" data-act="BLOCKED" data-id="${t.id}">CÓ VẤN ĐỀ</button>
        </div></div>`;
          })
          .join("")
      : `<p style="font-size:12px;color:var(--muted)">Không còn việc mở.</p>`;

    list.querySelectorAll("[data-open-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        openTaskDetail(card.dataset.openId);
      });
    });
    list.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await updateTaskStatus(btn.dataset.id, btn.dataset.act);
      });
    });
  }

  function projectsForLeader(user) {
    return (state.projects || []).filter((p) => ownerMatchesAccount(p.owner, user));
  }

  /** Equal-weight overall: each assigned task = 100/n; DONE=full, else energy% of weight */
  function leaderOverallPct(user) {
    const list = projectsForLeader(user);
    if (!list.length) return 0;
    const weight = 100 / list.length;
    let sum = 0;
    for (const p of list) {
      if (p.status === "DONE") sum += weight;
      else sum += (displayEnergy(p) / 100) * weight;
    }
    return Math.round(sum);
  }

  function formatAdmDayLabel(d) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const nth = (n) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    return `${days[d.getDay()]}, ${nth(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function toYmd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseYmd(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function leaderDayProjects(user, date) {
    const list = projectsForLeader(user).filter((p) => p.status !== "DONE");
    return list.filter((p) => {
      const dl = parseDeadline(p.deadline);
      if (dl && sameDay(dl, date)) return true;
      // no deadline → show on today only (load board)
      if (!dl && sameDay(date, new Date())) return true;
      return false;
    });
  }

  function buildDaySlots(projects) {
    let cursor = 10 * 60; // 10:00
    return projects.map((p, i) => {
      const mins = Math.max(30, Number(p.estimatedDurationMinutes) || 60);
      const start = cursor;
      const end = cursor + mins;
      cursor = end + 15;
      const fmt = (m) => {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        const ap = h >= 12 ? "pm" : "am";
        const h12 = ((h + 11) % 12) + 1;
        return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${ap}`;
      };
      return {
        project: p,
        startLabel: fmt(start),
        rangeLabel: `${fmt(start)} – ${fmt(end)}`,
        hourLabel: fmt(start),
        colorIndex: i % 8,
      };
    });
  }

  function renderAdminOps() {
    const grid = document.getElementById("admLeaderGrid");
    if (!grid) return;
    if (!isSystemAdmin()) {
      grid.innerHTML = `<p class="adm-empty">Chỉ tài khoản ADMINISTRATION mới xem Leaders.</p>`;
      return;
    }
    const user = state.auth.user;
    const hello = document.getElementById("admAdminHello");
    const av = document.getElementById("admAdminAvatar");
    const name = user?.displayName || user?.username || "ADMIN";
    if (hello) hello.textContent = String(name).toUpperCase();
    if (av) av.textContent = avatarInitials(name);

    const leaders = (state.auth.directory || []).filter(
      (u) => u.systemRole !== "SYSTEM_ADMIN" && u.status !== "DISABLED"
    );
    if (!leaders.length) {
      grid.innerHTML = `<p class="adm-empty">Chưa có Leader trong directory.</p>`;
      return;
    }
    grid.innerHTML = leaders
      .map((u, i) => {
        const overall = leaderOverallPct(u);
        const n = projectsForLeader(u).length;
        const label = u.displayName || u.username;
        return `<button type="button" class="adm-leader-card adm-c${i % 8}" data-leader-id="${esc(u.id)}">
          <div class="adm-leader-top">
            <span class="adm-mini-av">${esc(avatarInitials(label))}</span>
            <span class="adm-leader-name">${esc(label)}</span>
          </div>
          <div class="adm-overall"><span>overall</span> ${overall}%${n ? ` · ${n} task` : ""}</div>
        </button>`;
      })
      .join("");

    grid.querySelectorAll("[data-leader-id]").forEach((btn) => {
      btn.addEventListener("click", () => openAdminLeaderSchedule(btn.getAttribute("data-leader-id")));
    });

    if (window.gsap) {
      gsap.fromTo(
        "#admLeaderGrid .adm-leader-card",
        { y: 28, opacity: 0, scale: 0.92 },
        { y: 0, opacity: 1, scale: 1, duration: 0.45, stagger: 0.07, ease: "power3.out", overwrite: true }
      );
    }

    if (state.adminLeaderUserId) {
      renderAdminSchedule();
    }
  }

  function openAdminLeaderSchedule(userId) {
    if (!isSystemAdmin()) return;
    const user = (state.auth.directory || []).find((u) => u.id === userId);
    if (!user) return;
    state.adminLeaderUserId = userId;
    if (!state.adminScheduleDate) state.adminScheduleDate = toYmd(new Date());
    const home = document.getElementById("admHome");
    const sched = document.getElementById("admSchedule");
    if (home) home.hidden = true;
    if (sched) sched.hidden = false;
    renderAdminSchedule();
    if (window.gsap && sched) {
      gsap.fromTo(
        sched,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, ease: "power2.out" }
      );
      gsap.fromTo(
        "#admSchedule .adm-cal-panel",
        { y: 36, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, delay: 0.08, ease: "power3.out" }
      );
      gsap.fromTo(
        "#admFab",
        { scale: 0.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, delay: 0.2, ease: "back.out(1.7)" }
      );
    }
  }

  function closeAdminLeaderSchedule(silent) {
    state.adminLeaderUserId = null;
    const home = document.getElementById("admHome");
    const sched = document.getElementById("admSchedule");
    if (sched) sched.hidden = true;
    if (home) home.hidden = false;
    if (!silent && window.gsap && home) {
      gsap.fromTo(home, { x: -24, opacity: 0.6 }, { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" });
      renderAdminOps();
    }
  }
  window.closeAdminLeaderSchedule = closeAdminLeaderSchedule;

  function renderAdminSchedule() {
    const user = (state.auth.directory || []).find((u) => u.id === state.adminLeaderUserId);
    if (!user) return;
    const label = user.displayName || user.username;
    const hello = document.getElementById("admLeaderHello");
    const av = document.getElementById("admLeaderAvatar");
    if (hello) hello.textContent = String(label).toUpperCase();
    if (av) av.textContent = avatarInitials(label);

    const base = parseYmd(state.adminScheduleDate) || new Date();
    state.adminScheduleDate = toYmd(base);
    if (!state.adminStripStart) {
      const a = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 2);
      state.adminStripStart = toYmd(a);
    }
    const stripStart = parseYmd(state.adminStripStart) || base;
    const dateLabel = document.getElementById("admCalDateLabel");
    if (dateLabel) dateLabel.textContent = formatAdmDayLabel(base);

    const strip = document.getElementById("admDayStrip");
    if (strip) {
      const days = [];
      for (let i = 0; i < 14; i++) {
        days.push(
          new Date(stripStart.getFullYear(), stripStart.getMonth(), stripStart.getDate() + i)
        );
      }
      const dows = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      strip.innerHTML = days
        .map((d) => {
          const on = sameDay(d, base) ? " on" : "";
          return `<button type="button" class="adm-day${on}" data-ymd="${toYmd(d)}">
            <span class="dow">${dows[d.getDay()]}</span>
            <span class="dom">${String(d.getDate()).padStart(2, "0")}</span>
          </button>`;
        })
        .join("");
      strip.querySelectorAll("[data-ymd]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.adminScheduleDate = btn.getAttribute("data-ymd");
          renderAdminSchedule();
          if (window.gsap) {
            gsap.fromTo(btn.querySelector(".dom"), { scale: 0.7 }, { scale: 1, duration: 0.25, ease: "back.out(1.6)" });
          }
        });
      });
    }

    const timeline = document.getElementById("admTimeline");
    if (!timeline) return;
    const dayProjects = leaderDayProjects(user, base);
    const slots = buildDaySlots(dayProjects);
    if (!slots.length) {
      timeline.innerHTML = `<div class="adm-slot-empty">Chưa có việc phân bổ ngày này.<br/>Bấm + để giao task cho ${esc(label)}.</div>`;
    } else {
      timeline.innerHTML = slots
        .map((s) => {
          const q = s.project.quadrant || s.project.viewerContext?.quadrant || "";
          const energy = displayEnergy(s.project);
          return `<div class="adm-slot">
            <div class="adm-slot-time">${esc(s.hourLabel)}</div>
            <div class="adm-slot-card q-${esc(q)}" data-open-id="${esc(s.project.id)}">
              <b>${esc(s.project.name)}</b>
              <small>${esc(s.rangeLabel)} · ${energy}% · ${esc(projectStatusVi(s.project.status))}</small>
              <div class="adm-slot-meta">
                <div class="adm-slot-av"><i>${esc(avatarInitials(label))}</i></div>
                <small>${esc(quadrantLabel(s.project) || "—")}</small>
              </div>
            </div>
          </div>`;
        })
        .join("");
      timeline.querySelectorAll("[data-open-id]").forEach((el) => {
        el.addEventListener("click", () => openTaskEnergyModal(el.getAttribute("data-open-id")));
      });
    }
    if (window.gsap) {
      gsap.fromTo(
        "#admTimeline .adm-slot",
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.32, stagger: 0.05, ease: "power2.out", overwrite: true }
      );
    }
  }

  window.openAdminAssign = function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    if (!isSystemAdmin()) {
      showToast("Chỉ ADMINISTRATION mới giao task");
      return;
    }
    const leader = (state.auth.directory || []).find((u) => u.id === state.adminLeaderUserId);
    openProjectModal({
      assignMode: true,
      ownerLabel: leader ? leader.displayName || leader.username : "",
      fromFab: true,
    });
    if (window.gsap) {
      const card = document.querySelector("#projectModal .modal-card");
      if (card) {
        gsap.fromTo(
          card,
          { y: 80, opacity: 0, scale: 0.92 },
          { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "power3.out" }
        );
      }
    }
  };

  function myStaffProjects() {
    const user = state.auth.user;
    if (!user) return [];
    return (state.projects || []).filter((p) => {
      if (p.status === "DONE") return false;
      if (ownerMatchesAccount(p.owner, user)) return true;
      return (p.members || []).some(
        (m) => (m.userId === user.id || m.user?.id === user.id) && m.role === "PRIMARY"
      );
    });
  }

  function staffDayProjects(date) {
    return myStaffProjects().filter((p) => {
      const dl = parseDeadline(p.deadline);
      if (dl && sameDay(dl, date)) return true;
      if (!dl && sameDay(date, new Date())) return true;
      return false;
    });
  }

  function renderStaffOps() {
    const timeline = document.getElementById("staffTimeline");
    if (!timeline) return;
    if (isSystemAdmin()) return;
    const user = state.auth.user;
    if (!user) {
      timeline.innerHTML = `<div class="adm-slot-empty">Đăng nhập để xem lịch.</div>`;
      return;
    }
    const name = user.displayName || user.username || "STAFF";
    const hello = document.getElementById("staffHelloName");
    const av = document.getElementById("staffHelloAvatar");
    if (hello) hello.textContent = String(name).toUpperCase();
    if (av) av.textContent = avatarInitials(name);

    const base = parseYmd(state.staffScheduleDate) || new Date();
    state.staffScheduleDate = toYmd(base);
    if (!state.staffStripStart) {
      const a = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 2);
      state.staffStripStart = toYmd(a);
    }
    const stripStart = parseYmd(state.staffStripStart) || base;
    const dateLabel = document.getElementById("staffCalDateLabel");
    if (dateLabel) dateLabel.textContent = formatAdmDayLabel(base);

    const strip = document.getElementById("staffDayStrip");
    if (strip) {
      const days = [];
      for (let i = 0; i < 14; i++) {
        days.push(
          new Date(stripStart.getFullYear(), stripStart.getMonth(), stripStart.getDate() + i)
        );
      }
      const dows = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      strip.innerHTML = days
        .map((d) => {
          const on = sameDay(d, base) ? " on" : "";
          return `<button type="button" class="adm-day${on}" data-ymd="${toYmd(d)}">
            <span class="dow">${dows[d.getDay()]}</span>
            <span class="dom">${String(d.getDate()).padStart(2, "0")}</span>
          </button>`;
        })
        .join("");
      strip.querySelectorAll("[data-ymd]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.staffScheduleDate = btn.getAttribute("data-ymd");
          renderStaffOps();
          if (window.gsap) {
            gsap.fromTo(btn.querySelector(".dom"), { scale: 0.7 }, { scale: 1, duration: 0.25, ease: "back.out(1.6)" });
          }
        });
      });
    }

    const dayProjects = staffDayProjects(base);
    const slots = buildDaySlots(dayProjects);
    const stack = document.getElementById("staffAvatarStack");
    if (stack) {
      const people = [];
      dayProjects.forEach((p) => {
        (p.members || []).forEach((m) => {
          const lab = m.user?.displayName || m.user?.username || m.displayName;
          if (lab && !people.includes(lab)) people.push(lab);
        });
      });
      stack.innerHTML = people
        .slice(0, 4)
        .map((lab) => `<i>${esc(avatarInitials(lab))}</i>`)
        .join("");
    }

    if (!slots.length) {
      timeline.innerHTML = `<div class="adm-slot-empty">Chưa có task trong ngày này.<br/>Khi Admin giao việc, lịch sẽ hiện ở đây.</div>`;
    } else {
      timeline.innerHTML = slots
        .map((s) => {
          const q = s.project.quadrant || s.project.viewerContext?.quadrant || "";
          const energy = displayEnergy(s.project);
          const desc = String(s.project.description || s.project.expectedResult || "")
            .split("\n")[0]
            .slice(0, 72);
          return `<div class="adm-slot">
            <div class="adm-slot-time">${esc(s.hourLabel)}</div>
            <div class="adm-slot-card q-${esc(q)}" data-open-id="${esc(s.project.id)}" style="background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.06)">
              <b>${esc(s.project.name)}</b>
              ${desc ? `<small style="display:block;margin-top:4px">${esc(desc)}</small>` : ""}
              <small style="display:block;margin-top:6px">${esc(s.rangeLabel)} · ${energy}% · ${esc(projectStatusVi(s.project.status))}</small>
              <div class="adm-staff-hint">Chạm để mở Task · lập hạng mục &amp; giàn thời gian</div>
            </div>
          </div>`;
        })
        .join("");
      timeline.querySelectorAll("[data-open-id]").forEach((el) => {
        el.addEventListener("click", () => openTaskEnergyModal(el.getAttribute("data-open-id")));
      });
    }
    if (window.gsap) {
      gsap.fromTo(
        "#staffTimeline .adm-slot",
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.32, stagger: 0.05, ease: "power2.out", overwrite: true }
      );
    }
  }

  async function updateTaskStatus(id, status) {
    const progress = status === "DONE" ? 100 : status === "DOING" ? 40 : 20;
    const labels = {
      DOING: "Bắt đầu xử lý",
      DONE: "Đánh dấu hoàn tất",
      BLOCKED: "Báo có vấn đề",
    };
    try {
      await api("/api/tasks/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          progress,
          blocker: status === "BLOCKED" ? "Nhân viên báo có vấn đề" : null,
          eventLabel: labels[status] || status,
          eventDetail: "Từ app nhân viên",
        }),
      });
      showToast("Đã cập nhật trạng thái việc");
      await refresh();
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  }

  function stepCountForProject(p) {
    const fromLabels = Array.isArray(p.stepLabels)
      ? p.stepLabels.filter((x) => String(x || "").trim()).length
      : 0;
    const fromFlags = String(p.stepFlags || "").replace(/[^01]/g, "").length;
    return Math.min(20, Math.max(4, fromLabels || 0, fromFlags || 0, 4));
  }

  function normalizeStepFlags(raw, len) {
    const n = Math.max(1, Number(len) || 4);
    let s = String(raw ?? "").replace(/[^01]/g, "");
    if (!s) s = "0".repeat(n);
    if (s.length < n) s = s.padEnd(n, "0");
    if (s.length > n) s = s.slice(0, n);
    return s;
  }

  function stepLabelsForProject(p) {
    const n = stepCountForProject(p);
    if (Array.isArray(p.stepLabels) && p.stepLabels.some((x) => String(x || "").trim())) {
      const labels = p.stepLabels.map((x) => String(x || "").trim()).filter(Boolean);
      while (labels.length < n) {
        labels.push(DEFAULT_TASK_STEPS[labels.length] || "Hạng mục " + (labels.length + 1));
      }
      return labels.slice(0, n);
    }
    const fromTasks = (p.tasks || [])
      .slice()
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
      .map((t) => t.title)
      .filter(Boolean);
    return Array.from({ length: n }, (_, i) => fromTasks[i] || DEFAULT_TASK_STEPS[i] || "Hạng mục " + (i + 1));
  }

  function energyFromFlags(flags) {
    const s = String(flags || "");
    if (!s.length) return 0;
    const done = [...s].filter((c) => c === "1").length;
    return Math.round((done / s.length) * 100);
  }

  function pctPerStep(total) {
    return Math.round(100 / Math.max(1, total));
  }

  function displayFlags(p) {
    const n = stepCountForProject(p);
    const flags = normalizeStepFlags(p.stepFlags, n);
    if (flags !== "0".repeat(n)) return flags;
    const legacyN = Math.min(n, Math.floor(Number(p.readiness || 0) / 25));
    return "1".repeat(legacyN) + "0".repeat(n - legacyN);
  }

  function displayEnergy(p) {
    return energyFromFlags(displayFlags(p));
  }

  function renderProjects() {
    const grid = document.getElementById("projectGrid");
    if (!grid) return;
    const list = visibleProjects();
    const scopeKey = scopedOwnerKey();
    const clearBtn = document.getElementById("projectOwnerClear");
    const canClear =
      !!state.overviewOwner && (!isAuthenticated() || isSystemAdmin());
    if (clearBtn) clearBtn.style.display = canClear ? "" : "none";

    const countEl = document.getElementById("projectCalCount");
    if (countEl) countEl.textContent = list.length ? `${list.length} Task` : "";
    const monthEl = document.getElementById("projectCalMonth");
    if (monthEl) {
      const labels = { mine: "Tôi phụ trách", collab: "Tôi tham gia", all: "Tất cả Task" };
      monthEl.textContent = labels[state.projectScope] || "Phạm vi";
    }

    grid.innerHTML = list.length
      ? list
          .map((p, i) => {
            const flags = displayFlags(p);
            const energy = displayEnergy(p);
            const totalSteps = flags.length;
            const doneSteps = [...flags].filter((c) => c === "1").length;
            const ownerLabel = p.owner || "—";
            const dl = deadlineStatus(p.deadline);
            const st = p.status || "TODO";
            const members = p.members || [];
            const avatars = members
              .slice(0, 3)
              .map((m) => {
                const name = m.user?.displayName || m.user?.username || "?";
                const ini = name.slice(0, 2).toUpperCase();
                return `<span class="av" title="${esc(name)}">${esc(ini)}</span>`;
              })
              .join("");
            const more =
              members.length > 3
                ? `<span class="av more">+${members.length - 3}</span>`
                : "";
            const priorityClass =
              p.priority === "P0" || p.priority === "P1" || p.quadrant === "DO_NOW"
                ? " is-priority"
                : "";
            const q = quadrantLabel(p);
            const ack = awaitingAck(p)
              ? `<span class="status-pill" style="background:#fff3cd;margin-left:4px">Awaiting Ack</span>`
              : "";
            const risk = p.deadlineRisk || "ON_TRACK";
            const riskTone =
              risk === "OVERDUE" || risk === "CRITICAL"
                ? "late"
                : risk === "AT_RISK"
                  ? "soon"
                  : "ok";
            return `<div class="card project${priorityClass}" data-project-id="${p.id}" role="button" tabindex="0">
        <div class="row">
          <div style="min-width:0;flex:1">
            <div style="font-size:11px;font-weight:800;color:var(--muted);margin-bottom:4px">${esc(q || "—")} · ${esc(projectStatusVi(st))} · <span class="deadline-chip ${riskTone}">${esc(risk)}</span>${ack}</div>
            <h3 style="margin:0 0 4px">${esc(p.name)}</h3>
            <p style="margin:0">${esc(ownerLabel)}${p.description ? " · " + esc(String(p.description).slice(0, 60)) : ""}</p>
          </div>
          <div class="avatar-stack">${avatars}${more}</div>
        </div>
        <div class="energy-bar" style="margin-top:14px"><i style="width:${energy}%"></i></div>
        <div class="project-widget-foot">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="meta-pill">${esc(dl.text)}</span>
            <span class="meta-pill">${doneSteps}/${totalSteps} · ${energy}%</span>
            ${p.unit?.name ? `<span class="meta-pill">${esc(p.unit.name)}</span>` : ""}
          </div>
          <button class="btn-circle" type="button" data-open-energy="${p.id}" aria-label="Mở Task">↗</button>
        </div></div>`;
          })
          .join("")
      : `<div class="card"><p style="color:var(--muted);font-size:13px;margin:0">${
          !isAuthenticated() && !scopeKey
            ? "Chọn tài khoản hoặc đăng nhập để xem Task."
            : "Chưa có Task."
        }</p></div>`;

    grid.querySelectorAll("[data-project-id]").forEach((card) => {
      const open = () => openTaskEnergyModal(card.getAttribute("data-project-id"));
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        open();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });
    grid.querySelectorAll("[data-open-energy]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openTaskEnergyModal(btn.getAttribute("data-open-energy"));
      });
    });

    if (window.gsap) {
      gsap.fromTo(
        "#projectGrid .card.project",
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, stagger: 0.05, ease: "power2.out", overwrite: true }
      );
    }

    const sel = document.getElementById("decisionProject");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML =
        `<option value="">—</option>` +
        (state.projects || [])
          .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
          .join("");
      sel.value = cur;
    }
    const expSel = document.getElementById("expenseLinkedProject");
    if (expSel) {
      const cur = expSel.value;
      expSel.innerHTML =
        `<option value="">— Chưa xác định —</option>` +
        (state.projects || [])
          .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
          .join("");
      expSel.value = cur;
    }
  }

  window.setProjectScope = function (scope, el) {
    state.projectScope = scope;
    const days = document.querySelectorAll("#projectScopeFilters .cal-day");
    const stateBefore = window.Flip && days.length ? Flip.getState(days) : null;
    days.forEach((b) => b.classList.remove("active"));
    if (el) el.classList.add("active");
    else {
      document
        .querySelector(`#projectScopeFilters .cal-day[data-scope="${scope}"]`)
        ?.classList.add("active");
    }
    if (window.Flip && stateBefore) {
      Flip.from(stateBefore, { duration: 0.35, ease: "power2.out", absolute: false });
    } else if (window.gsap && el) {
      gsap.fromTo(el.querySelector(".dom"), { scale: 0.7 }, { scale: 1, duration: 0.28, ease: "back.out(1.6)" });
    }
    renderProjects();
  };

  window.setProjectFilter = function (f, el) {
    const same = state.projectFilter === f;
    state.projectFilter = same ? "all" : f;
    document.querySelectorAll("[data-pfilter]").forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-pfilter") === state.projectFilter)
    );
    renderProjects();
  };

  function parseStepProofs(raw, len) {
    const n = Math.max(1, Number(len) || 4);
    const arr = Array.isArray(raw) ? raw : [];
    return Array.from({ length: n }, (_, i) => {
      const item = arr[i];
      if (Array.isArray(item)) {
        return item
          .filter((x) => x && typeof x === "object" && x.dataUrl)
          .map((x) => ({
            name: String(x.name || "proof.jpg"),
            dataUrl: String(x.dataUrl),
          }));
      }
      if (item && typeof item === "object" && item.dataUrl) {
        return [
          {
            name: String(item.name || "proof.jpg"),
            dataUrl: String(item.dataUrl),
          },
        ];
      }
      return [];
    });
  }

  function fileToCompressedDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Không đọc được ảnh"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Ảnh không hợp lệ"));
        img.onload = () => {
          const max = 1280;
          let w = img.width;
          let h = img.height;
          if (w > max || h > max) {
            const scale = Math.min(max / w, max / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function renderProofBlock(projectId, stepIndex, proofs) {
    const count = proofs.length;
    if (!count) {
      return `<div class="task-step-proof"><span>Số ảnh của công việc này là 0</span></div>`;
    }
    const thumbs = proofs
      .map(
        (pr, j) =>
          `<a class="task-proof-thumb" href="${pr.dataUrl}" target="_blank" rel="noopener" title="Xem ảnh ${j + 1}">
            <img src="${pr.dataUrl}" alt="Ảnh ${j + 1}"/>
            <button type="button" class="task-proof-del" title="Xóa ảnh" onclick="event.preventDefault();event.stopPropagation();removeTaskProof('${projectId}',${stepIndex},${j})">×</button>
          </a>`
      )
      .join("");
    return `<div class="task-step-proof">
      <div class="task-proof-meta">
        <b>Số ảnh của công việc này là ${count}</b>
        <div class="task-proof-thumbs">${thumbs}</div>
        <a href="#" onclick="clearTaskProof('${projectId}',${stepIndex});return false">Xóa hết ảnh</a>
      </div>
    </div>`;
  }

  window.openTaskEnergyModal = function (projectId) {
    const paint = (p) => {
      if (!p) return;
      state.currentProjectId = p.id;
      const flags = displayFlags(p);
      const energy = displayEnergy(p);
      const labels = stepLabelsForProject(p);
      const proofs = parseStepProofs(p.stepProofs, labels.length);
      const deadlines = stepDeadlinesForProject(p);
      const owners = stepOwnersForProject(p);
      const taskDl = deadlineStatus(p.deadline);
      const st = p.status || "TODO";
      document.getElementById("taskEnergyCode").textContent =
        [
          quadrantLabel(p) || "—",
          projectStatusVi(st),
          p.deadlineRisk || "ON_TRACK",
        ].join(" · ");
      document.getElementById("taskEnergyTitle").textContent = p.name;
      const progress = p.workPlanProgress || p.viewerContext?.progress || {};
      const cur = p.currentStep || p.viewerContext?.currentStep || {};
      const riskReason = p.deadlineRiskReason
        ? `<div style="margin-top:4px;font-size:11px;color:var(--muted)">${esc(p.deadlineRiskReason)}</div>`
        : "";
      const currentWork = `
        <div style="margin-top:10px;padding:10px 12px;background:var(--widget-blue);border-radius:10px;font-size:12px">
          <div><b>Current:</b> ${cur.currentLabel ? "Step " + ((cur.currentIndex ?? 0) + 1) + " — " + esc(cur.currentLabel) : "—"}</div>
          <div><b>Next:</b> ${cur.nextLabel ? "Step " + ((cur.nextIndex ?? 0) + 1) + " — " + esc(cur.nextLabel) : "—"}</div>
          <div><b>Progress:</b> ${progress.done ?? "—"}/${progress.total ?? "—"} · ${progress.percent ?? energy}%</div>
        </div>`;
      const expected = p.expectedResult
        ? `<div style="margin-top:8px;font-size:12px"><b>Expected Result:</b> ${esc(p.expectedResult)}</div>`
        : "";
      const ackChip = awaitingAck(p)
        ? ` · <span class="status-pill" style="background:#fff3cd">Awaiting Acknowledgement</span>`
        : p.acknowledgedAt
          ? ` · <span class="status-pill">Ack ✓</span>`
          : "";
      const revNote = p.revisionNote
        ? `<div style="margin-top:8px;padding:8px 10px;background:#fff3cd;border-radius:8px;font-size:12px"><b>REVISION REQUESTED</b><br/>${esc(p.revisionNote)}</div>`
        : "";
      const pendingReq = p.pendingChangeRequest
        ? `<div style="margin-top:8px;padding:8px 10px;background:#e8f4fc;border-radius:8px;font-size:12px"><b>Pending change request</b> (${esc(p.pendingChangeRequest.type || "")})
           ${
             (p.viewerContext?.allowedActions || []).includes("APPROVE_CHANGE_REQUEST")
               ? `<div style="margin-top:6px;display:flex;gap:6px">
                    <button class="btn primary" type="button" onclick="taskWorkflowAction('APPROVE_CHANGE_REQUEST',event)">Approve</button>
                    <button class="btn soft" type="button" onclick="taskWorkflowAction('REJECT_CHANGE_REQUEST',event)">Reject</button>
                  </div>`
               : ""
           }</div>`
        : "";
      const issues = Array.isArray(p.collabIssues) ? p.collabIssues : [];
      const openIssues = issues.filter((i) => i.status === "OPEN" || i.status === "ACKNOWLEDGED");
      const issueBlock =
        openIssues.length
          ? `<div style="margin-top:8px;padding:8px 10px;background:#fff3cd;border-radius:8px;font-size:12px"><b>Collaborator issues</b>
             ${openIssues
               .map(
                 (i) =>
                   `<div style="margin-top:6px"><b>${esc(i.title)}</b> — ${esc(i.description || "")}
                    ${
                      (p.viewerContext?.allowedActions || []).includes("ESCALATE_ISSUE_TO_BLOCKER")
                        ? `<div style="margin-top:4px">
                             <button class="btn soft" type="button" onclick="ackCollabIssue('${p.id}','${esc(i.id)}')">Ack</button>
                             <button class="btn soft" type="button" onclick="escalateCollabIssue('${p.id}','${esc(i.id)}')">Escalate → BLOCKED</button>
                           </div>`
                        : ""
                    }</div>`
               )
               .join("")}</div>`
          : "";
      const waitInfo =
        st === "WAITING"
          ? `<div style="margin-top:6px;font-size:12px;color:var(--muted)">Waiting for: <b>${esc(p.waitingFor || "—")}</b> — ${esc(p.waitingReason || "")}</div>`
          : "";
      const blockInfo =
        st === "BLOCKED"
          ? `<div style="margin-top:6px;font-size:12px;color:#b42318"><b>${esc(p.blockerTitle || "Blocked")}</b> — ${esc(p.blockerDescription || "")}</div>`
          : "";
      const pauseInfo =
        st === "PAUSED"
          ? `<div style="margin-top:6px;font-size:12px;color:var(--muted)">Paused: ${esc(p.pauseReason || "")}</div>`
          : "";
      document.getElementById("taskEnergyMeta").innerHTML =
        (p.owner ? "Phụ trách: " + esc(p.owner) : "Phụ trách: —") +
        (p.reviewer
          ? " · Reviewer: " + esc(p.reviewer.displayName || p.reviewer.username)
          : "") +
        ` · Deadline: <span class="deadline-chip ${taskDl.tone}">${esc(taskDl.text)}</span>` +
        ` · Risk: <b>${esc(p.deadlineRisk || "ON_TRACK")}</b>` +
        ackChip +
        riskReason +
        expected +
        currentWork +
        waitInfo +
        blockInfo +
        pauseInfo +
        revNote +
        pendingReq +
        issueBlock;
      document.getElementById("taskEnergyPct").textContent =
        (progress.percent != null ? progress.percent : energy) + "%";
      document.getElementById("taskEnergyBar").style.width =
        (progress.percent != null ? progress.percent : energy) + "%";
      const hint = document.getElementById("taskEnergyHint");
      if (hint) hint.style.display = "none";

      const wf = document.getElementById("taskWorkflowActions");
      if (wf) {
        const allowed = p.viewerContext?.allowedActions || [];
        const overrides = p.viewerContext?.adminOverrideActions || [];
        const submitBlocks = p.viewerContext?.submitBlockers || [];
        const btns = [];
        const add = (action, label, cls = "soft") => {
          if (!allowed.includes(action)) return;
          btns.push(
            `<button class="btn ${cls}" type="button" onclick="taskWorkflowAction('${action}',event)">${label}</button>`
          );
        };
        add("ACKNOWLEDGE", "Acknowledge", "primary");
        add("START", "Start", "primary");
        add("MARK_WAITING", "Mark Waiting");
        add("REPORT_BLOCKED", "Report Blocked");
        add("PAUSE", "Pause");
        add("RESUME", "Resume");
        add("RESOLVE_AND_RESUME", "Resolve & Resume");
        add("REQUEST_DEADLINE_CHANGE", "Request Deadline");
        add("REQUEST_PRIORITY_CHANGE", "Request Priority");
        if (allowed.includes("SUBMIT_FOR_REVIEW")) {
          if (submitBlocks.length) {
            btns.push(
              `<button class="btn soft" type="button" disabled title="${esc(
                submitBlocks.join("; ")
              )}">Submit for Review</button>
               <span style="font-size:11px;color:#b42318">${esc(
                 "Cannot submit: " + submitBlocks.join("; ")
               )}</span>`
            );
          } else {
            btns.push(
              `<button class="btn primary" type="button" onclick="taskWorkflowAction('SUBMIT_FOR_REVIEW',event)">Submit for Review</button>`
            );
          }
        }
        add("APPROVE", "Approve → DONE", "primary");
        add("REQUEST_REVISION", "Request Revision");
        add("REPORT_ISSUE_TO_OWNER", "Report Issue to Owner");
        if (overrides.length) {
          btns.push(
            `<details style="width:100%"><summary style="cursor:pointer;font-size:11px;color:var(--muted)">Admin override…</summary>
             <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
             ${overrides
               .map(
                 (a) =>
                   `<button class="btn soft" type="button" onclick="taskWorkflowAction('${a}',event)">${
                     a === "FORCE_ACKNOWLEDGE" ? "Force Acknowledge" : "Force Submit"
                   }</button>`
               )
               .join("")}
             </div></details>`
          );
        }
        btns.push(
          `<button class="btn soft" type="button" onclick="requestDecisionForProject('${p.id}')">Yêu cầu quyết định</button>`
        );
        btns.push(
          `<button class="btn soft" type="button" onclick="openExpenseFromProject('${p.id}')">+ Chi phí</button>`
        );
        wf.innerHTML = btns.join("");
      }

      document.getElementById("taskEnergySteps").innerHTML = labels
        .map((title, i) => {
          const done = flags[i] === "1";
          const stepProofs = proofs[i] || [];
          const stepDl = deadlineStatus(deadlines[i], { done });
          const ownerLabel = resolveMemberLabel(p, owners[i]);
          const actions = done
            ? `<span class="tag green">Xong</span>
             <button class="btn soft" type="button" onclick="undoTaskStep('${p.id}',${i},event)">Hoàn tác</button>
             <button class="btn soft" type="button" onclick="pickTaskProof('${p.id}',${i})">Upload ảnh</button>`
            : `<button class="btn primary" type="button" onclick="completeTaskStep('${p.id}',${i},event)">Hoàn thành</button>
             <button class="btn soft" type="button" onclick="setCurrentStep('${p.id}',${i})">Set Current</button>
             <button class="btn soft" type="button" onclick="pickTaskProof('${p.id}',${i})">Upload ảnh</button>`;
          return `<div class="task-step${done ? " done" : ""}">
          <span class="task-step-num">${done ? "✓" : String(i + 1).padStart(2, "0")}</span>
          <div class="task-step-body"><b>${esc(title)}</b>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center">
            <span class="deadline-chip ${stepDl.tone}" style="cursor:pointer" onclick="openEditTaskModal('${p.id}')">${esc(stepDl.text)}</span>
            <span class="status-pill">${ownerLabel ? "Phụ trách: " + esc(ownerLabel) : "Chưa giao phụ trách"}</span>
          </div>
          </div>
          <div class="task-step-actions">${actions}</div>
          ${renderProofBlock(p.id, i, stepProofs)}
        </div>`;
        })
        .join("");

      renderTaskDetailPanels(p);
      applyTaskDetailTab(state.taskDetailTab || "steps");

      const submitBtn = document.getElementById("taskAddSubmitBtn");
      if (submitBtn) {
        submitBtn.setAttribute("onclick", `submitAddTaskStep('${p.id}',event)`);
      }
      const addToggle = document.getElementById("taskAddToggle");
      if (addToggle) {
        const canPlan = p.viewerContext?.canEditWorkPlan !== false;
        addToggle.hidden = !canPlan || st === "IN_REVIEW" || st === "DONE";
      }
      document.getElementById("taskEnergyModal")?.classList.add("show");
      hideAddTaskStepForm();
    };

    const local = state.projects.find((x) => x.id === projectId);
    if (!local) return showToast("Không tìm thấy Task");
    paint(local);

    if (isAuthenticated()) {
      api("/api/projects/" + projectId)
        .then((fresh) => {
          const idx = state.projects.findIndex((x) => x.id === projectId);
          if (idx >= 0) state.projects[idx] = { ...state.projects[idx], ...fresh };
          if (state.currentProjectId === projectId) {
            paint(idx >= 0 ? state.projects[idx] : fresh);
          }
        })
        .catch(() => {});
    }
  };

  function renderTaskDetailPanels(p) {
    const people = document.getElementById("taskDetailPeople");
    const costs = document.getElementById("taskDetailCosts");
    const docs = document.getElementById("taskDetailDocs");
    const hist = document.getElementById("taskDetailHistory");
    let members = p.members || [];
    // Legacy: có owner nhưng chưa có ProjectMember
    if (!members.length && p.owner) {
      const dir = (state.auth.directory || []).find((u) =>
        ownerMatchesAccount(p.owner, u)
      );
      members = [
        {
          userId: dir?.id || p.owner,
          role: "PRIMARY",
          user: dir || {
            displayName: p.owner,
            username: p.owner,
          },
        },
      ];
    }
    const directory = state.auth.directory || [];
    if (people) {
      const rows = members.length
        ? members
            .map((m) => {
              const name = m.user?.displayName || m.user?.username || m.userId;
              const role =
                m.role === "PRIMARY"
                  ? "Phụ trách chính"
                  : m.role === "VIEWER"
                    ? "Xem"
                    : "Phối hợp";
              const canManage = isSystemAdmin() || isPrimaryOn(p);
              const rm =
                canManage && m.role !== "PRIMARY"
                  ? `<button class="btn soft" type="button" onclick="removeProjectMember('${p.id}','${m.userId}')">Gỡ</button>`
                  : "";
              return `<div class="member-row"><div><b>${esc(name)}</b><br/><span class="status-pill">${role}</span></div>${rm}</div>`;
            })
            .join("")
        : `<div class="empty">Chưa có thành viên — thêm khi tạo Task hoặc bên dưới</div>`;
      const memberIds = new Set(members.map((m) => m.userId));
      const addOpts = directory
        .filter((u) => !memberIds.has(u.id))
        .map(
          (u) =>
            `<option value="${esc(u.id)}">${esc(u.displayName || u.username)}</option>`
        )
        .join("");
      people.innerHTML =
        `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">${members.length} người trong Task</div>` +
        rows +
        (isSystemAdmin() || isPrimaryOn(p)
          ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <select id="addCollabSelect" style="flex:1;min-width:140px;border:1px solid var(--line);border-radius:10px;padding:8px;font-size:11px">
                <option value="">+ Thêm phối hợp</option>${addOpts}
              </select>
              <button class="btn soft" type="button" onclick="addProjectCollaborator('${p.id}')">Thêm</button>
            </div>`
          : "");
    }
    if (costs) {
      const exps =
        p.expenses ||
        (state.expenses || []).filter((e) => e.linkedProjectId === p.id);
      const total = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
      costs.innerHTML = exps.length
        ? `<div style="margin-bottom:8px;font-size:12px"><b>Tổng: ${money(total)}</b></div>` +
          exps
            .map(
              (e) =>
                `<div class="cost-row" style="cursor:pointer" onclick="openExpenseDetail('${e.id}')"><div><b>${esc(e.code || "")} · ${esc(e.content || e.categoryLabel || "Chi")}</b><br/><span class="status-pill">${esc(expenseStatusVi(e.status))}</span></div><b>${money(e.amount)}</b></div>`
            )
            .join("") +
          `<div style="margin-top:10px"><button class="btn soft" type="button" onclick="openExpenseFromProject('${p.id}')">+ Ghi chi phí</button></div>`
        : `<div class="empty">Chưa có chi phí</div>
           <div style="margin-top:10px"><button class="btn soft" type="button" onclick="openExpenseFromProject('${p.id}')">+ Ghi chi phí</button></div>`;
    }
    if (docs) {
      const links = p.documentLinks || [];
      docs.innerHTML =
        (links.length
          ? links
              .map((l) => {
                const d = l.document || l;
                return `<div class="doc-row"><div><b>${esc(d.fileName || d.code)}</b><br/><span class="status-pill">${esc(l.relationType || d.fileType || "FILE")}</span></div>
                  <a class="btn soft" href="${esc(d.storageUrl || "#")}" target="_blank" rel="noopener">Mở</a></div>`;
              })
              .join("")
          : `<div class="empty">Chưa có tài liệu</div>`) +
        `<div style="margin-top:10px"><button class="btn soft" type="button" onclick="uploadProjectDoc('${p.id}')">+ Tải tài liệu</button></div>`;
    }
    if (hist) {
      const events = p.events || [];
      hist.innerHTML = events.length
        ? events
            .map((ev) => {
              const who = ev.actor?.displayName || ev.actor?.username || "—";
              const when = ev.createdAt
                ? new Date(ev.createdAt).toLocaleString("vi-VN")
                : "";
              return `<div class="time-row" style="margin-bottom:8px"><i class="time-dot"></i><div>
                <b>${esc(when)} · ${esc(who)}</b>
                <span>${esc(ev.action)}${ev.detail ? " — " + esc(ev.detail) : ""}${
                  ev.oldValue || ev.newValue
                    ? ` (${esc(ev.oldValue || "—")} → ${esc(ev.newValue || "—")})`
                    : ""
                }</span></div></div>`;
            })
            .join("")
        : `<div class="empty">Chưa có lịch sử</div>`;
    }
  }

  function applyTaskDetailTab(tab) {
    state.taskDetailTab = tab;
    document.querySelectorAll("#taskDetailTabs .filter").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-ttab") === tab);
    });
    const steps = document.getElementById("taskEnergySteps");
    const panels = {
      people: document.getElementById("taskDetailPeople"),
      costs: document.getElementById("taskDetailCosts"),
      docs: document.getElementById("taskDetailDocs"),
      history: document.getElementById("taskDetailHistory"),
    };
    if (steps) steps.hidden = tab !== "steps";
    Object.entries(panels).forEach(([k, el]) => {
      if (el) el.hidden = tab !== k;
    });
  }

  window.setTaskDetailTab = function (tab, el) {
    applyTaskDetailTab(tab);
    if (el) {
      document.querySelectorAll("#taskDetailTabs .filter").forEach((b) =>
        b.classList.remove("active")
      );
      el.classList.add("active");
    }
  };

  window.taskWorkflowAction = async function (action, ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    const id = state.currentProjectId;
    if (!id) return;
    const body = { action };
    if (action === "MARK_WAITING") {
      const waitingFor = window.prompt("Waiting for (bắt buộc)", "");
      if (waitingFor == null) return;
      if (!String(waitingFor).trim()) return showToast("Cần Waiting for");
      const reason = window.prompt("Reason (bắt buộc)", "");
      if (reason == null) return;
      if (!String(reason).trim()) return showToast("Cần Reason");
      const expected = window.prompt("Expected response date (tuỳ chọn YYYY-MM-DD)", "");
      body.waitingFor = String(waitingFor).trim();
      body.waitingReason = String(reason).trim();
      if (expected && String(expected).trim()) body.waitingExpectedDate = String(expected).trim();
    } else if (action === "REPORT_BLOCKED" || action === "REPORT_ISSUE") {
      const title = window.prompt("Blocker title (bắt buộc)", "");
      if (title == null) return;
      if (!String(title).trim()) return showToast("Cần Blocker title");
      const desc = window.prompt("Description (bắt buộc)", "");
      if (desc == null) return;
      if (!String(desc).trim()) return showToast("Cần Description");
      body.action = "REPORT_BLOCKED";
      body.blockerTitle = String(title).trim();
      body.blockerDescription = String(desc).trim();
    } else if (action === "PAUSE") {
      const reason = window.prompt("Pause reason (bắt buộc)", "");
      if (reason == null) return;
      if (!String(reason).trim()) return showToast("Cần Pause reason");
      body.pauseReason = String(reason).trim();
    } else if (action === "RESOLVE_AND_RESUME") {
      const note = window.prompt("Đã xử lý thế nào? (tuỳ chọn)", "");
      if (note == null) return;
      body.note = String(note || "Resolve & Resume").trim();
    } else if (action === "REQUEST_REVISION") {
      const note = window.prompt("Revision note (bắt buộc)", "");
      if (note == null) return;
      if (!String(note).trim()) return showToast("Cần note khi Request Revision");
      body.revisionNote = String(note).trim();
    } else if (action === "FORCE_ACKNOWLEDGE" || action === "FORCE_SUBMIT_FOR_REVIEW") {
      const reason = window.prompt("Override reason (bắt buộc)", "");
      if (reason == null) return;
      if (!String(reason).trim()) return showToast("Cần reason cho override");
      body.reason = String(reason).trim();
    } else if (action === "REQUEST_DEADLINE_CHANGE") {
      const p = state.projects.find((x) => x.id === id);
      const requested = window.prompt(
        "Requested deadline (YYYY-MM-DD)",
        p?.deadline || ""
      );
      if (requested == null) return;
      const reason = window.prompt("Reason (bắt buộc)", "");
      if (reason == null || !String(reason).trim()) return showToast("Cần reason");
      body.requestedDeadline = String(requested).trim();
      body.reason = String(reason).trim();
    } else if (action === "REQUEST_PRIORITY_CHANGE") {
      const imp = window.confirm("Requested Important = YES?\nOK = Yes · Cancel = No");
      const urg = window.confirm("Requested Urgent = YES?\nOK = Yes · Cancel = No");
      const reason = window.prompt("Reason (bắt buộc)", "");
      if (reason == null || !String(reason).trim()) return showToast("Cần reason");
      body.important = imp;
      body.urgent = urg;
      body.reason = String(reason).trim();
    } else if (action === "REJECT_CHANGE_REQUEST") {
      const note = window.prompt("Reject reason", "Rejected");
      if (note == null) return;
      body.reason = String(note).trim();
    } else if (action === "REPORT_ISSUE_TO_OWNER") {
      const title = window.prompt("Issue title", "");
      if (title == null || !String(title).trim()) return showToast("Cần title");
      const desc = window.prompt("Description", "");
      if (desc == null || !String(desc).trim()) return showToast("Cần description");
      const stepRaw = window.prompt("Step index (0-based, optional)", "");
      body.title = String(title).trim();
      body.description = String(desc).trim();
      if (stepRaw && String(stepRaw).trim() !== "") body.stepIndex = Number(stepRaw);
    }
    const labels = {
      ACKNOWLEDGE: "Đang xác nhận…",
      FORCE_ACKNOWLEDGE: "Force ack…",
      START: "Đang bắt đầu…",
      MARK_WAITING: "Đang ghi Waiting…",
      REPORT_BLOCKED: "Đang ghi Blocked…",
      PAUSE: "Đang Pause…",
      RESUME: "Đang Resume…",
      RESOLVE_AND_RESUME: "Đang mở chặn…",
      SUBMIT_FOR_REVIEW: "Đang Submit…",
      FORCE_SUBMIT_FOR_REVIEW: "Force submit…",
      APPROVE: "Đang Approve…",
      REQUEST_REVISION: "Đang gửi Revision…",
      REQUEST_DEADLINE_CHANGE: "Đang gửi…",
      REQUEST_PRIORITY_CHANGE: "Đang gửi…",
      APPROVE_CHANGE_REQUEST: "Đang duyệt…",
      REJECT_CHANGE_REQUEST: "Đang từ chối…",
      REPORT_ISSUE_TO_OWNER: "Đang gửi issue…",
    };
    const okMsgs = {
      ACKNOWLEDGE: "Đã Acknowledge",
      START: "Đã Start",
      MARK_WAITING: "Đã chuyển Waiting",
      REPORT_BLOCKED: "Đã Blocked",
      PAUSE: "Đã Pause",
      RESUME: "Đã Resume",
      RESOLVE_AND_RESUME: "Đã Resolve",
      SUBMIT_FOR_REVIEW: "Đã Submit for Review",
      APPROVE: "Đã Approve → DONE",
      REQUEST_REVISION: "Đã Request Revision",
    };
    await withBusy(
      ev,
      async () => patchProjectStep(id, body, okMsgs[body.action] || okMsgs[action] || "Đã cập nhật"),
      { label: labels[action] || "Đang xử lý…", lockKey: "wf:" + action + ":" + id }
    );
  };

  window.ackCollabIssue = async function (projectId, issueId) {
    await patchProjectStep(
      projectId,
      { action: "ACKNOWLEDGE_ISSUE", issueId },
      "Đã Ack issue"
    );
  };
  window.escalateCollabIssue = async function (projectId, issueId) {
    await patchProjectStep(
      projectId,
      { action: "ESCALATE_ISSUE_TO_BLOCKER", issueId },
      "Đã Escalate → BLOCKED"
    );
  };
  window.setCurrentStep = async function (projectId, stepIndex) {
    await patchProjectStep(
      projectId,
      { action: "SET_CURRENT_STEP", stepIndex },
      "Đã set Current Step"
    );
  };

  window.setProjectMatrix = function (key, val, el) {
    const input = document.getElementById(
      key === "important" ? "projectImportant" : "projectUrgent"
    );
    if (input) input.value = val ? "true" : "false";
    document
      .querySelectorAll(`.matrix-btn[data-matrix="${key}"]`)
      .forEach((b) => b.classList.remove("primary"));
    if (el) {
      el.classList.add("primary");
      el.classList.remove("soft");
    }
    const imp = document.getElementById("projectImportant")?.value;
    const urg = document.getElementById("projectUrgent")?.value;
    const preview = document.getElementById("projectQuadrantPreview");
    if (preview) {
      if (imp === "" || urg === "") {
        preview.textContent = "Result: — (chọn Important + Urgent)";
      } else {
        const important = imp === "true";
        const urgent = urg === "true";
        let q = "BACKLOG";
        if (important && urgent) q = "DO NOW";
        else if (important) q = "PLAN";
        else if (urgent) q = "QUICK ACTION";
        preview.textContent = "Result: " + q;
      }
    }
  };

  window.requestDecisionForProject = function (projectId) {
    if (!requireAuthenticatedAction(() => true)) return;
    const p = state.projects.find((x) => x.id === projectId);
    const titleEl = document.getElementById("decisionTitle");
    const projEl = document.getElementById("decisionProject");
    const impactEl = document.getElementById("decisionImpact");
    if (titleEl) titleEl.value = p ? "Duyệt: " + p.name : "";
    if (projEl) {
      renderProjects();
      projEl.value = projectId;
    }
    if (impactEl && p) {
      impactEl.value = "Nếu chưa quyết, Task “" + p.name + "” sẽ bị chặn.";
    }
    document.getElementById("decisionBlocking").checked = true;
    document.getElementById("decisionModal")?.classList.add("show");
  };

  window.openExpenseFromProject = function (projectId) {
    if (!requireAuthenticatedAction(() => true)) return;
    state.expenseFromProjectId = projectId;
    // Đóng Task modal trước để tránh click xuyên (P1-03)
    document.getElementById("taskEnergyModal")?.classList.remove("show");
    openExpenseModal();
    const p = state.projects.find((x) => x.id === projectId);
    const sel = document.getElementById("expenseLinkedProject");
    if (sel) {
      renderProjects();
      sel.value = projectId;
    }
    const unitEl = document.getElementById("expenseUnit");
    if (unitEl && p?.unit?.name) unitEl.value = p.unit.name;
    const modal = document.getElementById("expenseModal");
    if (modal) modal.style.zIndex = "40";
  };

  window.addProjectCollaborator = async function (projectId) {
    const sel = document.getElementById("addCollabSelect");
    const uid = sel?.value;
    if (!uid) return showToast("Chọn người");
    await patchProjectStep(projectId, { addCollaboratorUserId: uid }, "Đã thêm phối hợp");
  };

  window.removeProjectMember = async function (projectId, userId) {
    await patchProjectStep(projectId, { removeMemberUserId: userId }, "Đã gỡ");
  };

  window.uploadProjectDoc = function (projectId) {
    if (!requireAuthenticatedAction(() => true)) return;
    state.pendingDocProjectId = projectId;
    const input = document.getElementById("taskDocInput");
    if (input) {
      input.onchange = async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        try {
          const dataUrl = await fileToCompressedDataUrl(file).catch(async () => {
            const reader = new FileReader();
            return await new Promise((resolve, reject) => {
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          });
          await api("/api/documents", {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              dataUrl,
              fileType: file.type,
              projectId,
              entityType: "PROJECT",
              entityId: projectId,
              relationType: "GENERAL",
            }),
          });
          showToast("Đã tải tài liệu");
          await refresh();
          openTaskEnergyModal(projectId);
          applyTaskDetailTab("docs");
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      };
      input.click();
    }
  };

  async function loadDocuments() {
    try {
      const q = state.docView === "unlinked" ? "?unlinked=1" : "";
      state.documents = await api("/api/documents" + q);
    } catch {
      state.documents = [];
    }
    renderDocs();
  }

  function renderDocs() {
    const el = document.getElementById("docsList");
    if (!el) return;
    const list = state.documents || [];
    el.innerHTML = list.length
      ? `<div style="padding:4px 14px">${list
          .map((d) => {
            const projectName =
              d.projectName ||
              d.project?.name ||
              (d.links || []).find((l) => l.project)?.project?.name ||
              null;
            const projectId =
              d.projectId ||
              d.project?.id ||
              (d.links || []).find((l) => l.projectId)?.projectId ||
              null;
            const who = d.uploadedBy?.displayName || d.uploadedBy?.username || "—";
            return `<div class="docs-row">
              <div><b>${esc(d.code || "")} · ${esc(d.fileName)}</b><br/>
              <span style="color:var(--muted);font-size:10px">${esc(who)} · ${
                d.createdAt ? new Date(d.createdAt).toLocaleString("vi-VN") : ""
              }${
                projectName
                  ? ` · Task: ${esc(projectName)}`
                  : " · chưa gắn Task"
              }</span></div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${
                  projectId
                    ? `<button type="button" class="btn soft" onclick="openTaskEnergyModal('${projectId}')">Mở Task</button>`
                    : ""
                }
                <a class="btn soft" href="${esc(d.storageUrl || "#")}" target="_blank" rel="noopener">Mở file</a>
              </div>
            </div>`;
          })
          .join("")}</div>`
      : `<div class="docs-empty" style="padding:16px">Chưa có tài liệu</div>`;
  }

  window.setDocView = function (v, el) {
    state.docView = v;
    document.querySelectorAll("#docs .filters .filter").forEach((b) =>
      b.classList.remove("active")
    );
    if (el) el.classList.add("active");
    loadDocuments();
  };

  window.openDocUpload = function () {
    if (!requireAuthenticatedAction(() => true)) return;
    const input = document.getElementById("docFileInput");
    if (!input) return;
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      try {
        let dataUrl;
        if (file.type.startsWith("image/")) {
          dataUrl = await fileToCompressedDataUrl(file);
        } else {
          dataUrl = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
          });
        }
        await api("/api/documents", {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            dataUrl,
            fileType: file.type,
            relationType: "GENERAL",
          }),
        });
        showToast("Đã tải lên kho tài liệu");
        await loadDocuments();
        setView("docs");
      } catch (e) {
        showToast("Lỗi: " + e.message);
      }
    };
    input.click();
  };

  window.closeTaskEnergyModal = function () {
    document.getElementById("taskEnergyModal")?.classList.remove("show");
    state.currentProjectId = null;
    state.pendingProofStep = null;
    hideAddTaskStepForm();
  };

  window.openEditTaskModal = function (projectId) {
    if (!requireAuthenticatedAction(() => true)) return;
    const id = projectId || state.currentProjectId;
    const p = state.projects.find((x) => x.id === id);
    if (!p) return showToast("Không tìm thấy Task");
    state.currentProjectId = p.id;

    const nameEl = document.getElementById("editTaskName");
    const catEl = document.getElementById("editTaskCategory");
    const ownerEl = document.getElementById("editTaskOwner");
    const unitEl = document.getElementById("editTaskUnit");
    const budgetEl = document.getElementById("editTaskBudget");
    const dlEl = document.getElementById("editTaskDeadline");
    const statusEl = document.getElementById("editTaskStatus");
    const stepsEl = document.getElementById("editTaskSteps");

    if (nameEl) nameEl.value = p.name || "";
    if (catEl) catEl.value = p.category || "";
    if (budgetEl) budgetEl.value = p.budget != null ? p.budget : "";
    if (dlEl) dlEl.value = toDateInputValue(p.deadline);
    if (statusEl) {
      const raw = p.status || "TODO";
      statusEl.value =
        raw === "ON_TRACK" ? "DOING" : raw === "AT_RISK" ? "WAITING" : raw;
    }
    const priEl = document.getElementById("editTaskPriority");
    if (priEl) priEl.value = p.priority || "P2";
    const descEl = document.getElementById("editTaskDescription");
    if (descEl) descEl.value = p.description || "";
    if (unitEl) unitEl.value = p.unit?.name || "";

    if (ownerEl) {
      const curUser = state.auth.user;
      const directory = state.auth.directory || [];
      if (curUser && curUser.systemRole !== "SYSTEM_ADMIN") {
        const label = curUser.displayName || curUser.username;
        ownerEl.innerHTML = `<option value="${esc(label)}">${esc(label)}</option>`;
        ownerEl.value = label;
        ownerEl.disabled = true;
      } else {
        ownerEl.disabled = false;
        ownerEl.innerHTML =
          `<option value="">— Chọn —</option>` +
          directory
            .map(
              (u) =>
                `<option value="${esc(u.displayName || u.username)}">${esc(
                  u.displayName || u.username
                )}</option>`
            )
            .join("");
        ownerEl.value = p.owner || "";
        if (p.owner && ![...ownerEl.options].some((o) => o.value === p.owner)) {
          ownerEl.insertAdjacentHTML(
            "beforeend",
            `<option value="${esc(p.owner)}">${esc(p.owner)}</option>`
          );
          ownerEl.value = p.owner;
        }
      }
    }

    const labels = stepLabelsForProject(p);
    const deadlines = stepDeadlinesForProject(p);
    if (stepsEl) {
      stepsEl.innerHTML = labels
        .map(
          (title, i) => `<div class="task-edit-step">
          <div class="field"><label>Hạng mục ${String(i + 1).padStart(2, "0")}</label>
            <input data-edit-step-title="${i}" type="text" maxlength="120" value="${esc(title)}" /></div>
          <div class="field"><label>Hạn</label>
            <input data-edit-step-deadline="${i}" type="date" value="${toDateInputValue(deadlines[i])}" /></div>
        </div>`
        )
        .join("");
    }

    document.getElementById("taskEditModal")?.classList.add("show");
  };

  window.closeEditTaskModal = function () {
    document.getElementById("taskEditModal")?.classList.remove("show");
  };

  window.saveEditTask = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    const id = state.currentProjectId;
    if (!id) return showToast("Chưa chọn Task");
    const name = String(document.getElementById("editTaskName")?.value || "").trim();
    if (!name) return showToast("Tên Task trống");

    const curUser = state.auth.user;
    let owner = document.getElementById("editTaskOwner")?.value || "";
    if (curUser && curUser.systemRole !== "SYSTEM_ADMIN") {
      owner = curUser.displayName || curUser.username;
    }

    const titleInputs = [
      ...document.querySelectorAll("[data-edit-step-title]"),
    ];
    const deadlineInputs = [
      ...document.querySelectorAll("[data-edit-step-deadline]"),
    ];
    const stepLabels = titleInputs.map((el) => String(el.value || "").trim());
    if (stepLabels.some((t) => !t)) {
      return showToast("Tên hạng mục không được trống");
    }
    const stepDeadlines = deadlineInputs.map((el) =>
      String(el.value || "").trim()
    );

    const budgetRaw = document.getElementById("editTaskBudget")?.value;
    await withBusy(
      ev,
      async () => {
        try {
          const saved = await api("/api/projects/" + id, {
            method: "PATCH",
            body: JSON.stringify({
              name,
              category: document.getElementById("editTaskCategory")?.value || null,
              owner: owner || null,
              unitName: document.getElementById("editTaskUnit")?.value || "",
              budget:
                budgetRaw === "" || budgetRaw == null ? null : Number(budgetRaw),
              deadline: document.getElementById("editTaskDeadline")?.value || null,
              priority: document.getElementById("editTaskPriority")?.value || "P2",
              description:
                document.getElementById("editTaskDescription")?.value || null,
              stepLabels,
              stepDeadlines,
            }),
          });
          const idx = state.projects.findIndex((p) => p.id === id);
          if (idx >= 0) state.projects[idx] = { ...state.projects[idx], ...saved };
          closeEditTaskModal();
          renderProjects();
          renderDashboard();
          openTaskEnergyModal(id);
          showToast("Đã lưu chỉnh sửa Task");
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang lưu…", lockKey: "edit-task" }
    );
  };

  async function patchProjectStep(projectId, payload, okMsg) {
    if (!requireAuthenticatedAction(() => true)) return null;
    try {
      const saved = await api("/api/projects/" + projectId, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const idx = state.projects.findIndex((p) => p.id === projectId);
      if (idx >= 0) state.projects[idx] = { ...state.projects[idx], ...saved };
      renderProjects();
      openTaskEnergyModal(projectId);
      if (okMsg) showToast(okMsg);
      return saved;
    } catch (e) {
      showToast("Lỗi: " + e.message);
      return null;
    }
  }

  window.showAddTaskStepForm = function () {
    if (!requireAuthenticatedAction(() => true)) return;
    const form = document.getElementById("taskAddForm");
    const toggle = document.getElementById("taskAddToggle");
    const p = state.projects.find((x) => x.id === state.currentProjectId);
    if (toggle) toggle.hidden = true;
    if (form) {
      form.hidden = false;
      const input = document.getElementById("taskAddTitleInput");
      const dl = document.getElementById("taskAddDeadlineInput");
      const ownerSel = document.getElementById("taskAddOwnerSelect");
      if (dl) dl.value = "";
      if (p) fillStepOwnerSelect(ownerSel, p, "");
      else if (ownerSel) ownerSel.innerHTML = `<option value="">— Chọn —</option>`;
      if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 30);
      }
    }
  };

  window.hideAddTaskStepForm = function () {
    const form = document.getElementById("taskAddForm");
    const toggle = document.getElementById("taskAddToggle");
    if (form) form.hidden = true;
    if (toggle) toggle.hidden = false;
  };

  window.submitAddTaskStep = async function (projectId, ev) {
    const input = document.getElementById("taskAddTitleInput");
    const deadlineInput = document.getElementById("taskAddDeadlineInput");
    const ownerSel = document.getElementById("taskAddOwnerSelect");
    const cleaned = String(input?.value || "").trim();
    if (!cleaned) return showToast("Tên trống");
    const stepDeadline = String(deadlineInput?.value || "").trim();
    const stepOwner = String(ownerSel?.value || "").trim();
    const btn =
      resolveActionButton(ev) || document.getElementById("taskAddSubmitBtn");
    await withBusy(
      btn,
      async () =>
        patchProjectStep(
          projectId,
          {
            addStep: cleaned,
            stepDeadline: stepDeadline || null,
            stepOwner: stepOwner || null,
          },
          "Đã thêm công việc"
        ),
      { label: "Đang thêm…", lockKey: "add-step:" + projectId }
    );
  };

  window.addTaskStep = function (projectId) {
    state.currentProjectId = projectId;
    showAddTaskStepForm();
  };

  window.completeTaskStep = async function (projectId, stepIndex, ev) {
    await withBusy(
      ev,
      async () => {
        const saved = await patchProjectStep(
          projectId,
          { stepIndex, done: true },
          null
        );
        if (!saved) return;
        const energy = displayEnergy(saved);
        showToast(
          energy >= 100
            ? "Task đã đủ 100% năng lượng"
            : "Đã hoàn thành hạng mục · năng lượng " + energy + "%"
        );
      },
      { label: "Đang lưu…", lockKey: "step-done:" + projectId + ":" + stepIndex }
    );
  };

  window.undoTaskStep = async function (projectId, stepIndex, ev) {
    await withBusy(
      ev,
      async () =>
        patchProjectStep(
          projectId,
          { stepIndex, done: false },
          "Đã hoàn tác hạng mục"
        ),
      { label: "Đang hoàn tác…", lockKey: "step-undo:" + projectId + ":" + stepIndex }
    );
  };

  window.pickTaskProof = function (projectId, stepIndex) {
    if (!requireAuthenticatedAction(() => true)) return;
    state.pendingProofStep = { projectId, stepIndex };
    const input = document.getElementById("taskProofInput");
    if (!input) return;
    input.value = "";
    input.click();
  };

  window.clearTaskProof = async function (projectId, stepIndex) {
    await patchProjectStep(
      projectId,
      { stepIndex, proof: null },
      "Đã xóa hết ảnh bằng chứng"
    );
  };

  window.removeTaskProof = async function (projectId, stepIndex, proofIndex) {
    await patchProjectStep(
      projectId,
      { stepIndex, removeProofIndex: proofIndex },
      "Đã xóa ảnh"
    );
  };

  window.handleTaskProofFile = async function (fileOrFiles) {
    const pending = state.pendingProofStep;
    if (!pending) return;
    const files = Array.from(
      fileOrFiles?.length != null ? fileOrFiles : fileOrFiles ? [fileOrFiles] : []
    ).filter(Boolean);
    if (!files.length) return;
    const images = files.filter((f) => String(f.type || "").startsWith("image/"));
    if (!images.length) {
      showToast("Chỉ nhận file ảnh");
      return;
    }
    try {
      showToast(
        images.length > 1
          ? "Đang xử lý " + images.length + " ảnh…"
          : "Đang xử lý ảnh…"
      );
      for (const file of images) {
        const dataUrl = await fileToCompressedDataUrl(file);
        const saved = await api("/api/projects/" + pending.projectId, {
          method: "PATCH",
          body: JSON.stringify({
            stepIndex: pending.stepIndex,
            proof: { name: file.name || "proof.jpg", dataUrl },
          }),
        });
        const idx = state.projects.findIndex((p) => p.id === pending.projectId);
        if (idx >= 0) state.projects[idx] = { ...state.projects[idx], ...saved };
      }
      renderProjects();
      openTaskEnergyModal(pending.projectId);
      showToast(
        images.length > 1
          ? "Đã đính kèm " + images.length + " ảnh bằng chứng"
          : "Đã đính kèm ảnh bằng chứng"
      );
    } catch (e) {
      showToast("Lỗi ảnh: " + e.message);
    } finally {
      state.pendingProofStep = null;
    }
  };

  function canResolveDecisionClient(d) {
    if (state.capabilities?.canResolveAnyDecision || isSystemAdmin()) return true;
    const user = state.auth.user;
    if (!user || !d?.approver) return false;
    return ownerMatchesAccount(d.approver, user);
  }

  function renderDecisions() {
    const el = document.getElementById("decisionList");
    if (!el) return;
    el.innerHTML = state.decisions
      .map((d) => {
        const resolved = !["PENDING", "NEEDS_INFO"].includes(d.status);
        const t = d.linkedTask;
        const canAct = !resolved && canResolveDecisionClient(d);
        const blockingLabel =
          d.isBlocking && ["PENDING", "NEEDS_INFO"].includes(d.status)
            ? `<span class="link-chip">Đang chặn việc</span>`
            : "";
        return `<div class="decision ${resolved ? "decision-card-resolved" : ""}" id="decision-${d.code || d.id}">
        <div class="decision-top"><div><span class="decision-id">${esc(d.code || "")}</span>
        <h3>${esc(d.title)}</h3>
        <p>Người đề xuất: ${esc(d.proposer || "—")} · Người duyệt: ${esc(d.approver || "—")} · Hạn: ${esc(d.deadline || "—")}</p></div>
        <div><span class="amount">${esc(d.amountLabel || "—")}</span>
        <span class="tag ${tagStatus(d.status)}">${statusVi[d.status] || d.status}</span></div></div>
        <div class="decision-link">
          ${t ? `<span class="link-chip">↔ ${esc(t.code || "")} · ${esc(t.title)}</span>` : ""}
          ${d.linkedProject ? `<span class="link-chip">Task: ${esc(d.linkedProject.name)}</span>` : ""}
          ${blockingLabel}
          ${!t && !d.linkedProject ? `<span class="link-chip">Quyết định độc lập</span>` : ""}
        </div>
        ${d.impact ? `<div class="priority-gate"><b>Tác động nếu chưa quyết</b><p>${esc(d.impact)}</p></div>` : ""}
        <div class="decision-actions">
          ${t ? `<button class="btn soft" onclick="openTaskDetail('${t.id}')">Mở công việc</button>` : ""}
          ${
            d.linkedProjectId
              ? `<button class="btn soft" onclick="openTaskEnergyModal('${d.linkedProjectId}')">Mở Task</button>`
              : ""
          }
          ${
            canAct
              ? `<button class="btn dark" onclick="resolveDecision('${d.id}','APPROVED')">Duyệt</button>
                 <button class="btn soft" onclick="resolveDecision('${d.id}','NEEDS_INFO')">Yêu cầu bổ sung</button>
                 <button class="btn danger" onclick="resolveDecision('${d.id}','REJECTED')">Từ chối</button>`
              : !resolved
                ? `<span class="tag gray">Chỉ người duyệt / Admin mới phê duyệt</span>`
                : ""
          }
        </div></div>`;
      })
      .join("");

    const dash = document.getElementById("dashDecisions");
    if (dash) {
      dash.innerHTML = state.decisions
        .filter((d) => d.status === "PENDING")
        .slice(0, 3)
        .map(
          (d) => `<div class="decision" style="cursor:pointer" onclick="goToDecision('${d.code || d.id}')">
          <div class="decision-top"><h3>${esc(d.title)}</h3><span class="amount">${esc(d.amountLabel || "")}</span></div>
          <p>${esc(d.impact || "")}</p></div>`
        )
        .join("");
    }
  }

  function expenseStatusVi(s) {
    return statusVi[s] || s;
  }

  function formatOpsDate(iso) {
    if (!iso) return "—";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const wd = d.toLocaleDateString("vi-VN", { weekday: "long" });
    return `${wd} · ${m[3]}/${m[2]}/${m[1]}`;
  }

  function syncOpsDateUi() {
    const label = document.getElementById("opsDateLabel");
    if (label) label.textContent = formatOpsDate(state.opsDate);
    const closeDate = document.getElementById("closeDate");
    if (closeDate && state.opsDate) closeDate.value = state.opsDate;
  }

  function fillUnitSelect(sel, { includeEmpty, emptyLabel, current } = {}) {
    if (!sel) return;
    const names = (state.units || []).map((u) => u.name);
    const keep = current ?? sel.value;
    sel.innerHTML =
      (includeEmpty
        ? `<option value="">${esc(emptyLabel || "— Không gắn —")}</option>`
        : "") +
      names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
    else if (!includeEmpty && names[0]) sel.value = names[0];
  }

  function syncUnitSelects() {
    fillUnitSelect(document.getElementById("closeUnit"));
    fillUnitSelect(document.getElementById("expenseUnit"), {
      includeEmpty: true,
      emptyLabel: "Chưa xác định",
    });
    fillUnitSelect(document.getElementById("projectUnit"), {
      includeEmpty: true,
      emptyLabel: "— Không gắn —",
    });
    const uf = document.getElementById("expenseUnitFilter");
    if (uf) {
      const cur = uf.value || "all";
      uf.innerHTML =
        `<option value="all">Tất cả</option>` +
        (state.units || [])
          .map((u) => `<option value="${esc(u.name)}">${esc(u.name)}</option>`)
          .join("");
      uf.value = [...uf.options].some((o) => o.value === cur) ? cur : "all";
    }
  }

  function normalizeOwnerKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function ownerMatchesAccount(owner, user) {
    if (!owner || !user) return false;
    const o = normalizeOwnerKey(owner);
    const u = normalizeOwnerKey(user.username);
    const d = normalizeOwnerKey(user.displayName);
    return o === u || (d && o === d) || o.includes(u) || (d && o.includes(d));
  }

  function workItemsForOwner(ownerKey) {
    const projects = (state.projects || []).filter((p) => {
      if (!ownerKey) return !String(p.owner || "").trim();
      if (ownerKey.startsWith("user:")) {
        const username = ownerKey.slice(5);
        const user = (state.auth.directory || []).find((u) => u.username === username);
        return user ? ownerMatchesAccount(p.owner, user) : normalizeOwnerKey(p.owner) === normalizeOwnerKey(username);
      }
      return normalizeOwnerKey(p.owner) === normalizeOwnerKey(ownerKey);
    });
    return projects;
  }

  function buildOwnerClusters() {
    const directory = state.auth.directory || [];
    const used = new Set();
    const clusters = [];

    for (const u of directory) {
      const key = "user:" + u.username;
      const items = workItemsForOwner(key);
      items.forEach((p) => used.add(p.id));
      clusters.push({
        key,
        name: u.displayName || u.username,
        subtitle: u.username + (u.systemRole === "SYSTEM_ADMIN" ? " · Admin" : ""),
        items,
      });
    }

    // Owner tự do không khớp tài khoản
    const orphans = new Map();
    for (const p of state.projects || []) {
      if (used.has(p.id)) continue;
      const raw = String(p.owner || "").trim();
      if (!raw) continue;
      const k = "orphan:" + normalizeOwnerKey(raw);
      if (!orphans.has(k)) orphans.set(k, { key: k, name: raw, subtitle: "Chưa gắn tài khoản", items: [] });
      orphans.get(k).items.push(p);
    }
    for (const c of orphans.values()) clusters.push(c);

    const unassigned = (state.projects || []).filter((p) => !String(p.owner || "").trim());
    if (unassigned.length || !clusters.length) {
      clusters.push({
        key: "unassigned",
        name: "Chưa gán phụ trách",
        subtitle: "Việc chưa có người",
        items: unassigned,
      });
    }
    return clusters;
  }

  window.focusOverviewOwner = function (ownerKey, ownerName) {
    if (isAuthenticated() && !isSystemAdmin()) {
      const myKey = "user:" + state.auth.user.username;
      if (ownerKey && ownerKey !== myKey) {
        const username = ownerKey.startsWith("user:") ? ownerKey.slice(5) : null;
        if (username) {
          showToast("Đăng nhập " + (ownerName || username) + " để xem Task của họ");
          openPasswordGate(username);
        } else {
          showToast("Bạn chỉ xem được Task của tài khoản đang đăng nhập");
        }
        return;
      }
      state.overviewOwner = myKey;
      renderDashboard();
      renderProjects();
      setView("projects");
      return;
    }
    state.overviewOwner = ownerKey || null;
    renderDashboard();
    renderProjects();
    if (ownerKey) {
      showToast("Đang xem Task của " + (ownerName || ownerKey));
      // Tổng quan Oasis: không mở trang Task — hiện trên Dashboard
      setView("dashboard");
      const focus = document.getElementById("dashOwnerFocus");
      focus?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setView("dashboard");
    }
  };

  window.clearOverviewOwner = function () {
    if (isAuthenticated() && !isSystemAdmin()) {
      showToast("Tài khoản thường chỉ xem Task của chính mình");
      return;
    }
    state.overviewOwner = null;
    renderDashboard();
    renderProjects();
    showToast("Đã về Tổng quan · chọn account để xem Task");
    setView("dashboard");
  };

  function projectStatusTag(p) {
    const energy = displayEnergy(p);
    const cls =
      p.status === "BLOCKED"
        ? "red"
        : p.status === "AT_RISK"
          ? "amber"
          : energy >= 100
            ? "green"
            : "blue";
    const label =
      p.status === "BLOCKED"
        ? "ĐANG BỊ CHẶN"
        : p.status === "AT_RISK"
          ? "CÓ RỦI RO"
          : energy >= 100
            ? "HOÀN TẤT"
            : "ĐANG LÀM";
    return { cls, label, energy };
  }

  function formatDeadlineDisplay(d) {
    if (!d) return "";
    const iso = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return String(d);
  }

  function toDateInputValue(d) {
    const raw = String(d || "").trim();
    if (!raw) return "";
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = parseDeadline(raw);
    if (!parsed) return "";
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /**
   * Deadline urgency:
   * - late: past today → red
   * - soon: today .. +3 days → orange
   * - ok: >3 days left → green
   * - none: no deadline
   */
  function deadlineStatus(deadline, opts = {}) {
    const done = !!opts.done;
    const raw = String(deadline || "").trim();
    if (!raw) {
      return { tone: "none", text: "Chưa set hạn", short: "—" };
    }
    const label = formatDeadlineDisplay(raw);
    if (done) {
      return { tone: "ok", text: "Hạn " + label, short: label };
    }
    const d = parseDeadline(raw);
    if (!d) {
      return { tone: "none", text: "Hạn " + label, short: label };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0) {
      return {
        tone: "late",
        text: `Trễ ${-diff} ngày · ${label}`,
        short: label,
      };
    }
    if (diff === 0) {
      return { tone: "soon", text: `Hạn hôm nay · ${label}`, short: label };
    }
    if (diff <= 3) {
      return {
        tone: "soon",
        text: `Còn ${diff} ngày · ${label}`,
        short: label,
      };
    }
    return { tone: "ok", text: "Hạn " + label, short: label };
  }

  function stepDeadlinesForProject(p) {
    const n = stepCountForProject(p);
    const raw = Array.isArray(p.stepDeadlines) ? p.stepDeadlines : [];
    return Array.from({ length: n }, (_, i) => String(raw[i] || "").trim());
  }

  function stepOwnersForProject(p) {
    const n = stepCountForProject(p);
    const raw = Array.isArray(p.stepOwners) ? p.stepOwners : [];
    return Array.from({ length: n }, (_, i) => String(raw[i] || "").trim());
  }

  function projectMemberOptions(p) {
    const opts = [];
    const seen = new Set();
    for (const m of p.members || []) {
      const id = m.userId || m.user?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      opts.push({
        id,
        name: m.user?.displayName || m.user?.username || id,
        role: m.role || "COLLABORATOR",
      });
    }
    if (!opts.length && p.owner) {
      const dir = (state.auth.directory || []).find((u) =>
        ownerMatchesAccount(p.owner, u)
      );
      if (dir) {
        opts.push({
          id: dir.id,
          name: dir.displayName || dir.username,
          role: "PRIMARY",
        });
      } else {
        opts.push({ id: p.owner, name: p.owner, role: "PRIMARY" });
      }
    }
    return opts;
  }

  function resolveMemberLabel(p, key) {
    if (!key) return "";
    const opts = projectMemberOptions(p);
    const hit = opts.find(
      (o) =>
        o.id === key ||
        o.name === key ||
        normalizeOwnerKey(o.name) === normalizeOwnerKey(key)
    );
    return hit?.name || key;
  }

  function fillStepOwnerSelect(selectEl, p, selected) {
    if (!selectEl) return;
    const opts = projectMemberOptions(p);
    selectEl.innerHTML =
      `<option value="">— Chọn người trong Task —</option>` +
      opts
        .map(
          (o) =>
            `<option value="${esc(o.id)}">${esc(o.name)}${
              o.role === "PRIMARY" ? " · chính" : ""
            }</option>`
        )
        .join("");
    if (selected) selectEl.value = selected;
  }

  function renderOwnerWorkList(items) {
    if (!items.length) {
      return `<div class="owner-work-empty">Chưa có công việc</div>`;
    }
    return `<div class="owner-work-list">${items
      .map((p) => {
        const energy = displayEnergy(p);
        const dl = deadlineStatus(p.deadline);
        return `<div class="owner-work-item" onclick="openTaskEnergyModal('${p.id}')">
          <div class="owner-work-main">
            <b>${esc(p.name)}</b>
            <span class="deadline-chip ${dl.tone}">${esc(dl.text)}</span>
          </div>
          <div class="owner-work-energy">
            <b>${energy}%</b>
            <div class="energy-bar mini"><i style="width:${energy}%"></i></div>
          </div>
        </div>`;
      })
      .join("")}</div>`;
  }

  function renderDashboard() {
    const s = state.summary;
    const metrics = document.querySelectorAll("#dashMetrics .metric");
    if (metrics[0] && s) {
      metrics[0].querySelector(".value").textContent = money(s.revenue);
      metrics[0].querySelector(".delta").textContent = state.opsDate
        ? `DailyClose · ${state.opsDate}`
        : "Chưa có DailyClose";
    }
    if (metrics[1] && s) {
      metrics[1].querySelector(".value").textContent = money(s.cash);
      metrics[1].querySelector(".delta").textContent =
        s.submitted != null
          ? `${s.submitted}/${s.totalUnits || 0} phân khu đã nộp`
          : "Theo DailyClose";
    }
    if (metrics[2] && s) {
      metrics[2].querySelector(".value").textContent = money(s.expenseTotal);
      metrics[2].querySelector(".delta").textContent = "Xem chi tiết →";
    }
    if (metrics[3] && s) {
      const submitted = s.submitted || 0;
      const total = s.totalUnits || 0;
      metrics[3].querySelector(".value").textContent = `${submitted}/${total}`;
      const missing = (s.missingUnits || []).length;
      metrics[3].querySelector(".delta").textContent = missing
        ? `Thiếu ${missing}: ${(s.missingUnits || []).slice(0, 3).join(", ")}${
            missing > 3 ? "…" : ""
          }`
        : submitted
          ? "Đủ phân khu"
          : "Chưa có chốt ngày";
    }

    const clusters = buildOwnerClusters();
    const focusKey = scopedOwnerKey();
    const clearBtn = document.getElementById("dashOwnerClear");
    const focusEl = document.getElementById("dashOwnerFocus");
    const clustersEl = document.getElementById("dashOwnerClusters");
    const lockedToSelfEarly = isAuthenticated() && !isSystemAdmin();

    if (clearBtn) clearBtn.style.display = focusKey && !lockedToSelfEarly ? "" : "none";

    if (focusEl) {
      if (focusKey) {
        const c = clusters.find((x) => x.key === focusKey);
        focusEl.style.display = "";
        focusEl.innerHTML = c
          ? `<h3>${esc(c.name)}</h3>
             <p>${esc(c.subtitle)} · ${c.items.length} công việc · bấm việc để mở</p>
             ${renderOwnerWorkList(c.items)}
             <div style="margin-top:12px">
               <button type="button" class="btn soft" onclick="setView('projects')">Mở trang Task →</button>
             </div>`
          : `<h3>Không tìm thấy</h3><p>Người phụ trách này chưa có trong danh sách.</p>`;
      } else {
        focusEl.style.display = "none";
        focusEl.innerHTML = "";
      }
    }

    if (clustersEl) {
      const lockedToSelf = isAuthenticated() && !isSystemAdmin();
      // Đã có khối focus phía trên → ẩn cluster trùng (dashboard con)
      if (focusKey) {
        clustersEl.style.display = "none";
        clustersEl.innerHTML = "";
      } else {
        clustersEl.style.display = "";
        // Tổng quan: hiện tất cả account clusters
        const visible = clusters;

        if (!visible.length) {
          clustersEl.innerHTML = lockedToSelf
            ? `<div class="owner-cluster"><div class="owner-work-empty">Bạn chưa có Task. Bấm “+ Task mới”.</div></div>`
            : `<div class="owner-cluster"><div class="owner-work-empty">Chưa có tài khoản / công việc. Seed users rồi tạo Task mới.</div></div>`;
        } else {
          clustersEl.innerHTML = visible
            .map((c) => {
              const preview = c.items.slice(0, 4);
              const more =
                c.items.length > 4
                  ? `<div class="owner-work-empty">+${c.items.length - 4} việc nữa · bấm tên để xem hết</div>`
                  : "";
              return `<div class="owner-cluster" data-owner-key="${esc(c.key)}">
              <div class="owner-cluster-head" data-focus-owner="${esc(c.key)}" data-focus-name="${esc(c.name)}" title="Xem Task của ${esc(c.name)}">
                <span class="avatar">${esc(avatarInitials(c.name))}</span>
                <span class="meta">
                  <b><button type="button" class="owner-name-btn" data-focus-owner="${esc(c.key)}" data-focus-name="${esc(c.name)}">${esc(c.name)}</button></b>
                  <small>${esc(c.subtitle)}</small>
                </span>
                <span class="count">${c.items.length} việc</span>
              </div>
              ${preview.length ? renderOwnerWorkList(preview) + more : `<div class="owner-work-empty">Chưa có công việc</div>`}
            </div>`;
            })
            .join("");
          clustersEl.querySelectorAll("[data-focus-owner]").forEach((el) => {
            el.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              focusOverviewOwner(
                el.getAttribute("data-focus-owner"),
                el.getAttribute("data-focus-name")
              );
            });
          });
        }
      }
    }

    const unitsEl = document.getElementById("dashUnits");
    const unitsSub = document.getElementById("dashUnitsSub");
    if (unitsSub)
      unitsSub.textContent = state.opsDate
        ? `Theo DailyClose ngày ${state.opsDate}`
        : "Chưa có DailyClose";
    if (unitsEl) {
      const closes = state.dailyCloses || [];
      const byUnit = Object.fromEntries(closes.map((c) => [c.unitId, c]));
      const maxRev = Math.max(1, ...closes.map((c) => c.revenue || 0));
      const units = state.units || [];
      if (!units.length) {
        unitsEl.innerHTML =
          '<div class="unit"><h3>Chưa có phân khu</h3><div class="micro">Seed Unit trước</div></div>';
      } else {
        unitsEl.innerHTML = units
          .map((u) => {
            const c = byUnit[u.id];
            const rev = c?.revenue || 0;
            const cash = c?.cashCollected || 0;
            const st = c ? closeStatusVi(c.status) : "Chưa nộp";
            const tag = c
              ? c.status === "LOCKED"
                ? "green"
                : c.status === "RECONCILED"
                  ? "blue"
                  : "amber"
              : "gray";
            const barCls = c && c.status === "PROVISIONAL" ? " warn" : "";
            return `<div class="unit" style="cursor:pointer" onclick="openDailyClose('${esc(
              u.name
            )}')">
              <div class="unit-top"><h3>${esc(u.name)}</h3><span class="tag ${tag}">${esc(
              st
            )}</span></div>
              <div class="money">${money(rev)}</div>
              <div class="micro">Thực thu ${money(cash)}${
              c ? ` · ${esc(sourceLabel[c.source] || c.source)}` : ""
            }</div>
              <div class="bar${barCls}"><i style="width:${pct(rev, maxRev)}%"></i></div>
            </div>`;
          })
          .join("");
      }
    }

    const risksEl = document.getElementById("dashRisks");
    if (risksEl) {
      const risks = [];
      const missing = state.summary?.missingUnits || [];
      if (missing.length) {
        risks.push({
          tone: "amber",
          title: `${missing.length} phân khu chưa chốt ngày`,
          detail: missing.slice(0, 4).join(", ") + (missing.length > 4 ? "…" : ""),
          action: () => setView("finance"),
        });
      }
      const blocked = (state.tasks || []).filter((t) => t.status === "BLOCKED");
      if (blocked.length) {
        risks.push({
          tone: "red",
          title: `${blocked.length} việc bị chặn`,
          detail: blocked
            .slice(0, 2)
            .map((t) => t.title)
            .join(" · "),
          action: () => {
            setTaskFilter("blocked");
            setView("tasks");
          },
        });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overdue = (state.tasks || []).filter((t) => {
        if (t.status === "DONE") return false;
        const d = parseDeadline(t.deadline);
        return d && d < today;
      });
      if (overdue.length) {
        risks.push({
          tone: "amber",
          title: `${overdue.length} việc quá hạn`,
          detail: overdue
            .slice(0, 2)
            .map((t) => t.title)
            .join(" · "),
          action: () => {
            setTaskFilter("overdue");
            setView("tasks");
          },
        });
      }
      const pending = (state.decisions || []).filter((d) =>
        ["PENDING", "NEEDS_INFO"].includes(d.status)
      );
      if (pending.length) {
        risks.push({
          tone: "amber",
          title: `${pending.length} quyết định đang mở`,
          detail: pending
            .slice(0, 2)
            .map((d) => d.title)
            .join(" · "),
          action: () => setView("decisions"),
        });
      }
      const provExp = (state.expenses || []).filter(
        (e) => e.status === "PROVISIONAL"
      );
      if (provExp.length) {
        const sum = provExp.reduce((a, e) => a + (e.amount || 0), 0);
        risks.push({
          tone: "amber",
          title: `${provExp.length} khoản chi tạm ghi nhận`,
          detail: money(sum) + " chưa đối chiếu",
          action: () => setView("expenses"),
        });
      }
      if (!risks.length) {
        risksEl.innerHTML =
          '<div class="risk"><i class="dot green"></i><div><b>Không có điểm nóng</b><small>Closes / tasks / decisions ổn định</small></div><span class="tag green">OK</span></div>';
      } else {
        risksEl.innerHTML = risks
          .slice(0, 5)
          .map(
            (r, i) =>
              `<div class="risk" style="cursor:pointer" data-risk="${i}"><i class="dot ${
                r.tone === "amber" ? "amber" : ""
              }"></i><div><b>${esc(r.title)}</b><small>${esc(
                r.detail
              )}</small></div><span class="tag ${
                r.tone === "red" ? "red" : "amber"
              }">Xem</span></div>`
          )
          .join("");
        risksEl.querySelectorAll("[data-risk]").forEach((el) => {
          const i = Number(el.getAttribute("data-risk"));
          el.addEventListener("click", () => risks[i]?.action?.());
        });
      }
    }

    // decisions block continues below — keep existing dashDecisions render if present later
  }

  function renderFinance() {
    const s = state.summary;
    const metrics = document.querySelectorAll("#financeMetrics .metric");
    if (metrics[0] && s) {
      metrics[0].querySelector(".value").textContent = `${s.submitted || 0}/${
        s.totalUnits || 0
      }`;
      metrics[0].querySelector(".delta").textContent = state.opsDate
        ? `Ngày ${state.opsDate}`
        : "Chưa có ngày";
    }
    if (metrics[1] && s) {
      metrics[1].querySelector(".value").textContent = money(s.revenue);
    }
    if (metrics[2] && s) {
      metrics[2].querySelector(".value").textContent = money(s.cash);
    }
    if (metrics[3] && s) {
      metrics[3].querySelector(".value").textContent = String(
        s.confirmedCloses || 0
      );
    }

    const alert = document.getElementById("financeAlert");
    if (alert) {
      const missing = s?.missingUnits || [];
      const title = alert.querySelector("b");
      const sub = alert.querySelector("span");
      if (missing.length) {
        if (title)
          title.textContent = `${missing.length} phân khu chưa nộp chốt ngày`;
        if (sub)
          sub.textContent =
            missing.join(", ") +
            (state.opsDate ? ` · Ngày ${state.opsDate}` : "");
      } else if ((s?.submitted || 0) > 0) {
        if (title) title.textContent = "Đã nhận đủ chốt ngày theo phân khu";
        if (sub)
          sub.textContent = state.opsDate
            ? `Nguồn Prisma DailyClose · ${state.opsDate}`
            : "Nguồn Prisma DailyClose";
      } else {
        if (title) title.textContent = "Chưa có DailyClose";
        if (sub) sub.textContent = "Nhập chốt ngày để cập nhật bảng điều hành";
      }
    }

    const sub = document.getElementById("financeTableSub");
    if (sub)
      sub.textContent = state.opsDate
        ? `Nguồn: Prisma DailyClose · ${state.opsDate}`
        : "Nguồn: Prisma DailyClose";

    const tb = document.getElementById("financeTableBody");
    if (!tb) return;
    const closes = state.dailyCloses || [];
    const byUnit = Object.fromEntries(closes.map((c) => [c.unitId, c]));
    const units = state.units || [];
    if (!units.length) {
      tb.innerHTML =
        '<tr><td colspan="7" style="padding:16px;color:var(--muted)">Chưa có phân khu</td></tr>';
      return;
    }
    tb.innerHTML = units
      .map((u) => {
        const c = byUnit[u.id];
        if (!c) {
          return `<tr>
            <td><b>${esc(u.name)}</b></td>
            <td>—</td><td>—</td><td>—</td><td>—</td>
            <td><span class="tag gray">Chưa nộp</span></td>
            <td><button class="btn soft" type="button" onclick="openDailyClose('${esc(
              u.name
            )}')">Nhập</button></td>
          </tr>`;
        }
        const updated = new Date(c.updatedAt).toLocaleString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        });
        return `<tr>
          <td><b>${esc(u.name)}</b></td>
          <td><b>${money(c.revenue)}</b></td>
          <td>${money(c.cashCollected)}</td>
          <td><span class="source">${esc(
            sourceLabel[c.source] || c.source
          )}</span></td>
          <td>${esc(updated)}</td>
          <td><span class="tag ${tagStatus(c.status)}">${esc(
            closeStatusVi(c.status)
          )}</span></td>
          <td><button class="btn soft" type="button" onclick="openDailyClose('${esc(
            u.name
          )}')">Sửa</button></td>
        </tr>`;
      })
      .join("");
  }

  function breakdownRows(groups, total) {
    return groups
      .map(([name, amount]) => {
        const p = pct(amount, total);
        const bar =
          p >= 40 ? "" : p >= 20 ? " amber" : amount > 0 ? " red" : "";
        return `<div class="breakdown-row"><div class="name">${esc(
          name
        )}</div><div class="mini-bar${bar}"><i style="width:${p}%"></i></div><div class="amount">${money(
          amount
        )}</div></div>`;
      })
      .join("");
  }

  function renderExpenses() {
    const tb = document.getElementById("expenseTableBody");
    if (!tb) return;
    const s = state.summary;
    const metrics = document.querySelectorAll("#expenseMetrics .metric .value");
    if (metrics[0] && s) metrics[0].textContent = money(s.expenseTotal);
    if (metrics[1] && s) metrics[1].textContent = money(s.reconciled);
    if (metrics[2] && s) metrics[2].textContent = money(s.provisional);
    if (metrics[3] && s) metrics[3].textContent = money(s.linkedExpense);

    const expenses = state.expenses || [];
    const total = expenses.reduce((a, e) => a + (e.amount || 0), 0);

    const byCat = {};
    expenses.forEach((e) => {
      const k = e.categoryLabel || e.category || "Chưa xác định";
      byCat[k] = (byCat[k] || 0) + (e.amount || 0);
    });
    const catEl = document.getElementById("expenseByCategory");
    if (catEl) {
      const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      catEl.innerHTML = rows.length
        ? breakdownRows(rows, total)
        : '<div class="breakdown-row"><div class="name">Chưa có chi phí</div><div class="mini-bar"></div><div class="amount">—</div></div>';
    }

    const byUnit = {};
    expenses.forEach((e) => {
      const k = e.unit?.name || "Chưa gắn phân khu";
      byUnit[k] = (byUnit[k] || 0) + (e.amount || 0);
    });
    const unitEl = document.getElementById("expenseByUnit");
    if (unitEl) {
      const rows = Object.entries(byUnit).sort((a, b) => b[1] - a[1]);
      unitEl.innerHTML = rows.length
        ? breakdownRows(rows, total)
        : '<div class="breakdown-row"><div class="name">Chưa có chi phí</div><div class="mini-bar"></div><div class="amount">—</div></div>';
    }

    const statusEl = document.getElementById("expenseByStatus");
    if (statusEl) {
      const groups = [
        ["PROVISIONAL", "Tạm ghi nhận"],
        ["RECONCILED", "Đã đối chiếu"],
        ["LOCKED", "Đã chốt"],
      ];
      statusEl.innerHTML = groups
        .map(([code, label]) => {
          const list = expenses.filter((e) => e.status === code);
          const sum = list.reduce((a, e) => a + (e.amount || 0), 0);
          return `<div class="risk"><i class="dot ${
            code === "PROVISIONAL" ? "amber" : "green"
          }"></i><div><b>${esc(label)}</b><small>${list.length} khoản · ${money(
            sum
          )}</small></div><span class="tag ${tagStatus(code)}">${list.length}</span></div>`;
        })
        .join("");
    }

    const attn = document.getElementById("expenseAttention");
    if (attn) {
      const items = [];
      const unclassified = expenses.filter(
        (e) =>
          !e.categoryLabel ||
          e.category === "UNCLASSIFIED" ||
          e.categoryLabel === "Chưa xác định"
      );
      if (unclassified.length) {
        items.push({
          tone: "amber",
          title: `${unclassified.length} khoản chưa phân loại rõ`,
          detail: money(unclassified.reduce((a, e) => a + e.amount, 0)),
        });
      }
      const noUnit = expenses.filter((e) => !e.unitId);
      if (noUnit.length) {
        items.push({
          tone: "amber",
          title: `${noUnit.length} khoản chưa gắn phân khu`,
          detail: money(noUnit.reduce((a, e) => a + e.amount, 0)),
        });
      }
      const provisional = expenses.filter((e) => e.status === "PROVISIONAL");
      if (provisional.length) {
        items.push({
          tone: "amber",
          title: `${provisional.length} khoản tạm ghi nhận`,
          detail: "Cần Finance đối chiếu",
        });
      }
      const noLink = expenses.filter((e) => !e.linkedTaskId && !e.taskRef);
      if (noLink.length && noLink.length === expenses.length && expenses.length) {
        items.push({
          tone: "amber",
          title: "Chưa có khoản chi gắn công việc",
          detail: "Tuỳ chọn — không bắt buộc V1",
        });
      }
      attn.innerHTML = items.length
        ? items
            .map(
              (r) =>
                `<div class="risk"><i class="dot ${
                  r.tone === "amber" ? "amber" : ""
                }"></i><div><b>${esc(r.title)}</b><small>${esc(
                  r.detail
                )}</small></div></div>`
            )
            .join("")
        : '<div class="risk"><i class="dot green"></i><div><b>Không có điểm cần kiểm tra</b><small>Phân loại và trạng thái ổn</small></div></div>';
    }

    const catFilter = document.getElementById("expenseCategoryFilter");
    if (catFilter) {
      const cur = catFilter.value || "all";
      const cats = [
        ...new Set(expenses.map((e) => e.categoryLabel || e.category).filter(Boolean)),
      ];
      catFilter.innerHTML =
        `<option value="all">Tất cả</option>` +
        cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
      catFilter.value = [...catFilter.options].some((o) => o.value === cur)
        ? cur
        : "all";
    }

    tb.innerHTML = expenses.length
      ? expenses
          .map((e) => {
            const label = e.categoryLabel || e.category;
            const st = expenseStatusVi(e.status);
            const time = new Date(e.createdAt).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            });
            return `<tr class="expense-row" data-id="${e.id}" data-unit="${esc(
              e.unit?.name || ""
            )}" data-category="${esc(label)}" data-status="${esc(st)}">
        <td><span class="expense-code">${esc(e.code || "")}</span><br/>${time}</td>
        <td>${esc(e.unit?.name || "—")}</td>
        <td>${esc(label)}</td>
        <td>${esc(e.content || "")}</td>
        <td><b>${money(e.amount)}</b></td>
        <td><span class="source">${esc(
          e.linkedProject?.name ||
            e.linkedTask?.title ||
            e.linkedTask?.code ||
            e.taskRef ||
            (e.source === "Nhập tay" ? "—" : e.source) ||
            "—"
        )}</span></td>
        <td><span class="tag ${tagStatus(e.status)}">${esc(st)}</span></td></tr>`;
          })
          .join("")
      : '<tr><td colspan="7" style="padding:16px;color:var(--muted)">Chưa có khoản chi</td></tr>';
    tb.querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", () => openExpenseDetail(tr.dataset.id))
    );
    if (typeof window.filterExpenseRows === "function") window.filterExpenseRows();
  }

  function confidenceClass(v) {
    return v >= 85 ? "high" : v >= 65 ? "mid" : "low";
  }

  function renderAiDrafts() {
    const el = document.getElementById("aiDraftList");
    if (!el) return;
    const drafts = state.drafts;
    if (!drafts.length) {
      el.innerHTML =
        '<div class="priority-gate"><b>Chưa phân tích</b><p>Bấm “AI phân tích tin nhắn” để tạo bản nháp. AI chỉ gợi ý — người quản lý xác nhận trước khi ghi Task.</p></div>';
      return;
    }
    el.innerHTML = drafts
      .map((d) => {
        const stateCls =
          d.reviewStatus === "CONFIRMED" || d.reviewStatus === "MERGED"
            ? "confirmed"
            : d.reviewStatus === "SKIPPED"
              ? "skipped"
              : "";
        return `<div class="draft ${stateCls}" id="draft-${d.id}">
        <div class="draft-top"><div><div class="draft-title">${esc(d.suggestedTitle)}</div>
        ${d.parentGroup ? `<span class="draft-parent">Nhóm: ${esc(d.parentGroup)}</span>` : ""}</div>
        <span class="confidence ${confidenceClass(d.confidence)}">${d.confidence}%</span></div>
        <div class="draft-meta">
          <span class="tag blue">${esc(d.suggestedUnit || "—")}</span>
          <span class="tag gray">${esc(d.suggestedType || "")}</span>
          ${
            d.suggestedOwner
              ? `<span class="tag green">Phụ trách: ${esc(d.suggestedOwner)}</span>`
              : `<span class="tag amber">Chưa có người phụ trách</span>`
          }
          ${d.duplicateHint ? `<span class="tag red">Nghi trùng: ${esc(d.duplicateHint)}</span>` : ""}
        </div>
        <div class="draft-note">${esc(d.reason || "")}</div>
        ${
          d.reviewStatus === "PENDING" || d.reviewStatus === "EDITED"
            ? `<div class="draft-actions">
          <button class="btn primary" onclick="confirmDraft('${d.id}')">Xác nhận</button>
          <button class="btn soft" onclick="editDraftDemo('${d.id}')">Sửa</button>
          ${d.duplicateTaskId ? `<button class="btn soft" onclick="mergeDraftDemo('${d.id}')">Gộp với việc cũ</button>` : ""}
          <button class="btn soft" onclick="skipDraft('${d.id}')">Bỏ qua</button>
        </div>`
            : `<div class="draft-note">Trạng thái: ${esc(d.reviewStatus)}</div>`
        }
      </div>`;
      })
      .join("");

    const groups = new Set(drafts.map((d) => d.parentGroup).filter(Boolean)).size;
    const need = drafts.filter(
      (d) =>
        (d.reviewStatus === "PENDING" || d.reviewStatus === "EDITED") &&
        (d.confidence < 85 || !d.suggestedOwner)
    ).length;
    const dup = drafts.filter((d) => d.duplicateTaskId || d.duplicateHint).length;
    const set = (id, v) => {
      const n = document.getElementById(id);
      if (n) n.textContent = v;
    };
    set("aiGroups", groups || "—");
    set("aiDraftCount", drafts.length);
    set("aiNeedCheck", need);
    set("aiDuplicates", dup);
  }

  function renderLinkedDecisions(taskId) {
    const panel = document.getElementById("linkedDecisionPanel");
    if (!panel) return;
    const list = state.decisions.filter((d) => d.linkedTaskId === taskId);
    if (!list.length) {
      panel.className = "linked-decision-panel empty";
      panel.innerHTML =
        "<h4>Quyết định liên quan</h4><p>Không có yêu cầu duyệt đang gắn với công việc này.</p>";
      return;
    }
    panel.className = "linked-decision-panel";
    panel.innerHTML =
      "<h4>Quyết định liên quan</h4>" +
      list
        .map(
          (d) => `<div class="linked-decision-row"><div>
        <span class="decision-id">${esc(d.code || "")}</span><br/><b>${esc(d.title)}</b>
        <p>${statusVi[d.status] || d.status} · Hạn ${esc(d.deadline || "—")}${d.isBlocking ? " · đang chặn việc" : ""}</p>
        </div><button class="btn soft" onclick="goToDecision('${d.code || d.id}')">Mở</button></div>`
        )
        .join("");
  }

  async function refresh(date) {
    const q =
      date || state.opsDate
        ? `?date=${encodeURIComponent(date || state.opsDate)}`
        : "";
    const data = await api("/api/dashboard" + q);
    state.tasks = data.tasks || [];
    state.projects = data.projects || [];
    state.decisions = data.decisions || [];
    state.expenses = data.expenses || [];
    state.units = data.units || [];
    state.dailyCloses = data.dailyCloses || [];
    state.issues = data.issues || [];
    state.summary = data.summary;
    state.capabilities = data.capabilities || {
      canReconcileExpense: isSystemAdmin(),
      canResolveAnyDecision: isSystemAdmin(),
      isAdmin: isSystemAdmin(),
    };
    state.opsDate = data.date || date || state.opsDate;
    syncOpsDateUi();
    syncUnitSelects();
    renderDashboard();
    renderFinance();
    renderTasks();
    renderProjects();
    renderDecisions();
    renderExpenses();
    renderIssues();
    renderStaff();
    renderAdminOps();
    renderStaffOps();
    if (state.currentView === "docs" || document.getElementById("vr-docs")?.checked) {
      loadDocuments();
    }
    if (data.messages?.[0]?.drafts?.length && !state.drafts.length) {
      state.drafts = data.messages[0].drafts;
      state.messageId = data.messages[0].id;
      renderAiDrafts();
    }
  }

  window.openTaskDetail = async function (idOrKey) {
    let t = state.tasks.find((x) => x.id === idOrKey);
    if (!t) {
      t = state.tasks.find(
        (x) =>
          x.code === idOrKey ||
          x.title.toLowerCase().includes(String(idOrKey).toLowerCase())
      );
    }
    if (!t && idOrKey.length > 10) {
      t = await api("/api/tasks/" + idOrKey);
    }
    if (!t) return showToast("Không tìm thấy công việc");

    state.currentTaskId = t.id;
    window.currentTaskId = t.id;
    window.currentTaskKey = t.id;

    document.getElementById("detailCode").textContent = t.code || t.id.slice(0, 8);
    document.getElementById("detailTitle").textContent = t.title;
    document.getElementById("detailTags").innerHTML = `<span class="tag amber">${t.priority}</span><span class="tag blue">${esc(t.unit?.name || "")}</span>`;
    document.getElementById("detailProgressText").textContent = (t.progress || 0) + "%";
    document.getElementById("detailProgressBar").style.width = (t.progress || 0) + "%";
    document.getElementById("dUnit").textContent = t.unit?.name || "—";
    document.getElementById("dOwner").textContent = t.owner || "—";
    document.getElementById("dDeadline").textContent = t.deadline || "—";
    document.getElementById("dCost").textContent = t.cost != null ? money(t.cost) : "—";
    document.getElementById("dStatus").textContent = statusVi[t.status] || t.status;
    document.getElementById("dBlocker").textContent = t.blocker || "Không";

    const events = t.events || [];
    document.getElementById("detailTimeline").innerHTML = events.length
      ? events
          .map(
            (ev) => `<div class="time-row"><i class="time-dot"></i><div>
          <b>${new Date(ev.createdAt).toLocaleString("vi-VN")}</b>
          <span>${esc(ev.label)}${ev.detail ? " — " + esc(ev.detail) : ""}</span></div></div>`
          )
          .join("")
      : "<p style='font-size:11px;color:var(--muted)'>Chưa có lịch sử.</p>";

    renderLinkedDecisions(t.id);
    document.getElementById("detailModal").classList.add("show");
  };

  window.closeTaskDetail = function () {
    document.getElementById("detailModal")?.classList.remove("show");
    state.currentTaskId = null;
    window.currentTaskId = null;
  };

  window.goToDecision = function (codeOrId) {
    closeTaskDetail();
    setView("decisions");
    setTimeout(() => {
      const el =
        document.getElementById("decision-" + codeOrId) ||
        document.getElementById("decision-" + codeOrId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("decision-highlight");
        setTimeout(() => el.classList.remove("decision-highlight"), 1800);
      }
    }, 100);
  };

  window.resolveDecision = async function (id, status) {
    if (!requireAuthenticatedAction(() => true)) return;
    try {
      await api("/api/decisions/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          resolvedBy: state.auth.user?.username || null,
        }),
      });
      showToast(statusVi[status] || status);
      await refresh();
      if (state.currentTaskId) openTaskDetail(state.currentTaskId);
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.openDecisionModal = function (taskId) {
    if (!requireAuthenticatedAction(() => true)) return;
    const sel = document.getElementById("decisionTask");
    if (sel && taskId) sel.value = taskId;
    const t = state.tasks.find((x) => x.id === taskId);
    if (t) {
      document.getElementById("decisionTitle").value = "Duyệt: " + t.title;
      document.getElementById("decisionAmount").value =
        t.cost != null ? money(t.cost) : "";
      document.getElementById("decisionImpact").value =
        "Nếu chưa quyết, công việc “" + t.title + "” sẽ tiếp tục bị chặn.";
      if (t.project?.name) {
        document.getElementById("decisionProject").value = t.project.name;
      }
    }
    document.getElementById("decisionModal").classList.add("show");
  };

  window.closeDecisionModal = () =>
    document.getElementById("decisionModal")?.classList.remove("show");

  window.saveDecisionDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    await withBusy(
      ev,
      async () => {
        try {
          const projectVal = document.getElementById("decisionProject").value || null;
          await api("/api/decisions", {
            method: "POST",
            body: JSON.stringify({
              title: document.getElementById("decisionTitle").value,
              amountLabel: document.getElementById("decisionAmount").value,
              proposer: document.getElementById("decisionRequester").value,
              approver: document.getElementById("decisionApprover").value,
              deadline: document.getElementById("decisionDeadline").value,
              impact: document.getElementById("decisionImpact").value,
              isBlocking: document.getElementById("decisionBlocking").checked,
              linkedTaskId: document.getElementById("decisionTask").value || null,
              linkedProjectId: projectVal || null,
            }),
          });
          closeDecisionModal();
          showToast("Đã tạo yêu cầu duyệt");
          await refresh();
          setView("decisions");
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang gửi…", lockKey: "create-decision" }
    );
  };

  window.analyzeMessageDemo = async function () {
    if (!requireAuthenticatedAction(() => true)) return;
    const rawText = document.getElementById("aiSourceText").value;
    try {
      const msg = await api("/api/ai/inbox", {
        method: "POST",
        body: JSON.stringify({ rawText }),
      });
      state.messageId = msg.id;
      state.drafts = msg.drafts || [];
      renderAiDrafts();
      showToast("AI đã tách bản nháp · cần người xác nhận");
    } catch (e) {
      showToast("Lỗi AI: " + e.message);
    }
  };

  window.resetAiInbox = function () {
    state.drafts = [];
    state.messageId = null;
    renderAiDrafts();
    showToast("Đã đặt lại Hộp thư AI");
  };

  window.confirmDraft = async function (id) {
    if (!requireAuthenticatedAction(() => true)) return;
    try {
      await api("/api/ai/drafts/" + id, {
        method: "POST",
        body: JSON.stringify({ action: "confirm" }),
      });
      const d = state.drafts.find((x) => x.id === id);
      if (d) d.reviewStatus = "CONFIRMED";
      renderAiDrafts();
      showToast("Đã tạo công việc từ bản nháp");
      await refresh();
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.skipDraft = async function (id) {
    if (!requireAuthenticatedAction(() => true)) return;
    try {
      await api("/api/ai/drafts/" + id, {
        method: "POST",
        body: JSON.stringify({ action: "skip" }),
      });
      const d = state.drafts.find((x) => x.id === id);
      if (d) d.reviewStatus = "SKIPPED";
      renderAiDrafts();
      showToast("Đã bỏ qua bản nháp");
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.mergeDraftDemo = async function (id) {
    if (!requireAuthenticatedAction(() => true)) return;
    try {
      await api("/api/ai/drafts/" + id, {
        method: "POST",
        body: JSON.stringify({ action: "merge" }),
      });
      const d = state.drafts.find((x) => x.id === id);
      if (d) d.reviewStatus = "MERGED";
      renderAiDrafts();
      showToast("Đã gộp vào công việc đang có");
      await refresh();
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.editDraftDemo = function (id) {
    if (!requireAuthenticatedAction(() => true)) return;
    const d = state.drafts.find((x) => x.id === id);
    if (!d) return;
    const owner = prompt("Người phụ trách", d.suggestedOwner || "");
    if (owner === null) return;
    api("/api/ai/drafts/" + id, {
      method: "PATCH",
      body: JSON.stringify({
        suggestedTitle: d.suggestedTitle,
        suggestedUnit: d.suggestedUnit,
        suggestedType: d.suggestedType,
        suggestedOwner: owner || null,
        reason: d.reason,
      }),
    }).then((saved) => {
      Object.assign(d, saved);
      renderAiDrafts();
      showToast("Đã sửa bản nháp");
    });
  };

  window.confirmHighConfidence = async function () {
    if (!requireAuthenticatedAction(() => true)) return;
    if (!state.drafts.length) {
      await analyzeMessageDemo();
      return;
    }
    for (const d of state.drafts) {
      if (
        d.confidence >= 90 &&
        !d.duplicateTaskId &&
        (d.reviewStatus === "PENDING" || d.reviewStatus === "EDITED")
      ) {
        await confirmDraft(d.id);
      }
    }
  };

  window.openExpenseModal = function () {
    if (!requireAuthenticatedAction(() => true)) return;
    // Mở từ module Chi phí (không từ Task) → clear context
    if (!state.expenseFromProjectId) {
      const modal = document.getElementById("expenseModal");
      if (modal) modal.style.zIndex = "";
    }
    document.getElementById("expenseSuggestBox")?.classList.remove("show");
    const sel = document.getElementById("expenseLinkedProject");
    if (sel) {
      const cur = state.expenseFromProjectId || sel.value;
      sel.innerHTML =
        `<option value="">— Chưa xác định —</option>` +
        (state.projects || [])
          .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
          .join("");
      sel.value = cur || "";
    }
    document.getElementById("expenseModal")?.classList.add("show");
  };
  window.closeExpenseModal = () => {
    document.getElementById("expenseModal")?.classList.remove("show");
    const modal = document.getElementById("expenseModal");
    if (modal) modal.style.zIndex = "";
    state.expenseFromProjectId = null;
  };

  window.suggestExpenseDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    await withBusy(
      ev,
      async () => {
        try {
          const text = document.getElementById("expenseText").value;
          const unitName = document.getElementById("expenseUnit").value;
          const s = await api("/api/ai/classify", {
            method: "POST",
            body: JSON.stringify({ kind: "expense", text, unitName }),
          });
          state.lastExpenseSuggest = s;
          document.getElementById("expenseSuggestCategory").textContent =
            s.categoryLabel;
          document.getElementById("expenseSuggestUnit").textContent =
            s.unitName || "—";
          document.getElementById("expenseSuggestTask").textContent =
            s.linkedTaskHint || "—";
          document.getElementById("expenseSuggestConfidence").textContent =
            s.confidence + "%";
          document.getElementById("expenseSuggestReason").textContent = s.reason;
          document.getElementById("expenseSuggestBox").classList.add("show");
          document.getElementById("expenseCategory").value = s.categoryLabel;
          if (s.unitName) {
            const u = document.getElementById("expenseUnit");
            if (
              [...u.options].some(
                (o) => o.value === s.unitName || o.text === s.unitName
              )
            )
              u.value = s.unitName;
          }
          if (s.linkedTaskHint) {
            const hint = String(s.linkedTaskHint).toLowerCase();
            const match = (state.projects || []).find(
              (p) =>
                String(p.name || "").toLowerCase().includes(hint) ||
                hint.includes(String(p.name || "").toLowerCase().slice(0, 12))
            );
            const sel = document.getElementById("expenseLinkedProject");
            if (sel && match) sel.value = match.id;
          }
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang gợi ý…", lockKey: "suggest-expense" }
    );
  };

  window.suggestRevenueDemo = async function () {
    if (!requireAuthenticatedAction(() => true)) return;
    try {
      const text = document.getElementById("revenueSourceNote")?.value || "";
      const unitName = document.getElementById("closeUnit")?.value;
      const s = await api("/api/ai/classify", {
        method: "POST",
        body: JSON.stringify({ kind: "revenue", text, unitName }),
      });
      document.getElementById("revSuggestType").textContent = s.type;
      document.getElementById("revSuggestUnit").textContent = s.unitName || "—";
      document.getElementById("revSuggestCustomer").textContent = s.customerGroup;
      document.getElementById("revSuggestConfidence").textContent =
        s.confidence + "%";
      document.getElementById("revenueSuggestBox")?.classList.add("show");
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.saveExpenseDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    const label = document.getElementById("expenseCategory").value;
    const linkedProjectId =
      document.getElementById("expenseLinkedProject")?.value || null;
    const amount = Number(document.getElementById("expenseAmount").value || 0);
    if (!(amount > 0)) return showToast("Số tiền phải > 0");
    if (!linkedProjectId && !isSystemAdmin()) {
      return showToast("Gắn với Task trước khi ghi (bắt buộc với tài khoản thường)");
    }
    const project = (state.projects || []).find((p) => p.id === linkedProjectId);
    const fromProjectId = state.expenseFromProjectId || linkedProjectId;
    await withBusy(
      ev,
      async () => {
        try {
          await api("/api/expenses", {
            method: "POST",
            body: JSON.stringify({
              unitName: document.getElementById("expenseUnit").value || null,
              categoryLabel: label,
              amount,
              content: document.getElementById("expenseText").value,
              taskRef: project?.name || null,
              linkedProjectId: linkedProjectId || null,
              aiSuggestion: state.lastExpenseSuggest?.categoryLabel,
              aiConfidence: state.lastExpenseSuggest?.confidence,
              humanConfirmed: true,
              source: "Nhập tay",
            }),
          });
          closeExpenseModal();
          state.expenseFromProjectId = null;
          const expenseModal = document.getElementById("expenseModal");
          if (expenseModal) expenseModal.style.zIndex = "";
          showToast("Đã ghi chi phí");
          await refresh();
          if (fromProjectId) {
            openTaskEnergyModal(fromProjectId);
            applyTaskDetailTab("costs");
          } else {
            setView("expenses");
          }
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang lưu…", lockKey: "create-expense" }
    );
  };

  window.openExpenseDetail = function (id) {
    const e = state.expenses.find((x) => x.id === id || x.code === id);
    if (!e) return;
    state.currentExpenseId = e.id;
    document.getElementById("expenseDetailCode").textContent = e.code || "";
    document.getElementById("expenseDetailTitle").textContent = e.content || "";
    document.getElementById("expenseDetailMeta").textContent =
      (e.unit?.name || "") + " · " + new Date(e.createdAt).toLocaleString("vi-VN");
    document.getElementById("expenseDetailAmount").textContent = money(e.amount);
    const st = document.getElementById("expenseDetailStatus");
    st.textContent = expenseStatusVi(e.status);
    st.className = "tag " + tagStatus(e.status);
    document.getElementById("edUnit").textContent = e.unit?.name || "—";
    document.getElementById("edCategory").textContent =
      e.categoryLabel || e.category;
    document.getElementById("edReporter").textContent =
      state.auth.user?.username || "Người dùng đã đăng nhập";
    document.getElementById("edTime").textContent = new Date(
      e.createdAt
    ).toLocaleString("vi-VN");
    document.getElementById("edLinked").textContent = e.linkedProject
      ? e.linkedProject.name
      : e.linkedTask
        ? (e.linkedTask.code || "") + " · " + e.linkedTask.title
        : e.taskRef || "Chưa gắn";
    document.getElementById("edPayment").textContent = "Chi vận hành";
    document.getElementById("edAi").textContent = e.aiSuggestion
      ? `AI gợi ý “${e.aiSuggestion}” (${e.aiConfidence || "—"}%)`
      : "—";
    document.getElementById("edDocTitle").textContent = e.source || "Chứng từ";
    document.getElementById("edDocMeta").textContent = e.humanConfirmed
      ? "Đã xác nhận bởi người dùng"
      : "Chờ xác nhận";
    const flow =
      e.status === "LOCKED" ? 3 : e.status === "RECONCILED" ? 2 : 1;
    [1, 2, 3].forEach((i) =>
      document.getElementById("expenseFlow" + i)?.classList.toggle("on", i <= flow)
    );
    document.getElementById("expenseDetailTimeline").innerHTML = `<div class="time-row"><i class="time-dot"></i><div><b>${new Date(e.createdAt).toLocaleString("vi-VN")}</b><span>Ghi nhận khoản chi ${money(e.amount)}.</span></div></div>`;
    const btn = document.getElementById("expenseOpenTaskBtn");
    if (btn)
      btn.style.display =
        e.linkedProjectId || e.linkedTaskId ? "inline-flex" : "none";
    const reconBtn = document.getElementById("expenseReconcileBtn");
    if (reconBtn) {
      const can = !!(state.capabilities?.canReconcileExpense || isSystemAdmin());
      reconBtn.style.display = can ? "inline-flex" : "none";
      if (e.status === "LOCKED") {
        reconBtn.textContent = "Đã chốt";
        reconBtn.disabled = true;
      } else if (e.status === "RECONCILED") {
        reconBtn.textContent = "Chốt khoản chi";
        reconBtn.disabled = !can;
      } else {
        reconBtn.textContent = "Đối chiếu";
        reconBtn.disabled = !can;
      }
    }
    document.getElementById("expenseDetailModal").classList.add("show");
  };

  window.closeExpenseDetail = () =>
    document.getElementById("expenseDetailModal")?.classList.remove("show");

  window.openExpenseLinkedTask = function () {
    const e = state.expenses.find((x) => x.id === state.currentExpenseId);
    if (e?.linkedProjectId) {
      closeExpenseDetail();
      openTaskEnergyModal(e.linkedProjectId);
      return;
    }
    if (e?.linkedTaskId) {
      closeExpenseDetail();
      openTaskDetail(e.linkedTaskId);
    }
  };

  window.filterExpenseRows = function () {
    const u = document.getElementById("expenseUnitFilter")?.value || "all";
    const c = document.getElementById("expenseCategoryFilter")?.value || "all";
    const st = document.getElementById("expenseStatusFilter")?.value || "all";
    document.querySelectorAll("#expenseTableBody .expense-row").forEach((r) => {
      const ok =
        (u === "all" || r.dataset.unit === u) &&
        (c === "all" || r.dataset.category === c) &&
        (st === "all" || r.dataset.status === st);
      r.style.display = ok ? "" : "none";
    });
  };

  window.openDailyClose = (unit) => {
    if (!requireAuthenticatedAction(() => true)) return;
    syncUnitSelects();
    if (unit) document.getElementById("closeUnit").value = unit;
    const closeDate = document.getElementById("closeDate");
    if (closeDate && !closeDate.value && state.opsDate) closeDate.value = state.opsDate;
    if (closeDate && !closeDate.value)
      closeDate.value = new Date().toISOString().slice(0, 10);
    document.getElementById("dailyCloseModal")?.classList.add("show");
  };
  window.closeDailyClose = () =>
    document.getElementById("dailyCloseModal")?.classList.remove("show");

  window.saveDailyCloseDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    await withBusy(
      ev,
      async () => {
        try {
          const date =
            document.getElementById("closeDate")?.value ||
            state.opsDate ||
            new Date().toISOString().slice(0, 10);
          await api("/api/daily-closes", {
            method: "POST",
            body: JSON.stringify({
              unitName: document.getElementById("closeUnit").value,
              date,
              revenue: Number(document.getElementById("closeRevenue").value || 0),
              cashCollected: Number(document.getElementById("closeCash").value || 0),
              source: document.getElementById("closeSource")?.value || "MANUAL",
              note: document.getElementById("closeNote")?.value,
            }),
          });
          closeDailyClose();
          showToast("Đã lưu chốt ngày");
          await refresh(date);
          setView("finance");
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang lưu…", lockKey: "daily-close" }
    );
  };

  window.openTaskModal = () => {
    if (!requireAuthenticatedAction(() => true)) return;
    document.getElementById("taskModal")?.classList.add("show");
  };
  window.closeTaskModal = () =>
    document.getElementById("taskModal")?.classList.remove("show");
  window.toggleGate = function () {
    const p = document.getElementById("prioritySelect")?.value || "";
    const g = document.getElementById("replaceGate");
    if (g) g.style.display = p.startsWith("P1") || p.startsWith("P0") ? "block" : "none";
  };

  window.saveTaskDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    const title = document.getElementById("taskTitle")?.value?.trim();
    if (!title) return showToast("Nhập tên việc");
    await withBusy(
      ev,
      async () => {
        try {
          await api("/api/tasks", {
            method: "POST",
            body: JSON.stringify({
              title,
              priority: document.getElementById("prioritySelect").value,
              owner: document.getElementById("taskOwner").value,
              deadline: document.getElementById("taskDeadline").value,
            }),
          });
          closeTaskModal();
          showToast("Đã tạo việc");
          await refresh();
          setView("tasks");
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang tạo…", lockKey: "create-task" }
    );
  };

  window.openProjectModal = (opts) => {
    if (!requireAuthenticatedAction(() => true)) return;
    const options = opts && typeof opts === "object" ? opts : {};
    // Chỉ Admin mới giao task cho người khác (Leaders UI + form Assign)
    if (options.assignMode && !isSystemAdmin()) {
      showToast("Chỉ ADMINISTRATION mới giao task cho Leaders");
      return;
    }
    state.adminAssignMode = !!(options.assignMode || isSystemAdmin());
    const modal = document.getElementById("projectModal");
    modal?.classList.toggle("adm-assign-mode", state.adminAssignMode);
    const sub = document.getElementById("projectModalSub");
    if (sub) {
      sub.style.display = state.adminAssignMode ? "" : "none";
    }
    const title = document.getElementById("projectModalTitle");
    if (title) title.textContent = state.adminAssignMode ? "New task" : "Assign Task";

    const sel = document.getElementById("projectOwner");
    const collab = document.getElementById("projectCollaborators");
    const rev = document.getElementById("projectReviewer");
    const directory = state.auth.directory || [];
    document.getElementById("projectImportant").value = "";
    document.getElementById("projectUrgent").value = "";
    document.getElementById("projectQuadrantPreview").textContent =
      "Result: — (chọn Important + Urgent)";
    document.querySelectorAll(".matrix-btn").forEach((b) => {
      b.classList.remove("primary");
      b.classList.add("soft");
    });
    if (rev) {
      rev.innerHTML =
        `<option value="">Default: người Assign</option>` +
        directory
          .map(
            (u) =>
              `<option value="${esc(u.id)}">${esc(u.displayName || u.username)}</option>`
          )
          .join("");
    }
    if (sel) {
      const curUser = state.auth.user;
      if (curUser && curUser.systemRole !== "SYSTEM_ADMIN") {
        const label = curUser.displayName || curUser.username;
        sel.innerHTML = `<option value="${esc(label)}">${esc(label)}</option>`;
        sel.value = label;
        sel.disabled = true;
      } else {
        sel.disabled = false;
        const leadersOnly = directory.filter((u) => u.systemRole !== "SYSTEM_ADMIN");
        const pool = options.assignMode ? leadersOnly : directory;
        sel.innerHTML =
          `<option value="">— Chọn —</option>` +
          pool
            .map(
              (u) =>
                `<option value="${esc(u.displayName || u.username)}">${esc(
                  u.displayName || u.username
                )}</option>`
            )
            .join("");
        if (options.ownerLabel) sel.value = options.ownerLabel;
        else if (curUser && !options.assignMode)
          sel.value = curUser.displayName || curUser.username;
      }
    }
    if (collab) {
      const primaryLabel = String(sel?.value || "").trim();
      const curId = state.auth.user?.id;
      const optionsDir = directory.filter((u) => {
        const label = u.displayName || u.username;
        if (curId && u.id === curId && sel?.disabled) return false;
        if (primaryLabel && (label === primaryLabel || u.username === primaryLabel))
          return false;
        return true;
      });
      collab.innerHTML = optionsDir.length
        ? optionsDir
            .map(
              (u) => `<label>
                <input type="checkbox" name="projectCollab" value="${esc(u.id)}" />
                <span>${esc(u.displayName || u.username)}</span>
              </label>`
            )
            .join("")
        : `<div class="collab-empty">Không còn tài khoản để thêm</div>`;
    }
    if (sel && !sel.disabled) {
      sel.onchange = () => {
        const checked = new Set(
          [...document.querySelectorAll('#projectCollaborators input[name="projectCollab"]:checked')].map(
            (el) => el.value
          )
        );
        const primaryLabel = String(sel.value || "").trim();
        const optionsDir = directory.filter((u) => {
          const label = u.displayName || u.username;
          if (primaryLabel && (label === primaryLabel || u.username === primaryLabel))
            return false;
          return true;
        });
        if (collab) {
          collab.innerHTML = optionsDir.length
            ? optionsDir
                .map(
                  (u) => `<label>
                    <input type="checkbox" name="projectCollab" value="${esc(u.id)}" ${
                      checked.has(u.id) ? "checked" : ""
                    } />
                    <span>${esc(u.displayName || u.username)}</span>
                  </label>`
                )
                .join("")
            : `<div class="collab-empty">Không còn tài khoản để thêm</div>`;
        }
      };
    }
    const nameEl = document.getElementById("projectName");
    if (nameEl) nameEl.value = "";
    const objEl = document.getElementById("projectObjective");
    if (objEl) objEl.value = "";
    const descEl = document.getElementById("projectDescription");
    if (descEl) descEl.value = "";
    const accEl = document.getElementById("projectAcceptance");
    if (accEl) accEl.value = "";
    const docEl = document.getElementById("projectDocLink");
    if (docEl) docEl.value = "";
    const startEl = document.getElementById("projectStartDate");
    if (startEl) startEl.value = state.adminScheduleDate || "";
    const erEl = document.getElementById("projectExpectedResult");
    if (erEl) erEl.value = "";
    const dlEl = document.getElementById("projectDeadline");
    if (dlEl) dlEl.value = state.adminScheduleDate || "";
    const unitEl = document.getElementById("projectUnit");
    if (unitEl) unitEl.value = "";
    const catEl = document.getElementById("projectCategory");
    if (catEl) catEl.value = "";
    const proofDesc = document.getElementById("projectProofDescription");
    if (proofDesc) proofDesc.value = "";
    document.getElementById("projectModal")?.classList.add("show");
  };
  window.closeProjectModal = () => {
    document.getElementById("projectModal")?.classList.remove("show");
    document.getElementById("projectModal")?.classList.remove("adm-assign-mode");
    state.adminAssignMode = false;
  };

  window.saveProjectDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    const name = document.getElementById("projectName")?.value?.trim();
    if (!name) return showToast("Nhập tên Task");
    const objective = document.getElementById("projectObjective")?.value?.trim() || "";
    const brief = document.getElementById("projectDescription")?.value?.trim() || "";
    if (!objective && !brief) return showToast("Nhập Mục tiêu / Objective");
    const unitName = document.getElementById("projectUnit")?.value || "";
    if (!unitName) return showToast("Chọn Phân khu");
    const imp = document.getElementById("projectImportant")?.value;
    const urg = document.getElementById("projectUrgent")?.value;
    if (imp !== "true" && imp !== "false") return showToast("Chọn Important Yes/No");
    if (urg !== "true" && urg !== "false") return showToast("Chọn Urgent Yes/No");
    const deadline = document.getElementById("projectDeadline")?.value || "";
    if (!deadline) return showToast("Chọn Deadline");
    const expectedResult = document.getElementById("projectExpectedResult")?.value?.trim() || "";
    if (!expectedResult) return showToast("Nhập Expected Result");
    const acceptance = document.getElementById("projectAcceptance")?.value?.trim() || "";
    const docLink = document.getElementById("projectDocLink")?.value?.trim() || "";
    const startDate = document.getElementById("projectStartDate")?.value || "";
    const curUser = state.auth.user;
    let owner = document.getElementById("projectOwner")?.value || "";
    if (curUser && curUser.systemRole !== "SYSTEM_ADMIN") {
      owner = curUser.displayName || curUser.username;
    }
    if (!owner) return showToast("Chọn Owner");
    if (state.adminAssignMode && !isSystemAdmin()) {
      return showToast("Chỉ ADMINISTRATION mới giao task");
    }
    const descriptionParts = [objective || brief];
    if (objective && brief) descriptionParts.push(brief);
    if (startDate) descriptionParts.push("Start: " + startDate);
    if (docLink) descriptionParts.push("Doc: " + docLink);
    const description = descriptionParts.filter(Boolean).join("\n\n");
    let expectedFull = expectedResult;
    if (acceptance) expectedFull += "\n\nĐiều kiện đạt: " + acceptance;
    const collaboratorUserIds = [
      ...document.querySelectorAll('#projectCollaborators input[name="projectCollab"]:checked'),
    ]
      .map((el) => el.value)
      .filter(Boolean);
    const reviewerUserId = document.getElementById("projectReviewer")?.value || null;
    const estRaw = document.getElementById("projectEstDuration")?.value;
    const proofRequired = document.getElementById("projectProofRequired")?.value !== "false";
    const proofDescription = document.getElementById("projectProofDescription")?.value || null;
    if (proofRequired && !String(proofDescription || "").trim()) {
      return showToast("Nhập mô tả Proof khi Proof Required = Yes");
    }
    await withBusy(
      ev,
      async () => {
        try {
          await api("/api/projects", {
            method: "POST",
            body: JSON.stringify({
              name,
              description,
              category: document.getElementById("projectCategory")?.value || null,
              owner,
              deadline,
              unitName,
              collaboratorUserIds,
              reviewerUserId: reviewerUserId || undefined,
              important: imp === "true",
              urgent: urg === "true",
              expectedResult: expectedFull,
              proofRequired,
              proofDescription,
              estimatedDurationMinutes: estRaw ? Number(estRaw) : null,
            }),
          });
          closeProjectModal();
          showToast("Đã giao task");
          const leaderId = state.adminLeaderUserId;
          await refresh();
          if (leaderId) {
            setView("adminOps");
            openAdminLeaderSchedule(leaderId);
          } else {
            setView("projects");
          }
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang Assign…", lockKey: "create-project" }
    );
  };

  window.setTaskFilter = function (f, el) {
    state.taskFilter = f;
    document.querySelectorAll("#tasks .filter").forEach((b) => b.classList.remove("active"));
    if (el) el.classList.add("active");
    renderTasks();
  };

  window.setStaffTab = function (tab) {
    state.staffTab = tab;
    document.querySelectorAll(".bottomnav [data-tab]").forEach((b) => {
      b.classList.toggle("on", b.dataset.tab === tab);
    });
    if (tab === "issue") {
      setView("issue");
      return;
    }
    setView("staff");
    renderStaff();
  };

  window.selectIssueCat = function (btn) {
    state.selectedIssueCat = btn.dataset.cat;
    document.querySelectorAll(".issue-cat").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  };

  window.submitIssueDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    if (!state.selectedIssueCat) return showToast("Chọn loại vấn đề");
    await withBusy(
      ev,
      async () => {
        try {
          await api("/api/issues", {
            method: "POST",
            body: JSON.stringify({
              category: state.selectedIssueCat,
              note:
                (document.getElementById("issueNote")?.value || "") +
                (state.issuePhotoName ? ` [ảnh: ${state.issuePhotoName}]` : ""),
              areaLabel: "QR: Khu Hồ bơi",
              unitName: "Hồ bơi",
              status: "OPEN",
            }),
          });
          showToast("Đã gửi Issue · có thể chuyển thành Task/Quyết định bên dưới");
          const note = document.getElementById("issueNote");
          if (note) note.value = "";
          state.issuePhotoName = null;
          const preview = document.getElementById("issuePhotoPreview");
          if (preview)
            preview.textContent = "Chưa có ảnh · chạm để mở camera/thư viện";
          await refresh();
          setView("issue");
        } catch (e) {
          showToast("Lỗi gửi: " + e.message);
        }
      },
      { label: "Đang gửi…", lockKey: "submit-issue" }
    );
  };

  function issueStatusVi(s) {
    if (s === "CONVERTED_TASK") return "→ Task";
    if (s === "CONVERTED_DECISION") return "→ Quyết định";
    if (s === "RESOLVED" || s === "CLOSED") return "Đã xử lý";
    return "Mở";
  }

  function renderIssues() {
    const el = document.getElementById("issueInboxList");
    if (!el) return;
    const list = state.issues || [];
    el.innerHTML = list.length
      ? list
          .map((iss) => {
            const converted = String(iss.status || "").startsWith("CONVERTED");
            return `<div class="card" style="padding:12px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <div>
                  <b>${esc(iss.category)}</b>
                  <span class="tag ${converted ? "green" : "amber"}">${esc(issueStatusVi(iss.status))}</span>
                  <div style="font-size:11px;color:var(--muted);margin-top:4px">
                    ${esc(iss.unit?.name || "—")} · ${esc(iss.areaLabel || "")}
                    ${iss.note ? " · " + esc(String(iss.note).slice(0, 80)) : ""}
                  </div>
                </div>
                ${
                  converted
                    ? ""
                    : `<div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button type="button" class="btn primary" onclick="convertIssue('${iss.id}','CONVERT_TO_TASK')">→ Task</button>
                        <button type="button" class="btn soft" onclick="convertIssue('${iss.id}','CONVERT_TO_DECISION')">→ Quyết định</button>
                      </div>`
                }
              </div>
            </div>`;
          })
          .join("")
      : `<p style="color:var(--muted);font-size:12px">Chưa có Issue</p>`;
  }

  window.convertIssue = async function (id, action) {
    if (!requireAuthenticatedAction(() => true)) return;
    try {
      const data = await api("/api/issues/" + id, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      showToast(
        action === "CONVERT_TO_TASK"
          ? "Đã tạo Task từ Issue"
          : "Đã tạo Quyết định từ Issue"
      );
      await refresh();
      if (data.project?.id) openTaskEnergyModal(data.project.id);
      else setView("decisions");
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.reconcileExpenseDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    if (!(state.capabilities?.canReconcileExpense || isSystemAdmin())) {
      return showToast("Chỉ Admin/Finance được đối chiếu hoặc chốt chi phí");
    }
    if (!state.currentExpenseId) return;
    const e = state.expenses.find((x) => x.id === state.currentExpenseId);
    if (!e) return;
    if (e.status === "LOCKED") return showToast("Khoản chi đã chốt");
    const next = e.status === "PROVISIONAL" ? "RECONCILED" : "LOCKED";
    const label =
      next === "LOCKED"
        ? "Chốt khoản chi này? Sau khi chốt không thể sửa trạng thái thường."
        : "Xác nhận đối chiếu khoản chi này?";
    if (!window.confirm(label)) return;
    const note = window.prompt("Ghi chú đối chiếu (tuỳ chọn)", "") ?? undefined;
    await withBusy(
      ev,
      async () => {
        try {
          await api("/api/expenses/" + state.currentExpenseId, {
            method: "PATCH",
            body: JSON.stringify({ status: next, note: note || null }),
          });
          showToast(
            next === "LOCKED" ? "Đã chốt khoản chi" : "Đã đối chiếu khoản chi"
          );
          closeExpenseDetail();
          await refresh();
          setView("expenses");
        } catch (err) {
          showToast("Lỗi: " + err.message);
        }
      },
      { label: "Đang cập nhật…", lockKey: "reconcile-expense" }
    );
  };

  window.openProgressModal = function () {
    if (!requireAuthenticatedAction(() => true)) return;
    if (!state.currentTaskId) return showToast("Chưa chọn việc");
    const t = state.tasks.find((x) => x.id === state.currentTaskId);
    if (t) {
      document.getElementById("progressValue").value = t.progress || 0;
      document.getElementById("progressStatus").value = t.status;
    }
    document.getElementById("progressModal").classList.add("show");
  };
  window.closeProgressModal = () =>
    document.getElementById("progressModal")?.classList.remove("show");

  window.saveProgressDemo = async function (ev) {
    if (!requireAuthenticatedAction(() => true)) return;
    await withBusy(
      ev,
      async () => {
        try {
          await api("/api/tasks/" + state.currentTaskId, {
            method: "PATCH",
            body: JSON.stringify({
              progress: Number(document.getElementById("progressValue").value || 0),
              status: document.getElementById("progressStatus").value,
              eventLabel: "Cập nhật tiến độ",
              eventDetail: document.getElementById("progressNote").value,
            }),
          });
          closeProgressModal();
          showToast("Đã cập nhật tiến độ");
          await refresh();
          if (state.currentTaskId) openTaskDetail(state.currentTaskId);
        } catch (e) {
          showToast("Lỗi: " + e.message);
        }
      },
      { label: "Đang lưu…", lockKey: "save-progress" }
    );
  };

  window.openDocsModal = function () {
    if (!state.currentTaskId) return;
    const t = state.tasks.find((x) => x.id === state.currentTaskId);
    const related = state.expenses.filter(
      (e) =>
        e.linkedTaskId === state.currentTaskId ||
        (t?.unit?.name && e.unit?.name === t.unit.name)
    );
    document.getElementById("docsModalBody").innerHTML = related.length
      ? related
          .map(
            (e) => `<div class="decision"><div class="decision-top"><h3>${esc(e.content)}</h3><span class="amount">${money(e.amount)}</span></div>
        <p>${esc(e.categoryLabel || e.category)} · ${expenseStatusVi(e.status)}</p></div>`
          )
          .join("")
      : "<p style='font-size:12px;color:var(--muted)'>Chưa có chi phí liên quan.</p>";
    document.getElementById("docsModal").classList.add("show");
  };
  window.closeDocsModal = () =>
    document.getElementById("docsModal")?.classList.remove("show");
  window.openHistoryModal = function () {
    if (!state.currentTaskId) return;
    const t = state.tasks.find((x) => x.id === state.currentTaskId);
    document.getElementById("historyModalBody").innerHTML = (t?.events || [])
      .map(
        (ev) => `<div class="time-row"><i class="time-dot"></i><div>
        <b>${new Date(ev.createdAt).toLocaleString("vi-VN")}</b>
        <span>${esc(ev.label)}${ev.detail ? " — " + esc(ev.detail) : ""}</span></div></div>`
      )
      .join("") || "<p>Chưa có lịch sử.</p>";
    document.getElementById("historyModal").classList.add("show");
  };
  window.closeHistoryModal = () =>
    document.getElementById("historyModal")?.classList.remove("show");

  function boot() {
    enableDebugModeIfRequested();

    document.querySelectorAll(".nav [data-view]").forEach((b) => {
      b.addEventListener("click", () => {
        if (titles[b.dataset.view]) setView(b.dataset.view);
      });
    });
    [
      "taskModal",
      "dailyCloseModal",
      "expenseModal",
      "expenseDetailModal",
      "projectModal",
      "taskEnergyModal",
      "taskEditModal",
      "decisionModal",
      "detailModal",
      "progressModal",
      "docsModal",
      "historyModal",
      "passwordGateModal",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.addEventListener("click", (e) => {
          if (e.target.id === id) {
            if (id === "passwordGateModal") closePasswordGate();
            else if (id === "taskEnergyModal") closeTaskEnergyModal();
            else if (id === "taskEditModal") closeEditTaskModal();
            else el.classList.remove("show");
          }
        });
    });

    document.getElementById("accountTrigger")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleAccountSelector();
    });
    document.addEventListener("click", (e) => {
      const sw = document.getElementById("accountSwitcher");
      if (sw && !sw.contains(e.target)) closeAccountSelector();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAccountSelector();
        if (document.getElementById("passwordGateModal")?.classList.contains("show")) {
          closePasswordGate();
        }
      }
      if (
        e.key === "Enter" &&
        document.getElementById("passwordGateModal")?.classList.contains("show")
      ) {
        e.preventDefault();
        submitPasswordGate();
      }
    });

    const input = document.getElementById("issuePhotoInput");
    const cam = document.getElementById("issueCameraBtn");
    if (cam && input) {
      cam.addEventListener("click", () => input.click());
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        state.issuePhotoName = f ? f.name : null;
        const preview = document.getElementById("issuePhotoPreview");
        if (preview)
          preview.textContent = f
            ? `Đã chọn: ${f.name}`
            : "Chưa có ảnh · chạm để mở camera/thư viện";
        if (f) showToast("Đã gắn ảnh báo cáo");
      });
    }

    const proofInput = document.getElementById("taskProofInput");
    if (proofInput) {
      proofInput.addEventListener("change", () => {
        const files = proofInput.files;
        if (files?.length) handleTaskProofFile(files);
      });
    }

    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Enter" &&
        document.activeElement?.id === "taskAddTitleInput" &&
        state.currentProjectId
      ) {
        e.preventDefault();
        submitAddTaskStep(state.currentProjectId);
      }
    });

    const firstCat = document.querySelector(".issue-cat[data-cat]");
    if (firstCat) selectIssueCat(firstCat);

    const q = new URLSearchParams(location.search).get("view");
    if (q && document.getElementById(q)) {
      if (DEFERRED_VIEWS.has(q) && !isDebugMode()) setView("dashboard");
      else setView(q);
    }

    Promise.all([loadAuthState(), loadAccountDirectory(), refresh()])
      .then(() =>
        showToast(
          state.auth.authenticated
            ? "Đã sẵn sàng · " + (state.auth.user?.username || "")
            : "Tổng quan · chọn tài khoản để ghi dữ liệu"
        )
      )
      .catch((e) => showToast("API: " + e.message));
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
