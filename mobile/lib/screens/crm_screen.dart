import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../app_state.dart";
import "../controller_utils.dart";
import "../crm/crm_config.dart";
import "../theme.dart";

/// Native CRM shell — live data from CRM DB via `/api/crm/*` (Admin only).
class CrmScreen extends StatefulWidget {
  const CrmScreen({super.key});

  @override
  State<CrmScreen> createState() => _CrmScreenState();
}

class _CrmScreenState extends State<CrmScreen> {
  int _tab = 0;
  bool _loading = true;

  static const _tabs = ["Tổng quan", "Membership", "Khách lẻ", "Check-in", "Gói"];

  @override
  void initState() {
    super.initState();
    // Only runs when CRM tab is first opened (HomeShell lazy-mounts tabs).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final state = context.read<AppState>();
      if (state.crmSummary != null || state.crmCustomers.isNotEmpty) {
        if (mounted) setState(() => _loading = false);
        return;
      }
      _reload();
    });
  }

  Future<void> _reload({String q = ""}) async {
    if (mounted) setState(() => _loading = true);
    await context.read<AppState>().loadCrm(customerQuery: q);
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: List.generate(_tabs.length, (i) {
                      final on = _tab == i;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(_tabs[i]),
                          selected: on,
                          onSelected: (_) => setState(() => _tab = i),
                          selectedColor: OasisTheme.admBlue.withValues(alpha: 0.18),
                          labelStyle: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: on ? OasisTheme.admBlue : OasisTheme.muted,
                          ),
                          side: BorderSide(
                            color: on ? OasisTheme.admBlue : const Color(0xFFE5E7EB),
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ),
              IconButton(
                tooltip: "Làm mới CRM",
                onPressed: _loading ? null : () => _reload(),
                icon: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        if (state.crmError != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Material(
              color: const Color(0xFFFFF1F2),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  state.crmError!,
                  style: const TextStyle(color: Color(0xFFBE123C), fontSize: 12),
                ),
              ),
            ),
          ),
        const SizedBox(height: 8),
        Expanded(
          child: IndexedStack(
            index: _tab,
            children: [
              _CrmDashboardTab(onRefresh: _reload),
              _CrmCustomersTab(
                segment: CrmCustomerSegment.membership,
                onRefresh: _reload,
              ),
              _CrmAppCustomersTab(onRefresh: _reload),
              _CrmCheckinTab(onDone: _reload),
              const _CrmPackagesTab(),
            ],
          ),
        ),
      ],
    );
  }
}

class _CrmDashboardTab extends StatelessWidget {
  const _CrmDashboardTab({required this.onRefresh});
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final s = state.crmSummary ?? {};
    final services = state.crmServices;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [OasisTheme.admBlue, OasisTheme.admBlueDeep],
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  CrmComplex.name,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  "Dữ liệu trực tiếp từ CRM database",
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _Stat(
                      label: "Membership",
                      value: "${s["membershipCustomers"] ?? state.crmCustomerCounts["membership"] ?? "—"}",
                    ),
                    _Stat(
                      label: "Khách lẻ",
                      value: "${state.crmAppCustomersTotal > 0 ? state.crmAppCustomersTotal : (s["walkInCustomers"] ?? state.crmCustomerCounts["walkIn"] ?? "—")}",
                    ),
                    _Stat(
                      label: "Check-in",
                      value: "${s["checkinsToday"] ?? "—"}",
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            "Tổng khách ${s["totalCustomers"] ?? "—"} · Gói ACTIVE ${s["activeMemberships"] ?? "—"} / ${s["totalMemberships"] ?? "—"} · Mới tháng ${s["newMonth"] ?? "—"}",
            style: const TextStyle(color: OasisTheme.muted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          const Text(
            "Khu vực",
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 10),
          if (services.isEmpty)
            const Text("Chưa tải được dịch vụ", style: TextStyle(color: OasisTheme.muted))
          else
            ...services.map((raw) {
              final code = raw["code"]?.toString() ?? "";
              final name = raw["name"]?.toString() ?? code;
              final today = raw["checkinsToday"] ?? 0;
              final t = crmAreaTheme(code);
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: t.soft,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: t.border),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 10,
                      height: 40,
                      decoration: BoxDecoration(
                        color: t.solid,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color: t.text,
                              fontSize: 15,
                            ),
                          ),
                          Text(
                            "$code · check-in hôm nay: $today",
                            style: TextStyle(
                              fontSize: 11,
                              color: t.text.withValues(alpha: 0.7),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
          const SizedBox(height: 16),
          const Text(
            "Check-in gần đây",
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 8),
          if (state.crmRecentVisits.isEmpty)
            const Text("Chưa có visit", style: TextStyle(color: OasisTheme.muted))
          else
            ...state.crmRecentVisits.take(12).map((v) {
              final services = (v["services"] as List? ?? []).join(", ");
              return ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: const Icon(Icons.login, color: OasisTheme.green),
                title: Text(
                  "${v["customerName"] ?? ""} · ${v["customerCode"] ?? ""}",
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
                subtitle: Text(
                  "${v["visitCode"] ?? ""} · $services",
                  style: const TextStyle(fontSize: 11),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              fontSize: 20,
            ),
          ),
        ],
      ),
    );
  }
}

enum CrmCustomerSegment { membership, walkIn }

/// Khách app (QR) — chưa có tên → hiện ID; bấm ID → timeline trong khoảng thời gian.
class _CrmAppCustomersTab extends StatefulWidget {
  const _CrmAppCustomersTab({required this.onRefresh});
  final Future<void> Function({String q}) onRefresh;

  @override
  State<_CrmAppCustomersTab> createState() => _CrmAppCustomersTabState();
}

class _CrmAppCustomersTabState extends State<_CrmAppCustomersTab> {
  final _search = TextEditingController();
  int _days = 30;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _openTimeline(String customerCode) async {
    final state = context.read<AppState>();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return _AppCustomerTimelineSheet(
          customerCode: customerCode,
          initialDays: _days,
          loader: state.loadAppCustomerTimeline,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = state.crmAppCustomers;
    final total = state.crmAppCustomersTotal;
    final days = state.crmAppTimelineDays;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _search,
                  decoration: const InputDecoration(
                    hintText: "Tìm khách app · ID (CUS-…)",
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                  ),
                  onSubmitted: (q) => widget.onRefresh(q: q),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: () => widget.onRefresh(q: _search.text),
                icon: const Icon(Icons.search),
              ),
              PopupMenuButton<int>(
                tooltip: "Khoảng thời gian",
                initialValue: _days,
                onSelected: (d) async {
                  setState(() => _days = d);
                  state.crmAppTimelineDays = d;
                  await widget.onRefresh(q: _search.text);
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 7, child: Text("7 ngày")),
                  PopupMenuItem(value: 30, child: Text("30 ngày")),
                  PopupMenuItem(value: 90, child: Text("90 ngày")),
                ],
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        "${_days}d",
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: OasisTheme.admBlue,
                        ),
                      ),
                      const Icon(Icons.expand_more, size: 18),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              "$total khách app · timeline $days ngày · bấm ID để xem",
              style: const TextStyle(color: OasisTheme.muted, fontSize: 12),
            ),
          ),
        ),
        Expanded(
          child: list.isEmpty
              ? const Center(
                  child: Text(
                    "Chưa có khách app (QR pass)",
                    style: TextStyle(color: OasisTheme.muted),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => widget.onRefresh(q: _search.text),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    itemCount: list.length,
                    itemBuilder: (context, i) {
                      final c = list[i];
                      final code = c["customerCode"]?.toString() ?? "—";
                      final visits = (c["visitsInPeriod"] as num?)?.toInt() ?? 0;
                      final lastService = c["lastServiceName"]?.toString();
                      final lastAt = c["lastVisitAt"]?.toString();
                      String? lastLabel;
                      if (lastAt != null && lastAt.isNotEmpty) {
                        final d = DateTime.tryParse(lastAt)?.toLocal();
                        if (d != null) {
                          lastLabel =
                              "${d.day.toString().padLeft(2, "0")}/${d.month.toString().padLeft(2, "0")} ${d.hour.toString().padLeft(2, "0")}:${d.minute.toString().padLeft(2, "0")}";
                        }
                      }

                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          onTap: () => _openTimeline(code),
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFFECFDF5),
                            child: Text(
                              code.length >= 3 ? code.substring(code.length - 2) : "ID",
                              style: const TextStyle(
                                color: Color(0xFF047857),
                                fontWeight: FontWeight.w800,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          title: Text(
                            code,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontFamily: "monospace",
                            ),
                          ),
                          subtitle: Text(
                            [
                              if (lastService != null && lastService.isNotEmpty) lastService,
                              if (lastLabel != null) lastLabel,
                              if (lastService == null) "Chưa có lượt quét",
                            ].whereType<String>().join(" · "),
                            style: const TextStyle(fontSize: 12, color: OasisTheme.muted),
                          ),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                "$visits",
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                ),
                              ),
                              Text(
                                "lượt / ${_days}d",
                                style: const TextStyle(fontSize: 10, color: OasisTheme.muted),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

class _AppCustomerTimelineSheet extends StatefulWidget {
  const _AppCustomerTimelineSheet({
    required this.customerCode,
    required this.initialDays,
    required this.loader,
  });

  final String customerCode;
  final int initialDays;
  final Future<Map<String, dynamic>> Function(String code, {int? days}) loader;

  @override
  State<_AppCustomerTimelineSheet> createState() => _AppCustomerTimelineSheetState();
}

class _AppCustomerTimelineSheetState extends State<_AppCustomerTimelineSheet> {
  late int _days = widget.initialDays;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _timeline = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.loader(widget.customerCode, days: _days);
      if (!mounted) return;
      setState(() {
        _timeline = (data["timeline"] as List? ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = "$e";
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height * 0.75;
    return SizedBox(
      height: height,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Timeline",
                        style: TextStyle(fontSize: 12, color: OasisTheme.muted),
                      ),
                      Text(
                        widget.customerCode,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          fontFamily: "monospace",
                        ),
                      ),
                    ],
                  ),
                ),
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 7, label: Text("7d")),
                    ButtonSegment(value: 30, label: Text("30d")),
                    ButtonSegment(value: 90, label: Text("90d")),
                  ],
                  selected: {_days},
                  onSelectionChanged: (s) {
                    setState(() => _days = s.first);
                    _load();
                  },
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            _error!,
                            style: const TextStyle(color: Color(0xFFBE123C)),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    : _timeline.isEmpty
                        ? const Center(
                            child: Text(
                              "Chưa có lượt quét trong khoảng này",
                              style: TextStyle(color: OasisTheme.muted),
                            ),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                            itemCount: _timeline.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, i) {
                              final e = _timeline[i];
                              final at = DateTime.tryParse(
                                    e["at"]?.toString() ?? "",
                                  )?.toLocal();
                              final when = at == null
                                  ? "—"
                                  : "${at.day.toString().padLeft(2, "0")}/${at.month.toString().padLeft(2, "0")}/${at.year}  ${at.hour.toString().padLeft(2, "0")}:${at.minute.toString().padLeft(2, "0")}";
                              final party = (e["partySize"] as num?)?.toInt() ?? 1;
                              return Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: const Color(0xFFE5E7EB)),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 10,
                                      height: 10,
                                      decoration: const BoxDecoration(
                                        color: OasisTheme.admBlue,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            e["serviceName"]?.toString() ?? "—",
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            when,
                                            style: const TextStyle(
                                              fontSize: 12,
                                              color: OasisTheme.muted,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (party > 1)
                                      Text(
                                        "$party người",
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: OasisTheme.admBlueDeep,
                                        ),
                                      ),
                                  ],
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}

class _CrmCustomersTab extends StatefulWidget {
  const _CrmCustomersTab({
    required this.segment,
    required this.onRefresh,
  });

  final CrmCustomerSegment segment;
  final Future<void> Function({String q}) onRefresh;

  @override
  State<_CrmCustomersTab> createState() => _CrmCustomersTabState();
}

class _CrmCustomersTabState extends State<_CrmCustomersTab> {
  final _search = TextEditingController();

  bool get _isMembership => widget.segment == CrmCustomerSegment.membership;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _addCustomer() async {
    final name = TextEditingController();
    final phone = TextEditingController();
    String? planCode;
    final state = context.read<AppState>();
    final plans = state.crmPlans;

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
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _isMembership ? "Thêm khách Membership" : "Thêm khách lẻ",
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _isMembership
                          ? "Khách mua / gắn gói membership"
                          : "Khách dùng lẻ — chưa gắn gói membership",
                      style: const TextStyle(fontSize: 12, color: OasisTheme.muted),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: name,
                      decoration: const InputDecoration(labelText: "Họ và tên *"),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: "Số điện thoại *"),
                    ),
                    if (_isMembership) ...[
                      const SizedBox(height: 10),
                      DropdownButtonFormField<String?>(
                        // ignore: deprecated_member_use
                        value: planCode,
                        decoration: const InputDecoration(labelText: "Gói membership *"),
                        items: [
                          const DropdownMenuItem(value: null, child: Text("— Chọn gói —")),
                          ...plans.map(
                            (p) => DropdownMenuItem(
                              value: p["planCode"]?.toString(),
                              child: Text(p["name"]?.toString() ?? p["planCode"]?.toString() ?? ""),
                            ),
                          ),
                        ],
                        onChanged: (v) => setLocal(() => planCode = v),
                      ),
                    ],
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text(_isMembership ? "Lưu Membership" : "Lưu khách lẻ"),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    final n = name.text.trim();
    final p = phone.text.trim();
    disposeControllersAfterFrame([name, phone]);
    if (ok != true || n.isEmpty || p.isEmpty) return;
    if (_isMembership && (planCode == null || planCode!.isEmpty)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Membership cần chọn gói")),
      );
      return;
    }
    try {
      await state.createCrmCustomer({
        "fullName": n,
        "phone": p,
        "customerType": _isMembership ? "membership" : "walk_in",
        if (_isMembership) "planCode": planCode,
        "source": _isMembership ? "MEMBERSHIP" : "WALK_IN",
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _isMembership ? "Đã tạo khách Membership" : "Đã tạo khách lẻ",
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = _isMembership ? state.crmMembershipCustomers : state.crmWalkInCustomers;
    final totalLabel = _isMembership
        ? (state.crmCustomerCounts["membership"] ?? list.length)
        : (state.crmCustomerCounts["walkIn"] ?? list.length);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    hintText: _isMembership
                        ? "Tìm Membership · tên / SĐT / CUS"
                        : "Tìm khách lẻ · tên / SĐT / CUS",
                    prefixIcon: const Icon(Icons.search),
                    isDense: true,
                  ),
                  onSubmitted: (q) => widget.onRefresh(q: q),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: () => widget.onRefresh(q: _search.text),
                icon: const Icon(Icons.search),
              ),
              IconButton.filled(
                tooltip: _isMembership ? "Thêm Membership" : "Thêm khách lẻ",
                onPressed: _addCustomer,
                icon: const Icon(Icons.person_add_alt_1),
                style: IconButton.styleFrom(backgroundColor: OasisTheme.admBlue),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              _isMembership
                  ? "$totalLabel khách Membership (đã gắn gói)"
                  : "$totalLabel khách lẻ (chưa gắn gói)",
              style: const TextStyle(color: OasisTheme.muted, fontSize: 12),
            ),
          ),
        ),
        Expanded(
          child: list.isEmpty
              ? Center(
                  child: Text(
                    _isMembership ? "Chưa có khách Membership" : "Chưa có khách lẻ",
                    style: const TextStyle(color: OasisTheme.muted),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => widget.onRefresh(q: _search.text),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    itemCount: list.length,
                    itemBuilder: (context, i) {
                      final c = list[i];
                      final areaCode = () {
                        final pkg = c["packageCode"]?.toString() ?? "";
                        if (pkg.contains("SWIM")) return "OLYMPIC";
                        if (pkg.contains("PICK")) return "PICKLEBALL";
                        if (pkg.contains("VIP")) return "RESORT";
                        return "RESORT";
                      }();
                      final area = crmAreaTheme(areaCode);
                      final packageLabel = _isMembership
                          ? (c["packageName"]?.toString() ??
                              c["packageCode"]?.toString() ??
                              "Membership")
                          : "Khách lẻ";
                      final tags = (c["serviceTags"] as List? ?? [])
                          .map((e) => e.toString())
                          .where((e) => e.isNotEmpty)
                          .join(" · ");
                      final expiryInfo =
                          _isMembership ? _crmExpiryInfo(c["expiryDate"]?.toString()) : null;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: _isMembership ? area.soft : const Color(0xFFF1F5F9),
                            child: Text(
                              (c["fullName"]?.toString().isNotEmpty == true)
                                  ? c["fullName"].toString()[0].toUpperCase()
                                  : "?",
                              style: TextStyle(
                                color: _isMembership ? area.text : const Color(0xFF475569),
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          title: Text(
                            c["fullName"]?.toString() ?? "—",
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                "${c["customerCode"] ?? ""} · ${c["phone"]?.toString().isNotEmpty == true ? c["phone"] : "—"}",
                                style: const TextStyle(fontSize: 12, color: OasisTheme.muted),
                              ),
                              const SizedBox(height: 2),
                              Text.rich(
                                TextSpan(
                                  children: [
                                    TextSpan(
                                      text: packageLabel,
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: _isMembership
                                            ? OasisTheme.ink
                                            : OasisTheme.admBlueDeep,
                                      ),
                                    ),
                                    if (expiryInfo != null) ...[
                                      const TextSpan(
                                        text: " · ",
                                        style: TextStyle(fontSize: 12, color: OasisTheme.muted),
                                      ),
                                      TextSpan(
                                        text: expiryInfo.label,
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                          color: expiryInfo.color,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              if (expiryInfo != null) ...[
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: expiryInfo.soft,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: expiryInfo.border),
                                  ),
                                  child: Text(
                                    expiryInfo.badge,
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      color: expiryInfo.color,
                                    ),
                                  ),
                                ),
                              ],
                              if (tags.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  tags,
                                  style: const TextStyle(fontSize: 11, color: OasisTheme.muted),
                                ),
                              ],
                            ],
                          ),
                          isThreeLine: false,
                          trailing: Text(
                            "${c["totalVisits"] ?? 0} visit",
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: OasisTheme.muted,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

class _CrmExpiryInfo {
  const _CrmExpiryInfo({
    required this.days,
    required this.label,
    required this.badge,
    required this.color,
    required this.soft,
    required this.border,
  });
  final int days;
  final String label;
  final String badge;
  final Color color;
  final Color soft;
  final Color border;
}

/// Color tone aligned with HHGO CRM web (`remainingTone`).
_CrmExpiryInfo? _crmExpiryInfo(String? expiryRaw) {
  if (expiryRaw == null || expiryRaw.isEmpty) return null;
  final d = DateTime.tryParse(expiryRaw);
  if (d == null) return null;
  final end = DateTime(d.year, d.month, d.day);
  final today = DateTime.now();
  final start = DateTime(today.year, today.month, today.day);
  final days = end.difference(start).inDays;

  if (days < 0) {
    return _CrmExpiryInfo(
      days: days,
      label: "hết hạn",
      badge: "HẾT HẠN · ${-days} ngày trước",
      color: const Color(0xFFBE123C),
      soft: const Color(0xFFFFE4E6),
      border: const Color(0xFFFECDD3),
    );
  }
  if (days == 0) {
    return const _CrmExpiryInfo(
      days: 0,
      label: "hết hạn hôm nay",
      badge: "HẾT HẠN HÔM NAY",
      color: Color(0xFFBE123C),
      soft: Color(0xFFFFE4E6),
      border: Color(0xFFFECDD3),
    );
  }
  if (days <= 7) {
    return _CrmExpiryInfo(
      days: days,
      label: "còn $days ngày",
      badge: "SẮP HẾT · còn $days ngày",
      color: const Color(0xFFC2410C),
      soft: const Color(0xFFFFEDD5),
      border: const Color(0xFFFDBA74),
    );
  }
  if (days <= 14) {
    return _CrmExpiryInfo(
      days: days,
      label: "còn $days ngày",
      badge: "CẢNH BÁO · còn $days ngày",
      color: const Color(0xFFA16207),
      soft: const Color(0xFFFEF9C3),
      border: const Color(0xFFFDE68A),
    );
  }
  return _CrmExpiryInfo(
    days: days,
    label: "còn $days ngày",
    badge: "CÒN HẠN · $days ngày",
    color: const Color(0xFF047857),
    soft: const Color(0xFFD1FAE5),
    border: const Color(0xFFA7F3D0),
  );
}

class _CrmCheckinTab extends StatefulWidget {
  const _CrmCheckinTab({required this.onDone});
  final Future<void> Function() onDone;

  @override
  State<_CrmCheckinTab> createState() => _CrmCheckinTabState();
}

class _CrmCheckinTabState extends State<_CrmCheckinTab> {
  final _code = TextEditingController();
  String _area = "OLYMPIC";
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _checkin() async {
    final code = _code.text.trim();
    if (code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Nhập mã khách / membership / SĐT")),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await context.read<AppState>().crmCheckin(
            query: code,
            serviceCode: _area,
          );
      final visit = res["visit"] as Map?;
      if (!mounted) return;
      _code.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Check-in ${visit?["customerName"] ?? ""} · ${visit?["visitCode"] ?? ""}",
          ),
        ),
      );
      await widget.onDone();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$e")));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final areas = state.crmServices.isNotEmpty
        ? state.crmServices
            .map((s) => (code: s["code"]!.toString(), name: s["name"]?.toString() ?? s["code"].toString()))
            .toList()
        : crmServiceAreas.map((a) => (code: a.code, name: a.name)).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        const Text(
          "Check-in (ghi vào CRM DB)",
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: areas.map((a) {
            final t = crmAreaTheme(a.code);
            final on = _area == a.code;
            return ChoiceChip(
              label: Text(a.name),
              selected: on,
              selectedColor: t.soft,
              labelStyle: TextStyle(
                fontWeight: FontWeight.w700,
                color: on ? t.text : OasisTheme.muted,
              ),
              onSelected: (_) => setState(() => _area = a.code),
            );
          }).toList(),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _code,
          decoration: const InputDecoration(
            labelText: "Mã CUS / MEM / SĐT",
            prefixIcon: Icon(Icons.qr_code_scanner),
          ),
          onSubmitted: (_) => _checkin(),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _busy ? null : _checkin,
          icon: _busy
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Icon(Icons.login),
          label: const Text("Check-in", style: TextStyle(fontWeight: FontWeight.w800)),
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            backgroundColor: OasisTheme.admBlue,
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          "Visit gần đây (CRM DB)",
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
        ),
        const SizedBox(height: 8),
        if (state.crmRecentVisits.isEmpty)
          const Text("Chưa có check-in", style: TextStyle(color: OasisTheme.muted))
        else
          ...state.crmRecentVisits.map(
            (l) => ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle, color: OasisTheme.green),
              title: Text(
                "${l["customerName"]} · ${l["visitCode"]}",
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                "${(l["services"] as List? ?? []).join(", ")} · ${l["customerCode"]}",
                style: const TextStyle(fontSize: 11),
              ),
            ),
          ),
      ],
    );
  }
}

class _CrmPackagesTab extends StatelessWidget {
  const _CrmPackagesTab();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final plans = state.crmPlans;

    if (plans.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            "Gói từ CRM config (fallback)",
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          ...crmMembershipPackages.map((p) {
            final theme = crmPackageGroupThemes[p.group]!;
            return _pkgCard(
              name: p.name,
              desc: p.description,
              price: crmMoney(p.priceTotal),
              meta: "${p.durationDays} ngày · ${p.services.join(", ")}",
              theme: theme,
            );
          }),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Text(
          "${plans.length} gói trên CRM database",
          style: const TextStyle(color: OasisTheme.muted, fontSize: 12),
        ),
        const SizedBox(height: 10),
        ...plans.map((p) {
          final code = p["planCode"]?.toString() ?? "";
          final group = code.contains("SWIM")
              ? "SWIM"
              : code.contains("PICK")
                  ? "PICK"
                  : code.contains("VIP")
                      ? "VIP"
                      : "SWIM";
          final theme = crmPackageGroupThemes[group]!;
          final services = (p["services"] as List? ?? [])
              .map((e) => (e as Map)["code"]?.toString() ?? "")
              .where((e) => e.isNotEmpty)
              .join(", ");
          return _pkgCard(
            name: p["name"]?.toString() ?? code,
            desc: p["description"]?.toString() ?? code,
            price: "",
            meta: "${p["durationDays"] ?? "—"} ngày · $services",
            theme: theme,
          );
        }),
      ],
    );
  }

  Widget _pkgCard({
    required String name,
    required String desc,
    required String price,
    required String meta,
    required CrmPackageGroupTheme theme,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: TextStyle(fontWeight: FontWeight.w800, color: theme.text),
                ),
              ),
              if (price.isNotEmpty)
                Text(price, style: const TextStyle(fontWeight: FontWeight.w900)),
            ],
          ),
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(desc, style: const TextStyle(fontSize: 12, color: OasisTheme.muted)),
          ],
          const SizedBox(height: 6),
          Text(
            meta,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: theme.text.withValues(alpha: 0.8),
            ),
          ),
        ],
      ),
    );
  }
}
