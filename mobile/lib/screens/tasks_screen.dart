import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";
import "create_task_screen.dart";
import "task_detail_screen.dart";

class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = state.visibleProjects;
    final now = DateTime.now();
    final monthLabel = _monthVi(now.month);

    return Scaffold(
      backgroundColor: OasisTheme.bg,
      floatingActionButton: FloatingActionButton(
        heroTag: "tasksListFab",
        onPressed: () async {
          final isAdmin = context.read<AppState>().user?.isAdmin == true;
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => CreateTaskScreen(assignMode: isAdmin),
            ),
          );
        },
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: _CalendarStrip(
              monthLabel: monthLabel,
              countLabel: list.isEmpty ? "" : "${list.length} Task",
              scope: state.scope,
              onScope: state.setScope,
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                _Pill(
                  label: "Quá hạn",
                  selected: state.filter == "overdue",
                  onTap: () => state.setFilter("overdue"),
                ),
                _Pill(
                  label: "Bị chặn",
                  selected: state.filter == "blocked",
                  onTap: () => state.setFilter("blocked"),
                ),
                _Pill(
                  label: "Hoàn tất",
                  selected: state.filter == "done",
                  onTap: () => state.setFilter("done"),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: "Tìm Task…",
              ),
              onChanged: state.setSearch,
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: state.refresh,
              child: list.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 80),
                        Center(child: Text("Chưa có Task", style: TextStyle(color: OasisTheme.muted))),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 88),
                      itemCount: list.length,
                      itemBuilder: (context, i) => TaskProjectCard(
                        project: list[i],
                        highlight: list[i].priority == "P0" || list[i].priority == "P1",
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  static String _monthVi(int m) {
    const names = [
      "",
      "Tháng 1",
      "Tháng 2",
      "Tháng 3",
      "Tháng 4",
      "Tháng 5",
      "Tháng 6",
      "Tháng 7",
      "Tháng 8",
      "Tháng 9",
      "Tháng 10",
      "Tháng 11",
      "Tháng 12",
    ];
    return names[m];
  }
}

class _CalendarStrip extends StatelessWidget {
  const _CalendarStrip({
    required this.monthLabel,
    required this.countLabel,
    required this.scope,
    required this.onScope,
  });

  final String monthLabel;
  final String countLabel;
  final TaskScope scope;
  final ValueChanged<TaskScope> onScope;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 18),
      decoration: BoxDecoration(
        color: OasisTheme.calAccent,
        borderRadius: BorderRadius.circular(OasisTheme.radiusCard),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Text(
                monthLabel,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
              ),
              const Icon(Icons.keyboard_arrow_down, color: Colors.white70, size: 20),
              const Spacer(),
              if (countLabel.isNotEmpty)
                Text(countLabel, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _CalDay(
                  dow: "Mine",
                  dom: "1",
                  selected: scope == TaskScope.mine,
                  onTap: () => onScope(TaskScope.mine),
                ),
              ),
              Expanded(
                child: _CalDay(
                  dow: "Join",
                  dom: "2",
                  selected: scope == TaskScope.collab,
                  onTap: () => onScope(TaskScope.collab),
                ),
              ),
              Expanded(
                child: _CalDay(
                  dow: "All",
                  dom: "3",
                  selected: scope == TaskScope.all,
                  onTap: () => onScope(TaskScope.all),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CalDay extends StatelessWidget {
  const _CalDay({
    required this.dow,
    required this.dom,
    required this.selected,
    required this.onTap,
  });

  final String dow;
  final String dom;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          children: [
            Text(
              dow,
              style: TextStyle(
                color: selected ? Colors.white : Colors.white70,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? Colors.white : Colors.transparent,
                shape: BoxShape.circle,
              ),
              child: Text(
                dom,
                style: TextStyle(
                  color: selected ? OasisTheme.calAccent : Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: selected ? OasisTheme.calAccent : OasisTheme.widgetBlue,
        borderRadius: BorderRadius.circular(OasisTheme.radiusPill),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(OasisTheme.radiusPill),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              label,
              style: TextStyle(
                color: selected ? Colors.white : OasisTheme.ink,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class TaskProjectCard extends StatelessWidget {
  const TaskProjectCard({super.key, required this.project, this.highlight = false});
  final OasisProject project;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final members = project.members;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: highlight ? OasisTheme.calYellow : OasisTheme.widgetBlue,
        borderRadius: BorderRadius.circular(OasisTheme.radiusCard),
        child: InkWell(
          borderRadius: BorderRadius.circular(OasisTheme.radiusCard),
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => TaskDetailScreen(projectId: project.id)),
            );
          },
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            "${project.priority} · ${project.statusVi}",
                            style: const TextStyle(color: OasisTheme.muted, fontSize: 11, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          Text(project.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                          const SizedBox(height: 4),
                          Text(
                            project.owner ?? "—",
                            style: const TextStyle(color: OasisTheme.muted, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    if (members.isNotEmpty) _AvatarStack(members: members),
                  ],
                ),
                const SizedBox(height: 14),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: project.energy / 100,
                    minHeight: 8,
                    backgroundColor: Colors.white,
                    color: OasisTheme.calAccent,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _MetaPill(
                            project.deadline?.isNotEmpty == true ? project.deadline! : "Chưa hạn",
                          ),
                          _MetaPill("${project.energy}%"),
                          if (project.unit?.name.isNotEmpty == true) _MetaPill(project.unit!.name),
                        ],
                      ),
                    ),
                    Material(
                      color: OasisTheme.calAccent,
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => TaskDetailScreen(projectId: project.id)),
                          );
                        },
                        child: const SizedBox(
                          width: 44,
                          height: 44,
                          child: Icon(Icons.arrow_outward, color: Colors.white, size: 20),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  const _MetaPill(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(OasisTheme.radiusPill),
        border: Border.all(color: OasisTheme.line),
      ),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11)),
    );
  }
}

class _AvatarStack extends StatelessWidget {
  const _AvatarStack({required this.members});
  final List<ProjectMember> members;

  @override
  Widget build(BuildContext context) {
    final show = members.take(3).toList();
    final extra = members.length - show.length;
    return SizedBox(
      height: 28,
      width: 28.0 + (show.length + (extra > 0 ? 1 : 0) - 1) * 20,
      child: Stack(
        children: [
          for (var i = 0; i < show.length; i++)
            Positioned(
              left: i * 20.0,
              child: CircleAvatar(
                radius: 14,
                backgroundColor: i.isEven ? OasisTheme.sky : OasisTheme.calAccent,
                child: Text(
                  _ini(show[i]),
                  style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800),
                ),
              ),
            ),
          if (extra > 0)
            Positioned(
              left: show.length * 20.0,
              child: CircleAvatar(
                radius: 14,
                backgroundColor: OasisTheme.ink,
                child: Text("+$extra", style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
              ),
            ),
        ],
      ),
    );
  }

  String _ini(ProjectMember m) {
    final name = m.displayName.isNotEmpty ? m.displayName : m.username;
    if (name.isEmpty) return "?";
    return name.length >= 2 ? name.substring(0, 2).toUpperCase() : name.toUpperCase();
  }
}
