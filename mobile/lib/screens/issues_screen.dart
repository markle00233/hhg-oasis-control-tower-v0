import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../controller_utils.dart";
import "../theme.dart";

class IssuesScreen extends StatelessWidget {
  const IssuesScreen({super.key});

  String _statusVi(String? s) {
    switch (s) {
      case "RESOLVED":
      case "CLOSED":
        return "Đã xử lý";
      case "IN_PROGRESS":
        return "Đang xử lý";
      default:
        return "Mở";
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = state.issues;

    return Scaffold(
      appBar: AppBar(title: const Text("Vấn đề")),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: "issuesFab",
        onPressed: () => _openCreate(context),
        icon: const Icon(Icons.add),
        label: const Text("Báo vấn đề"),
      ),
      body: RefreshIndicator(
        onRefresh: state.refresh,
        child: list.isEmpty
            ? ListView(children: const [
                SizedBox(height: 80),
                Center(child: Text("Chưa có vấn đề", style: TextStyle(color: OasisTheme.muted))),
              ])
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final issue = list[i];
                  final unit = issue["unit"] is Map ? (issue["unit"] as Map)["name"] : null;
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(
                        issue["category"]?.toString() ?? "Vấn đề",
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        [
                          _statusVi(issue["status"]?.toString()),
                          if (unit != null) unit.toString(),
                          if (issue["areaLabel"] != null) issue["areaLabel"].toString(),
                          if (issue["note"] != null && issue["note"].toString().isNotEmpty)
                            issue["note"].toString(),
                        ].join(" · "),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _openCreate(BuildContext context) async {
    final category = TextEditingController();
    final note = TextEditingController();
    final area = TextEditingController();
    String? unit;
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
                    const Text("Báo vấn đề", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 12),
                    TextField(
                      controller: category,
                      decoration: const InputDecoration(labelText: "Loại / tiêu đề vấn đề"),
                    ),
                    const SizedBox(height: 10),
                    TextField(controller: note, maxLines: 3, decoration: const InputDecoration(labelText: "Mô tả")),
                    const SizedBox(height: 10),
                    TextField(controller: area, decoration: const InputDecoration(labelText: "Khu vực (tuỳ chọn)")),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String?>(
                      initialValue: unit,
                      decoration: const InputDecoration(labelText: "Phân khu"),
                      items: [
                        const DropdownMenuItem(value: null, child: Text("—")),
                        ...AppState.unitNames.map((u) => DropdownMenuItem(value: u, child: Text(u))),
                      ],
                      onChanged: (v) => setLocal(() => unit = v),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Gửi")),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    final cat = category.text.trim();
    final n = note.text.trim();
    final a = area.text.trim();
    disposeControllersAfterFrame([category, note, area]);
    if (ok != true) return;
    if (cat.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nhập loại vấn đề")));
      return;
    }
    try {
      await state.createIssue({
        "category": cat,
        "note": n.isEmpty ? null : n,
        "areaLabel": a.isEmpty ? null : a,
        "unitName": unit,
      });
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã báo vấn đề")));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }
}
