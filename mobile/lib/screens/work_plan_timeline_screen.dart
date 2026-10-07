import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../controller_utils.dart";
import "../models.dart";
import "../theme.dart";
import "task_detail_screen.dart";

/// Task hub: big title → list of small work items (hạng mục) with edit + cost proposal.
class WorkPlanTimelineScreen extends StatefulWidget {
  const WorkPlanTimelineScreen({super.key, required this.projectId});
  final String projectId;

  @override
  State<WorkPlanTimelineScreen> createState() => _WorkPlanTimelineScreenState();
}

class _StepRow {
  _StepRow({
    required this.title,
    this.deadline,
    this.minutes,
    this.priorityLevel,
  });
  final TextEditingController title;
  DateTime? deadline;
  int? minutes;
  int? priorityLevel;
}

class _WorkPlanTimelineScreenState extends State<WorkPlanTimelineScreen> {
  OasisProject? _project;
  bool _loading = true;
  bool _saving = false;
  bool _aiPlanning = false;
  final List<_StepRow> _rows = [];
  String? _aiSummary;

  static const _defaultLabels = [
    "Chuẩn bị / khảo sát",
    "Triển khai chính",
    "Kiểm tra & chỉnh sửa",
    "Hoàn tất & bàn giao",
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final r in _rows) {
      r.title.dispose();
    }
    super.dispose();
  }

  String _ymd(DateTime d) =>
      "${d.year.toString().padLeft(4, "0")}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}";

  DateTime? _parseYmd(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final m = RegExp(r"^(\d{4})-(\d{2})-(\d{2})").firstMatch(raw);
    if (m == null) return DateTime.tryParse(raw);
    return DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  }

  String _fmtMinutes(int? m) {
    if (m == null) return "—";
    if (m < 60) return "$m phút";
    if (m == 60) return "1 giờ";
    if (m % 60 == 0) return "${m ~/ 60} giờ";
    return "${m ~/ 60}h${m % 60}";
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final p = await context.read<AppState>().fetchProject(widget.projectId);
      if (!mounted) return;
      final stale = List<_StepRow>.from(_rows);
      final labels = p.stepLabels.where((e) => e.trim().isNotEmpty).toList();
      final use = labels.isNotEmpty ? labels : _defaultLabels;
      final next = <_StepRow>[];
      for (var i = 0; i < use.length; i++) {
        final dl = i < p.stepDeadlines.length ? _parseYmd(p.stepDeadlines[i]) : null;
        final est = i < p.stepEstimates.length ? p.stepEstimates[i] : null;
        next.add(
          _StepRow(
            title: TextEditingController(text: use[i]),
            deadline: dl ?? _parseYmd(p.deadline),
            minutes: est ??
                (p.estimatedDurationMinutes != null
                    ? (p.estimatedDurationMinutes! / use.length).round().clamp(15, 480)
                    : 60),
          ),
        );
      }
      setState(() {
        _rows
          ..clear()
          ..addAll(next);
        _project = p;
        _loading = false;
      });
      disposeControllersAfterFrame(stale.map((r) => r.title));
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }

  String _priorityLabel(int? level) {
    switch (level) {
      case 1:
        return "Ưu tiên 1 · 1 ngày";
      case 2:
        return "Ưu tiên 2 · 2 ngày";
      case 3:
        return "Ưu tiên 3 · 4 ngày";
      case 4:
        return "Ưu tiên 4 · 7 ngày";
      default:
        return "";
    }
  }

  Future<void> _aiAssist() async {
    if (_aiPlanning || _saving) return;
    setState(() => _aiPlanning = true);
    try {
      final res = await context.read<AppState>().planSubtasksWithAi(widget.projectId);
      if (!mounted) return;
      final subtasks = (res["subtasks"] as List? ?? []).whereType<Map>().toList();
      if (subtasks.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("AI không trả hạng mục nào")),
        );
        return;
      }
      setState(() => _aiSummary = res["summary"]?.toString());
      await _load();
      if (!mounted) return;
      final source = res["source"]?.toString() ?? "";
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            source == "openai"
                ? "AI đã chia hạng mục + điền lịch (Prisma)"
                : "Đã lập kế hoạch theo ma trận ưu tiên + điền lịch",
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _aiPlanning = false);
    }
  }

  void _addRow() {
    setState(() {
      _rows.add(
        _StepRow(
          title: TextEditingController(text: "Công việc mới"),
          deadline: _parseYmd(_project?.deadline) ?? DateTime.now(),
          minutes: 60,
        ),
      );
    });
  }

  void _removeRow(int i) {
    if (_rows.length <= 1) return;
    final dead = _rows[i];
    setState(() => _rows.removeAt(i));
    disposeControllersAfterFrame([dead.title]);
  }

  Future<void> _persistPlan() async {
    final labels = _rows.map((r) => r.title.text.trim()).toList();
    if (labels.any((t) => t.isEmpty)) {
      throw Exception("Tên công việc không được trống");
    }
    await context.read<AppState>().patchProject(widget.projectId, {
      "stepLabels": labels,
      "stepDeadlines": _rows.map((r) => r.deadline == null ? "" : _ymd(r.deadline!)).toList(),
      "stepEstimates": _rows.map((r) => r.minutes).toList(),
    });
  }

  Future<void> _saveAll() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await _persistPlan();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Đã lưu kế hoạch")),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editStep(int index) async {
    final row = _rows[index];
    final nameCtrl = TextEditingController(text: row.title.text);
    final amountCtrl = TextEditingController();
    DateTime? deadline = row.deadline;
    int? minutes = row.minutes;
    String? unit = _project?.unit?.name;
    final state = context.read<AppState>();
    final canEdit = _project?.canEditWorkPlan != false || state.user?.isAdmin == true;

    if (!canEdit) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Bạn không có quyền sửa hạng mục này")),
      );
      return;
    }

    final result = await showModalBottomSheet<String>(
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
                    Text(
                      "Sửa công việc ${index + 1}",
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(
                        labelText: "Tên công việc *",
                        hintText: "VD: Khảo sát hiện trạng",
                      ),
                    ),
                    const SizedBox(height: 8),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text("Hạn hạng mục"),
                      subtitle: Text(deadline == null ? "Chưa chọn" : _ymd(deadline!)),
                      trailing: const Icon(Icons.calendar_today, size: 18),
                      onTap: () async {
                        final now = DateTime.now();
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: deadline ?? now,
                          firstDate: DateTime(now.year - 1),
                          lastDate: DateTime(now.year + 3),
                        );
                        if (picked != null) setLocal(() => deadline = picked);
                      },
                    ),
                    DropdownButtonFormField<int?>(
                      // ignore: deprecated_member_use
                      value: minutes,
                      decoration: const InputDecoration(labelText: "Thời lượng ước tính"),
                      items: const [
                        DropdownMenuItem(value: 15, child: Text("15 phút")),
                        DropdownMenuItem(value: 30, child: Text("30 phút")),
                        DropdownMenuItem(value: 45, child: Text("45 phút")),
                        DropdownMenuItem(value: 60, child: Text("1 giờ")),
                        DropdownMenuItem(value: 120, child: Text("2 giờ")),
                        DropdownMenuItem(value: 240, child: Text("4 giờ")),
                        DropdownMenuItem(value: 480, child: Text("1 ngày")),
                      ],
                      onChanged: (v) => setLocal(() => minutes = v),
                    ),
                    const SizedBox(height: 16),
                    const Divider(),
                    const Text(
                      "Chi phí đề xuất",
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Gửi lên Admin → Quyết định. Duyệt xong sẽ vào Chi phí.",
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.35),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: amountCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: "Số tiền đề xuất (VND)",
                        hintText: "VD: 1500000",
                      ),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String?>(
                      // ignore: deprecated_member_use
                      value: unit,
                      decoration: const InputDecoration(labelText: "Phân khu đề xuất"),
                      items: [
                        const DropdownMenuItem(value: null, child: Text("— Chưa chọn —")),
                        ...AppState.unitNames.map((u) => DropdownMenuItem(value: u, child: Text(u))),
                      ],
                      onChanged: (v) => setLocal(() => unit = v),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, "save"),
                      child: const Text("Lưu công việc"),
                    ),
                    const SizedBox(height: 8),
                    FilledButton.tonal(
                      onPressed: () => Navigator.pop(ctx, "propose"),
                      child: const Text("Gửi chi phí đề xuất để duyệt"),
                    ),
                    const SizedBox(height: 4),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text("Huỷ"),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    final newName = nameCtrl.text.trim();
    final amountRaw = amountCtrl.text.trim().replaceAll(RegExp(r"[^\d]"), "");
    final amount = num.tryParse(amountRaw);
    disposeControllersAfterFrame([nameCtrl, amountCtrl]);
    if (result == null) return;

    if (newName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Tên công việc không được trống")),
      );
      return;
    }

    setState(() {
      row.title.text = newName;
      row.deadline = deadline;
      row.minutes = minutes;
    });

    setState(() => _saving = true);
    try {
      await _persistPlan();
      if (result == "propose") {
        if (amount == null || amount <= 0) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Nhập số tiền đề xuất > 0")),
          );
          return;
        }
        final proposer = state.user?.displayName ?? state.user?.username ?? "";
        await state.createDecision({
          "title": "Chi phí đề xuất: $newName",
          "description":
              "COST_PROPOSAL|step=$index|task=${_project?.name ?? ""}|unit=${unit ?? ""}",
          "amountLabel": amount.toStringAsFixed(0),
          "impact": unit,
          "isBlocking": false,
          "linkedProjectId": widget.projectId,
          "proposer": proposer,
        });
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Đã gửi chi phí đề xuất → chờ Admin duyệt")),
        );
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Đã lưu công việc")),
        );
      }
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _project;
    final state = context.watch<AppState>();
    final relatedDecisions = state.decisions.where((d) {
      return d["linkedProjectId"]?.toString() == widget.projectId &&
          (d["title"]?.toString() ?? "").startsWith("Chi phí đề xuất");
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      appBar: AppBar(
        title: const Text(
          "Công việc Task",
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        ),
        actions: [
          if (p != null)
            TextButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => TaskDetailScreen(projectId: p.id)),
                );
              },
              child: const Text("Chi tiết"),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : p == null
              ? const Center(child: Text("Không tải được Task"))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  children: [
                    // Big title
                    Text(
                      p.name,
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        height: 1.15,
                        letterSpacing: -0.6,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "${p.quadrantLabel} · ${p.statusVi} · Deadline ${p.deadline ?? "—"}"
                      "${p.unit != null && p.unit!.name.isNotEmpty ? " · ${p.unit!.name}" : ""}",
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade700,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if ((p.description ?? "").trim().isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        p.description!.trim(),
                        style: TextStyle(fontSize: 14, height: 1.4, color: Colors.grey.shade800),
                      ),
                    ],
                    const SizedBox(height: 18),
                    if (_aiSummary != null && _aiSummary!.trim().isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF6FF),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: OasisTheme.admBlue.withValues(alpha: 0.25)),
                        ),
                        child: Text(
                          _aiSummary!,
                          style: const TextStyle(fontSize: 13, height: 1.35),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            "Công việc nhỏ để hoàn thành",
                            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                          ),
                        ),
                        IconButton.filledTonal(
                          tooltip: "AI hỗ trợ chia hạng mục + điền lịch",
                          onPressed: _aiPlanning || _saving || _loading ? null : _aiAssist,
                          icon: _aiPlanning
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.auto_awesome, size: 20),
                        ),
                        const SizedBox(width: 4),
                        TextButton.icon(
                          onPressed: _aiPlanning || _rows.length >= 20 ? null : _addRow,
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text("Thêm"),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Dấu ✨ = AI đọc Task → chia hạng mục theo ma trận ưu tiên 4 mức → ghi Prisma & lịch",
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.3),
                    ),
                    const SizedBox(height: 8),
                    ...List.generate(_rows.length, (i) {
                      final r = _rows[i];
                      final name = r.title.text.trim().isEmpty ? "Công việc ${i + 1}" : r.title.text.trim();
                      final pending = relatedDecisions.where((d) {
                        final t = d["title"]?.toString() ?? "";
                        return t.contains(name) && d["status"]?.toString() == "PENDING";
                      }).isNotEmpty;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        color: OasisTheme.widgetBlue,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  CircleAvatar(
                                    radius: 14,
                                    backgroundColor: OasisTheme.admBlue,
                                    child: Text(
                                      "${i + 1}",
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      name,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                        height: 1.25,
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: "Sửa",
                                    onPressed: _saving ? null : () => _editStep(i),
                                    icon: const Icon(Icons.edit_outlined, size: 20),
                                  ),
                                  if (_rows.length > 1)
                                    IconButton(
                                      tooltip: "Xoá",
                                      onPressed: _saving ? null : () => _removeRow(i),
                                      icon: const Icon(Icons.delete_outline, size: 20),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Icon(Icons.event, size: 14, color: Colors.grey.shade600),
                                  const SizedBox(width: 4),
                                  Text(
                                    r.deadline == null ? "Chưa hạn" : _ymd(r.deadline!),
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                                  ),
                                  const SizedBox(width: 12),
                                  Icon(Icons.schedule, size: 14, color: Colors.grey.shade600),
                                  const SizedBox(width: 4),
                                  Text(
                                    _fmtMinutes(r.minutes),
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                                  ),
                                  if (_priorityLabel(r.priorityLevel).isNotEmpty) ...[
                                    const SizedBox(width: 10),
                                    Flexible(
                                      child: Text(
                                        _priorityLabel(r.priorityLevel),
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                          color: OasisTheme.admBlue,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                  if (pending) ...[
                                    const Spacer(),
                                    Text(
                                      "Chờ duyệt CP",
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.orange.shade800,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton(
                                  onPressed: _saving ? null : () => _editStep(i),
                                  child: const Text("Sửa · đề xuất chi phí →"),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
                ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _saving || _loading ? null : _saveAll,
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text("Lưu toàn bộ kế hoạch", style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ),
      ),
    );
  }
}
