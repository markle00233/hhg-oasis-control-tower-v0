import "dart:async";

import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../models.dart";
import "../theme.dart";
import "../widgets/offspots_widgets.dart";
import "offspots_task_detail_screen.dart";

/// User-UI Task — Figma `3048:885` Active / `3048:1183` Complete
class StaffScheduleScreen extends StatefulWidget {
  const StaffScheduleScreen({super.key});

  @override
  State<StaffScheduleScreen> createState() => _StaffScheduleScreenState();
}

class _StaffScheduleScreenState extends State<StaffScheduleScreen> {
  late DateTime _day;
  late DateTime _stripStart;
  int _tab = 0; // 0 Active, 1 Complete

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _day = DateTime(n.year, n.month, n.day);
    _stripStart = _day;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(context.read<AppState>().refreshCore());
    });
  }

  List<OasisProject> _mine(AppState state, {required bool done}) {
    final me = state.user;
    if (me == null) return const [];
    return state.projects.where((p) {
      final isMine = state.ownerMatches(p.owner, me) ||
          p.members.any((m) => m.userId == me.id);
      if (!isMine) return false;
      return done ? p.status == "DONE" : p.status != "DONE";
    }).toList();
  }

  Set<DateTime> _deadlineDays(List<OasisProject> projects) {
    final out = <DateTime>{};
    for (final p in projects) {
      final dl = offspotsParseDay(p.deadline);
      if (dl == null) continue;
      out.add(DateTime(dl.year, dl.month, dl.day));
    }
    return out;
  }

  List<OasisProject> _forDay(List<OasisProject> all) {
    final today = DateTime.now();
    final t0 = DateTime(today.year, today.month, today.day);
    final viewingToday = offspotsSameDay(_day, t0);
    return all.where((p) {
      final dl = offspotsParseDay(p.deadline);
      if (dl == null) return viewingToday;
      final d0 = DateTime(dl.year, dl.month, dl.day);
      if (offspotsSameDay(d0, _day)) return true;
      // Hôm nay: hiện cả quá hạn + sắp tới (14 ngày) — tránh tưởng "không nhận được task"
      if (viewingToday) {
        if (d0.isBefore(t0)) return true;
        if (d0.difference(t0).inDays <= 14) return true;
      }
      return false;
    }).toList();
  }

  void _selectDay(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    setState(() {
      _day = day;
      _stripStart = day.subtract(const Duration(days: 1));
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

  String _dueLabel(OasisProject p) {
    final dl = offspotsParseDay(p.deadline);
    if (dl == null) return "No due";
    return "Due day: ${dl.day} ${offspotsMonthShort(dl.month)}";
  }

  String _statusEn(OasisProject p) {
    switch (p.status) {
      case "DONE":
        return "Complete";
      case "DOING":
      case "ON_TRACK":
        return "In Progress";
      case "IN_REVIEW":
        return "In Review";
      case "WAITING":
      case "AT_RISK":
      case "BLOCKED":
      case "PAUSED":
        return "Waiting";
      default:
        return "Upcoming";
    }
  }

  String _tag(OasisProject p) {
    final u = p.unit?.name.trim() ?? "";
    if (u.isNotEmpty) return u;
    return "Task";
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final stripDays = List.generate(14, (i) => _stripStart.add(Duration(days: i)));
    final mine = _mine(state, done: _tab == 1);
    final list = _forDay(mine);
    final deadlineDays = _deadlineDays(mine);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(13, 8, 13, 0),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: _pickCalendarDay,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          offspotsDateHeadline(_day),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                            color: Colors.black,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Icon(Icons.calendar_month_outlined, size: 18, color: Colors.grey.shade500),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 13),
              child: OffspotsDateStrip(
                days: stripDays,
                selected: _day,
                deadlineDays: deadlineDays,
                onSelect: _selectDay,
                accent: const Color(0xFF2563EB),
              ),
            ),
            const SizedBox(height: 18),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 15),
              child: Text(
                "My task",
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
              ),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 15),
              child: Container(
                height: 50,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF6F6F6),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: _Seg(
                        label: "Active",
                        selected: _tab == 0,
                        onTap: () => setState(() => _tab = 0),
                      ),
                    ),
                    Expanded(
                      child: _Seg(
                        label: "Complete",
                        selected: _tab == 1,
                        onTap: () => setState(() => _tab = 1),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: state.refresh,
                child: list.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 48),
                          Center(
                            child: Text(
                              "Chưa có task.",
                              style: TextStyle(color: OasisTheme.muted),
                            ),
                          ),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(15, 16, 15, 28),
                        itemCount: list.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          final p = list[i];
                          final pri = OffspotsPriority.fromProject(
                            priority: p.priority,
                            quadrant: p.quadrant,
                          );
                          final desc = (p.description ?? p.expectedResult ?? "")
                              .split("\n")
                              .first
                              .trim();
                          return Material(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(11),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(11),
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => OffspotsTaskDetailScreen(
                                      projectId: p.id,
                                      staffMode: true,
                                    ),
                                  ),
                                );
                              },
                              child: Container(
                                padding: const EdgeInsets.fromLTRB(18, 14, 14, 12),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(11),
                                  border: Border.all(color: const Color(0xFFEBEBEB)),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.03),
                                      blurRadius: 4,
                                      offset: const Offset(0, 4),
                                    ),
                                  ],
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            p.name,
                                            style: const TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ),
                                        OffspotsPill(
                                          label: pri.label,
                                          fg: pri.fg,
                                          bg: pri.bg,
                                        ),
                                      ],
                                    ),
                                    if (desc.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        desc.length > 90 ? "${desc.substring(0, 90)}…" : desc,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: Color(0xFFAFB0B4),
                                          height: 1.35,
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 10),
                                    Wrap(
                                      spacing: 6,
                                      children: [
                                        OffspotsPill(
                                          label: _tag(p),
                                          fg: Colors.black,
                                          bg: const Color(0xFFF0F0F0),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    const Divider(height: 1, color: Color(0xFFEBEBEB)),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        const Icon(Icons.access_time, size: 12, color: Color(0xFF8D8D8D)),
                                        const SizedBox(width: 4),
                                        Text(
                                          _statusEn(p),
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: Color(0xFF8D8D8D),
                                          ),
                                        ),
                                        const Spacer(),
                                        Text(
                                          _dueLabel(p),
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: Color(0xFF8D8D8D),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Seg extends StatelessWidget {
  const _Seg({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(7),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(7),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: selected ? Colors.black : const Color(0xFF9B9B9B),
            ),
          ),
        ),
      ),
    );
  }
}
