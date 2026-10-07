import 'package:flutter/material.dart';

/// HHG Oasis — tokens aligned to Figma Offspots / HHG page
/// https://www.figma.com/design/6QdUQBXz9ggbkdncsuaZwD (node 2944:9943)
class OasisTheme {
  static const Color green = Color(0xFF0F6B50);
  static const Color greenSoft = Color(0xFFE7F3EE);
  static const Color ink = Color(0xFF0F172A);
  static const Color muted = Color(0xFF64748B);
  static const Color line = Color(0xFFD7EBF8);
  static const Color panel = Color(0xFFFFFFFF);
  static const Color bg = Color(0xFFFFFFFF);
  static const Color amber = Color(0xFFC2410C);
  static const Color amberSoft = Color(0xFFFFF1E6);
  static const Color red = Color(0xFFFF1A1E);
  static const Color redSoft = Color(0xFFFDECEA);

  /// Calendar accent (date chip) — Figma orange strip
  static const Color calAccent = Color(0xFFFF7A29);
  static const Color calYellow = Color(0xFFFFD84C);

  static const Color widgetBlue = Color(0xFFE8F4FC);
  static const Color widgetBlueStrong = Color(0xFFCFEAFE);
  static const Color sky = Color(0xFF3EBFFF);

  /// Figma primary blue header #008CFF
  static const Color admInk = Color(0xFF000000);
  static const Color admBlue = Color(0xFF008CFF);
  static const Color admBlueDeep = Color(0xFF0070E0);

  /// Admin LEADERS card fills — Figma 2998:10140
  static const List<Color> leaderPastels = [
    Color(0xFF3EBFFF), // sky
    Color(0xFF0022FD), // deep blue
    Color(0xFFE83EFF), // magenta
    Color(0xFFFF1A1E), // red
    Color(0xFF3EBFFF),
    Color(0xFF0022FD),
    Color(0xFFE83EFF),
    Color(0xFFFF1A1E),
  ];

  /// Timeline card left bars (priority / category)
  static const List<Color> taskBarColors = [
    Color(0xFF8B5CF6),
    Color(0xFFFF7A29),
    Color(0xFF22C55E),
    Color(0xFF3EBFFF),
  ];

  static const double radiusCard = 27;
  static const double radiusHeader = 41;
  static const double radiusPill = 999;

  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: admBlue,
        brightness: Brightness.light,
        primary: admBlue,
        secondary: calAccent,
        surface: Colors.white,
      ),
      scaffoldBackgroundColor: bg,
      appBarTheme: const AppBarTheme(
        backgroundColor: bg,
        foregroundColor: ink,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusCard),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: calAccent,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusPill)),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: calAccent,
        foregroundColor: Colors.white,
        shape: CircleBorder(),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: widgetBlue,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: admBlue, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: widgetBlueStrong,
        labelTextStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
