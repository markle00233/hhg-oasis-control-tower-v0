import "package:flutter/material.dart";

import "../theme.dart";

enum NewTaskMode { manual, voice }

/// Bottom sheet: chọn Giao manual / Giao bằng voice.
Future<NewTaskMode?> showNewTaskChooser(BuildContext context) {
  return showModalBottomSheet<NewTaskMode>(
    context: context,
    showDragHandle: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              "New Task",
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            const Text(
              "Chọn cách giao việc",
              style: TextStyle(color: OasisTheme.muted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            _Card(
              icon: Icons.edit_note_rounded,
              title: "Giao manual",
              subtitle: "Điền form Create New Task như hiện tại",
              color: const Color(0xFF2563EB),
              onTap: () => Navigator.pop(ctx, NewTaskMode.manual),
            ),
            const SizedBox(height: 10),
            _Card(
              icon: Icons.mic_none_rounded,
              title: "Giao bằng voice",
              subtitle: "Thu voice script (có thể nhiều lần) → AI điền form",
              color: const Color(0xFF7C3AED),
              onTap: () => Navigator.pop(ctx, NewTaskMode.voice),
            ),
          ],
        ),
      );
    },
  );
}

class _Card extends StatelessWidget {
  const _Card({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: color,
                child: Icon(icon, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                        color: color,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(fontSize: 12, color: OasisTheme.muted),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: color),
            ],
          ),
        ),
      ),
    );
  }
}
