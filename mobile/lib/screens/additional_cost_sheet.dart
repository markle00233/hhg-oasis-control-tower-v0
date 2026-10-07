import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";

/// Staff — form Additional Costs (Offspots).
class AdditionalCostSheet extends StatefulWidget {
  const AdditionalCostSheet({super.key, required this.project});
  final OasisProject project;

  @override
  State<AdditionalCostSheet> createState() => _AdditionalCostSheetState();
}

class _AdditionalCostSheetState extends State<AdditionalCostSheet> {
  final _name = TextEditingController();
  final _amount = TextEditingController();
  final _provider = TextEditingController();
  final _desc = TextEditingController();
  String? _category;
  String? _unit;
  bool _refund = false;
  bool _busy = false;

  static const _categories = [
    "Vận hành",
    "Marketing",
    "Nhân sự",
    "Mua sắm",
    "Khác",
  ];

  @override
  void initState() {
    super.initState();
    _unit = widget.project.unit?.name;
  }

  @override
  void dispose() {
    _name.dispose();
    _amount.dispose();
    _provider.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final name = _name.text.trim();
    final amount = num.tryParse(_amount.text.replaceAll(",", "").trim());
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nhập tên chi phí")));
      return;
    }
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Số tiền phải > 0")));
      return;
    }
    setState(() => _busy = true);
    try {
      final state = context.read<AppState>();
      final content = [
        name,
        if (_provider.text.trim().isNotEmpty) "NCC: ${_provider.text.trim()}",
        if (_desc.text.trim().isNotEmpty) _desc.text.trim(),
        if (_refund) "Refund request",
      ].join(" · ");

      final proposer = state.user?.displayName ?? state.user?.username ?? "";
      await state.createDecision({
        "title": "Chi phí đề xuất: $name",
        "description": "COST_PROPOSAL|$content|unit=${_unit ?? ""}|cat=${_category ?? ""}",
        "amountLabel": amount.toStringAsFixed(0),
        "impact": _unit,
        "isBlocking": false,
        "linkedProjectId": widget.project.id,
        "proposer": proposer,
      });

      if (!mounted) return;
      Navigator.pop(context, true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Đã gửi chi phí chờ Admin duyệt")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD0D7E2),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              "Additional Costs",
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: "Expense name"),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: "Amount of money (VND)",
                hintText: "500000",
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String?>(
              // ignore: deprecated_member_use
              value: _category,
              decoration: const InputDecoration(labelText: "Category"),
              items: [
                const DropdownMenuItem(value: null, child: Text("—")),
                ..._categories.map((c) => DropdownMenuItem(value: c, child: Text(c))),
              ],
              onChanged: (v) => setState(() => _category = v),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String?>(
              // ignore: deprecated_member_use
              value: _unit,
              decoration: const InputDecoration(labelText: "Unit"),
              items: [
                const DropdownMenuItem(value: null, child: Text("—")),
                ...AppState.unitNames.map((u) => DropdownMenuItem(value: u, child: Text(u))),
              ],
              onChanged: (v) => setState(() => _unit = v),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _provider,
              decoration: const InputDecoration(labelText: "Service provider"),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _desc,
              maxLines: 3,
              decoration: const InputDecoration(labelText: "Describe"),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text("Refund request", style: TextStyle(fontWeight: FontWeight.w700)),
              value: _refund,
              activeThumbColor: OasisTheme.admBlue,
              onChanged: (v) => setState(() => _refund = v),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: OasisTheme.admBlue,
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: Text(
                _busy ? "Đang gửi…" : "Add items",
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            TextButton(
              onPressed: _busy ? null : () => Navigator.pop(context),
              child: const Text("Cancel"),
            ),
          ],
        ),
      ),
    );
  }
}
