import "dart:async";

import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../theme.dart";
import "admin_leaders_screen.dart";
import "crm_screen.dart";
import "dashboard_screen.dart";
import "decisions_screen.dart";
import "documents_screen.dart";
import "expenses_screen.dart";
import "finance_screen.dart";
import "issues_screen.dart";
import "staff_schedule_screen.dart";
import "tasks_screen.dart";

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  /// Only build a tab the first time the user opens it (CRM etc. stay cold).
  final Set<int> _visited = {0};

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final isAdmin = state.user?.isAdmin == true;
    final tabCount = isAdmin ? 5 : 4;
    final safeIndex = _index.clamp(0, tabCount - 1);

    final titles = isAdmin
        ? const ["Leaders", "Chi phí", "CRM", "Quyết định", "Thêm"]
        : const ["My Task", "Chi phí", "Quyết định", "Thêm"];

    final destinations = isAdmin
        ? const [
            NavigationDestination(
              icon: Icon(Icons.groups_outlined),
              selectedIcon: Icon(Icons.groups),
              label: "Leaders",
            ),
            NavigationDestination(
              icon: Icon(Icons.payments_outlined),
              selectedIcon: Icon(Icons.payments),
              label: "Chi phí",
            ),
            NavigationDestination(
              icon: Icon(Icons.handshake_outlined),
              selectedIcon: Icon(Icons.handshake),
              label: "CRM",
            ),
            NavigationDestination(
              icon: Icon(Icons.gavel_outlined),
              selectedIcon: Icon(Icons.gavel),
              label: "Quyết định",
            ),
            NavigationDestination(
              icon: Icon(Icons.more_horiz),
              selectedIcon: Icon(Icons.more_horiz),
              label: "Thêm",
            ),
          ]
        : const [
            NavigationDestination(
              icon: Icon(Icons.task_alt_outlined),
              selectedIcon: Icon(Icons.task_alt),
              label: "My Task",
            ),
            NavigationDestination(
              icon: Icon(Icons.payments_outlined),
              selectedIcon: Icon(Icons.payments),
              label: "Chi phí",
            ),
            NavigationDestination(
              icon: Icon(Icons.gavel_outlined),
              selectedIcon: Icon(Icons.gavel),
              label: "Quyết định",
            ),
            NavigationDestination(
              icon: Icon(Icons.more_horiz),
              selectedIcon: Icon(Icons.more_horiz),
              label: "Thêm",
            ),
          ];

    final hideAppBar = safeIndex == 0;

    return Scaffold(
      appBar: hideAppBar
          ? null
          : AppBar(
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titles[safeIndex],
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                  ),
                  Text(
                    state.user?.displayName ?? state.user?.username ?? "",
                    style: const TextStyle(
                      fontSize: 11,
                      color: OasisTheme.muted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              actions: [
                IconButton(
                  tooltip: "Làm mới",
                  onPressed: state.busy
                      ? null
                      : () async {
                          try {
                            await state.refresh();
                          } catch (e) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
                          }
                        },
                  icon: const Icon(Icons.refresh),
                ),
                IconButton(
                  tooltip: "Đăng xuất",
                  onPressed: () async {
                    await state.logout();
                  },
                  icon: const Icon(Icons.logout),
                ),
              ],
            ),
      body: Column(
        children: [
          if (state.backgroundLoading)
            const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: IndexedStack(
              index: safeIndex,
              children: List.generate(tabCount, (i) {
                if (!_visited.contains(i)) {
                  return const SizedBox.shrink();
                }
                return _tabBody(isAdmin: isAdmin, index: i);
              }),
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (i) {
          setState(() {
            _index = i;
            _visited.add(i);
          });
          // Re-pull when opening tabs so newly assigned tasks show up.
          final state = context.read<AppState>();
          if (isAdmin) {
            if (i == 0) unawaited(state.refreshCore());
            if (i == 1) unawaited(state.loadExpenses());
            if (i == 3) unawaited(state.loadDecisions());
          } else {
            if (i == 0) unawaited(state.refreshCore());
            if (i == 1) unawaited(state.loadExpenses());
            if (i == 2) unawaited(state.loadDecisions());
          }
        },
        destinations: destinations,
      ),
    );
  }

  Widget _tabBody({required bool isAdmin, required int index}) {
    if (isAdmin) {
      switch (index) {
        case 0:
          return const AdminLeadersScreen();
        case 1:
          return const ExpensesScreen();
        case 2:
          return const CrmScreen();
        case 3:
          return const DecisionsScreen();
        default:
          return const _MoreHub();
      }
    }
    switch (index) {
      case 0:
        return const StaffScheduleScreen();
      case 1:
        return const ExpensesScreen();
      case 2:
        return const DecisionsScreen();
      default:
        return const _MoreHub();
    }
  }
}

class _MoreHub extends StatelessWidget {
  const _MoreHub();

  @override
  Widget build(BuildContext context) {
    final isAdmin = context.watch<AppState>().user?.isAdmin == true;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text("Module khác", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 8),
        const Text(
          "Các mục còn lại trên web Control Tower",
          style: TextStyle(color: OasisTheme.muted, fontSize: 13),
        ),
        const SizedBox(height: 12),
        _MoreTile(
          icon: Icons.task_alt_outlined,
          title: "Danh sách Task",
          subtitle: "Xem / lọc toàn bộ Task (ẩn khỏi thanh dưới)",
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => Scaffold(
                appBar: AppBar(title: const Text("Task")),
                body: const TasksScreen(),
              ),
            ),
          ),
        ),
        if (isAdmin)
          _MoreTile(
            icon: Icons.dashboard_outlined,
            title: "Tổng quan",
            subtitle: "Dashboard doanh thu / chi phí",
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => Scaffold(
                  appBar: AppBar(title: const Text("Tổng quan")),
                  body: const DashboardScreen(),
                ),
              ),
            ),
          ),
        _MoreTile(
          icon: Icons.today_outlined,
          title: "Chốt ngày",
          subtitle: "Doanh thu / tiền mặt theo phân khu",
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FinanceScreen())),
        ),
        _MoreTile(
          icon: Icons.folder_outlined,
          title: "Kho tài liệu",
          subtitle: "Tài liệu gắn Task / phân khu",
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => Scaffold(
                appBar: AppBar(title: const Text("Kho tài liệu")),
                body: const DocumentsScreen(),
              ),
            ),
          ),
        ),
        _MoreTile(
          icon: Icons.report_problem_outlined,
          title: "Vấn đề",
          subtitle: "Báo cáo sự cố vận hành",
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const IssuesScreen())),
        ),
      ],
    );
  }
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: OasisTheme.green),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
