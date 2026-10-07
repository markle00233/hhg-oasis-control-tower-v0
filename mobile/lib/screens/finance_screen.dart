import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../controller_utils.dart";
import "../theme.dart";

class FinanceScreen extends StatelessWidget {
  const FinanceScreen({super.key});

  String _money(num n) => n <= 0 ? "—" : "${(n / 1e6).toStringAsFixed(1)} tr";

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = state.dailyCloses;

    return Scaffold(
      appBar: AppBar(title: const Text("Chốt ngày")),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: "financeFab",
        onPressed: () => _openCreate(context),
        icon: const Icon(Icons.add),
        label: const Text("Nhập chốt ngày"),
      ),
      body: RefreshIndicator(
        onRefresh: state.refresh,
        child: list.isEmpty
            ? ListView(children: const [
                SizedBox(height: 80),
                Center(child: Text("Chưa có chốt ngày", style: TextStyle(color: OasisTheme.muted))),
              ])
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                itemCount: list.length,
                itemBuilder: (context, i) {
                  final d = list[i];
                  final date = (d["date"]?.toString() ?? "").split("T").first;
                  final revenue = (d["revenue"] as num?) ?? 0;
                  final cash = (d["cashCollected"] as num?) ?? revenue;
                  final unit = d["unit"] is Map ? (d["unit"] as Map)["name"] : d["unitName"];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text("$date · ${unit ?? "—"}", style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                        "DT ${_money(revenue)} · Tiền mặt ${_money(cash)}"
                        "${d["note"] != null && d["note"].toString().isNotEmpty ? " · ${d["note"]}" : ""}",
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _openCreate(BuildContext context) async {
    final revenue = TextEditingController();
    final cash = TextEditingController();
    final note = TextEditingController();
    String? unit = AppState.unitNames.first;
    final today = DateTime.now();
    final dateCtrl = TextEditingController(
      text:
          "${today.year}-${today.month.toString().padLeft(2, "0")}-${today.day.toString().padLeft(2, "0")}",
    );
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
                    const Text("Nhập chốt ngày", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 12),
                    TextField(controller: dateCtrl, decoration: const InputDecoration(labelText: "Ngày (YYYY-MM-DD)")),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: unit,
                      decoration: const InputDecoration(labelText: "Phân khu"),
                      items: AppState.unitNames.map((u) => DropdownMenuItem(value: u, child: Text(u))).toList(),
                      onChanged: (v) => setLocal(() => unit = v),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: revenue,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: "Doanh thu (VND)"),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: cash,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: "Tiền mặt thu (VND)"),
                    ),
                    const SizedBox(height: 10),
                    TextField(controller: note, maxLines: 2, decoration: const InputDecoration(labelText: "Ghi chú")),
                    const SizedBox(height: 14),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Lưu")),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    final date = dateCtrl.text.trim();
    final rev = num.tryParse(revenue.text.trim());
    final cashVal = num.tryParse(cash.text.trim());
    final n = note.text.trim();
    disposeControllersAfterFrame([dateCtrl, revenue, cash, note]);
    if (ok != true) return;
    if (date.isEmpty || unit == null || rev == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nhập ngày, phân khu và doanh thu")));
      return;
    }
    try {
      await state.createDailyClose({
        "date": date,
        "unitName": unit,
        "revenue": rev,
        "cashCollected": cashVal ?? rev,
        "note": n.isEmpty ? null : n,
      });
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã lưu chốt ngày")));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }
}
