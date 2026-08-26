import 'package:business_central_mobile/webview/native_scanner_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  testWidgets('native scanner bridge resolves a scanned barcode', (
    tester,
  ) async {
    final scripts = <String>[];
    final bridge = NativeScannerBridge(scan: (_) async => '8851234567890')
      ..attachJavaScriptEvaluator((script) async => scripts.add(script));
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (value) {
            context = value;
            return const SizedBox();
          },
        ),
      ),
    );

    await bridge.handleMessage(
      context,
      const JavaScriptMessage(message: '{"id":"scan-1","method":"scan"}'),
    );

    expect(scripts, hasLength(1));
    expect(scripts.single, contains('"scan-1", "8851234567890", null'));
  });

  testWidgets('native scanner bridge reports unknown methods', (tester) async {
    final scripts = <String>[];
    final bridge = NativeScannerBridge()
      ..attachJavaScriptEvaluator((script) async => scripts.add(script));
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (value) {
            context = value;
            return const SizedBox();
          },
        ),
      ),
    );

    await bridge.handleMessage(
      context,
      const JavaScriptMessage(message: '{"id":"bad-1","method":"unsupported"}'),
    );

    expect(scripts.single, contains('Unknown native scanner method'));
  });
}
