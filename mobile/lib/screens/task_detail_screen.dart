import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../controller_utils.dart";
import "../models.dart";
import "../theme.dart";
import "decisions_screen.dart";

class TaskDetailScreen extends StatefulWidget {
  const TaskDetailScreen({super.key, required this.projectId});
  final String projectId;

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  OasisProject? _project;
  List<Map<String, dynamic>> _docs = [];
  bool _loading = true;
  bool _acting = false;
  int _tab = 0; // 0 steps, 1 people, 2 costs, 3 docs, 4 history

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final state = context.read<AppState>();
      final p = await state.fetchProject(widget.projectId);
      List<Map<String, dynamic>> docs = [];
      try {
        docs = await state.fetchProjectDocs(widget.projectId);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _project = p;
        _docs = docs;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addExpense() async {
    final content = TextEditingController();
    final amount = TextEditingController();
    String category = "Vận hành thường xuyên";
    final state = context.read<AppState>();
    final unit = _project?.unit?.name;

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text("Ghi chi phí cho Task", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 12),
                    TextField(controller: content, decoration: const InputDecoration(labelText: "Nội dung")),
                    const SizedBox(height: 10),
                    TextField(
                      controller: amount,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: "Số tiền (VND)"),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: category,
                      decoration: const InputDecoration(labelText: "Nhóm chi phí"),
                      items: const [
                        DropdownMenuItem(value: "Chưa xác định", child: Text("Chưa xác định")),
                        DropdownMenuItem(value: "Vận hành thường xuyên", child: Text("Vận hành thường xuyên")),
                        DropdownMenuItem(value: "Sửa chữa / bảo trì", child: Text("Sửa chữa / bảo trì")),
                        DropdownMenuItem(value: "Cải tạo / nâng cấp", child: Text("Cải tạo / nâng cấp")),
                        DropdownMenuItem(value: "Mua sắm tài sản / thiết bị", child: Text("Mua sắm tài sản / thiết bị")),
                        DropdownMenuItem(value: "Chi phí dùng chung", child: Text("Chi phí dùng chung")),
                      ],
                      onChanged: (v) => setLocal(() => category = v ?? category),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Ghi nhận")),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    final text = content.text.trim();
    final amt = num.tryParse(amount.text.trim());
    disposeControllersAfterFrame([content, amount]);
    if (ok != true) return;
    if (text.isEmpty || amt == null || amt <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nhập nội dung và số tiền > 0")));
      return;
    }
    setState(() => _acting = true);
    try {
      await state.createExpense({
        "content": text,
        "amount": amt,
        "unitName": unit,
        "categoryLabel": category,
        "linkedProjectId": widget.projectId,
        "humanConfirmed": true,
        "source": "Mobile",
      });
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã ghi chi phí")));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _action(String action, {Map<String, dynamic>? extra}) async {
    if (_acting) return;
    setState(() => _acting = true);
    try {
      final body = <String, dynamic>{"action": action, ...?extra};
      final p = await context.read<AppState>().patchProject(widget.projectId, body);
      if (!mounted) return;
      setState(() => _project = p);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã cập nhật")));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _promptAction(String action) async {
    final extra = <String, dynamic>{};
    if (action == "MARK_WAITING") {
      final waitingFor = await _promptText("Waiting for (bắt buộc)");
      if (waitingFor == null || waitingFor.trim().isEmpty) return;
      final reason = await _promptText("Reason (bắt buộc)");
      if (reason == null || reason.trim().isEmpty) return;
      extra["waitingFor"] = waitingFor.trim();
      extra["waitingReason"] = reason.trim();
    } else if (action == "REPORT_BLOCKED") {
      final title = await _promptText("Blocker title (bắt buộc)");
      if (title == null || title.trim().isEmpty) return;
      final desc = await _promptText("Description (bắt buộc)");
      if (desc == null || desc.trim().isEmpty) return;
      extra["blockerTitle"] = title.trim();
      extra["blockerDescription"] = desc.trim();
    } else if (action == "PAUSE") {
      final reason = await _promptText("Pause reason (bắt buộc)");
      if (reason == null || reason.trim().isEmpty) return;
      extra["pauseReason"] = reason.trim();
    } else if (action == "RESOLVE_AND_RESUME") {
      final note = await _promptText("Đã xử lý thế nào? (tuỳ chọn)", optional: true);
      if (note == null) return;
      extra["note"] = note.trim().isEmpty ? "Resolve & Resume" : note.trim();
    } else if (action == "REQUEST_REVISION") {
      final note = await _promptText("Revision note (bắt buộc)");
      if (note == null || note.trim().isEmpty) return;
      extra["revisionNote"] = note.trim();
    } else if (action == "REQUEST_DEADLINE_CHANGE") {
      final requested = await _promptText("Requested deadline YYYY-MM-DD");
      if (requested == null || requested.trim().isEmpty) return;
      final reason = await _promptText("Reason");
      if (reason == null || reason.trim().isEmpty) return;
      extra["requestedDeadline"] = requested.trim();
      extra["reason"] = reason.trim();
    } else if (action == "REQUEST_PRIORITY_CHANGE") {
      final imp = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text("Requested Important?"),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("No")),
                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Yes")),
              ],
            ),
          ) ??
          false;
      final urg = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text("Requested Urgent?"),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("No")),
                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Yes")),
              ],
            ),
          ) ??
          false;
      final reason = await _promptText("Reason");
      if (reason == null || reason.trim().isEmpty) return;
      extra["important"] = imp;
      extra["urgent"] = urg;
      extra["reason"] = reason.trim();
    } else if (action == "REJECT_CHANGE_REQUEST") {
      final note = await _promptText("Reject reason", optional: true);
      if (note == null) return;
      extra["reason"] = note.trim().isEmpty ? "Rejected" : note.trim();
    } else if (action == "REPORT_ISSUE_TO_OWNER") {
      final title = await _promptText("Issue title");
      if (title == null || title.trim().isEmpty) return;
      final desc = await _promptText("Description");
      if (desc == null || desc.trim().isEmpty) return;
      extra["title"] = title.trim();
      extra["description"] = desc.trim();
    }
    await _action(action, extra: extra);
  }

  Future<String?> _promptText(String title, {bool optional = false}) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(controller: ctrl, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Hủy")),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("OK")),
        ],
      ),
    );
    final text = ctrl.text;
    disposeControllersAfterFrame([ctrl]);
    if (ok != true) return null;
    if (!optional && text.trim().isEmpty) return "";
    return text;
  }

  List<Widget> _workflowButtons(OasisProject p) {
    final allowed = p.allowedActions;
    Widget? btn(String action, String label, {bool primary = false}) {
      if (!allowed.contains(action)) return null;
      if (action == "SUBMIT_FOR_REVIEW" && p.submitBlockers.isNotEmpty) {
        return Tooltip(
          message: p.submitBlockers.join("; "),
          child: const OutlinedButton(
            onPressed: null,
            child: Text("Submit (thiếu điều kiện)"),
          ),
        );
      }
      final onPressed = _acting ? null : () => _promptAction(action);
      if (primary) {
        return FilledButton(onPressed: onPressed, child: Text(label));
      }
      return OutlinedButton(onPressed: onPressed, child: Text(label));
    }

    return [
      if (p.awaitingAcknowledgement)
        const Chip(
          label: Text("Awaiting Acknowledgement"),
          backgroundColor: Color(0xFFFFF3CD),
        ),
      if (p.revisionNote != null && p.revisionNote!.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text("Revision: ${p.revisionNote}", style: const TextStyle(color: Color(0xFFB42318))),
        ),
      ...[
        btn("ACKNOWLEDGE", "Acknowledge", primary: true),
        btn("START", "Start", primary: true),
        btn("MARK_WAITING", "Waiting"),
        btn("REPORT_BLOCKED", "Blocked"),
        btn("PAUSE", "Pause"),
        btn("RESUME", "Resume"),
        btn("RESOLVE_AND_RESUME", "Resolve"),
        btn("REQUEST_DEADLINE_CHANGE", "Request Deadline"),
        btn("REQUEST_PRIORITY_CHANGE", "Request Priority"),
        btn("APPROVE_CHANGE_REQUEST", "Approve Change"),
        btn("REJECT_CHANGE_REQUEST", "Reject Change"),
        btn("REPORT_ISSUE_TO_OWNER", "Report Issue"),
        btn("SUBMIT_FOR_REVIEW", "Submit for Review", primary: true),
        btn("APPROVE", "Approve → DONE", primary: true),
        btn("REQUEST_REVISION", "Request Revision"),
      ].whereType<Widget>(),
      OutlinedButton(
        onPressed: _acting
            ? null
            : () async {
                await DecisionsScreen.openCreateForProject(context, widget.projectId);
                await _load();
              },
        child: const Text("Yêu cầu duyệt"),
      ),
      OutlinedButton(
        onPressed: _acting ? null : _addExpense,
        child: const Text("Ghi chi phí"),
      ),
    ];
  }

  Future<void> _toggleStep(int index, bool done) async {
    if (_acting) return;
    setState(() => _acting = true);
    try {
      final p = await context.read<AppState>().patchProject(widget.projectId, {
        "stepIndex": index,
        "done": done,
      });
      if (!mounted) return;
      setState(() => _project = p);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _addStep() async {
    final titleCtrl = TextEditingController();
    String? ownerId;
    final members = _project?.members ?? [];
    final appState = context.read<AppState>();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text("Thêm hạng mục", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 12),
                  TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: "Tên công việc")),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String?>(
                    initialValue: ownerId,
                    decoration: const InputDecoration(labelText: "Người phụ trách"),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text("— Chọn —")),
                      ...members.map(
                        (m) => DropdownMenuItem<String?>(
                          value: m.userId,
                          child: Text(m.displayName.isNotEmpty ? m.displayName : m.username),
                        ),
                      ),
                    ],
                    onChanged: (v) => setLocal(() => ownerId = v),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text("Thêm"),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
    final title = titleCtrl.text.trim();
    disposeControllersAfterFrame([titleCtrl]);
    if (ok != true || title.isEmpty) return;
    setState(() => _acting = true);
    try {
      final body = <String, dynamic>{"addStep": title};
      if (ownerId != null) body["stepOwner"] = ownerId;
      final p = await appState.patchProject(widget.projectId, body);
      if (!mounted) return;
      setState(() => _project = p);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _project;
    return Scaffold(
      appBar: AppBar(
        title: Text(p?.name ?? "Task"),
        actions: [
          IconButton(
            onPressed: _loading || _acting || !(_project?.canEditWorkPlan ?? false) ? null : _addStep,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: _loading && p == null
          ? const Center(child: CircularProgressIndicator())
          : p == null
              ? const Center(child: Text("Không tìm thấy Task"))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text("${p.priority} · ${p.statusVi}", style: const TextStyle(color: OasisTheme.muted, fontSize: 12)),
                    const SizedBox(height: 4),
                    Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text("Phụ trách: ${p.owner ?? "—"}", style: const TextStyle(color: OasisTheme.muted)),
                    const SizedBox(height: 14),
                    Text("${p.quadrantLabel} · ${p.statusVi} · ${p.deadlineRisk ?? "ON_TRACK"}",
                        style: Theme.of(context).textTheme.labelMedium),
                    if (p.deadlineRiskReason != null && p.deadlineRiskReason!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(p.deadlineRiskReason!, style: const TextStyle(fontSize: 12, color: OasisTheme.muted)),
                      ),
                    if (p.expectedResult != null && p.expectedResult!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text("Expected: ${p.expectedResult}"),
                      ),
                    const SizedBox(height: 8),
                    Text("Current: ${p.currentStepLabel ?? "—"}"),
                    Text("Next: ${p.nextStepLabel ?? "—"}"),
                    Text(
                      "Progress: ${p.progressDone ?? "—"}/${p.progressTotal ?? "—"} · ${p.progressPercent ?? p.energy}%",
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Text("Work Plan", style: Theme.of(context).textTheme.labelMedium),
                        const Spacer(),
                        Text("${p.progressPercent ?? p.energy}%", style: const TextStyle(fontWeight: FontWeight.w800)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value: (p.progressPercent ?? p.energy) / 100,
                        minHeight: 10,
                        backgroundColor: const Color(0xFFEEF1EE),
                        color: OasisTheme.green,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ..._workflowButtons(p),
                        if (p.adminOverrideActions.isNotEmpty)
                          ...p.adminOverrideActions.map(
                            (a) => OutlinedButton(
                              onPressed: _acting
                                  ? null
                                  : () async {
                                      final reason = await _promptText("Override reason (bắt buộc)");
                                      if (reason == null || reason.trim().isEmpty) return;
                                      await _action(a, extra: {"reason": reason.trim()});
                                    },
                              child: Text(a == "FORCE_ACKNOWLEDGE" ? "Force Ack" : "Force Submit"),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: SegmentedButton<int>(
                        segments: const [
                          ButtonSegment(value: 0, label: Text("Hạng mục")),
                          ButtonSegment(value: 1, label: Text("Người")),
                          ButtonSegment(value: 2, label: Text("Chi phí")),
                          ButtonSegment(value: 3, label: Text("Tài liệu")),
                          ButtonSegment(value: 4, label: Text("Lịch sử")),
                        ],
                        selected: {_tab},
                        onSelectionChanged: (s) => setState(() => _tab = s.first),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_tab == 0) _StepsTab(project: p, acting: _acting, onToggle: _toggleStep, canEditStructure: p.canEditWorkPlan),
                    if (_tab == 1) _PeopleTab(project: p),
                    if (_tab == 2) _CostsTab(project: p, onAdd: _acting ? null : _addExpense),
                    if (_tab == 3) _DocsTab(docs: _docs),
                    if (_tab == 4) _HistoryTab(project: p),
                  ],
                ),
    );
  }
}

class _StepsTab extends StatelessWidget {
  const _StepsTab({
    required this.project,
    required this.acting,
    required this.onToggle,
    this.canEditStructure = true,
  });
  final OasisProject project;
  final bool acting;
  final Future<void> Function(int index, bool done) onToggle;
  final bool canEditStructure;

  @override
  Widget build(BuildContext context) {
    final labels = project.stepLabels.isNotEmpty
        ? project.stepLabels
        : const ["Chuẩn bị / khảo sát", "Triển khai chính", "Kiểm tra & chỉnh sửa", "Hoàn tất & bàn giao"];
    var flags = project.stepFlags.replaceAll(RegExp(r"[^01]"), "");
    if (flags.length < labels.length) flags = flags.padRight(labels.length, "0");

    String ownerLabel(int i) {
      if (i >= project.stepOwners.length || project.stepOwners[i].isEmpty) return "Chưa giao phụ trách";
      final key = project.stepOwners[i];
      final m = project.members.where((e) => e.userId == key || e.username == key || e.displayName == key);
      if (m.isNotEmpty) return "Phụ trách: ${m.first.displayName.isNotEmpty ? m.first.displayName : m.first.username}";
      return "Phụ trách: $key";
    }

    return Column(
      children: [
        for (var i = 0; i < labels.length; i++)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: flags[i] == "1" ? OasisTheme.greenSoft : const Color(0xFFEEF1EE),
                child: Text(
                  flags[i] == "1" ? "✓" : "${i + 1}".padLeft(2, "0"),
                  style: TextStyle(
                    color: flags[i] == "1" ? OasisTheme.green : OasisTheme.ink,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
              title: Text(labels[i], style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(ownerLabel(i)),
              trailing: flags[i] == "1"
                  ? TextButton(onPressed: acting ? null : () => onToggle(i, false), child: const Text("Hoàn tác"))
                  : FilledButton(onPressed: acting ? null : () => onToggle(i, true), child: const Text("Xong")),
            ),
          ),
      ],
    );
  }
}

class _PeopleTab extends StatelessWidget {
  const _PeopleTab({required this.project});
  final OasisProject project;

  @override
  Widget build(BuildContext context) {
    final members = project.members;
    if (members.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text("Phụ trách: ${project.owner ?? "—"}", style: const TextStyle(color: OasisTheme.muted)),
        ),
      );
    }
    return Column(
      children: members
          .map((m) {
            final role = m.role == "PRIMARY"
                ? "Phụ trách chính"
                : m.role == "VIEWER"
                    ? "Xem"
                    : "Phối hợp";
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: CircleAvatar(
                  child: Text(
                    () {
                      final name = m.displayName.isNotEmpty ? m.displayName : m.username;
                      if (name.isEmpty) return "?";
                      return name.length >= 2 ? name.substring(0, 2).toUpperCase() : name.toUpperCase();
                    }(),
                  ),
                ),
                title: Text(m.displayName.isNotEmpty ? m.displayName : m.username, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(role),
              ),
            );
          })
          .toList(),
    );
  }
}

class _CostsTab extends StatelessWidget {
  const _CostsTab({required this.project, this.onAdd});
  final OasisProject project;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final exps = project.expenses;
    final total = exps.fold<double>(0, (s, e) => s + ((e["amount"] as num?)?.toDouble() ?? 0));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              exps.isEmpty ? "Chưa có chi phí" : "Tổng: ${(total / 1e6).toStringAsFixed(1)} triệu",
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: exps.isEmpty ? OasisTheme.muted : OasisTheme.ink,
              ),
            ),
            const Spacer(),
            if (onAdd != null)
              TextButton.icon(onPressed: onAdd, icon: const Icon(Icons.add, size: 18), label: const Text("Ghi")),
          ],
        ),
        const SizedBox(height: 8),
        ...exps.map(
          (e) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              title: Text(e["content"]?.toString() ?? e["categoryLabel"]?.toString() ?? "Chi"),
              trailing: Text(
                "${(((e["amount"] as num?)?.toDouble() ?? 0) / 1e6).toStringAsFixed(1)} tr",
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DocsTab extends StatelessWidget {
  const _DocsTab({required this.docs});
  final List<Map<String, dynamic>> docs;

  @override
  Widget build(BuildContext context) {
    if (docs.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text("Chưa có tài liệu gắn Task này", style: TextStyle(color: OasisTheme.muted)),
        ),
      );
    }
    return Column(
      children: docs
          .map(
            (d) => Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: const Icon(Icons.description_outlined),
                title: Text(
                  d["fileName"]?.toString() ?? d["code"]?.toString() ?? "Tài liệu",
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text([
                  if (d["code"] != null) d["code"].toString(),
                  if (d["createdAt"] != null) d["createdAt"].toString().split("T").first,
                ].join(" · ")),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({required this.project});
  final OasisProject project;

  @override
  Widget build(BuildContext context) {
    final events = project.events;
    if (events.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text("Chưa có lịch sử", style: TextStyle(color: OasisTheme.muted)),
        ),
      );
    }
    return Column(
      children: events
          .map(
            (e) => Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                title: Text("${e.action}${e.detail != null ? " — ${e.detail}" : ""}"),
                subtitle: Text("${e.actorName}${e.createdAt != null ? " · ${e.createdAt}" : ""}"),
              ),
            ),
          )
          .toList(),
    );
  }
}
