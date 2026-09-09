import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class WebViewPrinterStorage {
  Future<void> savePrinter({required String id, required String name});
  Future<({String id, String name})?> getSavedPrinter();
  Future<void> clearSavedPrinter();
}

class SecureWebViewPrinterStorage implements WebViewPrinterStorage {
  SecureWebViewPrinterStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _printerIdKey = 'business_central.webview.printer_id';
  static const _printerNameKey = 'business_central.webview.printer_name';

  final FlutterSecureStorage _storage;

  @override
  Future<void> savePrinter({required String id, required String name}) async {
    await _storage.write(key: _printerIdKey, value: id);
    await _storage.write(key: _printerNameKey, value: name);
  }

  @override
  Future<({String id, String name})?> getSavedPrinter() async {
    final id = await _storage.read(key: _printerIdKey);
    final name = await _storage.read(key: _printerNameKey);
    if (id == null || id.isEmpty) return null;
    return (id: id, name: name?.isNotEmpty == true ? name! : 'Thermal printer');
  }

  @override
  Future<void> clearSavedPrinter() async {
    await _storage.delete(key: _printerIdKey);
    await _storage.delete(key: _printerNameKey);
  }
}

class InMemoryWebViewPrinterStorage implements WebViewPrinterStorage {
  InMemoryWebViewPrinterStorage({String? initialId, String? initialName})
    : _saved = initialId != null
          ? (id: initialId, name: initialName ?? 'Thermal printer')
          : null;

  ({String id, String name})? _saved;

  @override
  Future<void> savePrinter({required String id, required String name}) async {
    _saved = (id: id, name: name);
  }

  @override
  Future<({String id, String name})?> getSavedPrinter() async => _saved;

  @override
  Future<void> clearSavedPrinter() async {
    _saved = null;
  }
}
