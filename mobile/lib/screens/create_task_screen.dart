import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../theme.dart";

class CreateTaskScreen extends StatefulWidget {
  const CreateTaskScreen({
    super.key,
    this.assignMode = false,
    this.prefillOwner,
    this.prefillDeadline,
    this.aiPrefill,
    this.voiceScripts,
  });

  /// Dark Admin assign sheet (Leaders FAB).
  final bool assignMode;
  final String? prefillOwner;
  final DateTime? prefillDeadline;
  /// Kết quả /api/ai/parse-task → tự điền form manual.
  final Map<String, dynamic>? aiPrefill;
  final List<String>? voiceScripts;

  @override
  State<CreateTaskScreen> createState() => _CreateTaskScreenState();
}

class _CreateTaskScreenState extends State<CreateTaskScreen> {
  final _name = TextEditingController();
  final _objective = TextEditingController();
  final _brief = TextEditingController();
  final _expected = TextEditingController();
  final _acceptance = TextEditingController();
  final _proofDesc = TextEditingController();
  final _category = TextEditingController();
  final _docLink = TextEditingController();
  bool? _important;
  bool? _urgent;
  bool _proofRequired = false;
  String? _unit;
  String? _ownerLabel;
  String? _reviewerUserId;
  final Set<String> _collabIds = {};
  int? _estMinutes;
  DateTime? _deadline;
  DateTime? _startDate;
  bool _submitting = false;
  bool _requiresCostApproval = false;
  String? _costNote;

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

  String get _quadrant {
    if (_important == null || _urgent == null) return "—";
    if (_important! && _urgent!) return "DO NOW";
    if (_important!) return "PLAN";
    if (_urgent!) return "QUICK ACTION";
    return "BACKLOG";
  }

  String _ymd(DateTime d) =>
      "${d.year.toString().padLeft(4, "0")}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}";

  @override
  void initState() {
    super.initState();
    _ownerLabel = widget.prefillOwner;
    _deadline = widget.prefillDeadline;
    _startDate = widget.prefillDeadline;
    _applyAiPrefill(widget.aiPrefill);
  }

  void _applyAiPrefill(Map<String, dynamic>? p) {
    if (p == null || p.isEmpty) return;
    // Merge heuristic từ scripts gốc (phòng AI/model bỏ sót VN).
    final merged = Map<String, dynamic>.from(p);
    _enrichFromScripts(merged, widget.voiceScripts ?? const []);

    final name = merged["name"]?.toString().trim() ?? "";
    final objective = merged["objective"]?.toString().trim() ?? "";
    final brief = merged["brief"]?.toString().trim() ?? "";
    if (name.isNotEmpty) _name.text = name;
    if (objective.isNotEmpty) _objective.text = objective;
    if (brief.isNotEmpty) _brief.text = brief;
    final unit = merged["unitName"]?.toString();
    if (unit != null && units.contains(unit)) _unit = unit;
    final cat = merged["category"]?.toString().trim() ?? "";
    if (cat.isNotEmpty) _category.text = cat;
    final owner = merged["owner"]?.toString().trim();
    if (owner != null && owner.isNotEmpty) _ownerLabel = owner;
    if (merged["important"] is bool) _important = merged["important"] as bool;
    if (merged["urgent"] is bool) _urgent = merged["urgent"] as bool;
    final mins = merged["estimatedDurationMinutes"];
    if (mins is num) _estMinutes = mins.round();
    final dl = merged["deadline"]?.toString();
    if (dl != null && RegExp(r"^\d{4}-\d{2}-\d{2}$").hasMatch(dl)) {
      // AI/script deadline thắng ngày đang chọn trên lịch.
      _deadline = DateTime.tryParse(dl);
      _startDate ??= _deadline;
    }
    _requiresCostApproval = merged["requiresCostApproval"] == true;
    _costNote = merged["costNote"]?.toString();
  }

  void _enrichFromScripts(Map<String, dynamic> task, List<String> scripts) {
    if (scripts.isEmpty) return;
    final joined = scripts.join("\n");
    final lower = joined.toLowerCase();

    final both = RegExp(
      r"vừa\s+quan\s*trọng\s+mà\s+vừa\s+cần\s*thiết|vừa\s+quan\s*trọng.{0,40}vừa\s+cần\s*thiết",
      caseSensitive: false,
    ).hasMatch(joined);
    final important = both ||
        RegExp(r"quan\s*trọng|important|ưu tiên cao", caseSensitive: false)
            .hasMatch(lower);
    final urgent = both ||
        RegExp(
          r"khẩn\s*cấp|cần\s*thiết|gấp|urgent|asap|hôm nay",
          caseSensitive: false,
        ).hasMatch(lower);
    if (important) task["important"] = true;
    if (urgent) task["urgent"] = true;

    final m = RegExp(
      r"ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{2,4}))?",
      caseSensitive: false,
    ).firstMatch(joined);
    if (m != null) {
      final d = int.tryParse(m.group(1)!);
      final mo = int.tryParse(m.group(2)!);
      var y = m.group(3) != null
          ? int.tryParse(m.group(3)!)
          : DateTime.now().year;
      if (d != null && mo != null && y != null) {
        if (y < 100) y += 2000;
        final dl =
            "${y.toString().padLeft(4, "0")}-${mo.toString().padLeft(2, "0")}-${d.toString().padLeft(2, "0")}";
        task["deadline"] = dl;
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _objective.dispose();
    _brief.dispose();
    _expected.dispose();
    _acceptance.dispose();
    _proofDesc.dispose();
    _category.dispose();
    _docLink.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool deadline}) async {
    final now = DateTime.now();
    final initial = deadline ? (_deadline ?? now) : (_startDate ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null) return;
    setState(() {
      if (deadline) {
        _deadline = picked;
      } else {
        _startDate = picked;
      }
    });
  }

  Future<void> _save() async {
    if (_submitting) return;
    final state = context.read<AppState>();
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nhập tên Task")));
      return;
    }
    final objective = _objective.text.trim();
    final brief = _brief.text.trim();
    if (objective.isEmpty && brief.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nhập Mục tiêu / Objective")));
      return;
    }
    if (_unit == null || _unit!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Chọn Phân khu")));
      return;
    }
    if (_important == null || _urgent == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Chọn Important và Urgent")));
      return;
    }
    if (_deadline == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Chọn Deadline")));
      return;
    }
    // Section 5/6 ẩn tạm — fallback từ objective/brief.
    final expected = _expected.text.trim().isNotEmpty
        ? _expected.text.trim()
        : (objective.isNotEmpty ? objective : brief);

    String owner;
    if (state.user?.isAdmin == true) {
      owner = (_ownerLabel ?? "").trim();
      if (owner.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Chọn Owner")));
        return;
      }
    } else {
      owner = state.user?.displayName ?? state.user?.username ?? "";
    }

    final descParts = <String>[objective.isNotEmpty ? objective : brief];
    if (objective.isNotEmpty && brief.isNotEmpty) descParts.add(brief);
    if (_startDate != null) descParts.add("Start: ${_ymd(_startDate!)}");
    final doc = _docLink.text.trim();
    if (doc.isNotEmpty) descParts.add("Doc: $doc");
    final scripts = widget.voiceScripts ?? const <String>[];
    if (scripts.isNotEmpty) {
      descParts.add(
        "Voice scripts:\n${scripts.asMap().entries.map((e) => "${e.key + 1}. ${e.value}").join("\n")}",
      );
    }
    if (_requiresCostApproval) {
      descParts.add(
        "COST_APPROVAL_REQUIRED: ${_costNote ?? "Task liên quan chi phí — staff gửi đề xuất chi phí để Admin duyệt khi chia hạng mục."}",
      );
    }

    var expectedFull = expected;
    final acc = _acceptance.text.trim();
    if (acc.isNotEmpty) expectedFull += "\n\nĐiều kiện đạt: $acc";

    setState(() => _submitting = true);
    try {
      await state.createProject({
        "name": name,
        "description": descParts.join("\n\n"),
        "category": _category.text.trim().isEmpty ? null : _category.text.trim(),
        "owner": owner,
        "unitName": _unit,
        "important": _important,
        "urgent": _urgent,
        "expectedResult": expectedFull,
        "proofRequired": _proofRequired,
        "proofDescription": _proofDesc.text.trim().isEmpty ? null : _proofDesc.text.trim(),
        "estimatedDurationMinutes": _estMinutes,
        "deadline": _ymd(_deadline!),
        "collaboratorUserIds": _collabIds.toList(),
        if (_reviewerUserId != null && _reviewerUserId!.isNotEmpty) "reviewerUserId": _reviewerUserId,
      });
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã giao task")));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  InputDecoration _dec(String label, {bool dark = false}) {
    if (!dark) return InputDecoration(labelText: label);
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Color(0xFF9AA3AD), fontSize: 12),
      filled: true,
      fillColor: const Color(0xFF161B22),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF2A3340)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: OasisTheme.admBlue, width: 1.5),
      ),
    );
  }

  Widget _sec(String t, bool dark) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 8),
        child: Text(
          t,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
            color: dark ? OasisTheme.calAccent : OasisTheme.muted,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    // Offspots Create Task = light form.
    final dark = false; // keep flag for legacy dark styling helpers
    final leaders = state.leaders;
    final directory = state.directory;

    final body = ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
      children: [
        if (widget.aiPrefill != null) ...[
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF6EE7B7)),
            ),
            child: const Text(
              "AI đã điền form từ voice scripts — kiểm tra rồi bấm giao task.",
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
        ],
        if (_requiresCostApproval) ...[
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFFDBA74)),
            ),
            child: Text(
              _costNote ??
                  "Task có yếu tố chi phí — khi staff chia subtask hãy dùng «Gửi chi phí đề xuất» để Admin duyệt.",
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
        ],
        if (dark) ...[
          const Text(
            "New task",
            style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.5),
          ),
          const SizedBox(height: 4),
          const Text(
            "Giao việc cho Leader · chỉ ADMINISTRATION",
            style: TextStyle(color: Color(0xFF8B949E), fontSize: 12),
          ),
        ],
        _sec("1 · Thông tin Task", dark),
        TextField(
          controller: _name,
          style: dark ? const TextStyle(color: Colors.white) : null,
          decoration: _dec("Tên Task *", dark: dark),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _objective,
          maxLines: 2,
          style: dark ? const TextStyle(color: Colors.white) : null,
          decoration: _dec("Mục tiêu / Objective *", dark: dark),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _brief,
          maxLines: 2,
          style: dark ? const TextStyle(color: Colors.white) : null,
          decoration: _dec("Mô tả chi tiết / Brief", dark: dark),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<String?>(
          // ignore: deprecated_member_use
          value: _unit,
          dropdownColor: dark ? const Color(0xFF161B22) : null,
          style: dark ? const TextStyle(color: Colors.white) : null,
          decoration: _dec("Phân khu *", dark: dark),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text("—")),
            ...units.map((u) => DropdownMenuItem<String?>(value: u, child: Text(u))),
          ],
          onChanged: (v) => setState(() => _unit = v),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _category,
          style: dark ? const TextStyle(color: Colors.white) : null,
          decoration: _dec("Category", dark: dark),
        ),
        _sec("2 · Người chịu trách nhiệm", dark),
        if (state.user?.isAdmin == true)
          DropdownButtonFormField<String?>(
            // ignore: deprecated_member_use
            value: _ownerLabel,
            dropdownColor: dark ? const Color(0xFF161B22) : null,
            style: dark ? const TextStyle(color: Colors.white) : null,
            decoration: _dec("Owner *", dark: dark),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text("— Chọn —")),
              ...leaders.map((u) {
                final label = u.displayName.isNotEmpty ? u.displayName : u.username;
                return DropdownMenuItem<String?>(value: label, child: Text(label));
              }),
            ],
            onChanged: (v) => setState(() {
              _ownerLabel = v;
              final ownerUser = directory.where((u) {
                final lab = u.displayName.isNotEmpty ? u.displayName : u.username;
                return lab == v;
              }).firstOrNull;
              if (ownerUser != null) _collabIds.remove(ownerUser.id);
            }),
          )
        else
          Text(
            "Owner: ${state.user?.displayName ?? state.user?.username ?? "—"}",
            style: TextStyle(color: dark ? Colors.white70 : OasisTheme.muted, fontWeight: FontWeight.w600),
          ),
        const SizedBox(height: 10),
        if (state.user?.isAdmin == true) ...[
          DropdownButtonFormField<String?>(
            // ignore: deprecated_member_use
            value: _reviewerUserId,
            dropdownColor: dark ? const Color(0xFF161B22) : null,
            style: dark ? const TextStyle(color: Colors.white) : null,
            decoration: _dec("Reviewer (default: bạn)", dark: dark),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text("Default: người Assign")),
              ...directory.map(
                (u) => DropdownMenuItem<String?>(
                  value: u.id,
                  child: Text(u.displayName.isNotEmpty ? u.displayName : u.username),
                ),
              ),
            ],
            onChanged: (v) => setState(() => _reviewerUserId = v),
          ),
          const SizedBox(height: 10),
          Text("Collaborators", style: TextStyle(color: dark ? const Color(0xFF9AA3AD) : OasisTheme.muted, fontSize: 12)),
          const SizedBox(height: 6),
          ...directory.where((u) {
            final lab = u.displayName.isNotEmpty ? u.displayName : u.username;
            return lab != _ownerLabel && u.id != state.user?.id;
          }).map((u) {
            final lab = u.displayName.isNotEmpty ? u.displayName : u.username;
            return CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              activeColor: OasisTheme.admBlue,
              title: Text(lab, style: TextStyle(color: dark ? Colors.white : null, fontSize: 13)),
              value: _collabIds.contains(u.id),
              onChanged: (v) => setState(() {
                if (v == true) {
                  _collabIds.add(u.id);
                } else {
                  _collabIds.remove(u.id);
                }
              }),
            );
          }),
        ],
        _sec("3 · Mức độ ưu tiên", dark),
        Text("Important? *", style: TextStyle(color: dark ? Colors.white70 : null)),
        Row(
          children: [
            ChoiceChip(
              label: const Text("Yes"),
              selected: _important == true,
              selectedColor: OasisTheme.admBlue,
              labelStyle: TextStyle(color: _important == true ? Colors.white : (dark ? Colors.white70 : null)),
              onSelected: (_) => setState(() => _important = true),
            ),
            const SizedBox(width: 8),
            ChoiceChip(
              label: const Text("No"),
              selected: _important == false,
              selectedColor: OasisTheme.admBlue,
              labelStyle: TextStyle(color: _important == false ? Colors.white : (dark ? Colors.white70 : null)),
              onSelected: (_) => setState(() => _important = false),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text("Urgent? *", style: TextStyle(color: dark ? Colors.white70 : null)),
        Row(
          children: [
            ChoiceChip(
              label: const Text("Yes"),
              selected: _urgent == true,
              selectedColor: OasisTheme.admBlue,
              labelStyle: TextStyle(color: _urgent == true ? Colors.white : (dark ? Colors.white70 : null)),
              onSelected: (_) => setState(() => _urgent = true),
            ),
            const SizedBox(width: 8),
            ChoiceChip(
              label: const Text("No"),
              selected: _urgent == false,
              selectedColor: OasisTheme.admBlue,
              labelStyle: TextStyle(color: _urgent == false ? Colors.white : (dark ? Colors.white70 : null)),
              onSelected: (_) => setState(() => _urgent = false),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          "Result: $_quadrant",
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: dark ? const Color(0xFF9EF0C8) : OasisTheme.ink,
          ),
        ),
        _sec("4 · Thời gian", dark),
        ListTile(
          contentPadding: EdgeInsets.zero,
          textColor: dark ? Colors.white : null,
          iconColor: dark ? Colors.white70 : null,
          title: Text("Deadline *", style: TextStyle(color: dark ? Colors.white : null)),
          subtitle: Text(
            _deadline == null ? "Chưa chọn" : _ymd(_deadline!),
            style: TextStyle(color: dark ? Colors.white54 : OasisTheme.muted),
          ),
          trailing: Icon(Icons.calendar_today, color: dark ? Colors.white70 : null),
          onTap: () => _pickDate(deadline: true),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          textColor: dark ? Colors.white : null,
          iconColor: dark ? Colors.white70 : null,
          title: Text("Start date", style: TextStyle(color: dark ? Colors.white : null)),
          subtitle: Text(
            _startDate == null ? "Optional" : _ymd(_startDate!),
            style: TextStyle(color: dark ? Colors.white54 : OasisTheme.muted),
          ),
          trailing: Icon(Icons.event, color: dark ? Colors.white70 : null),
          onTap: () => _pickDate(deadline: false),
        ),
        DropdownButtonFormField<int?>(
          // ignore: deprecated_member_use
          value: _estMinutes,
          dropdownColor: dark ? const Color(0xFF161B22) : null,
          style: dark ? const TextStyle(color: Colors.white) : null,
          decoration: _dec("Estimated Duration", dark: dark),
          items: const [
            DropdownMenuItem(value: null, child: Text("— Nên có —")),
            DropdownMenuItem(value: 15, child: Text("15 min")),
            DropdownMenuItem(value: 30, child: Text("30 min")),
            DropdownMenuItem(value: 45, child: Text("45 min")),
            DropdownMenuItem(value: 60, child: Text("1h")),
            DropdownMenuItem(value: 120, child: Text("2h")),
            DropdownMenuItem(value: 240, child: Text("4h")),
            DropdownMenuItem(value: 480, child: Text("1 day (8h)")),
          ],
          onChanged: (v) => setState(() => _estMinutes = v),
        ),
        // 5 · Kết quả cần bàn giao — ẩn tạm (chưa cần)
        // 6 · Bằng chứng — ẩn tạm (chưa cần)
        _sec("5 · Tài liệu hỗ trợ", dark),
        TextField(
          controller: _docLink,
          style: dark ? const TextStyle(color: Colors.white) : null,
          decoration: _dec("Document / Link", dark: dark),
        ),
        const SizedBox(height: 22),
        FilledButton(
          style: dark
              ? FilledButton.styleFrom(
                  backgroundColor: OasisTheme.calAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                )
              : null,
          onPressed: _submitting ? null : _save,
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(
                  widget.assignMode ? "Create" : "Giao task",
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
        ),
        if (widget.assignMode)
          TextButton(
            onPressed: _submitting ? null : () => Navigator.pop(context),
            child: const Text("Cancel"),
          ),
      ],
    );

    if (dark) {
      return Scaffold(
        backgroundColor: Colors.black54,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Material(
                color: OasisTheme.admInk,
                borderRadius: BorderRadius.circular(32),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close, color: Colors.white70),
                      ),
                    ),
                    Expanded(child: body),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.assignMode ? "Create New Task" : "Assign Task",
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: body,
    );
  }
}
