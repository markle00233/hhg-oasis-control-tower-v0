import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../controller_utils.dart";
import "../theme.dart";
import "task_detail_screen.dart";

class ExpensesScreen extends StatelessWidget {
  const ExpensesScreen({super.key});

  String _money(num n) {
    if (n <= 0) return "—";
    final s = n.toStringAsFixed(0);
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      final fromEnd = s.length - i;
      buf.write(s[i]);
      if (fromEnd > 1 && fromEnd % 3 == 1) buf.write(".");
    }
    return "${buf.toString()}đ";
  }

  String _statusVi(String? s) {
    switch (s) {
      case "RECONCILED":
        return "Đã đối chiếu";
      case "LOCKED":
        return "Đã chốt";
      default:
        return "Tạm ghi nhận";
    }
  }

  String _proposerOf(Map<String, dynamic> e) {
    final source = e["source"]?.toString() ?? "";
    if (source.startsWith("Đề xuất:")) {
      return source.substring("Đề xuất:".length).trim();
    }
    final content = e["content"]?.toString() ?? "";
    final m = RegExp(r"^(.+?)\s+đề xuất").firstMatch(content);
    if (m != null) return m.group(1)!.trim();
    return "—";
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = state.expenses;
    final total = list.fold<num>(0, (s, e) => s + ((e["amount"] as num?) ?? 0));
    final byUnit = <String, num>{};
    for (final e in list) {
      final unit = e["unit"]?["name"]?.toString() ?? "Chưa phân khu";
      byUnit[unit] = (byUnit[unit] ?? 0) + ((e["amount"] as num?) ?? 0);
    }
    final unitEntries = byUnit.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: "expensesFab",
        onPressed: () => _openCreate(context),
        icon: const Icon(Icons.add),
        label: const Text("Ghi chi phí"),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await state.loadExpenses();
        },
        child: list.isEmpty
            ? ListView(children: [
                const SizedBox(height: 80),
                Center(
                  child: Text(
                    state.backgroundLoading ? "Đang tải chi phí…" : "Chưa có chi phí",
                    style: const TextStyle(color: OasisTheme.muted),
                  ),
                ),
              ])
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                itemCount: list.length + 1,
                itemBuilder: (context, i) {
                  if (i == 0) {
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      color: const Color(0xFF0F172A),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              "Tổng chi phí",
                              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _money(total),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 26,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5,
                              ),
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              "Theo phân khu",
                              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 8),
                            ...unitEntries.map(
                              (e) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        e.key,
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                    Text(
                                      _money(e.value),
                                      style: const TextStyle(color: Color(0xFFCBD5E1), fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  final e = list[i - 1];
                  final amount = (e["amount"] as num?)?.toDouble() ?? 0;
                  final linked = e["linkedProject"] as Map?;
                  final linkedId = e["linkedProjectId"]?.toString();
                  final unitName = e["unit"]?["name"]?.toString() ?? "—";
                  final proposer = _proposerOf(e);

                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(
                        e["content"]?.toString() ?? e["categoryLabel"]?.toString() ?? "Chi phí",
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        "Đề xuất: $proposer · Khu: $unitName · ${_statusVi(e["status"]?.toString())}"
                        "${linked != null ? " · ${linked["name"]}" : ""}",
                      ),
                      trailing: Text(_money(amount), style: const TextStyle(fontWeight: FontWeight.w800)),
                      onTap: linkedId == null || linkedId.isEmpty
                          ? null
                          : () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => TaskDetailScreen(projectId: linkedId),
                                ),
                              );
                            },
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _openCreate(BuildContext context) async {
    final content = TextEditingController();
    final amount = TextEditingController();
    String? unit;
    String? projectId;
    String category = "Vận hành thường xuyên";
    final state = context.read<AppState>();

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
                    const Text("Ghi chi phí", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 12),
                    TextField(controller: content, decoration: const InputDecoration(labelText: "Nội dung")),
                    const SizedBox(height: 10),
                    TextField(
                      controller: amount,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: "Số tiền (VND)"),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String?>(
                      initialValue: unit,
                      decoration: const InputDecoration(labelText: "Phân khu"),
                      items: [
                        const DropdownMenuItem(value: null, child: Text("Chưa xác định")),
                        ...AppState.unitNames.map((u) => DropdownMenuItem(value: u, child: Text(u))),
                      ],
                      onChanged: (v) => setLocal(() => unit = v),
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
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String?>(
                      initialValue: projectId,
                      decoration: InputDecoration(
                        labelText: state.user?.isAdmin == true
                            ? "Gắn Task (tuỳ chọn)"
                            : "Gắn Task (bắt buộc)",
                        helperText: state.projects.isEmpty
                            ? "Chưa có Task — Admin cần giao Task trước"
                            : null,
                      ),
                      items: [
                        if (state.user?.isAdmin == true)
                          const DropdownMenuItem(value: null, child: Text("— Chưa xác định —")),
                        ...state.projects.map(
                          (p) => DropdownMenuItem(value: p.id, child: Text(p.name)),
                        ),
                      ],
                      onChanged: state.projects.isEmpty
                          ? null
                          : (v) => setLocal(() => projectId = v),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text("Ghi nhận"),
                    ),
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
    if (state.user?.isAdmin != true && (projectId == null || projectId!.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Staff phải gắn chi phí với Task mình đang tham gia"),
        ),
      );
      return;
    }
    try {
      await state.createExpense({
        "content": text,
        "amount": amt,
        "unitName": unit,
        "categoryLabel": category,
        "linkedProjectId": projectId,
        "humanConfirmed": true,
        "source": "Mobile:${state.user?.displayName ?? state.user?.username ?? ""}",
      });
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã ghi chi phí")));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }
}
