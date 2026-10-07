import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";
import "../widgets/offspots_widgets.dart";
import "create_task_screen.dart";
import "new_task_chooser_sheet.dart";
import "offspots_task_detail_screen.dart";
import "voice_script_collector_screen.dart";

/// Admin UI — lịch / Task của 1 Leader (sau khi chạm card LEADERS).
class AdminScheduleScreen extends StatefulWidget {
  const AdminScheduleScreen({super.key, required this.leader});

  final UserAccount leader;

  @override
  State<AdminScheduleScreen> createState() => _AdminScheduleScreenState();
}

class _AdminScheduleScreenState extends State<AdminScheduleScreen> {
  late DateTime _day;
  late DateTime _stripStart;

  static const _cardColors = [
    Color(0xFFFF9F43),
    Color(0xFF7367F0),
    Color(0xFFEA5455),
    Color(0xFF28C76F),
    Color(0xFF00CFE8),
    Color(0xFFD8D634),
  ];

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _day = DateTime(n.year, n.month, n.day);
    _stripStart = _day.subtract(const Duration(days: 2));
  }

  List<OasisProject> _openProjects(AppState state) =>
      state.projectsForLeader(widget.leader).where((p) => p.status != "DONE").toList();

  Set<DateTime> _deadlineDays(List<OasisProject> projects) {
    final out = <DateTime>{};
    for (final p in projects) {
      final dl = offspotsParseDay(p.deadline);
      if (dl == null) continue;
      out.add(DateTime(dl.year, dl.month, dl.day));
    }
    return out;
  }

  List<OasisProject> _dayProjects(List<OasisProject> all) {
    final today = DateTime.now();
    final t0 = DateTime(today.year, today.month, today.day);
    return all.where((p) {
      final dl = offspotsParseDay(p.deadline);
      if (dl != null) return offspotsSameDay(dl, _day);
      // Chưa có deadline → chỉ hiện ở hôm nay.
      return offspotsSameDay(_day, t0);
    }).toList();
  }

  void _selectDay(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    setState(() {
      _day = day;
      // Giữ ngày chọn gần giữa strip để dễ vuốt qua lại.
      _stripStart = day.subtract(const Duration(days: 2));
    });
  }

  Future<void> _pickCalendarDay() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 3),
      helpText: "Chọn ngày xem lịch",
      cancelText: "Huỷ",
      confirmText: "Xem",
    );
    if (picked == null || !mounted) return;
    _selectDay(picked);
  }

  List<_Slot> _slots(List<OasisProject> projects) {
    var cursor = 10 * 60;
    return projects.asMap().entries.map((e) {
      final p = e.value;
      final mins = (p.estimatedDurationMinutes ?? 60).clamp(30, 480);
      final start = cursor;
      final end = cursor + mins;
      cursor = end + 15;
      return _Slot(
        project: p,
        hourLabel: offspotsFmtMinutes(start),
        rangeLabel: "${offspotsFmtMinutes(start)} – ${offspotsFmtMinutes(end)}",
        color: _cardColors[e.key % _cardColors.length],
      );
    }).toList();
  }

  List<_CategoryStat> _categories(List<OasisProject> projects) {
    final map = <String, List<OasisProject>>{};
    for (final p in projects) {
      final key = (p.unit?.name.trim().isNotEmpty == true) ? p.unit!.name : "General";
      map.putIfAbsent(key, () => []).add(p);
    }
    final entries = map.entries.toList();
    if (entries.isEmpty) {
      return [
        const _CategoryStat(name: "Web Design", count: 0, pct: 0, color: Color(0xFF7367F0)),
        const _CategoryStat(name: "UI Design", count: 0, pct: 0, color: Color(0xFFFF9F43)),
      ];
    }
    return List.generate(entries.length.clamp(0, 4), (i) {
      final e = entries[i];
      final avg = e.value.isEmpty
          ? 0
          : (e.value.map((p) => p.progressPercent ?? p.energy).reduce((a, b) => a + b) /
                  e.value.length)
              .round();
      return _CategoryStat(
        name: e.key,
        count: e.value.length,
        pct: avg,
        color: _cardColors[i % _cardColors.length],
      );
    });
  }

  String get _ownerName => widget.leader.displayName.isNotEmpty
      ? widget.leader.displayName
      : widget.leader.username;

  Future<void> _openAssign() async {
    final mode = await showNewTaskChooser(context);
    if (mode == null || !mounted) return;
    if (mode == NewTaskMode.manual) {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => CreateTaskScreen(
            assignMode: true,
            prefillOwner: _ownerName,
            prefillDeadline: _day,
          ),
        ),
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VoiceScriptCollectorScreen(
          prefillOwner: _ownerName,
          prefillDeadline: _day,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final name = widget.leader.displayName.isNotEmpty
        ? widget.leader.displayName
        : widget.leader.username;
    final open = _openProjects(state);
    final projects = _dayProjects(open);
    final deadlineDays = _deadlineDays(open);
    final slots = _slots(projects);
    final cats = _categories(projects);
    final stripDays = List.generate(21, (i) => _stripStart.add(Duration(days: i)));

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back_ios_new, size: 18),
                  ),
                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: _pickCalendarDay,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    offspotsDateHeadline(_day),
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                      color: OasisTheme.ink,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Icon(
                                  Icons.calendar_month_outlined,
                                  size: 18,
                                  color: Colors.grey.shade500,
                                ),
                              ],
                            ),
                            Text(
                              name,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: OasisTheme.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OffspotsDateStrip(
                days: stripDays,
                selected: _day,
                deadlineDays: deadlineDays,
                onSelect: _selectDay,
                accent: const Color(0xFF2563EB),
              ),
            ),
            const SizedBox(height: 14),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Text(
                    "Categories",
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  Spacer(),
                  Text(
                    "view all",
                    style: TextStyle(fontSize: 12, color: OasisTheme.muted),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 118,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                itemCount: cats.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, i) {
                  final c = cats[i];
                  return Container(
                    width: 200,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [c.color, c.color.withValues(alpha: 0.75)],
                      ),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                c.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                "${c.count.toString().padLeft(2, "0")} projects",
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.9),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Spacer(),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.vertical(bottom: Radius.circular(18)),
                          ),
                          child: Row(
                            children: [
                              Text(
                                "${c.pct}%",
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: c.color,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: OffspotsProgressBar(
                                  value: c.pct / 100,
                                  color: c.color,
                                  height: 6,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                "Task",
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(height: 4),
            Expanded(
              child: RefreshIndicator(
                onRefresh: state.refresh,
                child: slots.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.fromLTRB(24, 32, 24, 100),
                        children: [
                          Text(
                            "Chưa có việc ngày này.\nBấm + New Task bên dưới để giao cho $name.",
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: OasisTheme.muted, height: 1.5),
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                        itemCount: slots.length,
                        itemBuilder: (context, i) {
                          final s = slots[i];
                          final members = s.project.members.length.clamp(1, 99);
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(
                                  width: 52,
                                  child: Padding(
                                    padding: const EdgeInsets.only(top: 14),
                                    child: Text(
                                      s.hourLabel,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xFF94A3B8),
                                      ),
                                    ),
                                  ),
                                ),
                                Expanded(
                                  child: Material(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(18),
                                    child: InkWell(
                                      borderRadius: BorderRadius.circular(18),
                                      onTap: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => OffspotsTaskDetailScreen(
                                              projectId: s.project.id,
                                              staffMode: false,
                                            ),
                                          ),
                                        );
                                      },
                                      child: Container(
                                        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(18),
                                          border: Border(
                                            left: BorderSide(color: s.color, width: 4),
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: Colors.black.withValues(alpha: 0.04),
                                              blurRadius: 12,
                                              offset: const Offset(0, 4),
                                            ),
                                          ],
                                        ),
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              "[${s.project.unit?.name ?? "Task"}] — ${s.project.name}",
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 13,
                                                color: OasisTheme.ink,
                                              ),
                                            ),
                                            const SizedBox(height: 8),
                                            Row(
                                              children: [
                                                Icon(Icons.access_time,
                                                    size: 14, color: Colors.grey.shade500),
                                                const SizedBox(width: 4),
                                                Text(
                                                  s.rangeLabel,
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w600,
                                                    color: Colors.grey.shade600,
                                                  ),
                                                ),
                                                const SizedBox(width: 12),
                                                Icon(Icons.event_outlined,
                                                    size: 14, color: Colors.grey.shade500),
                                                const SizedBox(width: 2),
                                                Text(
                                                  s.project.deadline?.isNotEmpty == true
                                                      ? s.project.deadline!
                                                      : "Chưa hạn",
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w600,
                                                    color: Colors.grey.shade600,
                                                  ),
                                                ),
                                                const SizedBox(width: 12),
                                                Icon(Icons.people_outline,
                                                    size: 14, color: Colors.grey.shade500),
                                                const SizedBox(width: 2),
                                                Text(
                                                  "$members",
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w600,
                                                    color: Colors.grey.shade600,
                                                  ),
                                                ),
                                                const Spacer(),
                                                Text(
                                                  "${s.project.energy}%",
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w800,
                                                    color: s.color,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      floatingActionButton: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _openAssign,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
                elevation: 4,
              ),
              icon: const Icon(Icons.add),
              label: const Text(
                "+ New Task",
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Slot {
  const _Slot({
    required this.project,
    required this.hourLabel,
    required this.rangeLabel,
    required this.color,
  });
  final OasisProject project;
  final String hourLabel;
  final String rangeLabel;
  final Color color;
}

class _CategoryStat {
  const _CategoryStat({
    required this.name,
    required this.count,
    required this.pct,
    required this.color,
  });
  final String name;
  final int count;
  final int pct;
  final Color color;
}
