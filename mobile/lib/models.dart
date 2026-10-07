class UserAccount {
  final String id;
  final String username;
  final String displayName;
  final String systemRole;
  final String status;

  const UserAccount({
    required this.id,
    required this.username,
    required this.displayName,
    required this.systemRole,
    this.status = "ACTIVE",
  });

  factory UserAccount.fromJson(Map<String, dynamic> j) => UserAccount(
        id: j["id"]?.toString() ?? "",
        username: j["username"]?.toString() ?? "",
        displayName: j["displayName"]?.toString() ?? j["username"]?.toString() ?? "",
        systemRole: j["systemRole"]?.toString() ?? "STANDARD",
        status: j["status"]?.toString() ?? "ACTIVE",
      );

  bool get isAdmin => systemRole == "SYSTEM_ADMIN";
}

class UnitInfo {
  final String id;
  final String name;
  const UnitInfo({required this.id, required this.name});
  factory UnitInfo.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const UnitInfo(id: "", name: "");
    return UnitInfo(id: j["id"]?.toString() ?? "", name: j["name"]?.toString() ?? "");
  }
}

class ProjectMember {
  final String userId;
  final String role;
  final String displayName;
  final String username;

  const ProjectMember({
    required this.userId,
    required this.role,
    required this.displayName,
    required this.username,
  });

  factory ProjectMember.fromJson(Map<String, dynamic> j) {
    final user = j["user"] as Map<String, dynamic>?;
    return ProjectMember(
      userId: j["userId"]?.toString() ?? user?["id"]?.toString() ?? "",
      role: j["role"]?.toString() ?? "COLLABORATOR",
      displayName: user?["displayName"]?.toString() ?? user?["username"]?.toString() ?? "",
      username: user?["username"]?.toString() ?? "",
    );
  }
}

class ProjectEvent {
  final String action;
  final String? detail;
  final String? oldValue;
  final String? newValue;
  final DateTime? createdAt;
  final String actorName;

  const ProjectEvent({
    required this.action,
    this.detail,
    this.oldValue,
    this.newValue,
    this.createdAt,
    this.actorName = "—",
  });

  factory ProjectEvent.fromJson(Map<String, dynamic> j) {
    final actor = j["actor"] as Map<String, dynamic>?;
    return ProjectEvent(
      action: j["action"]?.toString() ?? "",
      detail: j["detail"]?.toString(),
      oldValue: j["oldValue"]?.toString(),
      newValue: j["newValue"]?.toString(),
      createdAt: j["createdAt"] != null ? DateTime.tryParse(j["createdAt"].toString()) : null,
      actorName: actor?["displayName"]?.toString() ?? actor?["username"]?.toString() ?? "—",
    );
  }
}

class OasisProject {
  final String id;
  final String name;
  final String? owner;
  final String? description;
  final String priority;
  final String? deadline;
  final int readiness;
  final String status;
  final String stepFlags;
  final List<String> stepLabels;
  final List<String> stepDeadlines;
  final List<String> stepOwners;
  final List<int?> stepEstimates;
  /// Per-step proof images: `[[{name, dataUrl}, ...], ...]`
  final List<List<Map<String, dynamic>>> stepProofs;
  final UnitInfo? unit;
  final List<ProjectMember> members;
  final List<ProjectEvent> events;
  final List<Map<String, dynamic>> expenses;
  final String? quadrant;
  final bool? important;
  final bool? urgent;
  final DateTime? acknowledgedAt;
  final String? revisionNote;
  final String? waitingFor;
  final String? waitingReason;
  final String? blockerTitle;
  final String? blockerDescription;
  final String? pauseReason;
  final String? expectedResult;
  final String? deadlineRisk;
  final String? deadlineRiskReason;
  final int? estimatedDurationMinutes;
  final int? progressDone;
  final int? progressTotal;
  final int? progressPercent;
  final String? currentStepLabel;
  final String? nextStepLabel;
  final List<String> allowedActions;
  final List<String> adminOverrideActions;
  final List<String> submitBlockers;
  final bool awaitingAcknowledgement;
  final bool canEditWorkPlan;
  /// AI plan payload: stepDetails / aiAgentVars / budgetMinutes …
  final Map<String, dynamic>? pendingChangeRequest;

  const OasisProject({
    required this.id,
    required this.name,
    this.owner,
    this.description,
    this.priority = "P2",
    this.deadline,
    this.readiness = 0,
    this.status = "TODO",
    this.stepFlags = "0000",
    this.stepLabels = const [],
    this.stepDeadlines = const [],
    this.stepOwners = const [],
    this.stepEstimates = const [],
    this.stepProofs = const [],
    this.unit,
    this.members = const [],
    this.events = const [],
    this.expenses = const [],
    this.quadrant,
    this.important,
    this.urgent,
    this.acknowledgedAt,
    this.revisionNote,
    this.waitingFor,
    this.waitingReason,
    this.blockerTitle,
    this.blockerDescription,
    this.pauseReason,
    this.expectedResult,
    this.deadlineRisk,
    this.deadlineRiskReason,
    this.estimatedDurationMinutes,
    this.progressDone,
    this.progressTotal,
    this.progressPercent,
    this.currentStepLabel,
    this.nextStepLabel,
    this.allowedActions = const [],
    this.adminOverrideActions = const [],
    this.submitBlockers = const [],
    this.awaitingAcknowledgement = false,
    this.canEditWorkPlan = true,
    this.pendingChangeRequest,
  });

  factory OasisProject.fromJson(Map<String, dynamic> j) {
    List<String> asStringList(dynamic raw) {
      if (raw is! List) return const [];
      return raw.map((e) => e?.toString() ?? "").toList();
    }

    final vc = j["viewerContext"] is Map ? Map<String, dynamic>.from(j["viewerContext"] as Map) : null;
    DateTime? ackAt;
    final rawAck = j["acknowledgedAt"];
    if (rawAck != null) ackAt = DateTime.tryParse(rawAck.toString());

    return OasisProject(
      id: j["id"]?.toString() ?? "",
      name: j["name"]?.toString() ?? "",
      owner: j["owner"]?.toString(),
      description: j["description"]?.toString(),
      priority: j["priority"]?.toString() ?? "P2",
      deadline: j["deadline"]?.toString(),
      readiness: (j["readiness"] as num?)?.toInt() ?? 0,
      status: j["status"]?.toString() ?? "TODO",
      stepFlags: j["stepFlags"]?.toString() ?? "0000",
      stepLabels: asStringList(j["stepLabels"]),
      stepDeadlines: asStringList(j["stepDeadlines"]),
      stepOwners: asStringList(j["stepOwners"]),
      stepEstimates: (j["stepEstimates"] as List? ?? [])
          .map((e) => e == null || e == "" ? null : (e as num?)?.toInt())
          .toList(),
      stepProofs: () {
        final raw = j["stepProofs"];
        if (raw is! List) return const <List<Map<String, dynamic>>>[];
        return raw.map((step) {
          if (step is! List) return <Map<String, dynamic>>[];
          return step
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }).toList();
      }(),
      unit: j["unit"] != null ? UnitInfo.fromJson(j["unit"] as Map<String, dynamic>) : null,
      members: (j["members"] as List? ?? [])
          .whereType<Map>()
          .map((e) => ProjectMember.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      events: (j["events"] as List? ?? [])
          .whereType<Map>()
          .map((e) => ProjectEvent.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      expenses: (j["expenses"] as List? ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList(),
      quadrant: (j["quadrant"] ?? vc?["quadrant"])?.toString(),
      important: j["important"] as bool?,
      urgent: j["urgent"] as bool?,
      acknowledgedAt: ackAt,
      revisionNote: j["revisionNote"]?.toString(),
      waitingFor: j["waitingFor"]?.toString(),
      waitingReason: j["waitingReason"]?.toString(),
      blockerTitle: j["blockerTitle"]?.toString(),
      blockerDescription: j["blockerDescription"]?.toString(),
      pauseReason: j["pauseReason"]?.toString(),
      expectedResult: j["expectedResult"]?.toString(),
      deadlineRisk: j["deadlineRisk"]?.toString(),
      deadlineRiskReason: j["deadlineRiskReason"]?.toString(),
      estimatedDurationMinutes: (j["estimatedDurationMinutes"] as num?)?.toInt(),
      progressDone: (j["workPlanProgress"] is Map ? (j["workPlanProgress"]["done"] as num?)?.toInt() : null) ??
          (vc?["progress"] is Map ? (vc!["progress"]["done"] as num?)?.toInt() : null),
      progressTotal: (j["workPlanProgress"] is Map ? (j["workPlanProgress"]["total"] as num?)?.toInt() : null) ??
          (vc?["progress"] is Map ? (vc!["progress"]["total"] as num?)?.toInt() : null),
      progressPercent: (j["workPlanProgress"] is Map ? (j["workPlanProgress"]["percent"] as num?)?.toInt() : null) ??
          (vc?["progress"] is Map ? (vc!["progress"]["percent"] as num?)?.toInt() : null),
      currentStepLabel: (j["currentStep"] is Map ? j["currentStep"]["currentLabel"]?.toString() : null) ??
          (vc?["currentStep"] is Map ? vc!["currentStep"]["currentLabel"]?.toString() : null),
      nextStepLabel: (j["currentStep"] is Map ? j["currentStep"]["nextLabel"]?.toString() : null) ??
          (vc?["currentStep"] is Map ? vc!["currentStep"]["nextLabel"]?.toString() : null),
      allowedActions: asStringList(vc?["allowedActions"]),
      adminOverrideActions: asStringList(vc?["adminOverrideActions"]),
      submitBlockers: asStringList(vc?["submitBlockers"]),
      awaitingAcknowledgement: vc?["awaitingAcknowledgement"] == true,
      canEditWorkPlan: vc?["canEditWorkPlan"] != false,
      pendingChangeRequest: j["pendingChangeRequest"] is Map
          ? Map<String, dynamic>.from(j["pendingChangeRequest"] as Map)
          : null,
    );
  }

  /// Chi tiết hạng mục do AI ghi (description + howToSteps + priorityLevel).
  List<Map<String, dynamic>> get stepDetails {
    final pending = pendingChangeRequest;
    if (pending == null) return const [];
    final raw = pending["stepDetails"];
    if (raw is List) {
      return raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    final vars = pending["aiAgentVars"];
    if (vars is Map) {
      final subs = vars["subtasks"];
      if (subs is List) {
        return subs
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    }
    return const [];
  }

  int? get aiBudgetMinutes {
    final v = pendingChangeRequest?["budgetMinutes"];
    if (v is num) return v.toInt();
    final vars = pendingChangeRequest?["aiAgentVars"];
    if (vars is Map && vars["budgetMinutes"] is num) {
      return (vars["budgetMinutes"] as num).toInt();
    }
    return estimatedDurationMinutes;
  }

  int get energy {
    final labels = stepLabels.where((e) => e.trim().isNotEmpty).toList();
    final n = labels.isNotEmpty ? labels.length : stepFlags.replaceAll(RegExp(r"[^01]"), "").length;
    if (n <= 0) return readiness.clamp(0, 100);
    var flags = stepFlags.replaceAll(RegExp(r"[^01]"), "");
    if (flags.length < n) flags = flags.padRight(n, "0");
    if (flags.length > n) flags = flags.substring(0, n);
    final done = flags.split("").where((c) => c == "1").length;
    return ((done / n) * 100).round();
  }

  String get statusVi {
    switch (status) {
      case "TODO":
        return "Chưa làm";
      case "DOING":
      case "ON_TRACK":
        return "Đang làm";
      case "WAITING":
      case "AT_RISK":
        return "Đang chờ";
      case "BLOCKED":
        return "Bị chặn";
      case "PAUSED":
        return "Tạm dừng";
      case "IN_REVIEW":
        return "Chờ duyệt";
      case "DONE":
        return "Hoàn tất";
      default:
        return status;
    }
  }

  String get quadrantLabel {
    switch (quadrant) {
      case "DO_NOW":
        return "DO NOW";
      case "PLAN":
        return "PLAN";
      case "QUICK_ACTION":
        return "QUICK ACTION";
      case "BACKLOG":
        return "BACKLOG";
      default:
        return priority;
    }
  }
}

class DashboardData {
  final String? date;
  final Map<String, dynamic>? summary;
  final List<OasisProject> projects;
  final List<Map<String, dynamic>> expenses;
  final List<Map<String, dynamic>> decisions;

  const DashboardData({
    this.date,
    this.summary,
    this.projects = const [],
    this.expenses = const [],
    this.decisions = const [],
  });

  factory DashboardData.fromJson(Map<String, dynamic> j) => DashboardData(
        date: j["date"]?.toString(),
        summary: j["summary"] is Map ? Map<String, dynamic>.from(j["summary"] as Map) : null,
        projects: (j["projects"] as List? ?? [])
            .whereType<Map>()
            .map((e) => OasisProject.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        expenses: (j["expenses"] as List? ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList(),
        decisions: (j["decisions"] as List? ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList(),
      );
}
