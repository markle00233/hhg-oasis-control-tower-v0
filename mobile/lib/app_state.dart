import "dart:async";

import "package:flutter/foundation.dart";

import "api_client.dart";
import "models.dart";

enum TaskScope { mine, collab, all }

class AppState extends ChangeNotifier {
  AppState(this.api);

  final ApiClient api;

  UserAccount? user;
  bool bootstrapping = true;
  bool busy = false;
  /// True while secondary (non-blocking) fetches are in flight.
  bool backgroundLoading = false;
  String? error;

  DashboardData? dashboard;
  List<OasisProject> projects = [];
  List<Map<String, dynamic>> expenses = [];
  List<Map<String, dynamic>> decisions = [];
  List<Map<String, dynamic>> dailyCloses = [];
  List<Map<String, dynamic>> documents = [];
  List<Map<String, dynamic>> issues = [];
  List<Map<String, dynamic>> units = [];
  List<UserAccount> directory = [];

  TaskScope scope = TaskScope.mine;
  String filter = "all";
  String search = "";

  int _loadGen = 0;
  int _secondaryToken = 0;

  static const unitNames = [
    "Lòng Nướng",
    "Spa",
    "Hồ bơi",
    "Gym",
    "Pickleball",
    "Bếp Trung Tâm",
    "Mía Ơi",
    "Dùng chung",
  ];

  bool get isAuthenticated => user != null;

  String get _projectScopeKey => user?.isAdmin == true
      ? "all"
      : switch (scope) {
          TaskScope.mine => "mine",
          TaskScope.collab => "collab",
          TaskScope.all => "all",
        };

  Future<void> bootstrap() async {
    bootstrapping = true;
    notifyListeners();
    try {
      await api.loadSession();
      if (api.hasSession) {
        final me = await api.get("/api/auth/me");
        if (me is Map && me["authenticated"] == true && me["user"] is Map) {
          user = UserAccount.fromJson(Map<String, dynamic>.from(me["user"] as Map));
          // Show shell immediately; load data after paint.
          bootstrapping = false;
          notifyListeners();
          await refreshCore();
          unawaited(refreshSecondary());
          return;
        }
        await api.clearSession();
        user = null;
      }
    } catch (_) {
      await api.clearSession();
      user = null;
    } finally {
      bootstrapping = false;
      notifyListeners();
    }
  }

  Future<void> login(String username, String password) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      final data = await api.post("/api/auth/login", body: {
        "username": username.trim(),
        "password": password,
      });
      if (data is! Map || data["authenticated"] != true || data["user"] is! Map) {
        throw ApiException("Đăng nhập thất bại");
      }
      if (!api.hasSession) {
        throw ApiException("Không nhận được session cookie từ server");
      }
      user = UserAccount.fromJson(Map<String, dynamic>.from(data["user"] as Map));
      // Unlock UI immediately; Tasks/Leaders fill in right after paint.
      busy = false;
      notifyListeners();
      unawaited(() async {
        await refreshCore();
        unawaited(refreshSecondary());
      }());
    } on ApiException catch (e) {
      error = e.message;
      busy = false;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    _loadGen++;
    try {
      await api.post("/api/auth/logout");
    } catch (_) {}
    await api.clearSession();
    user = null;
    dashboard = null;
    projects = [];
    expenses = [];
    decisions = [];
    dailyCloses = [];
    documents = [];
    issues = [];
    directory = [];
    units = [];
    crmSummary = null;
    crmCustomers = [];
    crmMembershipCustomers = [];
    crmWalkInCustomers = [];
    crmAppCustomers = [];
    crmAppCustomersTotal = 0;
    crmCustomerCounts = const {"membership": 0, "walkIn": 0, "all": 0};
    crmServices = [];
    crmPlans = [];
    crmRecentVisits = [];
    crmError = null;
    backgroundLoading = false;
    notifyListeners();
  }

  List<UserAccount> get leaders =>
      directory.where((u) => !u.isAdmin && u.status != "DISABLED").toList();

  String _norm(String? s) =>
      (s ?? "").toLowerCase().replaceAll(RegExp(r"\s+"), "");

  bool ownerMatches(String? owner, UserAccount u) {
    final o = _norm(owner);
    if (o.isEmpty) return false;
    final username = _norm(u.username);
    final display = _norm(u.displayName);
    return o == username ||
        o == display ||
        (username.isNotEmpty && o.contains(username)) ||
        (display.isNotEmpty && o.contains(display));
  }

  List<OasisProject> projectsForLeader(UserAccount u) => projects.where((p) {
        if (ownerMatches(p.owner, u)) return true;
        return p.members.any(
          (m) => m.userId == u.id && m.role.toUpperCase() == "PRIMARY",
        );
      }).toList();

  /// Equal weight: n tasks → each 100/n; DONE full, else energy% of weight.
  int leaderOverallPct(UserAccount u) {
    final list = projectsForLeader(u);
    if (list.isEmpty) return 0;
    final weight = 100 / list.length;
    var sum = 0.0;
    for (final p in list) {
      if (p.status == "DONE") {
        sum += weight;
      } else {
        sum += (p.energy / 100) * weight;
      }
    }
    return sum.round();
  }

  List<Map<String, dynamic>> _maps(dynamic raw) => (raw as List? ?? [])
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();

  List<OasisProject> _parseProjects(dynamic list) => (list as List? ?? [])
      .whereType<Map>()
      .map((e) => OasisProject.fromJson(Map<String, dynamic>.from(e)))
      .toList();

  List<UserAccount> _parseUsers(dynamic usersRaw) {
    final list = usersRaw is Map ? usersRaw["users"] : usersRaw;
    return (list as List? ?? [])
        .whereType<Map>()
        .map((e) => UserAccount.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Fast path: Tasks (+ Leaders directory + pending Quyết định for Admin).
  Future<void> refreshCore() async {
    final gen = ++_loadGen;
    try {
      if (user?.isAdmin == true) {
        // Admin must see Prisma decisions immediately (approve inbox).
        final results = await Future.wait([
          _soft(api.get("/api/projects", query: {"scope": _projectScopeKey})),
          _soft(api.get("/api/users")),
          _soft(api.get("/api/decisions")),
          _soft(api.get("/api/expenses")),
        ]);
        if (gen != _loadGen) return;
        if (results[0] != null) projects = _parseProjects(results[0]);
        if (results[1] != null) directory = _parseUsers(results[1]);
        if (results[2] != null) decisions = _maps(results[2]);
        if (results[3] != null) expenses = _maps(results[3]);
      } else {
        final results = await Future.wait([
          _soft(api.get("/api/projects", query: {"scope": _projectScopeKey})),
          _soft(api.get("/api/decisions")),
        ]);
        if (gen != _loadGen) return;
        if (results[0] != null) projects = _parseProjects(results[0]);
        if (results[1] != null) decisions = _maps(results[1]);
      }
    } catch (_) {
      // Keep previous snapshot on soft failure.
    }
    notifyListeners();
  }

  Future<T?> _soft<T>(Future<T> future) async {
    try {
      return await future;
    } catch (_) {
      return null;
    }
  }

  /// Slow path: docs / issues / closes — runs in background (Prisma APIs).
  Future<void> refreshSecondary() async {
    final token = ++_secondaryToken;
    backgroundLoading = true;
    notifyListeners();

    final run = () async {
      try {
        final results = await Future.wait([
          _soft(api.get("/api/expenses")),
          _soft(api.get("/api/decisions")),
          _soft(api.get("/api/daily-closes")),
          _soft(api.get("/api/issues")),
          _soft(api.get("/api/documents")),
          if (user?.isAdmin != true) _soft(api.get("/api/users")),
        ]);
        // Only the latest secondary run may apply (avoids stale wipe).
        if (token != _secondaryToken) return;

        if (results[0] != null) expenses = _maps(results[0]);
        if (results[1] != null) decisions = _maps(results[1]);
        if (results[2] != null) dailyCloses = _maps(results[2]);
        if (results[3] != null) issues = _maps(results[3]);
        if (results[4] != null) documents = _maps(results[4]);
        if (user?.isAdmin != true && results.length > 5 && results[5] != null) {
          directory = _parseUsers(results[5]);
        }

        unawaited(_loadDashboardQuiet(token));
      } finally {
        if (token == _secondaryToken) {
          backgroundLoading = false;
          notifyListeners();
        }
      }
    }();

    return run;
  }

  Future<void> _loadDashboardQuiet(int token) async {
    try {
      final dash = await api.get("/api/dashboard");
      if (token != _secondaryToken) return;
      if (dash is Map) {
        dashboard = DashboardData.fromJson(Map<String, dynamic>.from(dash));
        units = _maps(dash["units"]);
        notifyListeners();
      }
    } catch (_) {}
  }

  /// Force re-fetch Quyết định from Prisma (tab open / pull).
  Future<void> loadDecisions() async {
    final raw = await _soft(api.get("/api/decisions"));
    if (raw != null) {
      decisions = _maps(raw);
      notifyListeners();
    }
  }

  /// Force re-fetch Chi phí from Prisma.
  Future<void> loadExpenses() async {
    final raw = await _soft(api.get("/api/expenses"));
    if (raw != null) {
      expenses = _maps(raw);
      notifyListeners();
    }
  }

  /// Pull-to-refresh: core (incl. decisions/expenses) then secondary.
  Future<void> refresh() async {
    await refreshCore();
    unawaited(refreshSecondary());
  }

  void setScope(TaskScope s) {
    scope = s;
    notifyListeners();
    unawaited(refreshCore());
  }

  void setFilter(String f) {
    filter = filter == f ? "all" : f;
    notifyListeners();
  }

  void setSearch(String q) {
    search = q;
    notifyListeners();
  }

  List<OasisProject> get visibleProjects {
    var list = projects.toList();
    if (filter == "blocked") {
      list = list.where((p) => p.status == "BLOCKED").toList();
    } else if (filter == "done") {
      list = list.where((p) => p.status == "DONE").toList();
    } else if (filter == "overdue") {
      list = list.where((p) {
        if (p.status == "DONE" || (p.deadline ?? "").isEmpty) return false;
        final d = DateTime.tryParse(p.deadline!);
        if (d == null) return false;
        final today = DateTime.now();
        final t0 = DateTime(today.year, today.month, today.day);
        return d.isBefore(t0);
      }).toList();
    }
    final q = search.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list
          .where((p) =>
              p.name.toLowerCase().contains(q) ||
              (p.owner ?? "").toLowerCase().contains(q) ||
              p.id.toLowerCase().contains(q))
          .toList();
    }
    return list;
  }

  Future<OasisProject> fetchProject(String id) async {
    final data = await api.get("/api/projects/$id");
    final p = OasisProject.fromJson(Map<String, dynamic>.from(data as Map));
    final idx = projects.indexWhere((e) => e.id == id);
    if (idx >= 0) {
      projects[idx] = p;
    } else {
      projects = [p, ...projects];
    }
    notifyListeners();
    return p;
  }

  /// Voice/manual scripts → GPT điền form Create Task.
  Future<Map<String, dynamic>> parseTaskFromScripts(List<String> scripts) async {
    final data = await api.post("/api/ai/parse-task", body: {
      "scripts": scripts,
    });
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> planSubtasksWithAi(String projectId, {bool apply = true}) async {
    busy = true;
    notifyListeners();
    try {
      final data = await api.post("/api/ai/plan-subtasks", body: {
        "projectId": projectId,
        "apply": apply,
      });
      final map = Map<String, dynamic>.from(data as Map);
      // Refresh project list so Lịch picks up new step deadlines.
      await refreshCore();
      if (map["project"] is Map) {
        final p = OasisProject.fromJson(Map<String, dynamic>.from(map["project"] as Map));
        final idx = projects.indexWhere((e) => e.id == p.id);
        if (idx >= 0) {
          projects[idx] = p;
        } else {
          projects = [p, ...projects];
        }
        notifyListeners();
      }
      return map;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<OasisProject> patchProject(String id, Map<String, dynamic> body) async {
    busy = true;
    notifyListeners();
    try {
      final data = await api.patch("/api/projects/$id", body: body);
      final p = OasisProject.fromJson(Map<String, dynamic>.from(data as Map));
      final idx = projects.indexWhere((e) => e.id == id);
      if (idx >= 0) projects[idx] = p;
      notifyListeners();
      return p;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<OasisProject> createProject(Map<String, dynamic> body) async {
    busy = true;
    notifyListeners();
    try {
      final data = await api.post("/api/projects", body: body);
      final p = OasisProject.fromJson(Map<String, dynamic>.from(data as Map));
      projects = [p, ...projects.where((e) => e.id != p.id)];
      notifyListeners();
      // Only re-pull Tasks — don't wait on Chi phí / docs / dashboard.
      unawaited(refreshCore());
      return p;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> createExpense(Map<String, dynamic> body) async {
    busy = true;
    notifyListeners();
    try {
      await api.post("/api/expenses", body: body);
      try {
        expenses = _maps(await api.get("/api/expenses"));
      } catch (_) {
        unawaited(refreshSecondary());
      }
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> createDecision(Map<String, dynamic> body) async {
    busy = true;
    notifyListeners();
    try {
      await api.post("/api/decisions", body: body);
      try {
        decisions = _maps(await api.get("/api/decisions"));
      } catch (_) {
        unawaited(refreshSecondary());
      }
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> resolveDecision(String id, String status, {String? note}) async {
    busy = true;
    notifyListeners();
    try {
      await api.patch("/api/decisions/$id", body: {
        "status": status,
        if (note != null && note.isNotEmpty) "resolutionNote": note,
      });
      // Refresh decisions + expenses (approve cost → new expense).
      final results = await Future.wait([
        _soft(api.get("/api/decisions")),
        _soft(api.get("/api/expenses")),
      ]);
      if (results[0] != null) decisions = _maps(results[0]);
      if (results[1] != null) expenses = _maps(results[1]);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> createDailyClose(Map<String, dynamic> body) async {
    busy = true;
    notifyListeners();
    try {
      await api.post("/api/daily-closes", body: body);
      try {
        dailyCloses = _maps(await api.get("/api/daily-closes"));
      } catch (_) {
        unawaited(refreshSecondary());
      }
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> createIssue(Map<String, dynamic> body) async {
    busy = true;
    notifyListeners();
    try {
      await api.post("/api/issues", body: body);
      try {
        issues = _maps(await api.get("/api/issues"));
      } catch (_) {
        unawaited(refreshSecondary());
      }
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<List<Map<String, dynamic>>> fetchProjectDocs(String projectId) async {
    final data = await api.get("/api/documents", query: {"projectId": projectId});
    return _maps(data);
  }

  /// Upload PDF/ảnh gắn Task (và tùy chọn hạng mục qua note `step:N`).
  Future<Map<String, dynamic>> uploadProjectDoc({
    required String projectId,
    required String fileName,
    required String dataUrl,
    String? note,
    int? stepIndex,
  }) async {
    final data = await api.post("/api/documents", body: {
      "fileName": fileName,
      "dataUrl": dataUrl,
      "projectId": projectId,
      "entityType": "PROJECT",
      "entityId": projectId,
      "relationType": "GENERAL",
      "note": stepIndex != null ? "step:$stepIndex${note != null && note.isNotEmpty ? " · $note" : ""}" : note,
    });
    return Map<String, dynamic>.from(data as Map);
  }

  /// Chụp/đính ảnh proof cho 1 hạng mục nhỏ (stepProofs trên Project).
  Future<OasisProject> addStepProof({
    required String projectId,
    required int stepIndex,
    required String fileName,
    required String dataUrl,
  }) {
    return patchProject(projectId, {
      "stepIndex": stepIndex,
      "proof": {"name": fileName, "dataUrl": dataUrl},
    });
  }

  Future<OasisProject> removeStepProof({
    required String projectId,
    required int stepIndex,
    required int proofIndex,
  }) {
    return patchProject(projectId, {
      "stepIndex": stepIndex,
      "removeProofIndex": proofIndex,
    });
  }

  // ── HHGO CRM (crm_* tables on Control Tower DATABASE_URL) ──

  Map<String, dynamic>? crmSummary;
  List<Map<String, dynamic>> crmCustomers = [];
  List<Map<String, dynamic>> crmMembershipCustomers = [];
  List<Map<String, dynamic>> crmWalkInCustomers = [];
  /// Khách app (QR pass) — CRM › Khách lẻ. Chưa có tên → dùng customerCode.
  List<Map<String, dynamic>> crmAppCustomers = [];
  int crmAppCustomersTotal = 0;
  int crmAppTimelineDays = 30;
  Map<String, int> crmCustomerCounts = const {
    "membership": 0,
    "walkIn": 0,
    "all": 0,
  };
  List<Map<String, dynamic>> crmServices = [];
  List<Map<String, dynamic>> crmPlans = [];
  List<Map<String, dynamic>> crmRecentVisits = [];
  String? crmError;
  bool crmLoading = false;

  Future<void> loadCrm({String customerQuery = ""}) async {
    if (user?.isAdmin != true) return;
    crmError = null;
    crmLoading = true;
    notifyListeners();
    try {
      final q = customerQuery.trim();
      // Isolate failures: Khách lẻ (app-customers) must not wipe Membership.
      final settled = await Future.wait<Object?>([
        api.get("/api/crm/summary").then<Object?>((v) => v).catchError((e) => e),
        api
            .get(
              "/api/crm/customers",
              query: {
                "take": "100",
                "segment": "membership",
                if (q.isNotEmpty) "q": q,
              },
            )
            .then<Object?>((v) => v)
            .catchError((e) => e),
        api
            .get(
              "/api/crm/customers",
              query: {
                "take": "100",
                "segment": "walk_in",
                if (q.isNotEmpty) "q": q,
              },
            )
            .then<Object?>((v) => v)
            .catchError((e) => e),
        api
            .get(
              "/api/crm/app-customers",
              query: {
                "take": "100",
                "days": "$crmAppTimelineDays",
                if (q.isNotEmpty) "q": q,
              },
            )
            .then<Object?>((v) => v)
            .catchError((e) => e),
      ]);

      final errors = <String>[];
      Map<String, dynamic>? asMap(Object? v, String label) {
        if (v is Map) return Map<String, dynamic>.from(v);
        if (v != null) errors.add("$label: $v");
        return null;
      }

      final summary = asMap(settled[0], "summary");
      if (summary != null) {
        crmSummary = Map<String, dynamic>.from(summary["summary"] as Map? ?? {});
        crmServices = _maps(summary["services"]);
        crmPlans = _maps(summary["plans"]);
        crmRecentVisits = _maps(summary["recentVisits"]);
      }

      final app = asMap(settled[3], "app-customers");
      if (app != null) {
        crmAppCustomers = _maps(app["customers"]);
        crmAppCustomersTotal =
            (app["total"] as num?)?.toInt() ?? crmAppCustomers.length;
        crmAppTimelineDays =
            (app["days"] as num?)?.toInt() ?? crmAppTimelineDays;
      }

      final mem = asMap(settled[1], "membership");
      final walk = asMap(settled[2], "walk_in");
      // Server cũ (chưa có segment) có thể trả cả 2 list giống nhau —
      // luôn tách lại phía client: có gói = Membership, chưa gói = walk-in CRM.
      final memRaw = mem != null ? _maps(mem["customers"]) : <Map<String, dynamic>>[];
      final walkRaw = walk != null ? _maps(walk["customers"]) : <Map<String, dynamic>>[];
      final merged = <String, Map<String, dynamic>>{};
      for (final c in [...memRaw, ...walkRaw]) {
        final id = c["id"]?.toString() ?? c["customerCode"]?.toString() ?? "";
        if (id.isEmpty) continue;
        merged[id] = c;
      }
      bool hasMembership(Map<String, dynamic> c) {
        final mems = c["memberships"];
        if (mems is List && mems.isNotEmpty) return true;
        final code = c["membershipCode"]?.toString() ?? "";
        final pkg = c["packageCode"]?.toString() ?? c["packageName"]?.toString() ?? "";
        return code.isNotEmpty || pkg.isNotEmpty;
      }

      if (mem != null || walk != null) {
        crmMembershipCustomers = merged.values.where(hasMembership).toList();
        crmWalkInCustomers = merged.values.where((c) => !hasMembership(c)).toList();
        crmCustomers = [...crmMembershipCustomers, ...crmWalkInCustomers];
        final counts = mem?["counts"] is Map
            ? Map<String, dynamic>.from(mem!["counts"] as Map)
            : (walk?["counts"] is Map
                ? Map<String, dynamic>.from(walk!["counts"] as Map)
                : const {});
        crmCustomerCounts = {
          "membership":
              (counts["membership"] as num?)?.toInt() ?? crmMembershipCustomers.length,
          "walkIn": (counts["walkIn"] as num?)?.toInt() ?? crmWalkInCustomers.length,
          "all": (counts["all"] as num?)?.toInt() ??
              crmMembershipCustomers.length + crmWalkInCustomers.length,
        };
        if (mem?["segment"] == null && walk?["segment"] == null) {
          crmCustomerCounts = {
            "membership": crmMembershipCustomers.length,
            "walkIn": crmWalkInCustomers.length,
            "all": crmCustomers.length,
          };
        }
      }

      if (errors.isNotEmpty) {
        final authExpired = errors.any((e) {
          final s = e.toLowerCase();
          return s.contains("vui lòng chọn tài khoản") ||
              s.contains("http 401") ||
              s.contains(": 401");
        });
        if (authExpired) {
          crmError =
              "Phiên đăng nhập hết hạn. Đăng xuất rồi đăng nhập lại bằng ADMINISTRATION.";
          // Bounce to login so stale JWT (e.g. after DB reseed) cannot linger.
          unawaited(logout());
        } else {
          crmError = errors.join(" · ");
        }
      }
    } catch (e) {
      final msg = "$e";
      if (msg.toLowerCase().contains("vui lòng chọn tài khoản") ||
          msg.contains("401")) {
        crmError =
            "Phiên đăng nhập hết hạn. Đăng xuất rồi đăng nhập lại bằng ADMINISTRATION.";
        unawaited(logout());
      } else {
        crmError = msg.contains("HTML") || msg.contains("JSON")
            ? "CRM API chưa sẵn trên server đang dùng. Chạy Next local hoặc deploy CRM routes."
            : msg;
      }
    } finally {
      crmLoading = false;
      notifyListeners();
    }
  }

  Future<void> createCrmCustomer(Map<String, dynamic> body) async {
    await api.post("/api/crm/customers", body: body);
    await loadCrm();
  }

  Future<Map<String, dynamic>> crmCheckin({
    required String query,
    required String serviceCode,
  }) async {
    final data = await api.post(
      "/api/crm/checkin",
      body: {"query": query, "serviceCode": serviceCode},
    );
    unawaited(loadCrm());
    return Map<String, dynamic>.from(data as Map);
  }

  /// Timeline quét QR của khách app (CRM › Khách lẻ › bấm ID).
  Future<Map<String, dynamic>> loadAppCustomerTimeline(
    String customerCode, {
    int? days,
  }) async {
    final d = days ?? crmAppTimelineDays;
    final data = await api.get(
      "/api/crm/app-customers/${Uri.encodeComponent(customerCode)}",
      query: {"days": "$d"},
    );
    return Map<String, dynamic>.from(data as Map);
  }
}
