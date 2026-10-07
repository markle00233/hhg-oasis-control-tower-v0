import "package:flutter_test/flutter_test.dart";
import "package:hhg_oasis_app/main.dart";

void main() {
  testWidgets("App boots to login or shell", (tester) async {
    await tester.pumpWidget(const OasisApp());
    await tester.pump();
    expect(find.byType(OasisApp), findsOneWidget);
  });
}
