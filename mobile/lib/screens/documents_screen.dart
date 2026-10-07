import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../config.dart";
import "../theme.dart";
import "task_detail_screen.dart";

class DocumentsScreen extends StatelessWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = state.documents;

    return RefreshIndicator(
      onRefresh: state.refresh,
      child: list.isEmpty
          ? ListView(children: const [
              SizedBox(height: 80),
              Center(child: Text("Chưa có tài liệu", style: TextStyle(color: OasisTheme.muted))),
            ])
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: list.length,
              itemBuilder: (context, i) {
                final d = list[i];
                final links = d["links"] as List? ?? [];
                String? projectId;
                for (final link in links.whereType<Map>()) {
                  final pid = link["projectId"]?.toString();
                  if (pid != null && pid.isNotEmpty) {
                    projectId = pid;
                    break;
                  }
                  if (link["entityType"]?.toString() == "PROJECT") {
                    projectId = link["entityId"]?.toString();
                    break;
                  }
                }
                final unit = d["unit"] is Map ? (d["unit"] as Map)["name"] : null;
                final storage = d["storageUrl"]?.toString();
                final fullUrl = storage == null || storage.isEmpty
                    ? null
                    : storage.startsWith("http")
                        ? storage
                        : "${AppConfig.apiBaseUrl.replaceAll(RegExp(r"/$"), "")}$storage";

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.description_outlined),
                    title: Text(
                      d["fileName"]?.toString() ?? d["code"]?.toString() ?? "Tài liệu",
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      [
                        if (d["code"] != null) d["code"].toString(),
                        if (unit != null) unit.toString(),
                        if (d["createdAt"] != null) d["createdAt"].toString().split("T").first,
                        if (fullUrl != null) "Có file",
                      ].join(" · "),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: projectId == null || projectId.isEmpty
                        ? null
                        : () {
                            Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => TaskDetailScreen(projectId: projectId!)),
                            );
                          },
                  ),
                );
              },
            ),
    );
  }
}
