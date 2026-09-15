/* HHG Oasis Control Tower — live UI wired to Prisma APIs */
(function () {
  const titles = {
    dashboard: ["QUẢN TRỊ HHG", "Trung tâm điều hành"],
    projects: ["DANH MỤC DỰ ÁN", "Dự án"],
    tasks: ["THỰC THI", "Công việc"],
    decisions: ["PHÊ DUYỆT & QUYẾT ĐỊNH", "Việc chờ quyết định"],
    finance: ["TÀI CHÍNH QUẢN TRỊ", "Chốt ngày & tài chính"],
    staff: ["NHÂN VIÊN", "Việc của tôi"],
    issue: ["NHÂN VIÊN", "Báo vấn đề"],
    blueprint: ["THIẾT KẾ HỆ THỐNG", "Sơ đồ hệ thống"],
  };

  const statusVi = {
    TODO: "Chưa bắt đầu",
    DOING: "Đang làm",
    BLOCKED: "Bị chặn",
    DONE: "Hoàn tất",
    WAITING: "Đang chờ",
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    NEEDS_INFO: "Cần bổ sung",
    REJECTED: "Từ chối",
    ON_TRACK: "ĐÚNG TIẾN ĐỘ",
    AT_RISK: "CÓ RỦI RO",
    BLOCKED_P: "ĐANG BỊ CHẶN",
  };

  const sourceLabel = {
    MANUAL: "Nhập tay",
    EXCEL: "File Excel",
    POS: "Import file",
    FINANCE: "Finance tổng hợp",
    AUTO: "Tự động",
  };

  let state = {
    tasks: [],
    projects: [],
    decisions: [],
    expenses: [],
    issues: [],
    dailyCloses: [],
    units: [],
    summary: null,
    taskFilter: "all",
    selectedIssueCat: "BROKEN",
    currentTaskId: null,
    issuePhotoName: null,
    staffTab: "tasks",
  };

  function money(v) {
    const n = Number(v || 0);
    return n
      ? (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) +
          " triệu"
      : "—";
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    return data;
  }

  function closeMobileMenu() {
    const t = document.getElementById("mobileMenuToggle");
    if (t) t.checked = false;
  }

  window.setView = function setView(id) {
    const r = document.getElementById("vr-" + id);
    if (r) r.checked = true;
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
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
    if (id === "staff") renderStaff();
  };

  function tagStatus(s) {
    if (s === "DONE" || s === "APPROVED") return "green";
    if (s === "BLOCKED" || s === "REJECTED") return "red";
    if (s === "WAITING" || s === "NEEDS_INFO" || s === "PENDING") return "amber";
    if (s === "DOING") return "blue";
    return "gray";
  }

  function prioTag(p) {
    if (p === "P0" || p === "P1") return "amber";
    return "gray";
  }

  function projectStatusClass(s) {
    if (s === "BLOCKED") return "red";
    if (s === "AT_RISK") return "amber";
    return "green";
  }

  function projectStatusLabel(s) {
    if (s === "BLOCKED") return "ĐANG BỊ CHẶN";
    if (s === "AT_RISK") return "CÓ RỦI RO";
    return "ĐÚNG TIẾN ĐỘ";
  }

  function filteredTasks() {
    const f = state.taskFilter;
    return state.tasks.filter((t) => {
      if (f === "all") return true;
      if (f === "p01") return t.priority === "P0" || t.priority === "P1";
      if (f === "overdue") return t.status !== "DONE" && !!t.deadline;
      if (f === "blocked") return t.status === "BLOCKED";
      if (f === "ba") return (t.progress || 0) > 0;
      return true;
    });
  }

  function renderTasks() {
    const tb = document.getElementById("taskTableBody");
    if (!tb) return;
    const rows = filteredTasks();
    tb.innerHTML = rows
      .map((t) => {
        const unit = t.unit?.name || "—";
        const proj = t.project?.name ? `Dự án: ${t.project.name}` : "";
        return `<tr data-task-id="${t.id}">
        <td class="task-title"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(proj)}</small></td>
        <td>${escapeHtml(unit)}</td>
        <td><span class="tag ${prioTag(t.priority)}">${t.priority}</span></td>
        <td>${escapeHtml(t.owner || "—")}</td>
        <td>${escapeHtml(t.deadline || "—")}</td>
        <td><span class="tag ${tagStatus(t.status)}">${statusVi[t.status] || t.status}</span></td>
        <td>${t.cost != null ? money(t.cost) : "—"}</td>
      </tr>`;
      })
      .join("");
    tb.querySelectorAll("tr[data-task-id]").forEach((tr) => {
      tr.addEventListener("click", () => openTaskDetailById(tr.dataset.taskId));
    });
  }

  function renderProjects() {
    const grid = document.getElementById("projectGrid");
    if (!grid) return;
    grid.innerHTML = state.projects
      .map((p) => {
        const done = (p.tasks || []).filter((t) => t.status === "DONE").length;
        const total = (p.tasks || []).length;
        const blockers = (p.tasks || []).filter((t) => t.status === "BLOCKED").length;
        const footTag =
          p.status === "BLOCKED"
            ? `<span class="tag red">Cần quyết định</span>`
            : blockers
              ? `<span class="tag amber">${blockers} vướng mắc</span>`
              : `<span class="tag green">Không vướng</span>`;
        const go =
          p.status === "BLOCKED"
            ? `<button class="btn soft" type="button" onclick="setView('decisions')">Quyết định →</button>`
            : `<button class="btn soft" type="button" onclick="setView('tasks')">Xem việc →</button>`;
        return `<div class="card project">
        <div class="row"><div><h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.category || "")} · Phụ trách: ${escapeHtml(p.owner || "—")}</p></div>
        <span class="tag ${projectStatusClass(p.status)}">${projectStatusLabel(p.status)}</span></div>
        <div class="progressline"><span>Mức sẵn sàng</span><b>${p.readiness || 0}%</b></div>
        <div class="bar ${p.readiness < 70 ? "warn" : ""}"><i style="width:${p.readiness || 0}%"></i></div>
        <div class="meta">
          <div class="meta-box"><span>Ngân sách</span><b>${p.budget != null ? money(p.budget) : "—"}</b></div>
          <div class="meta-box"><span>Hạn</span><b>${escapeHtml(p.deadline || "—")}</b></div>
          <div class="meta-box"><span>Công việc</span><b>${done} / ${total}</b></div>
        </div>
        <div class="foot">${footTag}${go}</div>
      </div>`;
      })
      .join("");
  }

  function renderDecisions() {
    const box = document.getElementById("decisionsList");
    if (!box) return;
    const pending = state.decisions.filter((d) => d.status === "PENDING");
    box.innerHTML = state.decisions
      .map((d) => {
        const actions =
          d.status === "PENDING"
            ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button class="btn dark" type="button" onclick="decideAction('${d.id}','APPROVED')">Duyệt</button>
            <button class="btn soft" type="button" onclick="decideAction('${d.id}','NEEDS_INFO')">Yêu cầu bổ sung</button>
            <button class="btn danger" type="button" onclick="decideAction('${d.id}','REJECTED')">Từ chối</button>
          </div>`
            : `<div style="margin-top:10px"><span class="tag ${tagStatus(d.status)}">${statusVi[d.status] || d.status}</span></div>`;
        return `<div class="decision">
        <div class="decision-top"><div>
          <h3>${escapeHtml(d.title)}</h3>
          <p>Người đề xuất: ${escapeHtml(d.proposer || "—")} · Người duyệt: ${escapeHtml(d.approver || "—")} · Hạn: ${escapeHtml(d.deadline || "—")}</p>
        </div><div><span class="amount">${escapeHtml(d.amountLabel || "")}</span>
        ${d.status === "PENDING" ? '<span class="tag red">CHỜ</span>' : `<span class="tag ${tagStatus(d.status)}">${statusVi[d.status]}</span>`}
        </div></div>
        ${d.impact ? `<div class="priority-gate"><b>Tác động / ghi chú</b><p>${escapeHtml(d.impact)}</p></div>` : ""}
        ${actions}
      </div>`;
      })
      .join("");

    const dash = document.getElementById("dashDecisions");
    if (dash) {
      dash.innerHTML = (pending.length ? pending : state.decisions)
        .slice(0, 3)
        .map(
          (d) => `<div class="decision"><div class="decision-top"><h3>${escapeHtml(d.title)}</h3>
          <span class="amount">${escapeHtml(d.amountLabel || "")}</span></div>
          <p>${escapeHtml(d.impact || "")}</p></div>`
        )
        .join("");
    }
  }

  function renderStaff() {
    const list = document.getElementById("staffTaskList");
    const hello = document.getElementById("staffHello");
    const hist = document.getElementById("staffHistory");
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
                  (t) => `<div class="staff-task" data-task-id="${t.id}">
              <div class="top"><div><h3>${escapeHtml(t.title)}</h3>
              <p>${escapeHtml(t.unit?.name || "")} · ${statusVi[t.status]}</p></div>
              <span class="tag green">Hoàn tất</span></div></div>`
                )
                .join("")
            : `<p style="font-size:12px;color:var(--muted)">Chưa có việc hoàn tất.</p>`);
        hist.querySelectorAll("[data-task-id]").forEach((el) => {
          el.addEventListener("click", () => openTaskDetailById(el.dataset.taskId));
        });
      }
      return;
    }

    if (hist) hist.style.display = "none";
    list.style.display = "block";
    const open = state.tasks.filter((t) => t.status !== "DONE");
    if (hello) hello.innerHTML = `<small>Hôm nay</small><h3>Còn ${open.length} việc cần xử lý</h3>`;
    list.innerHTML = open
      .map((t, i) => {
        const tag = i === 0 ? "amber" : "gray";
        const label = i === 0 ? "Làm trước" : "Tiếp theo";
        return `<div class="staff-task" data-open-id="${t.id}">
        <div class="top"><div><h3>${escapeHtml(t.title)}</h3>
        <p>${escapeHtml(t.deadline || "")} · ${escapeHtml(t.unit?.name || "")}</p></div>
        <span class="tag ${tag}">${label}</span></div>
        <div class="staff-actions">
          <button type="button" class="start" data-act="DOING" data-id="${t.id}">BẮT ĐẦU</button>
          <button type="button" class="done" data-act="DONE" data-id="${t.id}">ĐÃ XONG</button>
          <button type="button" class="problem" data-act="BLOCKED" data-id="${t.id}">CÓ VẤN ĐỀ</button>
        </div></div>`;
      })
      .join("");

    list.querySelectorAll("[data-open-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        openTaskDetailById(card.dataset.openId);
      });
    });
    list.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await updateTaskStatus(btn.dataset.id, btn.dataset.act);
      });
    });
  }

  function renderFinanceExtras() {
    const expenseBody = document.getElementById("expenseTableBody");
    if (expenseBody) {
      expenseBody.innerHTML = state.expenses
        .map((e) => {
          const time = new Date(e.createdAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return `<tr><td>${time}</td><td>${escapeHtml(e.unit?.name || "—")}</td>
          <td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.content || "")}</td>
          <td><b>${money(e.amount)}</b></td><td><span class="source">${escapeHtml(e.source || "")}</span></td>
          <td><span class="tag amber">${escapeHtml(e.status)}</span></td></tr>`;
        })
        .join("");
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refresh() {
    const data = await api("/api/dashboard");
    state.tasks = data.tasks || [];
    state.projects = data.projects || [];
    state.decisions = data.decisions || [];
    state.expenses = data.expenses || [];
    state.issues = data.issues || [];
    state.dailyCloses = data.dailyCloses || [];
    state.units = data.units || [];
    state.summary = data.summary;
    renderTasks();
    renderProjects();
    renderDecisions();
    renderStaff();
    renderFinanceExtras();
    updatePickleFromCloses();
  }

  function updatePickleFromCloses() {
    const pickle = state.dailyCloses.find((c) => c.unit?.name === "Pickleball");
    if (!pickle) return;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set("pickleRev", money(pickle.revenue));
    set("pickleCash", money(pickle.cashCollected));
    set("pickleSource", sourceLabel[pickle.source] || pickle.source);
    set("pickleTime", "đã lưu");
    const st = document.getElementById("pickleStatus");
    if (st) st.innerHTML = '<span class="tag amber">Tạm ghi nhận</span>';
  }

  window.openTaskModal = () =>
    document.getElementById("taskModal")?.classList.add("show");
  window.closeTaskModal = () =>
    document.getElementById("taskModal")?.classList.remove("show");
  window.openDailyClose = (unit) => {
    if (unit) document.getElementById("closeUnit").value = unit;
    document.getElementById("dailyCloseModal")?.classList.add("show");
  };
  window.closeDailyClose = () =>
    document.getElementById("dailyCloseModal")?.classList.remove("show");
  window.openExpenseModal = () =>
    document.getElementById("expenseModal")?.classList.add("show");
  window.closeExpenseModal = () =>
    document.getElementById("expenseModal")?.classList.remove("show");
  window.openProjectModal = () =>
    document.getElementById("projectModal")?.classList.add("show");
  window.closeProjectModal = () =>
    document.getElementById("projectModal")?.classList.remove("show");
  window.openDecisionModal = () =>
    document.getElementById("decisionModal")?.classList.add("show");
  window.closeDecisionModal = () =>
    document.getElementById("decisionModal")?.classList.remove("show");
  window.closeTaskDetail = () => {
    document.getElementById("detailModal")?.classList.remove("show");
    state.currentTaskId = null;
  };
  window.closeProgressModal = () =>
    document.getElementById("progressModal")?.classList.remove("show");
  window.closeDocsModal = () =>
    document.getElementById("docsModal")?.classList.remove("show");
  window.closeHistoryModal = () =>
    document.getElementById("historyModal")?.classList.remove("show");

  window.toggleGate = function () {
    const p = document.getElementById("prioritySelect")?.value;
    const g = document.getElementById("replaceGate");
    if (g) g.style.display = p === "P1" || p === "P0" ? "block" : "none";
  };

  window.selectIssueCat = function (btn) {
    state.selectedIssueCat = btn.dataset.cat;
    document.querySelectorAll(".issue-cat").forEach((b) => (b.style.outline = ""));
    btn.style.outline = "2px solid var(--green)";
  };

  window.setTaskFilter = function (f, el) {
    state.taskFilter = f;
    document.querySelectorAll(".filter").forEach((b) => b.classList.remove("active"));
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

  async function openTaskDetailById(id) {
    const t =
      state.tasks.find((x) => x.id === id) ||
      (await api("/api/tasks/" + id));
    state.currentTaskId = t.id;
    document.getElementById("detailCode").textContent = t.id.slice(0, 8).toUpperCase();
    document.getElementById("detailTitle").textContent = t.title;
    document.getElementById("detailTags").innerHTML = `<span class="tag ${prioTag(t.priority)}">${t.priority}</span><span class="tag blue">${escapeHtml(t.unit?.name || "")}</span>`;
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
            (ev, i) => `<div class="time-row"><i class="time-dot ${i === 0 && t.progress < 100 ? "wait" : ""}"></i>
          <div><b>${new Date(ev.createdAt).toLocaleString("vi-VN")}</b>
          <span>${escapeHtml(ev.label)}${ev.detail ? " — " + escapeHtml(ev.detail) : ""}</span></div></div>`
          )
          .join("")
      : `<div class="time-row"><i class="time-dot"></i><div><b>Chưa có lịch sử</b><span>Cập nhật tiến độ để ghi nhận.</span></div></div>`;

    const afterDone = t.status === "DONE" || (t.progress || 0) >= 100;
    const scene = document.getElementById("afterScene");
    const lamp = document.getElementById("afterLamp");
    const pending = document.getElementById("pendingText");
    const label = document.getElementById("afterLabel");
    if (afterDone) {
      scene.className = "scene after";
      lamp.style.display = "block";
      pending.style.display = "none";
      label.textContent = "ẢNH DEMO · SAU";
      document.getElementById("afterCaption").textContent = "Đã hoàn tất";
      document.getElementById("afterTime").textContent = "Đã cập nhật";
    } else {
      scene.className = "scene pending";
      lamp.style.display = "none";
      pending.style.display = "block";
      label.textContent = "CHỜ ẢNH SAU";
      document.getElementById("afterCaption").textContent = "Chưa có ảnh sau";
      document.getElementById("afterTime").textContent = "Chờ cập nhật";
    }
    document.getElementById("detailModal").classList.add("show");
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

  window.decideAction = async function (id, status) {
    try {
      await api("/api/decisions/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      showToast("Đã cập nhật quyết định: " + (statusVi[status] || status));
      await refresh();
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.saveTaskDemo = async function () {
    const title = document.getElementById("taskTitle").value;
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
      showToast("Đã tạo việc trong DB");
      await refresh();
    } catch (e) {
      showToast("Lỗi lưu: " + e.message);
    }
  };

  window.saveDailyCloseDemo = async function () {
    const unit = document.getElementById("closeUnit").value;
    const rev = document.getElementById("closeRevenue").value;
    const cash = document.getElementById("closeCash").value;
    const src = document.getElementById("closeSource").value;
    const date =
      document.querySelector("#dailyCloseModal input[type=date]")?.value ||
      "2026-09-13";
    try {
      await api("/api/daily-closes", {
        method: "POST",
        body: JSON.stringify({
          unitName: unit,
          date,
          revenue: Number(rev || 0),
          cashCollected: Number(cash || 0),
          source: src,
        }),
      });
      closeDailyClose();
      showToast("Đã lưu chốt ngày vào DB");
      await refresh();
    } catch (e) {
      showToast("Lỗi lưu: " + e.message);
    }
  };

  window.saveExpenseDemo = async function () {
    try {
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          unitName: document.getElementById("expenseUnit").value,
          category: document.getElementById("expenseCategory").value,
          amount: Number(document.getElementById("expenseAmount").value || 0),
          content: document.getElementById("expenseContent").value,
          taskRef: document.getElementById("expenseTaskRef").value || null,
          source: "Ảnh hóa đơn",
        }),
      });
      closeExpenseModal();
      showToast("Đã lưu chi phí vào DB");
      await refresh();
    } catch (e) {
      showToast("Lỗi lưu: " + e.message);
    }
  };

  window.saveProjectDemo = async function () {
    try {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("projectName").value,
          category: document.getElementById("projectCategory").value,
          owner: document.getElementById("projectOwner").value,
          budget: document.getElementById("projectBudget").value,
          deadline: document.getElementById("projectDeadline").value,
          readiness: document.getElementById("projectReadiness").value || 0,
          status: document.getElementById("projectStatus").value,
          unitName: document.getElementById("projectUnit").value || null,
        }),
      });
      closeProjectModal();
      showToast("Đã tạo dự án");
      await refresh();
      setView("projects");
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.saveDecisionDemo = async function () {
    try {
      await api("/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("decisionTitle").value,
          amountLabel: document.getElementById("decisionAmount").value,
          proposer: document.getElementById("decisionProposer").value,
          approver: document.getElementById("decisionApprover").value,
          deadline: document.getElementById("decisionDeadline").value,
          impact: document.getElementById("decisionImpact").value,
        }),
      });
      closeDecisionModal();
      showToast("Đã tạo yêu cầu duyệt");
      await refresh();
      setView("decisions");
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.submitIssueDemo = async function () {
    try {
      await api("/api/issues", {
        method: "POST",
        body: JSON.stringify({
          category: state.selectedIssueCat,
          note:
            (document.getElementById("issueNote").value || "") +
            (state.issuePhotoName ? ` [ảnh: ${state.issuePhotoName}]` : ""),
          areaLabel: "QR: Khu Hồ bơi",
          unitName: "Hồ bơi",
        }),
      });
      showToast("Đã gửi báo cáo · lưu DB");
      document.getElementById("issueNote").value = "";
      state.issuePhotoName = null;
      const preview = document.getElementById("issuePhotoPreview");
      if (preview) preview.textContent = "Chưa có ảnh";
      await refresh();
    } catch (e) {
      showToast("Lỗi gửi: " + e.message);
    }
  };

  window.openProgressModal = function () {
    if (!state.currentTaskId) return showToast("Chưa chọn việc");
    const t = state.tasks.find((x) => x.id === state.currentTaskId);
    if (t) {
      document.getElementById("progressValue").value = t.progress || 0;
      document.getElementById("progressStatus").value = t.status || "DOING";
      document.getElementById("progressNote").value = "";
    }
    document.getElementById("progressModal").classList.add("show");
  };

  window.saveProgressDemo = async function () {
    if (!state.currentTaskId) return;
    try {
      const progress = Number(document.getElementById("progressValue").value || 0);
      const status = document.getElementById("progressStatus").value;
      const note = document.getElementById("progressNote").value;
      await api("/api/tasks/" + state.currentTaskId, {
        method: "PATCH",
        body: JSON.stringify({
          progress,
          status,
          eventLabel: "Cập nhật tiến độ",
          eventDetail: note || `${progress}% · ${status}`,
        }),
      });
      closeProgressModal();
      showToast("Đã cập nhật tiến độ");
      await refresh();
      await openTaskDetailById(state.currentTaskId);
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.openDocsModal = function () {
    if (!state.currentTaskId) return showToast("Chưa chọn việc");
    const t = state.tasks.find((x) => x.id === state.currentTaskId);
    const related = state.expenses.filter(
      (e) =>
        (t?.unit?.name && e.unit?.name === t.unit.name) ||
        (e.taskRef && t && e.taskRef.includes(t.title.slice(0, 8)))
    );
    const box = document.getElementById("docsModalBody");
    box.innerHTML = related.length
      ? related
          .map(
            (e) => `<div class="decision"><div class="decision-top"><h3>${escapeHtml(e.content || e.category)}</h3>
            <span class="amount">${money(e.amount)}</span></div>
            <p>${escapeHtml(e.unit?.name || "")} · ${escapeHtml(e.source || "")} · ${escapeHtml(e.status)}</p></div>`
          )
          .join("")
      : `<p style="font-size:12px;color:var(--muted)">Chưa có chứng từ/chi phí gắn với việc hoặc phân khu này. Dùng “+ Ghi chi phí” để thêm.</p>
         <button class="btn primary" type="button" onclick="closeDocsModal();openExpenseModal()">+ Ghi chi phí</button>`;
    document.getElementById("docsModal").classList.add("show");
  };

  window.openHistoryModal = function () {
    if (!state.currentTaskId) return showToast("Chưa chọn việc");
    const t = state.tasks.find((x) => x.id === state.currentTaskId);
    const events = t?.events || [];
    document.getElementById("historyModalBody").innerHTML = events.length
      ? events
          .map(
            (ev) => `<div class="time-row"><i class="time-dot"></i><div>
          <b>${new Date(ev.createdAt).toLocaleString("vi-VN")}</b>
          <span>${escapeHtml(ev.label)}${ev.detail ? " — " + escapeHtml(ev.detail) : ""}</span></div></div>`
          )
          .join("")
      : `<p style="font-size:12px;color:var(--muted)">Chưa có lịch sử.</p>`;
    document.getElementById("historyModal").classList.add("show");
  };

  function bindModals() {
    [
      ["taskModal", closeTaskModal],
      ["dailyCloseModal", closeDailyClose],
      ["expenseModal", closeExpenseModal],
      ["detailModal", closeTaskDetail],
      ["projectModal", closeProjectModal],
      ["decisionModal", closeDecisionModal],
      ["progressModal", closeProgressModal],
      ["docsModal", closeDocsModal],
      ["historyModal", closeHistoryModal],
    ].forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", (e) => {
        if (e.target.id === id) fn();
      });
    });
  }

  function initNav() {
    document.querySelectorAll(".nav [data-view]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.dataset.view;
        if (titles[id]) {
          setTimeout(() => setView(id), 0);
        }
      });
    });
  }

  function initCamera() {
    const input = document.getElementById("issuePhotoInput");
    const btn = document.getElementById("issueCameraBtn");
    if (btn && input) {
      btn.addEventListener("click", () => input.click());
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        state.issuePhotoName = f ? f.name : null;
        const preview = document.getElementById("issuePhotoPreview");
        if (preview) preview.textContent = f ? `Đã chọn: ${f.name}` : "Chưa có ảnh";
        showToast(f ? "Đã gắn ảnh báo cáo" : "Chưa chọn ảnh");
      });
    }
  }

  async function boot() {
    bindModals();
    initNav();
    initCamera();
    const params = new URLSearchParams(location.search);
    const q = params.get("view");
    if (q && document.getElementById(q)) setView(q);
    try {
      await refresh();
      showToast("Đã đồng bộ dữ liệu Prisma");
    } catch (e) {
      showToast("API chưa sẵn sàng: " + e.message);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
