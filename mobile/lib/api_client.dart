import "dart:convert";

import "package:http/http.dart" as http;
import "package:shared_preferences/shared_preferences.dart";

import "config.dart";

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, {this.statusCode = 0});
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? _sessionCookie;

  String? get sessionCookie => _sessionCookie;
  bool get hasSession => (_sessionCookie ?? "").isNotEmpty;

  Future<void> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    _sessionCookie = prefs.getString("hhg_session_cookie");
  }

  Future<void> _persistSession(String? value) async {
    _sessionCookie = value;
    final prefs = await SharedPreferences.getInstance();
    if (value == null || value.isEmpty) {
      await prefs.remove("hhg_session_cookie");
    } else {
      await prefs.setString("hhg_session_cookie", value);
    }
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = AppConfig.apiBaseUrl.replaceAll(RegExp(r"/$"), "");
    return Uri.parse("$base$path").replace(queryParameters: query);
  }

  Map<String, String> _headers({bool jsonBody = false}) {
    final h = <String, String>{
      "Accept": "application/json",
      if (jsonBody) "Content-Type": "application/json",
    };
    if ((_sessionCookie ?? "").isNotEmpty) {
      h["Cookie"] = "${AppConfig.sessionCookieName}=$_sessionCookie";
    }
    return h;
  }

  void _captureCookie(http.Response res) {
    final raw = res.headers["set-cookie"];
    if (raw == null || raw.isEmpty) return;
    // May contain multiple cookies; pick hhg_session
    final match = RegExp(
      "${AppConfig.sessionCookieName}=([^;\\s,]+)",
      caseSensitive: false,
    ).firstMatch(raw);
    if (match != null) {
      _persistSession(match.group(1));
    }
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) async {
    final res = await _client.get(_uri(path, query), headers: _headers());
    _captureCookie(res);
    return _decode(res);
  }

  Future<dynamic> post(String path, {Object? body}) async {
    final res = await _client.post(
      _uri(path),
      headers: _headers(jsonBody: true),
      body: body == null ? null : jsonEncode(body),
    );
    _captureCookie(res);
    return _decode(res);
  }

  Future<dynamic> patch(String path, {Object? body}) async {
    final res = await _client.patch(
      _uri(path),
      headers: _headers(jsonBody: true),
      body: body == null ? null : jsonEncode(body),
    );
    _captureCookie(res);
    return _decode(res);
  }

  dynamic _decode(http.Response res) {
    final raw = res.body;
    final trimmed = raw.trimLeft();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      throw ApiException(
        res.statusCode >= 400
            ? "API trả về HTML (HTTP ${res.statusCode}). Kiểm tra API_BASE_URL / route."
            : "API trả về HTML thay vì JSON. Kiểm tra API_BASE_URL.",
        statusCode: res.statusCode == 200 ? 502 : res.statusCode,
      );
    }
    dynamic data;
    try {
      data = raw.isEmpty ? <String, dynamic>{} : jsonDecode(raw);
    } on FormatException {
      throw ApiException(
        "Phản hồi không phải JSON (HTTP ${res.statusCode})",
        statusCode: res.statusCode,
      );
    }
    if (res.statusCode >= 400) {
      final msg = data is Map && data["error"] != null
          ? data["error"].toString()
          : "HTTP ${res.statusCode}";
      throw ApiException(msg, statusCode: res.statusCode);
    }
    return data;
  }

  Future<void> clearSession() => _persistSession(null);
}
