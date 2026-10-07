import "package:flutter/material.dart";

import "../theme.dart";

String offspotsInitials(String name) {
  final parts = name.trim().split(RegExp(r"[\s._-]+")).where((e) => e.isNotEmpty).toList();
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  final t = parts.isEmpty ? "ME" : parts.first;
  return (t.length >= 2 ? t.substring(0, 2) : "${t}X").toUpperCase();
}

String offspotsWeekday(int w) => const [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ][w - 1];

String offspotsMonthShort(int m) => const [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][m - 1];

String offspotsMonthLong(int m) => const [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][m - 1];

String offspotsNth(int n) {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

String offspotsDowShort(int w) =>
    const ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][w - 1];

String offspotsDateHeadline(DateTime d, {bool longMonth = false}) {
  final month = longMonth ? offspotsMonthLong(d.month) : offspotsMonthShort(d.month);
  return "${offspotsWeekday(d.weekday)}, ${d.day}${offspotsNth(d.day)} $month ${d.year}";
}

bool offspotsSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

DateTime? offspotsParseDay(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final iso = RegExp(r"^(\d{4})-(\d{2})-(\d{2})").firstMatch(raw);
  if (iso != null) {
    return DateTime(int.parse(iso[1]!), int.parse(iso[2]!), int.parse(iso[3]!));
  }
  return DateTime.tryParse(raw);
}

String offspotsFmtMinutes(int m) {
  final h = m ~/ 60;
  final mm = m % 60;
  final ap = h >= 12 ? "pm" : "am";
  final h12 = ((h + 11) % 12) + 1;
  if (mm == 0) return "$h12 $ap";
  return "$h12:${mm.toString().padLeft(2, "0")} $ap";
}

class OffspotsPriority {
  const OffspotsPriority(this.label, this.fg, this.bg);
  final String label;
  final Color fg;
  final Color bg;

  static OffspotsPriority fromProject({
    required String priority,
    String? quadrant,
  }) {
    if (quadrant == "DO_NOW" || priority == "P1") {
      return const OffspotsPriority("High", Color(0xFFB45309), Color(0xFFFEF3C7));
    }
    if (quadrant == "PLAN" || priority == "P2") {
      return const OffspotsPriority("Medium", Color(0xFF1D4ED8), Color(0xFFDBEAFE));
    }
    if (quadrant == "QUICK_ACTION") {
      return const OffspotsPriority("Urgent", Color(0xFFB91C1C), Color(0xFFFEE2E2));
    }
    return const OffspotsPriority("Low", Color(0xFF475569), Color(0xFFF1F5F9));
  }
}

class OffspotsDateStrip extends StatelessWidget {
  const OffspotsDateStrip({
    super.key,
    required this.days,
    required this.selected,
    required this.onSelect,
    this.deadlineDays = const {},
    this.accent = OasisTheme.admBlue,
  });

  final List<DateTime> days;
  final DateTime selected;
  final ValueChanged<DateTime> onSelect;
  /// Days that have at least one task deadline (normalized to local date).
  final Set<DateTime> deadlineDays;
  final Color accent;

  bool _hasDeadline(DateTime d) {
    final key = DateTime(d.year, d.month, d.day);
    return deadlineDays.any((x) => offspotsSameDay(x, key));
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 78,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: days.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final d = days[i];
          final on = offspotsSameDay(d, selected);
          final hasDl = _hasDeadline(d);
          return Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => onSelect(DateTime(d.year, d.month, d.day)),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                width: 56,
                decoration: BoxDecoration(
                  color: on ? accent : const Color(0xFFF3F6FA),
                  borderRadius: BorderRadius.circular(18),
                  border: !on && hasDl
                      ? Border.all(color: accent.withValues(alpha: 0.35))
                      : null,
                  boxShadow: on
                      ? [
                          BoxShadow(
                            color: accent.withValues(alpha: 0.28),
                            blurRadius: 12,
                            offset: const Offset(0, 5),
                          ),
                        ]
                      : null,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      offspotsDowShort(d.weekday),
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        color: on ? Colors.white : const Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      d.day.toString().padLeft(2, "0"),
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: on ? Colors.white : const Color(0xFF334155),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: hasDl
                            ? (on ? Colors.white : accent)
                            : Colors.transparent,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class OffspotsPill extends StatelessWidget {
  const OffspotsPill({
    super.key,
    required this.label,
    required this.fg,
    required this.bg,
  });

  final String label;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}

class OffspotsProgressBar extends StatelessWidget {
  const OffspotsProgressBar({
    super.key,
    required this.value,
    this.height = 8,
    this.color = OasisTheme.admBlue,
    this.track = const Color(0xFFE8EEF5),
  });

  final double value;
  final double height;
  final Color color;
  final Color track;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: LinearProgressIndicator(
        value: value.clamp(0, 1),
        minHeight: height,
        backgroundColor: track,
        color: color,
      ),
    );
  }
}
