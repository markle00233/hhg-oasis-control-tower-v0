import "package:flutter/widgets.dart";

/// Dispose [TextEditingController]s after modal/dialog exit animation so
/// TextFields can unmount first (avoids "used after being disposed" / dependents).
void disposeControllersAfterFrame(Iterable<TextEditingController> controllers) {
  final list = controllers.toList(growable: false);
  Future<void>.delayed(const Duration(milliseconds: 350), () {
    for (final c in list) {
      c.dispose();
    }
  });
}
