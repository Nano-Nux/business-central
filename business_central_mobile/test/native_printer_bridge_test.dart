import 'dart:convert';

import 'package:business_central_mobile/webview/native_printer_bridge.dart';
import 'package:business_central_mobile/webview/webview_printer_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  testWidgets('native printer bridge scans, connects, and persists printer', (
    tester,
  ) async {
    final printer = Printer(
      type: PrinterType.bluetooth,
      name: 'POS-58',
      bleAddress: 'AA:BB',
    );
    final plugin = _FakeThermalPrinter([printer]);
    final storage = InMemoryWebViewPrinterStorage();
    final scripts = <String>[];
    final bridge = NativePrinterBridge(printer: plugin, storage: storage)
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

    // Scan persists selected printer
    final savedAfterScan = await storage.getSavedPrinter();
    expect(savedAfterScan?.id, 'AA:BB');
    expect(savedAfterScan?.name, 'POS-58');

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

  testWidgets('native printer bridge auto-connects to saved printer', (
    tester,
  ) async {
    final printer = Printer(
      type: PrinterType.bluetooth,
      name: 'POS-80',
      bleAddress: '11:22:33',
    );
    final plugin = _FakeThermalPrinter([printer]);
    final storage = InMemoryWebViewPrinterStorage(
      initialId: '11:22:33',
      initialName: 'POS-80',
    );
    final scripts = <String>[];
    final bridge = NativePrinterBridge(printer: plugin, storage: storage)
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

    // Call autoConnect via message
    await bridge.handleMessage(
      context,
      const JavaScriptMessage(
        message: '{"id":"auto-1","method":"autoConnect"}',
      ),
    );

    expect(plugin.connected, same(printer));
    expect(scripts, hasLength(1));
    expect(scripts[0], contains('"auto-1"'));
    expect(scripts[0], contains('"id":"11:22:33"'));
    expect(scripts[0], contains('"name":"POS-80"'));

    // autoConnectOnPageLoaded fires notification
    await bridge.autoConnectOnPageLoaded();
    expect(scripts, hasLength(2));
    expect(scripts[1], contains('business-central-native-printer-connected'));
    expect(scripts[1], contains('11:22:33'));
  });

  testWidgets('auto-connect returns null when saved printer is not in range', (
    tester,
  ) async {
    final otherPrinter = Printer(
      type: PrinterType.bluetooth,
      name: 'Other-Printer',
      bleAddress: '99:99',
    );
    final plugin = _FakeThermalPrinter([otherPrinter]);
    final storage = InMemoryWebViewPrinterStorage(
      initialId: '11:22:33',
      initialName: 'POS-80',
    );
    final scripts = <String>[];
    final bridge = NativePrinterBridge(printer: plugin, storage: storage)
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
      const JavaScriptMessage(
        message: '{"id":"auto-2","method":"autoConnect"}',
      ),
    );

    expect(plugin.connected, isNull);
    expect(scripts, hasLength(1));
    expect(scripts[0], contains('"auto-2", null, null'));
  });

  testWidgets('switching printers disconnects old and updates storage', (
    tester,
  ) async {
    final printer1 = Printer(
      type: PrinterType.bluetooth,
      name: 'Printer-1',
      bleAddress: '11:11',
    );
    final printer2 = Printer(
      type: PrinterType.bluetooth,
      name: 'Printer-2',
      bleAddress: '22:22',
    );
    final plugin = _FakeThermalPrinter([printer1, printer2]);
    final storage = InMemoryWebViewPrinterStorage(
      initialId: '11:11',
      initialName: 'Printer-1',
    );
    final scripts = <String>[];
    final bridge = NativePrinterBridge(printer: plugin, storage: storage)
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

    // Connect printer 1
    await bridge.handleMessage(
      context,
      const JavaScriptMessage(
        message:
            '{"id":"conn-1","method":"connect","payload":{"id":"11:11","name":"Printer-1"}}',
      ),
    );
    expect(plugin.connected?.bleAddress, '11:11');

    // Switch to printer 2
    await bridge.handleMessage(
      context,
      const JavaScriptMessage(
        message:
            '{"id":"conn-2","method":"connect","payload":{"id":"22:22","name":"Printer-2"}}',
      ),
    );

    // Old printer was disconnected, new printer is connected
    expect(plugin.disconnected?.bleAddress, '11:11');
    expect(plugin.connected?.bleAddress, '22:22');

    // Storage is updated to printer 2
    final saved = await storage.getSavedPrinter();
    expect(saved?.id, '22:22');
    expect(saved?.name, 'Printer-2');
  });
}

class _FakeThermalPrinter extends ThermalPrinterFlutter {
  _FakeThermalPrinter(this.printers);

  final List<Printer> printers;
  Printer? connected;
  Printer? disconnected;
  List<int>? printedBytes;
  bool disposed = false;
  bool bluetoothEnabled = true;

  @override
  Future<bool> checkBluetoothPermissions() async => true;

  @override
  Future<bool> isBluetoothEnabled() async => bluetoothEnabled;

  @override
  Future<List<Printer>> getPrinters({required PrinterType printerType}) async =>
      printers;

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
