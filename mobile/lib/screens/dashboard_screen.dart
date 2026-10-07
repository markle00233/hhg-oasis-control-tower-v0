import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";
import "task_detail_screen.dart";

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final s = state.dashboard?.summary;
    final projects = state.projects.take(8).toList();

    return RefreshIndicator(
      onRefresh: state.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            "Xin chào, ${state.user?.displayName ?? state.user?.username ?? ""}",
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            state.dashboard?.date != null
                ? "Ngày vận hành · ${state.dashboard!.date}"
                : "Đồng bộ từ Control Tower",
            style: const TextStyle(color: OasisTheme.muted, fontSize: 12),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MetricCard(
                label: "Doanh thu",
                value: _money(s?["revenue"]),
              ),
              _MetricCard(
                label: "Chi phí",
                value: _money(s?["expenseTotal"]),
              ),
              _MetricCard(
                label: "Task của tôi",
                value: "${state.projects.length}",
              ),
              _MetricCard(
                label: "Quyết định",
                value: "${state.dashboard?.decisions.length ?? 0}",
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Text("Task gần đây", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 10),
          if (projects.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text("Chưa có Task", style: TextStyle(color: OasisTheme.muted)),
              ),
            )
          else
            ...projects.map((p) => _TaskTile(project: p)),
        ],
      ),
    );
  }

  static String _money(dynamic v) {
    final n = (v as num?)?.toDouble() ?? 0;
    if (n <= 0) return "—";
    return "${(n / 1e6).toStringAsFixed(1)} tr";
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: (MediaQuery.of(context).size.width - 42) / 2,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, color: OasisTheme.muted, letterSpacing: 0.6)),
              const SizedBox(height: 8),
              Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({required this.project});
  final OasisProject project;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(project.name, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text("${project.priority} · ${project.statusVi} · ${project.energy}%"),
        trailing: SizedBox(
          width: 72,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text("${project.energy}%", style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: project.energy / 100,
                  minHeight: 6,
                  backgroundColor: const Color(0xFFE8EDE9),
                  color: OasisTheme.green,
                ),
              ),
            ],
          ),
        ),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => TaskDetailScreen(projectId: project.id)),
          );
        },
      ),
    );
  }
}
