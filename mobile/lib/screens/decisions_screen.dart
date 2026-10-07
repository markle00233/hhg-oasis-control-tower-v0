import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../controller_utils.dart";
import "../theme.dart";
import "task_detail_screen.dart";

class DecisionsScreen extends StatelessWidget {
  const DecisionsScreen({super.key});

  String _statusVi(String? s) {
    switch (s) {
      case "APPROVED":
        return "Đã duyệt";
      case "REJECTED":
        return "Từ chối";
      case "NEEDS_INFO":
        return "Cần bổ sung";
      default:
        return "Chờ duyệt";
    }
  }

  String _moneyLabel(String? raw) {
    if (raw == null || raw.trim().isEmpty) return "";
    final digits = raw.replaceAll(RegExp(r"[^\d]"), "");
    final n = num.tryParse(digits);
    if (n == null || n <= 0) return raw;
    final s = n.toStringAsFixed(0);
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      final fromEnd = s.length - i;
      buf.write(s[i]);
      if (fromEnd > 1 && fromEnd % 3 == 1) buf.write(".");
    }
    return "${buf.toString()}đ";
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = state.decisions;
    final isAdmin = state.user?.isAdmin == true;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: "decisionsFab",
        onPressed: () => _openCreate(context),
        icon: const Icon(Icons.add),
        label: const Text("Yêu cầu duyệt"),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await state.loadDecisions();
        },
        child: list.isEmpty
            ? ListView(children: [
                const SizedBox(height: 80),
                Center(
                  child: Text(
                    state.backgroundLoading ? "Đang tải quyết định…" : "Chưa có quyết định",
                    style: const TextStyle(color: OasisTheme.muted),
                  ),
                ),
              ])
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final d = list[i];
                  final project = d["linkedProject"] as Map?;
                  final projectId = d["linkedProjectId"]?.toString();
                  final blocking = d["isBlocking"] == true;
                  final status = d["status"]?.toString() ?? "PENDING";
                  final pending = status == "PENDING";
                  final amount = _moneyLabel(d["amountLabel"]?.toString());
                  final proposer = d["proposer"]?.toString() ?? "—";
                  final unit = d["impact"]?.toString();
                  final isCost = (d["title"]?.toString() ?? "").startsWith("Chi phí đề xuất") ||
                      (d["description"]?.toString() ?? "").contains("COST_PROPOSAL");

                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  d["title"]?.toString() ?? "Quyết định",
                                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                                ),
                              ),
                              if (blocking)
                                const Icon(Icons.block, color: OasisTheme.red, size: 18),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            "${d["code"] ?? ""} · ${_statusVi(status)}"
                            "${project != null ? " · ${project["name"]}" : ""}",
                            style: const TextStyle(fontSize: 12, color: OasisTheme.muted),
                          ),
                          if (isCost) ...[
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 6,
                              children: [
                                _chip(Icons.person_outline, "Đề xuất: $proposer"),
                                if (unit != null && unit.isNotEmpty)
                                  _chip(Icons.place_outlined, "Khu: $unit"),
                                if (amount.isNotEmpty) _chip(Icons.payments_outlined, amount),
                              ],
                            ),
                          ],
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              if (projectId != null && projectId.isNotEmpty)
                                TextButton(
                                  onPressed: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => TaskDetailScreen(projectId: projectId),
                                      ),
                                    );
                                  },
                                  child: const Text("Xem Task"),
                                ),
                              const Spacer(),
                              if (isAdmin && pending) ...[
                                TextButton(
                                  onPressed: () => _resolve(context, d["id"]?.toString() ?? "", "REJECTED"),
                                  child: const Text("Từ chối", style: TextStyle(color: OasisTheme.red)),
                                ),
                                FilledButton(
                                  onPressed: () => _resolve(context, d["id"]?.toString() ?? "", "APPROVED"),
                                  child: Text(isCost ? "Duyệt → Chi phí" : "Duyệt"),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }

  Widget _chip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: OasisTheme.muted),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Future<void> _resolve(BuildContext context, String id, String status) async {
    if (id.isEmpty) return;
    final state = context.read<AppState>();
    try {
      await state.resolveDecision(id, status);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(status == "APPROVED" ? "Đã duyệt" : "Đã từ chối"),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }

  Future<void> _openCreate(BuildContext context) => openDecisionCreateSheet(context);

  static Future<void> openCreateForProject(BuildContext context, String projectId) =>
      openDecisionCreateSheet(context, presetProjectId: projectId);
}

Future<void> openDecisionCreateSheet(BuildContext context, {String? presetProjectId}) async {
  final title = TextEditingController();
  final impact = TextEditingController();
  String? projectId = presetProjectId;
  bool blocking = true;
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
                  const Text("Yêu cầu quyết định", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 12),
                  TextField(controller: title, decoration: const InputDecoration(labelText: "Tiêu đề")),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String?>(
                    initialValue: projectId,
                    decoration: const InputDecoration(labelText: "Gắn Task"),
                    items: [
                      const DropdownMenuItem(value: null, child: Text("—")),
                      ...state.projects.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))),
                    ],
                    onChanged: (v) => setLocal(() => projectId = v),
                  ),
                  const SizedBox(height: 10),
                  TextField(controller: impact, maxLines: 2, decoration: const InputDecoration(labelText: "Tác động nếu chưa quyết")),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text("Đang chặn Task"),
                    value: blocking,
                    onChanged: (v) => setLocal(() => blocking = v),
                  ),
                  FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Gửi yêu cầu")),
                ],
              ),
            );
          },
        ),
      );
    },
  );

  final t = title.text.trim();
  final imp = impact.text.trim();
  disposeControllersAfterFrame([title, impact]);
  if (ok != true) return;
  if (t.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nhập tiêu đề")));
    return;
  }
  try {
    await state.createDecision({
      "title": t,
      "impact": imp.isEmpty ? null : imp,
      "isBlocking": blocking,
      "linkedProjectId": projectId,
      "proposer": state.user?.displayName ?? state.user?.username,
    });
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã gửi yêu cầu duyệt")));
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
  }
}
