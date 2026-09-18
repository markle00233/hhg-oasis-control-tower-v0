/* HHG Oasis — live UI wired to Prisma (post-handoff merge) */
(function () {
  const titles = {
    dashboard: ["QUẢN TRỊ HHG", "Trung tâm điều hành"],
    projects: ["DANH MỤC DỰ ÁN", "Dự án"],
    tasks: ["THỰC THI", "Công việc"],
    ai: ["AI HỖ TRỢ · HUMAN CHECK", "Hộp thư AI"],
    decisions: ["PHÊ DUYỆT & QUYẾT ĐỊNH", "Việc chờ quyết định"],
    finance: ["DOANH THU QUẢN TRỊ", "Doanh thu & chốt ngày"],
    expenses: ["CHI PHÍ QUẢN TRỊ", "Chi phí"],
    staff: ["LEAD / TỔ TRƯỞNG", "Việc của tôi"],
    issue: ["LEAD / TỔ TRƯỞNG", "Báo vấn đề"],
    blueprint: ["THIẾT KẾ HỆ THỐNG", "Sơ đồ hệ thống"],
  };

  const statusVi = {
    TODO: "Chưa bắt đầu",
    DOING: "Đang làm",
    BLOCKED: "Bị chặn",
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

  let state = {
    tasks: [],
    projects: [],
    decisions: [],
    expenses: [],
    summary: null,
    drafts: [],
    messageId: null,
    currentTaskId: null,
    currentExpenseId: null,
    lastExpenseSuggest: null,
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
    return n
      ? (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " triệu"
      : "—";
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
  }
  window.showToast = showToast;

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

  window.setView = function (id) {
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
    tb.innerHTML = state.tasks
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
      .join("");
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

  function renderProjects() {
    const grid = document.getElementById("projectGrid");
    if (!grid) return;
    grid.innerHTML = state.projects
      .map((p) => {
        const done = (p.tasks || []).filter((t) => t.status === "DONE").length;
        const total = (p.tasks || []).length;
        const cls =
          p.status === "BLOCKED" ? "red" : p.status === "AT_RISK" ? "amber" : "green";
        const label =
          p.status === "BLOCKED"
            ? "ĐANG BỊ CHẶN"
            : p.status === "AT_RISK"
              ? "CÓ RỦI RO"
              : "ĐÚNG TIẾN ĐỘ";
        const go =
          p.status === "BLOCKED"
            ? `<button class="btn soft" onclick="setView('decisions')">Quyết định →</button>`
            : `<button class="btn soft" onclick="setView('tasks')">Xem việc →</button>`;
        return `<div class="card project"><div class="row"><div><h3>${esc(p.name)}</h3>
        <p>${esc(p.category || "")} · Phụ trách: ${esc(p.owner || "—")}</p></div>
        <span class="tag ${cls}">${label}</span></div>
        <div class="progressline"><span>Mức sẵn sàng</span><b>${p.readiness || 0}%</b></div>
        <div class="bar"><i style="width:${p.readiness || 0}%"></i></div>
        <div class="meta"><div class="meta-box"><span>Ngân sách</span><b>${p.budget != null ? money(p.budget) : "—"}</b></div>
        <div class="meta-box"><span>Hạn</span><b>${esc(p.deadline || "—")}</b></div>
        <div class="meta-box"><span>Công việc</span><b>${done} / ${total}</b></div></div>
        <div class="foot"><span class="tag ${cls}">${(p.decisions || []).filter((d) => d.status === "PENDING").length} chờ duyệt</span>${go}</div></div>`;
      })
      .join("");

    const sel = document.getElementById("decisionProject");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML =
        `<option value="">— Không gắn dự án —</option>` +
        state.projects
          .map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`)
          .join("");
      sel.value = cur;
    }
  }

  function renderDecisions() {
    const el = document.getElementById("decisionList");
    if (!el) return;
    el.innerHTML = state.decisions
      .map((d) => {
        const resolved = !["PENDING", "NEEDS_INFO"].includes(d.status);
        const t = d.linkedTask;
        return `<div class="decision ${resolved ? "decision-card-resolved" : ""}" id="decision-${d.code || d.id}">
        <div class="decision-top"><div><span class="decision-id">${esc(d.code || "")}</span>
        <h3>${esc(d.title)}</h3>
        <p>Người đề xuất: ${esc(d.proposer || "—")} · Người duyệt: ${esc(d.approver || "—")} · Hạn: ${esc(d.deadline || "—")}</p></div>
        <div><span class="amount">${esc(d.amountLabel || "—")}</span>
        <span class="tag ${tagStatus(d.status)}">${statusVi[d.status] || d.status}</span></div></div>
        <div class="decision-link">
          ${t ? `<span class="link-chip">↔ ${esc(t.code || "")} · ${esc(t.title)}</span>` : ""}
          ${d.linkedProject ? `<span class="link-chip">Dự án: ${esc(d.linkedProject.name)}</span>` : ""}
          ${d.isBlocking ? `<span class="link-chip">Đang chặn việc</span>` : ""}
          ${!t && !d.linkedProject ? `<span class="link-chip">Quyết định độc lập</span>` : ""}
        </div>
        ${d.impact ? `<div class="priority-gate"><b>Tác động nếu chưa quyết</b><p>${esc(d.impact)}</p></div>` : ""}
        <div class="decision-actions">
          ${t ? `<button class="btn soft" onclick="openTaskDetail('${t.id}')">Mở công việc</button>` : ""}
          ${
            !resolved
              ? `<button class="btn dark" onclick="resolveDecision('${d.id}','APPROVED')">Duyệt</button>
                 <button class="btn soft" onclick="resolveDecision('${d.id}','NEEDS_INFO')">Yêu cầu bổ sung</button>
                 <button class="btn danger" onclick="resolveDecision('${d.id}','REJECTED')">Từ chối</button>`
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

  function renderExpenses() {
    const tb = document.getElementById("expenseTableBody");
    if (!tb) return;
    const s = state.summary;
    const setText = (sel, v) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = v;
    };
    // metrics on expenses page — first 4 .metric .value under #expenses
    const metrics = document.querySelectorAll("#expenses .grid4 .metric .value");
    if (metrics[0] && s) metrics[0].textContent = money(s.expenseTotal);
    if (metrics[1] && s) metrics[1].textContent = money(s.reconciled);
    if (metrics[2] && s) metrics[2].textContent = money(s.provisional);
    if (metrics[3] && s) metrics[3].textContent = money(s.linkedExpense);

    tb.innerHTML = state.expenses
      .map((e) => {
        const label = e.categoryLabel || e.category;
        const st = expenseStatusVi(e.status);
        const time = new Date(e.createdAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<tr class="expense-row" data-id="${e.id}" data-unit="${esc(e.unit?.name || "")}" data-category="${esc(label)}" data-status="${esc(st)}">
        <td><span class="expense-code">${esc(e.code || "")}</span><br/>${time}</td>
        <td>${esc(e.unit?.name || "—")}</td>
        <td>${esc(label)}</td>
        <td>${esc(e.content || "")}</td>
        <td><b>${money(e.amount)}</b></td>
        <td><span class="source">${esc(e.linkedTask?.code || e.source || "")}</span></td>
        <td><span class="tag ${tagStatus(e.status)}">${esc(st)}</span></td></tr>`;
      })
      .join("");
    tb.querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", () => openExpenseDetail(tr.dataset.id))
    );
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

  async function refresh() {
    const data = await api("/api/dashboard");
    state.tasks = data.tasks || [];
    state.projects = data.projects || [];
    state.decisions = data.decisions || [];
    state.expenses = data.expenses || [];
    state.summary = data.summary;
    renderTasks();
    renderProjects();
    renderDecisions();
    renderExpenses();
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
    try {
      await api("/api/decisions/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status, resolvedBy: "Giám đốc vận hành" }),
      });
      showToast(statusVi[status] || status);
      await refresh();
      if (state.currentTaskId) openTaskDetail(state.currentTaskId);
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.openDecisionModal = function (taskId) {
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

  window.saveDecisionDemo = async function () {
    try {
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
          projectName: document.getElementById("decisionProject").value || null,
        }),
      });
      closeDecisionModal();
      showToast("Đã tạo yêu cầu duyệt · đã liên kết");
      await refresh();
      setView("decisions");
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.analyzeMessageDemo = async function () {
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
    document.getElementById("expenseSuggestBox")?.classList.remove("show");
    document.getElementById("expenseModal")?.classList.add("show");
  };
  window.closeExpenseModal = () =>
    document.getElementById("expenseModal")?.classList.remove("show");

  window.suggestExpenseDemo = async function () {
    try {
      const text = document.getElementById("expenseText").value;
      const unitName = document.getElementById("expenseUnit").value;
      const s = await api("/api/ai/classify", {
        method: "POST",
        body: JSON.stringify({ kind: "expense", text, unitName }),
      });
      state.lastExpenseSuggest = s;
      document.getElementById("expenseSuggestCategory").textContent = s.categoryLabel;
      document.getElementById("expenseSuggestUnit").textContent = s.unitName || "—";
      document.getElementById("expenseSuggestTask").textContent =
        s.linkedTaskHint || "—";
      document.getElementById("expenseSuggestConfidence").textContent =
        s.confidence + "%";
      document.getElementById("expenseSuggestReason").textContent = s.reason;
      document.getElementById("expenseSuggestBox").classList.add("show");
      document.getElementById("expenseCategory").value = s.categoryLabel;
      if (s.unitName) {
        const u = document.getElementById("expenseUnit");
        if ([...u.options].some((o) => o.value === s.unitName || o.text === s.unitName))
          u.value = s.unitName;
      }
      if (s.linkedTaskHint)
        document.getElementById("expenseLinkedTask").value = s.linkedTaskHint;
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.suggestRevenueDemo = async function () {
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

  window.saveExpenseDemo = async function () {
    try {
      const label = document.getElementById("expenseCategory").value;
      const hint = document.getElementById("expenseLinkedTask").value;
      const linked = state.tasks.find(
        (t) =>
          t.title.includes(hint) ||
          (t.code && hint.includes(t.code)) ||
          hint.includes(t.title.slice(0, 12))
      );
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          unitName: document.getElementById("expenseUnit").value || null,
          categoryLabel: label,
          amount: Number(document.getElementById("expenseAmount").value || 0),
          content: document.getElementById("expenseText").value,
          taskRef: hint || null,
          linkedTaskId: linked?.id || null,
          aiSuggestion: state.lastExpenseSuggest?.categoryLabel,
          aiConfidence: state.lastExpenseSuggest?.confidence,
          humanConfirmed: true,
          source: "Ảnh hóa đơn",
        }),
      });
      closeExpenseModal();
      showToast("Đã ghi chi phí · " + label);
      await refresh();
      setView("expenses");
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
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
    document.getElementById("edReporter").textContent = "Lead / Tổ trưởng";
    document.getElementById("edTime").textContent = new Date(
      e.createdAt
    ).toLocaleString("vi-VN");
    document.getElementById("edLinked").textContent = e.linkedTask
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
    if (btn) btn.style.display = e.linkedTaskId ? "inline-flex" : "none";
    document.getElementById("expenseDetailModal").classList.add("show");
  };

  window.closeExpenseDetail = () =>
    document.getElementById("expenseDetailModal")?.classList.remove("show");

  window.openExpenseLinkedTask = function () {
    const e = state.expenses.find((x) => x.id === state.currentExpenseId);
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
    if (unit) document.getElementById("closeUnit").value = unit;
    document.getElementById("dailyCloseModal")?.classList.add("show");
  };
  window.closeDailyClose = () =>
    document.getElementById("dailyCloseModal")?.classList.remove("show");

  window.saveDailyCloseDemo = async function () {
    try {
      await api("/api/daily-closes", {
        method: "POST",
        body: JSON.stringify({
          unitName: document.getElementById("closeUnit").value,
          date:
            document.querySelector("#dailyCloseModal input[type=date]")?.value ||
            "2026-09-13",
          revenue: Number(document.getElementById("closeRevenue").value || 0),
          cashCollected: Number(document.getElementById("closeCash").value || 0),
          source: "MANUAL",
          note: document.getElementById("closeNote")?.value,
        }),
      });
      closeDailyClose();
      showToast("Đã lưu chốt ngày");
      await refresh();
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
  };

  window.openTaskModal = () =>
    document.getElementById("taskModal")?.classList.add("show");
  window.closeTaskModal = () =>
    document.getElementById("taskModal")?.classList.remove("show");
  window.toggleGate = function () {
    const p = document.getElementById("prioritySelect")?.value || "";
    const g = document.getElementById("replaceGate");
    if (g) g.style.display = p.startsWith("P1") || p.startsWith("P0") ? "block" : "none";
  };

  window.openProgressModal = function () {
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

  window.saveProgressDemo = async function () {
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
      openTaskDetail(state.currentTaskId);
    } catch (e) {
      showToast("Lỗi: " + e.message);
    }
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
      "decisionModal",
      "detailModal",
      "progressModal",
      "docsModal",
      "historyModal",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.addEventListener("click", (e) => {
          if (e.target.id === id) el.classList.remove("show");
        });
    });

    const q = new URLSearchParams(location.search).get("view");
    if (q && document.getElementById(q)) setView(q);

    refresh()
      .then(() => showToast("Đã đồng bộ Prisma · Hộp thư AI + Chi phí sẵn sàng"))
      .catch((e) => showToast("API: " + e.message));
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
