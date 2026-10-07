import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";
import "../widgets/offspots_widgets.dart";
import "../widgets/task_attachments.dart";
import "additional_cost_sheet.dart";
import "work_plan_timeline_screen.dart";

/// Offspots Task Detail — Staff & Admin (tabs Details / Gantt / Files / Comments).
class OffspotsTaskDetailScreen extends StatefulWidget {
  const OffspotsTaskDetailScreen({
    super.key,
    required this.projectId,
    this.staffMode = true,
  });

  final String projectId;
  final bool staffMode;

  @override
  State<OffspotsTaskDetailScreen> createState() => _OffspotsTaskDetailScreenState();
}

class _OffspotsTaskDetailScreenState extends State<OffspotsTaskDetailScreen>
    with SingleTickerProviderStateMixin {
  OasisProject? _project;
  bool _loading = true;
  bool _aiPlanning = false;
  bool _addingStep = false;
  late final TabController _tabs;

  static const _placeholderSteps = [
    "Prepare specs",
    "Design mockups",
    "Implement",
    "Handoff",
  ];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final p = await context.read<AppState>().fetchProject(widget.projectId);
      if (!mounted) return;
      setState(() {
        _project = p;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }

  List<String> _stepLabels(OasisProject p) {
    final labels = p.stepLabels.where((e) => e.trim().isNotEmpty).toList();
    return labels.isNotEmpty ? labels : List<String>.from(_placeholderSteps);
  }

  bool _hasPersistedSteps(OasisProject p) =>
      p.stepLabels.any((e) => e.trim().isNotEmpty);

  String _ymd(DateTime d) =>
      "${d.year.toString().padLeft(4, "0")}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}";

  Future<void> _toggleStep(int index) async {
    final p = _project;
    if (p == null) return;
    final steps = _stepLabels(p);
    var flags = p.stepFlags.replaceAll(RegExp(r"[^01]"), "");
    if (flags.length < steps.length) flags = flags.padRight(steps.length, "0");
    if (flags.length > steps.length) flags = flags.substring(0, steps.length);
    final chars = flags.split("");
    if (index < 0 || index >= chars.length) return;
    chars[index] = chars[index] == "1" ? "0" : "1";
    try {
      final body = <String, dynamic>{"stepFlags": chars.join()};
      // Lần đầu tick trên placeholder → ghi luôn labels vào Prisma.
      if (!_hasPersistedSteps(p)) {
        body["stepLabels"] = steps;
      }
      final updated = await context.read<AppState>().patchProject(p.id, body);
      if (!mounted) return;
      setState(() => _project = updated);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }

  Future<void> _addStep() async {
    final p = _project;
    if (p == null || _addingStep || _aiPlanning) return;
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Thêm đầu việc"),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: "Tên công việc",
            hintText: "VD: Viết spec API đăng nhập",
          ),
          onSubmitted: (_) => Navigator.pop(ctx, true),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Huỷ")),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Thêm")),
        ],
      ),
    );
    final title = ctrl.text.trim();
    ctrl.dispose();
    if (ok != true || title.isEmpty) return;
    if (!mounted) return;
    final state = context.read<AppState>();

    setState(() => _addingStep = true);
    try {
      final current = _hasPersistedSteps(p)
          ? p.stepLabels.where((e) => e.trim().isNotEmpty).toList()
          : <String>[];
      final labels = [...current, title];
      var flags = p.stepFlags.replaceAll(RegExp(r"[^01]"), "");
      if (_hasPersistedSteps(p)) {
        if (flags.length < current.length) flags = flags.padRight(current.length, "0");
        flags = "${flags.substring(0, current.length)}0";
      } else {
        flags = "0" * labels.length;
      }
      final deadlines = List<String>.generate(labels.length, (i) {
        if (i < p.stepDeadlines.length && p.stepDeadlines[i].trim().isNotEmpty) {
          return p.stepDeadlines[i];
        }
        return p.deadline ?? _ymd(DateTime.now());
      });
      final updated = await state.patchProject(p.id, {
        "stepLabels": labels,
        "stepFlags": flags,
        "stepDeadlines": deadlines,
      });
      if (!mounted) return;
      setState(() => _project = updated);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Đã thêm đầu việc")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _addingStep = false);
    }
  }

  Future<void> _aiAssist() async {
    final p = _project;
    if (p == null || _aiPlanning || _addingStep) return;
    setState(() => _aiPlanning = true);
    try {
      final res = await context.read<AppState>().planSubtasksWithAi(p.id);
      if (!mounted) return;
      await _load();
      if (!mounted) return;
      final n = (res["subtasks"] as List?)?.length ?? 0;
      final source = res["source"]?.toString() ?? "";
      final budget = res["budgetMinutes"];
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            n > 0
                ? "AI đã chia $n hạng mục + ma trận ưu tiên"
                    "${budget != null ? " · ≤${budget}p" : ""}"
                    "${source.isNotEmpty ? " ($source)" : ""}"
                : "AI không trả hạng mục nào",
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

  Map<String, dynamic>? _detailForStep(OasisProject p, int index, String title) {
    final details = p.stepDetails;
    if (index >= 0 && index < details.length) return details[index];
    for (final d in details) {
      if ((d["title"]?.toString() ?? "").trim() == title.trim()) return d;
    }
    return null;
  }

  String _priorityShort(int level) {
    switch (level) {
      case 1:
        return "P1 · +1 ngày";
      case 2:
        return "P2 · +2 ngày";
      case 3:
        return "P3 · +4 ngày";
      default:
        return "P4 · +7 ngày";
    }
  }

  Color _priorityFg(int level) {
    switch (level) {
      case 1:
        return const Color(0xFFB91C1C);
      case 2:
        return const Color(0xFFC2410C);
      case 3:
        return const Color(0xFF1D4ED8);
      default:
        return const Color(0xFF475569);
    }
  }

  Color _priorityBg(int level) {
    switch (level) {
      case 1:
        return const Color(0xFFFEE2E2);
      case 2:
        return const Color(0xFFFFEDD5);
      case 3:
        return const Color(0xFFDBEAFE);
      default:
        return const Color(0xFFF1F5F9);
    }
  }

  void _openStepHowTo(OasisProject p, int index, String title, bool checked) {
    final detail = _detailForStep(p, index, title);
    final level = (detail?["priorityLevel"] as num?)?.toInt() ??
        ((index == 0) ? 1 : (index == 1 ? 2 : (index < 3 ? 3 : 4)));
    final minutes = (detail?["estimatedMinutes"] as num?)?.toInt() ??
        (index < p.stepEstimates.length ? p.stepEstimates[index] : null);
    final deadline = detail?["deadline"]?.toString() ??
        (index < p.stepDeadlines.length ? p.stepDeadlines[index] : null);
    final description = (detail?["description"]?.toString() ?? "").trim();
    final howTo = (detail?["howToSteps"] is List)
        ? (detail!["howToSteps"] as List)
            .map((e) => e?.toString().trim() ?? "")
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];
    final fallbackHowTo = howTo.isNotEmpty
        ? howTo
        : [
            "Xác định đầu ra mong muốn của「$title」.",
            "Thu thập input cần thiết (brief, tài liệu, stakeholder).",
            "Làm lần lượt; ghi chú điểm chưa rõ để hỏi.",
            "Tự kiểm trước khi đánh dấu hoàn thành.",
          ];
    final descText = description.isNotEmpty
        ? description
        : "Hạng mục「$title」trong Task「${p.name}」— làm rõ phạm vi và hoàn thành theo các bước bên dưới.";

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.62,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          builder: (_, scrollCtrl) {
            return ListView(
              controller: scrollCtrl,
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                    color: OasisTheme.ink,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _MetaChip(
                      label: _priorityShort(level),
                      fg: _priorityFg(level),
                      bg: _priorityBg(level),
                    ),
                    if (minutes != null && minutes > 0)
                      _MetaChip(
                        label: "~$minutes phút",
                        fg: OasisTheme.admBlueDeep,
                        bg: const Color(0xFFE8F1FF),
                      ),
                    if (deadline != null && deadline.trim().isNotEmpty)
                      _MetaChip(
                        label: "Hạn $deadline",
                        fg: const Color(0xFF334155),
                        bg: const Color(0xFFF1F5F9),
                      ),
                    if (checked)
                      const _MetaChip(
                        label: "Đã xong",
                        fg: Color(0xFF15803D),
                        bg: Color(0xFFDCFCE7),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                const Text(
                  "Mô tả",
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                ),
                const SizedBox(height: 6),
                Text(
                  descText,
                  style: const TextStyle(
                    color: Color(0xFF475569),
                    height: 1.45,
                    fontSize: 13.5,
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  "Các bước làm",
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                ),
                const SizedBox(height: 8),
                ...List.generate(fallbackHowTo.length, (i) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 24,
                          height: 24,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: const Color(0xFFE8F1FF),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            "${i + 1}",
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                              color: OasisTheme.admBlue,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            fallbackHowTo[i],
                            style: const TextStyle(
                              fontSize: 13.5,
                              height: 1.4,
                              color: OasisTheme.ink,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 18),
                TaskAttachmentsPanel(
                  projectId: p.id,
                  stepIndex: index,
                  stepLabel: title,
                  compact: true,
                  onChanged: () {
                    _load();
                  },
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: FilledButton.styleFrom(
                    backgroundColor: OasisTheme.admBlue,
                    minimumSize: const Size.fromHeight(44),
                  ),
                  child: const Text("Đóng", style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  List<Map<String, dynamic>> _projectExpenses(AppState state, OasisProject p) {
    final fromProject = p.expenses;
    final linked = fromProject.isNotEmpty
        ? List<Map<String, dynamic>>.from(fromProject)
        : state.expenses.where((e) {
            final id = e["linkedProjectId"]?.toString() ??
                (e["linkedProject"] is Map
                    ? (e["linkedProject"] as Map)["id"]?.toString()
                    : null);
            return id == p.id;
          }).toList();

    // Pending cost proposals (decisions) also show in Incurred costs.
    final pending = state.decisions.where((d) {
      return d["linkedProjectId"]?.toString() == p.id &&
          (d["title"]?.toString() ?? "").startsWith("Chi phí đề xuất") &&
          (d["status"]?.toString() == "PENDING" || d["status"]?.toString() == "OPEN");
    }).map((d) {
      final title = (d["title"]?.toString() ?? "Expense").replaceFirst("Chi phí đề xuất: ", "");
      final amount = num.tryParse(d["amountLabel"]?.toString() ?? "") ?? 0;
      return <String, dynamic>{
        "content": title,
        "amount": amount,
        "status": "PENDING",
        "code": d["code"]?.toString() ?? "",
      };
    });

    return [...linked, ...pending];
  }

  String _money(num? n) {
    if (n == null) return "0";
    final s = n.round().toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(",");
      buf.write(s[i]);
    }
    return buf.toString();
  }

  Color _expenseStatusColor(String? status) {
    switch ((status ?? "").toUpperCase()) {
      case "APPROVED":
      case "RECONCILED":
      case "LOCKED":
        return const Color(0xFF16A34A);
      case "REJECTED":
        return const Color(0xFFDC2626);
      case "PROVISIONAL":
      case "PENDING":
      default:
        return const Color(0xFFD97706);
    }
  }

  String _expenseStatusLabel(String? status) {
    switch ((status ?? "").toUpperCase()) {
      case "APPROVED":
      case "RECONCILED":
      case "LOCKED":
        return "Approved";
      case "REJECTED":
        return "Rejected";
      default:
        return "Pending approval";
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final p = _project;

    if (_loading || p == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final pri = OffspotsPriority.fromProject(priority: p.priority, quadrant: p.quadrant);
    final steps = _stepLabels(p);
    var flags = p.stepFlags.replaceAll(RegExp(r"[^01]"), "");
    if (flags.length < steps.length) flags = flags.padRight(steps.length, "0");
    final done = flags.split("").take(steps.length).where((c) => c == "1").length;
    final expenses = _projectExpenses(state, p);
    final total = expenses.fold<num>(0, (s, e) => s + ((e["amount"] as num?) ?? 0));
    final busyChecklist = _aiPlanning || _addingStep;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              p.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 2),
            OffspotsPill(label: pri.label, fg: pri.fg, bg: pri.bg),
          ],
        ),
        actions: [
          IconButton(
            tooltip: "AI chia hạng mục",
            onPressed: _aiPlanning || _loading || _project == null ? null : _aiAssist,
            icon: _aiPlanning
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_awesome),
          ),
          if (!widget.staffMode)
            IconButton(
              tooltip: "Work plan",
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => WorkPlanTimelineScreen(projectId: p.id),
                  ),
                );
              },
              icon: const Icon(Icons.edit_calendar_outlined),
            ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          labelColor: OasisTheme.admBlue,
          unselectedLabelColor: OasisTheme.muted,
          indicatorColor: OasisTheme.admBlue,
          tabs: const [
            Tab(text: "Details"),
            Tab(text: "Gantt"),
            Tab(text: "Files"),
            Tab(text: "Comments"),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                _OverviewCard(project: p),
                const SizedBox(height: 18),
                const Text(
                  "Task description",
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
                const SizedBox(height: 8),
                Text(
                  (p.description ?? p.expectedResult ?? "—").trim().isEmpty
                      ? "—"
                      : (p.description ?? p.expectedResult)!.trim(),
                  style: const TextStyle(
                    color: Color(0xFF475569),
                    height: 1.45,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        "Checklist · $done of ${steps.length} completed",
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                      ),
                    ),
                    Text(
                      "${p.energy}%",
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: OasisTheme.admBlue,
                      ),
                    ),
                    const SizedBox(width: 4),
                    IconButton.filledTonal(
                      tooltip: "AI hỗ trợ — đọc tiêu đề Task, chia hạng mục + lịch",
                      onPressed: busyChecklist ? null : _aiAssist,
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0xFFE8F1FF),
                        foregroundColor: OasisTheme.admBlue,
                      ),
                      icon: _aiPlanning
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.auto_awesome, size: 20),
                    ),
                    IconButton.filled(
                      tooltip: "Thêm đầu việc",
                      onPressed: busyChecklist ? null : _addStep,
                      style: IconButton.styleFrom(
                        backgroundColor: OasisTheme.admBlue,
                        foregroundColor: Colors.white,
                      ),
                      icon: _addingStep
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.add, size: 22),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  "✨ AI đọc「${p.name}」→ ma trận P1–P4 · ≤${p.aiBudgetMinutes ?? p.estimatedDurationMinutes ?? "?"}p · ấn hạng mục xem bước làm",
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.35),
                ),
                if ((p.description ?? "").contains("COST_APPROVAL_REQUIRED")) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF7ED),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFFDBA74)),
                    ),
                    child: const Text(
                      "Task có duyệt chi phí — khi chia hạng mục / phát sinh mua sắm, bấm Add chi phí để gửi Admin duyệt.",
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 1.35),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                OffspotsProgressBar(value: done / steps.length.clamp(1, 99)),
                const SizedBox(height: 10),
                ...List.generate(steps.length, (i) {
                  final checked = i < flags.length && flags[i] == "1";
                  final detail = _detailForStep(p, i, steps[i]);
                  final level = (detail?["priorityLevel"] as num?)?.toInt() ??
                      (i == 0 ? 1 : (i == 1 ? 2 : (i < 3 ? 3 : 4)));
                  final minutes = (detail?["estimatedMinutes"] as num?)?.toInt() ??
                      (i < p.stepEstimates.length ? p.stepEstimates[i] : null);
                  final proofCount =
                      i < p.stepProofs.length ? p.stepProofs[i].length : 0;
                  return Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => _openStepHowTo(p, i, steps[i], checked),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Checkbox(
                              value: checked,
                              activeColor: OasisTheme.admBlue,
                              onChanged: busyChecklist ? null : (_) => _toggleStep(i),
                            ),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(top: 10, bottom: 8, right: 4),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      steps[i],
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 14,
                                        decoration:
                                            checked ? TextDecoration.lineThrough : null,
                                        color: checked
                                            ? OasisTheme.muted
                                            : OasisTheme.ink,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Wrap(
                                      spacing: 6,
                                      runSpacing: 6,
                                      children: [
                                        _MetaChip(
                                          label: _priorityShort(level),
                                          fg: _priorityFg(level),
                                          bg: _priorityBg(level),
                                          compact: true,
                                        ),
                                        if (minutes != null && minutes > 0)
                                          _MetaChip(
                                            label: "${minutes}p",
                                            fg: OasisTheme.admBlueDeep,
                                            bg: const Color(0xFFE8F1FF),
                                            compact: true,
                                          ),
                                        _MetaChip(
                                          label: proofCount > 0
                                              ? "File ($proofCount)"
                                              : "Camera / File",
                                          fg: proofCount > 0
                                              ? const Color(0xFF15803D)
                                              : OasisTheme.muted,
                                          bg: proofCount > 0
                                              ? const Color(0xFFDCFCE7)
                                              : const Color(0xFFF8FAFC),
                                          compact: true,
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const Padding(
                              padding: EdgeInsets.only(top: 14, right: 4),
                              child: Icon(
                                Icons.chevron_right,
                                size: 20,
                                color: OasisTheme.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Text(
                      "Incurred costs",
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                    ),
                    const Spacer(),
                    TextButton.icon(
                      onPressed: () async {
                        final ok = await showModalBottomSheet<bool>(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: Colors.white,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                          ),
                          builder: (_) => AdditionalCostSheet(project: p),
                        );
                        if (ok == true) await _load();
                      },
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text("Add", style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ],
                ),
                if (expenses.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text(
                      "Chưa có chi phí. Bấm Add để gửi đề xuất.",
                      style: TextStyle(color: OasisTheme.muted, fontSize: 13),
                    ),
                  )
                else ...[
                  const SizedBox(height: 6),
                  Text(
                    "${_money(total)} VND",
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: OasisTheme.ink,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...expenses.map((e) {
                    final status = e["status"]?.toString();
                    final color = _expenseStatusColor(status);
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  e["content"]?.toString() ??
                                      e["categoryLabel"]?.toString() ??
                                      e["code"]?.toString() ??
                                      "Expense",
                                  style: const TextStyle(fontWeight: FontWeight.w700),
                                ),
                                Text(
                                  _expenseStatusLabel(status),
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            "${_money(e["amount"] as num?)} VND",
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ],
                      ),
                    );
                  }),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () async {
                    try {
                      await context.read<AppState>().patchProject(p.id, {
                        "status": p.status == "DONE" ? "DOING" : "DONE",
                      });
                      await _load();
                    } catch (e) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
                    }
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: OasisTheme.admBlue,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(
                    p.status == "DONE" ? "Reopen task" : "Mark as done",
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
          _GanttTab(project: p),
          RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                TaskAttachmentsPanel(
                  projectId: p.id,
                  onChanged: _load,
                ),
              ],
            ),
          ),
          const Center(
            child: Text("Comments — sắp có", style: TextStyle(color: OasisTheme.muted)),
          ),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.label,
    required this.fg,
    required this.bg,
    this.compact = false,
  });

  final String label;
  final Color fg;
  final Color bg;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontWeight: FontWeight.w800,
          fontSize: compact ? 10.5 : 12,
        ),
      ),
    );
  }
}

class _OverviewCard extends StatelessWidget {
  const _OverviewCard({required this.project});
  final OasisProject project;

  @override
  Widget build(BuildContext context) {
    final owners = project.members.isNotEmpty
        ? project.members.map((m) => m.displayName.isNotEmpty ? m.displayName : m.username).join(", ")
        : (project.owner ?? "—");
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F8FF),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          _kv("Assigned by", "Admin"),
          _kv("Owned by", owners),
          _kv("Start / Due", project.deadline ?? "—"),
          _kv("Status", project.statusVi),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(k, style: const TextStyle(color: OasisTheme.muted, fontSize: 12)),
          ),
          Expanded(
            child: Text(v, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

class _GanttTab extends StatelessWidget {
  const _GanttTab({required this.project});
  final OasisProject project;

  @override
  Widget build(BuildContext context) {
    final labels = project.stepLabels.where((e) => e.trim().isNotEmpty).toList();
    final steps = labels.isNotEmpty ? labels : ["UI Mock", "App Design", "Dev", "QA", "Release"];
    var flags = project.stepFlags.replaceAll(RegExp(r"[^01]"), "").padRight(steps.length, "0");
    final colors = OasisTheme.taskBarColors;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text("Gantt", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 12),
        ...List.generate(steps.length, (i) {
          final done = i < flags.length && flags[i] == "1";
          final pct = done ? 1.0 : ((i + 1) / (steps.length + 1)).clamp(0.2, 0.85);
          final color = colors[i % colors.length];
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(steps[i], style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                    Text("${(pct * 100).round()}%", style: TextStyle(color: color, fontWeight: FontWeight.w800)),
                  ],
                ),
                const SizedBox(height: 6),
                OffspotsProgressBar(value: pct, color: color, height: 14),
              ],
            ),
          );
        }),
        const SizedBox(height: 20),
        const Text("Workload", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 12),
        SizedBox(
          height: 120,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: List.generate(5, (i) {
              final h = [1.0, 0.5, 0.25, 0.35, 0.15][i];
              final overload = h >= 0.9;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text("${(h * 100).round()}%", style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Flexible(
                        child: FractionallySizedBox(
                          heightFactor: h,
                          widthFactor: 1,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: overload ? const Color(0xFFEA5455) : const Color(0xFF28C76F),
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text("D${i + 1}", style: const TextStyle(fontSize: 10, color: OasisTheme.muted)),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ],
    );
  }
}
