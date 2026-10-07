import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "api_client.dart";
import "app_state.dart";
import "screens/home_shell.dart";
import "screens/login_screen.dart";
import "theme.dart";

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const OasisApp());
}

class OasisApp extends StatelessWidget {
  const OasisApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState(ApiClient())..bootstrap(),
      child: MaterialApp(
        title: "HHG Oasis",
        debugShowCheckedModeBanner: false,
        theme: OasisTheme.light(),
        home: const _Root(),
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.bootstrapping) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(strokeWidth: 2.5),
              SizedBox(height: 12),
              Text("Đang mở…", style: TextStyle(color: OasisTheme.muted, fontSize: 13)),
            ],
          ),
        ),
      );
    }
    if (!state.isAuthenticated) return const LoginScreen();
    return const HomeShell();
  }
}
