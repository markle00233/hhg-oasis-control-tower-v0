import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";

/// Bảng tổng hợp AI — Admin xác nhận rồi mới gửi staff (ẩn form Create Task tạm thời).
class AiTaskSummaryScreen extends StatefulWidget {
  const AiTaskSummaryScreen({
    super.key,
    required this.task,
    required this.scripts,
    this.prefillOwner,
    this.prefillDeadline,
    this.aiSource,
  });

  final Map<String, dynamic> task;
  final List<String> scripts;
  final String? prefillOwner;
  final DateTime? prefillDeadline;
  final String? aiSource;

  @override
  State<AiTaskSummaryScreen> createState() => _AiTaskSummaryScreenState();
}

class _AiTaskSummaryScreenState extends State<AiTaskSummaryScreen> {
  static const units = [
    "Lòng Nướng",
    "Spa",
    "Hồ bơi",
    "Gym",
    "Pickleball",
    "Bếp Trung Tâm",
    "Mía Ơi",
    "Dùng chung",
  ];

  late TextEditingController _name;
  late TextEditingController _content;
  String? _unit;
  String? _owner;
  String? _ownerUserId;
  bool? _important;
  bool? _urgent;
  DateTime? _deadline;
  bool _submitting = false;
  bool _askAddOwner = false;

  String _ymd(DateTime d) =>
      "${d.year.toString().padLeft(4, "0")}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}";

  @override
  void initState() {
    super.initState();
    final t = Map<String, dynamic>.from(widget.task);
    final joined = widget.scripts.join("\n").trim();

    var name = t["name"]?.toString().trim() ?? "";
    var content = t["objective"]?.toString().trim() ?? "";
    final brief = t["brief"]?.toString().trim() ?? "";
    if (brief.isNotEmpty) {
      content = content.isEmpty ? brief : "$content\n\n$brief";
    }
    // Nội dung dài từ script = nội dung task
    if (joined.length > (content.length + 20)) {
      content = joined;
    }
    if (name.isEmpty || name.length > 90) {
      name = _genName(content.isNotEmpty ? content : joined);
    }

    _name = TextEditingController(text: name);
    _content = TextEditingController(text: content);
    _unit = t["unitName"]?.toString();
    if (_unit != null && !units.contains(_unit)) _unit = null;

    _owner = t["owner"]?.toString().trim();
    if (_owner == null || _owner!.isEmpty) {
      _owner = widget.prefillOwner;
    }
    // Resolve after first frame when directory is available — see didChangeDependencies
    _askAddOwner = _owner == null || _owner!.trim().isEmpty;

    if (t["important"] is bool) _important = t["important"] as bool;
    if (t["urgent"] is bool) _urgent = t["urgent"] as bool;

    final dl = t["deadline"]?.toString();
    if (dl != null && RegExp(r"^\d{4}-\d{2}-\d{2}$").hasMatch(dl)) {
      _deadline = DateTime.tryParse(dl);
    }
    _deadline ??= widget.prefillDeadline;
  }

  String _genName(String raw) {
    final line = raw
        .split(RegExp(r"[\n.!]"))
        .map((s) => s.trim())
        .firstWhere((s) => s.isNotEmpty, orElse: () => "Task mới");
    var n = line.replaceAll(RegExp(r"^(bây giờ|thì|là|có)\s+", caseSensitive: false), "");
    if (n.length > 60) n = "${n.substring(0, 57)}…";
    return n.isEmpty ? "Task mới" : n[0].toUpperCase() + n.substring(1);
  }

  bool get _missingPriority => _important == null || _urgent == null;
  bool get _missingDeadline => _deadline == null;
  bool get _missingUnit => _unit == null || _unit!.isEmpty;
  bool get _missingOwner =>
      _ownerUserId == null || _owner == null || _owner!.trim().isEmpty;

  bool _resolvedOwnerOnce = false;

  UserAccount? _matchLeader(AppState state, String? label) {
    final raw = (label ?? "").trim();
    if (raw.isEmpty) return null;
    final compact = raw.toLowerCase().replaceAll(RegExp(r"\s+"), "");
    for (final u in state.leaders) {
      final dn = u.displayName.toLowerCase().replaceAll(RegExp(r"\s+"), "");
      final un = u.username.toLowerCase().replaceAll(RegExp(r"\s+"), "");
      if (dn == compact || un == compact) return u;
      if (dn.contains(compact) || un.contains(compact) || compact.contains(un)) {
        return u;
      }
    }
    return null;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_resolvedOwnerOnce) return;
    _resolvedOwnerOnce = true;
    final state = context.read<AppState>();
    // Prefer prefill (Leader đang mở lịch) over AI nickname that may not match.
    final candidate = widget.prefillOwner?.trim().isNotEmpty == true
        ? widget.prefillOwner
        : _owner;
    final hit = _matchLeader(state, candidate) ?? _matchLeader(state, _owner);
    if (hit != null) {
      _owner = hit.displayName.isNotEmpty ? hit.displayName : hit.username;
      _ownerUserId = hit.id;
      _askAddOwner = false;
    } else {
      // Drop unresolved AI owner so we don't silently assign to Admin.
      if (_owner != null && _matchLeader(state, _owner) == null) {
        _owner = widget.prefillOwner;
      }
      final pre = _matchLeader(state, widget.prefillOwner);
      if (pre != null) {
        _owner = pre.displayName.isNotEmpty ? pre.displayName : pre.username;
        _ownerUserId = pre.id;
        _askAddOwner = false;
      } else {
        _ownerUserId = null;
        _askAddOwner = true;
      }
    }
  }

  String get _quadrant {
    if (_important == null || _urgent == null) return "—";
    if (_important! && _urgent!) return "DO NOW";
    if (_important!) return "PLAN";
    if (_urgent!) return "QUICK ACTION";
    return "BACKLOG";
  }

  Future<void> _pickDeadline() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _deadline ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null) return;
    setState(() => _deadline = picked);
  }

  Future<void> _confirm() async {
    if (_submitting) return;
    final name = _name.text.trim();
    final content = _content.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Chưa có tên task — sửa ô Tên trước khi gửi")),
      );
      return;
    }
    if (content.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Chưa có nội dung task")),
      );
      return;
    }
    if (_missingUnit) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Chọn Phân khu")),
      );
      return;
    }
    if (_missingPriority) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Chọn Important & Urgent (script chưa nêu rõ)")),
      );
      return;
    }
    if (_missingDeadline) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Chọn Deadline (script chưa nêu ngày)")),
      );
      return;
    }
    if (_missingOwner) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Chọn Owner (người phụ trách) trong danh sách")),
      );
      return;
    }

    final state = context.read<AppState>();
    final owner = _owner!.trim();

    setState(() => _submitting = true);
    try {
      final cost = widget.task["requiresCostApproval"] == true;
      final desc = [
        content,
        if (widget.scripts.isNotEmpty)
          "Voice scripts:\n${widget.scripts.asMap().entries.map((e) => "${e.key + 1}. ${e.value}").join("\n")}",
        if (cost)
          "COST_APPROVAL_REQUIRED: ${widget.task["costNote"] ?? "Có yếu tố chi phí — staff gửi đề xuất để Admin duyệt."}",
      ].join("\n\n");

      await state.createProject({
        "name": name,
        "description": desc,
        "category": widget.task["category"],
        "owner": owner,
        "ownerUserId": _ownerUserId,
        "unitName": _unit,
        "important": _important,
        "urgent": _urgent,
        "expectedResult": content.length > 200 ? content.substring(0, 200) : content,
        "proofRequired": false,
        "deadline": _ymd(_deadline!),
        "collaboratorUserIds": <String>[],
      });
      if (!mounted) return;
      Navigator.of(context).pop(); // về lịch Leader
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Đã xác nhận · gửi task cho staff")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _row(String label, Widget value, {bool missing = false}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: missing ? const Color(0xFFFFF7ED) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: missing ? const Color(0xFFFDBA74) : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: missing ? const Color(0xFFC2410C) : OasisTheme.muted,
                ),
              ),
              if (missing) ...[
                const SizedBox(width: 6),
                const Text(
                  "Cần bổ sung",
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFC2410C),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          value,
        ],
      ),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _content.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final leaders = context.watch<AppState>().leaders;
    final cost = widget.task["requiresCostApproval"] == true;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      appBar: AppBar(
        title: const Text(
          "Tổng hợp AI",
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              "AI đã đọc ${widget.scripts.length} script"
              "${widget.aiSource != null ? " · nguồn: ${widget.aiSource}" : ""}.\n"
              "Kiểm tra bảng dưới — chỗ thiếu sẽ hỏi bạn — rồi xác nhận gửi staff.",
              style: const TextStyle(fontSize: 13, height: 1.4, fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 14),
          _row(
            "TÊN TASK (tự gen nếu user không nói)",
            TextField(
              controller: _name,
              decoration: const InputDecoration(
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
          ),
          _row(
            "NỘI DUNG TASK (script dài → nội dung)",
            TextField(
              controller: _content,
              maxLines: 6,
              decoration: const InputDecoration(
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
          ),
          _row(
            "PHÂN KHU",
            DropdownButtonFormField<String>(
              value: _unit,
              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
              items: units
                  .map((u) => DropdownMenuItem(value: u, child: Text(u)))
                  .toList(),
              onChanged: (v) => setState(() => _unit = v),
              hint: const Text("Chọn phân khu"),
            ),
            missing: _missingUnit,
          ),
          _row(
            "NGƯỜI PHỤ TRÁCH (Owner)",
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_askAddOwner)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Text(
                      "Script chưa rõ người phụ trách — bạn có muốn thêm Owner không?",
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                Builder(
                  builder: (context) {
                    final ownerValue = _ownerUserId ?? "";
                    return DropdownButtonFormField<String>(
                      value: ownerValue.isEmpty ? "" : ownerValue,
                      decoration: const InputDecoration(
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: "",
                          child: Text("— Chưa chọn —"),
                        ),
                        ...leaders.map((u) {
                          final label = u.displayName.isNotEmpty
                              ? u.displayName
                              : u.username;
                          return DropdownMenuItem(
                            value: u.id,
                            child: Text(label),
                          );
                        }),
                      ],
                      onChanged: (v) => setState(() {
                        if (v == null || v.isEmpty) {
                          _owner = null;
                          _ownerUserId = null;
                          return;
                        }
                        final u = leaders.where((e) => e.id == v).firstOrNull;
                        _ownerUserId = v;
                        _owner = u == null
                            ? null
                            : (u.displayName.isNotEmpty
                                ? u.displayName
                                : u.username);
                      }),
                    );
                  },
                ),
              ],
            ),
            missing: _missingOwner,
          ),
          _row(
            "PRIORITY · Result: $_quadrant",
            Column(
              children: [
                if (_missingPriority)
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Text(
                        "Script chưa nêu mức độ — chọn giúp:",
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                Row(
                  children: [
                    const SizedBox(
                      width: 88,
                      child: Text("Important", style: TextStyle(fontSize: 12)),
                    ),
                    ChoiceChip(
                      label: const Text("Yes"),
                      selected: _important == true,
                      onSelected: (_) => setState(() => _important = true),
                    ),
                    const SizedBox(width: 6),
                    ChoiceChip(
                      label: const Text("No"),
                      selected: _important == false,
                      onSelected: (_) => setState(() => _important = false),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const SizedBox(
                      width: 88,
                      child: Text("Urgent", style: TextStyle(fontSize: 12)),
                    ),
                    ChoiceChip(
                      label: const Text("Yes"),
                      selected: _urgent == true,
                      onSelected: (_) => setState(() => _urgent = true),
                    ),
                    const SizedBox(width: 6),
                    ChoiceChip(
                      label: const Text("No"),
                      selected: _urgent == false,
                      onSelected: (_) => setState(() => _urgent = false),
                    ),
                  ],
                ),
              ],
            ),
            missing: _missingPriority,
          ),
          _row(
            "DEADLINE",
            InkWell(
              onTap: _pickDeadline,
              child: InputDecorator(
                decoration: const InputDecoration(
                  isDense: true,
                  border: OutlineInputBorder(),
                  suffixIcon: Icon(Icons.calendar_today, size: 18),
                ),
                child: Text(
                  _deadline == null ? "Chưa có — bấm chọn ngày" : _ymd(_deadline!),
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: _deadline == null ? OasisTheme.muted : OasisTheme.ink,
                  ),
                ),
              ),
            ),
            missing: _missingDeadline,
          ),
          if (cost)
            _row(
              "CHI PHÍ",
              Text(
                widget.task["costNote"]?.toString() ??
                    "Có yếu tố chi phí — staff sẽ gửi đề xuất để Admin duyệt.",
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: FilledButton(
            onPressed: _submitting ? null : _confirm,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: const Color(0xFFFF9F43),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: _submitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text(
                    "Xác nhận · gửi cho staff",
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                  ),
          ),
        ),
      ),
    );
  }
}
