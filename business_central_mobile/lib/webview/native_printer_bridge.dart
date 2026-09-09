import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'webview_printer_storage.dart';

class NativePrinterBridge {
  NativePrinterBridge({
    ThermalPrinterFlutter? printer,
    WebViewPrinterStorage? storage,
  })  : _printer = printer ?? ThermalPrinterFlutter(),
        _storage = storage ?? SecureWebViewPrinterStorage();

  static const channelName = 'BusinessCentralPrinterChannel';

  final ThermalPrinterFlutter _printer;
  final WebViewPrinterStorage _storage;
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
        'getSavedPrinter' => await _getSavedPrinter(),
        'autoConnect' => await _autoConnect(),
        'disconnect' => await _disconnect(),
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

  Future<Map<String, String>?> _getSavedPrinter() async {
    final saved = await _storage.getSavedPrinter();
    if (saved == null) return null;
    return {
      'id': saved.id,
      'name': saved.name,
    };
  }

  Future<Map<String, String>?> _autoConnect() async {
    final saved = await _storage.getSavedPrinter();
    if (saved == null) return null;
    if (!await _available()) return null;

    if (_connectedPrinter != null) {
      final currentId = _connectedPrinter!.bleAddress.isNotEmpty
          ? _connectedPrinter!.bleAddress
          : _connectedPrinter!.name;
      if (currentId == saved.id || _connectedPrinter!.name == saved.name) {
        return {
          'id': saved.id,
          'name': saved.name,
        };
      }
    }

    try {
      final printers = await _printer.getPrinters(
        printerType: PrinterType.bluetooth,
      );
      Printer? target;
      for (final p in printers) {
        final id = p.bleAddress.isNotEmpty ? p.bleAddress : p.name;
        if (id == saved.id || p.name == saved.name) {
          target = p;
          break;
        }
      }
      if (target == null) return null;

      if (_connectedPrinter != null && _connectedPrinter != target) {
        await _printer.disconnect(printer: _connectedPrinter!);
      }
      final connected = await _printer.connect(printer: target);
      if (!connected) return null;

      _connectedPrinter = target;
      _discovered[saved.id] = target;
      return {
        'id': saved.id,
        'name': saved.name,
      };
    } catch (_) {
      return null;
    }
  }

  Future<void> autoConnectOnPageLoaded() async {
    try {
      final connected = await _autoConnect();
      if (connected != null && _runJavaScript != null) {
        await _runJavaScript!(
          'window.dispatchEvent(new CustomEvent("business-central-native-printer-connected", { detail: ${jsonEncode(connected)} }));',
        );
      }
    } catch (_) {
      // Silently ignore auto-connect failures on initial page load.
    }
  }

  Future<bool> _disconnect() async {
    final printer = _connectedPrinter;
    _connectedPrinter = null;
    if (printer != null) {
      await _printer.disconnect(printer: printer);
    }
    return true;
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
    final name = selected.name.isEmpty ? 'Thermal printer' : selected.name;
    _discovered[id] = selected;
    await _storage.savePrinter(id: id, name: name);
    return {
      'id': id,
      'name': name,
    };
  }

  Future<bool> _connect(Object? payload) async {
    final map = _payloadMap(payload);
    final id = map['id']?.toString() ?? '';
    final name = map['name']?.toString() ?? '';

    var printer = _discovered[id];
    if (printer == null && id.isNotEmpty) {
      printer = Printer(
        type: PrinterType.bluetooth,
        name: name.isNotEmpty ? name : 'Thermal printer',
        bleAddress: id,
      );
      _discovered[id] = printer;
    }
    if (printer == null) throw StateError('Scan for the printer again.');

    if (_connectedPrinter != null && _connectedPrinter != printer) {
      await _printer.disconnect(printer: _connectedPrinter!);
    }
    final connected = await _printer.connect(printer: printer);
    if (!connected) {
      throw StateError('The selected thermal printer could not be connected.');
    }
    _connectedPrinter = printer;
    final savedName = printer.name.isNotEmpty
        ? printer.name
        : (name.isNotEmpty ? name : 'Thermal printer');
    await _storage.savePrinter(id: id, name: savedName);
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
