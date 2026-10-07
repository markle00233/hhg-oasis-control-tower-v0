/// API backend — Control Tower only (same DATABASE_URL as this repo).
class AppConfig {
  static const String apiBaseUrl =
      String.fromEnvironment(
        "API_BASE_URL",
        defaultValue: "https://hhg-oasis-control-tower-v0.vercel.app",
      );

  static const String sessionCookieName = "hhg_session";
}
