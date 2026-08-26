import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

class NativePrinterBridge {
  NativePrinterBridge({ThermalPrinterFlutter? printer})
    : _printer = printer ?? ThermalPrinterFlutter();

  static const channelName = 'BusinessCentralPrinterChannel';

  final ThermalPrinterFlutter _printer;
  final Map<String, Printer> _discovered = {};
  Future<void> Function(String script)? _runJavaScript;
  Printer? _connectedPrinter;

  void attach(WebViewController controller) {
    _runJavaScript = controller.runJavaScript;
  }

  @visibleForTesting
  void attachJavaScriptEvaluator(
    Future<void> Function(String script) evaluate,
  ) {
    _runJavaScript = evaluate;
  }

  Future<void> close() async {
    final printer = _connectedPrinter;
    _connectedPrinter = null;
    if (printer != null) await _printer.disconnect(printer: printer);
    await _printer.dispose();
  }

  Future<void> handleMessage(
    BuildContext context,
    JavaScriptMessage message,
  ) async {
    String requestId = '';
    try {
      final request = jsonDecode(message.message) as Map<String, dynamic>;
      requestId = request['id']?.toString() ?? '';
      final method = request['method']?.toString() ?? '';
      final payload = request['payload'];
      if (method == 'scan') {
        final result = await _scan(context);
        await _resolve(requestId, result: result);
        return;
      }
      final result = switch (method) {
        'available' => await _available(),
        'connect' => await _connect(payload),
        'print' => await _print(payload),
        _ => throw StateError('Unknown native printer method: $method'),
      };
      await _resolve(requestId, result: result);
    } on Object catch (error) {
      await _resolve(requestId, error: _friendlyError(error));
    }
  }

  Future<bool> _available() async {
    final permitted = await _printer.checkBluetoothPermissions();
    if (!permitted) return false;
    return _printer.isBluetoothEnabled();
  }

  Future<Map<String, String>> _scan(BuildContext context) async {
    if (!await _printer.checkBluetoothPermissions()) {
      throw StateError(
        'Allow nearby-device and Bluetooth permissions, then try again.',
      );
    }
    if (!await _printer.isBluetoothEnabled()) {
      throw StateError('Bluetooth is disabled. Enable it and try again.');
    }
    final printers = await _printer.getPrinters(
      printerType: PrinterType.bluetooth,
    );
    if (printers.isEmpty) {
      throw StateError('No Bluetooth thermal printers were found.');
    }
    if (!context.mounted) throw StateError('Printer selection was cancelled.');
    final selected = await showDialog<Printer>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('Select thermal printer'),
        children: [
          for (final printer in printers)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(dialogContext, printer),
              child: ListTile(
                leading: const Icon(Icons.print_outlined),
                title: Text(
                  printer.name.isEmpty ? 'Thermal printer' : printer.name,
                ),
                subtitle: printer.bleAddress.isEmpty
                    ? null
                    : Text(printer.bleAddress),
              ),
            ),
        ],
      ),
    );
    if (selected == null) throw StateError('Printer selection was cancelled.');
    final id = selected.bleAddress.isEmpty
        ? selected.name
        : selected.bleAddress;
    _discovered[id] = selected;
    return {
      'id': id,
      'name': selected.name.isEmpty ? 'Thermal printer' : selected.name,
    };
  }

  Future<bool> _connect(Object? payload) async {
    final printer = _printerFor(payload);
    if (_connectedPrinter != null && _connectedPrinter != printer) {
      await _printer.disconnect(printer: _connectedPrinter!);
    }
    final connected = await _printer.connect(printer: printer);
    if (!connected) {
      throw StateError('The selected thermal printer could not be connected.');
    }
    _connectedPrinter = printer;
    return true;
  }

  Future<bool> _print(Object? payload) async {
    final printer = _connectedPrinter;
    if (printer == null) {
      throw StateError('Connect a thermal printer before printing.');
    }
    final map = _payloadMap(payload);
    final encoded = map['bytes']?.toString() ?? '';
    if (encoded.isEmpty) throw StateError('The receipt print data is empty.');
    final bytes = base64Decode(encoded);
    await _printer.printBytes(bytes: bytes, printer: printer);
    return true;
  }

  Printer _printerFor(Object? payload) {
    final id = _payloadMap(payload)['id']?.toString() ?? '';
    final printer = _discovered[id];
    if (printer == null) throw StateError('Scan for the printer again.');
    return printer;
  }

  Map<String, dynamic> _payloadMap(Object? payload) {
    if (payload is Map<String, dynamic>) return payload;
    if (payload is Map) return Map<String, dynamic>.from(payload);
    return const {};
  }

  Future<void> _resolve(
    String requestId, {
    Object? result,
    String? error,
  }) async {
    final runJavaScript = _runJavaScript;
    if (requestId.isEmpty || runJavaScript == null) return;
    await runJavaScript(
      'window.__businessCentralNativePrinterResolve('
      '${jsonEncode(requestId)}, ${jsonEncode(result)}, ${jsonEncode(error)});',
    );
  }

  String _friendlyError(Object error) {
    final message = error.toString();
    return message
        .replaceFirst('Bad state: ', '')
        .replaceFirst('StateError: ', '')
        .replaceFirst('Exception: ', '');
  }
}
