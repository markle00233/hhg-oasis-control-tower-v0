import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";
import "admin_schedule_screen.dart";
import "create_task_screen.dart";
import "new_task_chooser_sheet.dart";
import "tasks_screen.dart";
import "voice_script_collector_screen.dart";

/// Admin-UI Home — Figma `3043:245`
/// White · Hello beige card · TIMELINE / LEADERS · stacked gradient cards.
class AdminLeadersScreen extends StatefulWidget {
  const AdminLeadersScreen({super.key});

  @override
  State<AdminLeadersScreen> createState() => _AdminLeadersScreenState();
}

class _AdminLeadersScreenState extends State<AdminLeadersScreen> {
  bool _viewTasks = false;
  /// null = task của tất cả; otherwise filter by leader id.
  String? _ownerUserId;

  static const _gradients = [
    [Color(0xFFFF9F43), Color(0xFFFF6B1A)],
    [Color(0xFF7367F0), Color(0xFF5A4FCF)],
    [Color(0xFFEA5455), Color(0xFFD63A3C)],
    [Color(0xFFC8D634), Color(0xFF9FB80E)],
    [Color(0xFF28C76F), Color(0xFF1F9D57)],
    [Color(0xFF00CFE8), Color(0xFF00A1C2)],
    [Color(0xFFFF6F91), Color(0xFFE83E6A)],
    [Color(0xFF5B8DEF), Color(0xFF3A6BD9)],
  ];

  static const _expandedH = 144.0;
  static const _compactH = 80.0;
  static const _overlap = 12.0;

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r"[\s._-]+")).where((e) => e.isNotEmpty).toList();
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    final t = parts.isEmpty ? "AD" : parts.first;
    return (t.length >= 2 ? t.substring(0, 2) : "${t}X").toUpperCase();
  }

  void _openLeader(UserAccount u) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AdminScheduleScreen(leader: u)),
    );
  }

  List<OasisProject> _allTasks(AppState state) {
    var list = state.visibleProjects;
    if (_ownerUserId != null) {
      final leader = state.leaders.where((u) => u.id == _ownerUserId).firstOrNull;
      if (leader != null) {
        list = state.projectsForLeader(leader);
      }
    }
    return list;
  }

  Future<void> _openCreateTask() async {
    final mode = await showNewTaskChooser(context);
    if (mode == null || !mounted) return;
    UserAccount? prefill;
    if (_ownerUserId != null) {
      final app = context.read<AppState>();
      prefill = app.leaders.where((u) => u.id == _ownerUserId).firstOrNull;
    }
    final ownerName = prefill == null
        ? null
        : (prefill.displayName.isNotEmpty ? prefill.displayName : prefill.username);
    if (mode == NewTaskMode.manual) {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => CreateTaskScreen(assignMode: true, prefillOwner: ownerName),
        ),
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VoiceScriptCollectorScreen(prefillOwner: ownerName),
      ),
    );
  }

  Widget _card({
    required UserAccount user,
    required List<Color> gradient,
    required int pct,
    required bool expanded,
  }) {
    final name = (user.displayName.isNotEmpty ? user.displayName : user.username).toUpperCase();
    return Material(
      color: Colors.transparent,
      elevation: 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(expanded ? 18 : 14),
        onTap: () => _openLeader(user),
        child: Ink(
          height: expanded ? _expandedH : _compactH,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: gradient,
            ),
            borderRadius: BorderRadius.circular(expanded ? 18 : 14),
            boxShadow: [
              BoxShadow(
                color: gradient.first.withValues(alpha: 0.28),
                blurRadius: 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: expanded
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(15, 14, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 50,
                            height: 55,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              _initials(name),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  "STAFF",
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 22,
                                    fontWeight: FontWeight.w400,
                                    height: 1.05,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.more_vert, color: Colors.white, size: 22),
                        ],
                      ),
                      const Spacer(),
                      Container(
                        height: 32,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.11),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Text(
                              "Overall",
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              "$pct%",
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              "STAFF",
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 24,
                                fontWeight: FontWeight.w400,
                                height: 1.05,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        "$pct%",
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.user;
    final hello = (me?.displayName ?? me?.username ?? "ADMIN").toUpperCase();
    final leaders = state.leaders;
    final tasks = _viewTasks ? _allTasks(state) : const <OasisProject>[];

    double stackHeight = 0;
    if (leaders.isNotEmpty) {
      stackHeight = _expandedH;
      for (var i = 1; i < leaders.length; i++) {
        stackHeight += _compactH - _overlap;
      }
    }

    return Scaffold(
      backgroundColor: Colors.white,
      floatingActionButton: _viewTasks
          ? FloatingActionButton(
              heroTag: "adminHomeTasksFab",
              onPressed: _openCreateTask,
              child: const Icon(Icons.add),
            )
          : null,
      body: SafeArea(
        child: RefreshIndicator(
          color: OasisTheme.admBlue,
          onRefresh: state.refresh,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 88),
            children: [
              Container(
                height: 103,
                padding: const EdgeInsets.fromLTRB(8, 5, 16, 5),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEDDB9),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 75,
                      height: 93,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        _initials(hello),
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: Colors.black,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(fontSize: 16, color: Colors.black, height: 1.2),
                          children: [
                            const TextSpan(
                              text: "Hello, ",
                              style: TextStyle(fontWeight: FontWeight.w400),
                            ),
                            TextSpan(
                              text: "$hello!",
                              style: const TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "TIMELINE",
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.4,
                            color: Colors.black,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _viewTasks ? "TASKS" : "LEADERS",
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w400,
                            color: Colors.black,
                            height: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => state.refresh(),
                    icon: const Icon(Icons.notifications_none, color: Colors.black),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _ViewChip(
                    label: "Leaders",
                    selected: !_viewTasks,
                    onTap: () => setState(() => _viewTasks = false),
                  ),
                  const SizedBox(width: 8),
                  _ViewChip(
                    label: "Tất cả Task",
                    selected: _viewTasks,
                    onTap: () {
                      setState(() => _viewTasks = true);
                      if (state.scope != TaskScope.all) state.setScope(TaskScope.all);
                    },
                  ),
                ],
              ),
              if (!_viewTasks) ...[
                const SizedBox(height: 12),
                if (leaders.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 24),
                    child: Text(
                      "Chưa có Leader trong directory.",
                      style: TextStyle(color: OasisTheme.muted),
                    ),
                  )
                else
                  SizedBox(
                    height: stackHeight,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        for (var i = 0; i < leaders.length; i++)
                          Positioned(
                            top: i == 0
                                ? 0
                                : _expandedH + (i - 1) * (_compactH - _overlap) - _overlap,
                            left: 0,
                            right: 0,
                            height: i == 0 ? _expandedH : _compactH,
                            child: _card(
                              user: leaders[i],
                              gradient: _gradients[i % _gradients.length],
                              pct: state.leaderOverallPct(leaders[i]),
                              expanded: i == 0,
                            ),
                          ),
                      ],
                    ),
                  ),
              ] else ...[
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _OwnerChip(
                        label: "Tất cả",
                        selected: _ownerUserId == null,
                        onTap: () => setState(() => _ownerUserId = null),
                      ),
                      for (final u in leaders)
                        _OwnerChip(
                          label: (u.displayName.isNotEmpty ? u.displayName : u.username)
                              .toUpperCase(),
                          selected: _ownerUserId == u.id,
                          onTap: () => setState(() {
                            _ownerUserId = _ownerUserId == u.id ? null : u.id;
                          }),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _OwnerChip(
                        label: "Quá hạn",
                        selected: state.filter == "overdue",
                        onTap: () => state.setFilter("overdue"),
                      ),
                      _OwnerChip(
                        label: "Bị chặn",
                        selected: state.filter == "blocked",
                        onTap: () => state.setFilter("blocked"),
                      ),
                      _OwnerChip(
                        label: "Hoàn tất",
                        selected: state.filter == "done",
                        onTap: () => state.setFilter("done"),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: "Tìm Task…",
                  ),
                  onChanged: state.setSearch,
                ),
                const SizedBox(height: 12),
                if (tasks.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 32),
                    child: Center(
                      child: Text("Chưa có Task", style: TextStyle(color: OasisTheme.muted)),
                    ),
                  )
                else
                  ...tasks.map(
                    (p) => TaskProjectCard(
                      project: p,
                      highlight: p.priority == "P0" || p.priority == "P1",
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ViewChip extends StatelessWidget {
  const _ViewChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Colors.black : const Color(0xFFF3F4F6),
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : Colors.black87,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _OwnerChip extends StatelessWidget {
  const _OwnerChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: selected ? OasisTheme.admBlue : const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
