import 'dart:convert';

import 'package:business_central_mobile/webview/native_printer_bridge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  testWidgets('native printer bridge scans, connects, and prints bytes', (
    tester,
  ) async {
    final printer = Printer(
      type: PrinterType.bluetooth,
      name: 'POS-58',
      bleAddress: 'AA:BB',
    );
    final plugin = _FakeThermalPrinter(printer);
    final scripts = <String>[];
    final bridge = NativePrinterBridge(printer: plugin)
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

    final scan = bridge.handleMessage(
      context,
      const JavaScriptMessage(message: '{"id":"scan-1","method":"scan"}'),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('POS-58'));
    await tester.pumpAndSettle();
    await scan;

    await bridge.handleMessage(
      context,
      const JavaScriptMessage(
        message:
            '{"id":"connect-1","method":"connect","payload":{"id":"AA:BB"}}',
      ),
    );
    final encoded = base64Encode([0x1b, 0x40, 0x0a]);
    await bridge.handleMessage(
      context,
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'print-1',
          'method': 'print',
          'payload': {'bytes': encoded},
        }),
      ),
    );
    await bridge.close();

    expect(plugin.connected, same(printer));
    expect(plugin.printedBytes, [0x1b, 0x40, 0x0a]);
    expect(plugin.disconnected, same(printer));
    expect(plugin.disposed, isTrue);
    expect(scripts, hasLength(3));
    expect(scripts[0], contains('"id":"AA:BB"'));
    expect(scripts[1], contains('"connect-1", true, null'));
    expect(scripts[2], contains('"print-1", true, null'));
  });
}

class _FakeThermalPrinter extends ThermalPrinterFlutter {
  _FakeThermalPrinter(this.printer);

  final Printer printer;
  Printer? connected;
  Printer? disconnected;
  List<int>? printedBytes;
  bool disposed = false;

  @override
  Future<bool> checkBluetoothPermissions() async => true;

  @override
  Future<bool> isBluetoothEnabled() async => true;

  @override
  Future<List<Printer>> getPrinters({required PrinterType printerType}) async =>
      [printer];

  @override
  Future<bool> connect({required Printer printer}) async {
    connected = printer;
    return true;
  }

  @override
  Future<void> printBytes({
    required List<int> bytes,
    required Printer printer,
    int copies = 1,
  }) async {
    printedBytes = bytes;
  }

  @override
  Future<void> disconnect({required Printer printer}) async {
    disconnected = printer;
  }

  @override
  Future<void> dispose() async {
    disposed = true;
  }
}
