import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/database/app_database.dart';
import '../core/security/silent_license_validator.dart';

class NativeStorageBridge {
  NativeStorageBridge({
    AppDatabase? database,
    SilentLicenseValidator? licenseValidator,
  }) {
    _database = database;
    _licenseValidator = licenseValidator;
  }

  static const channelName = 'BusinessCentralStorageChannel';

  AppDatabase? _database;
  SilentLicenseValidator? _licenseValidator;
  Future<void> Function(String script)? _runJavaScript;

  void attach(
    WebViewController controller, {
    AppDatabase? database,
    SilentLicenseValidator? licenseValidator,
  }) {
    _runJavaScript = controller.runJavaScript;
    if (database != null) _database = database;
    if (licenseValidator != null) _licenseValidator = licenseValidator;
  }

  @visibleForTesting
  void attachJavaScriptEvaluator(
    Future<void> Function(String script) evaluate, {
    AppDatabase? database,
    SilentLicenseValidator? licenseValidator,
  }) {
    _runJavaScript = evaluate;
    if (database != null) _database = database;
    if (licenseValidator != null) _licenseValidator = licenseValidator;
  }

  AppDatabase get _db => _database ??= AppDatabase();

  Future<void> handleMessage(JavaScriptMessage message) async {
    String requestId = '';
    try {
      final request = jsonDecode(message.message) as Map<String, dynamic>;
      requestId = request['id']?.toString() ?? '';
      final method = request['method']?.toString() ?? '';
      final payload = request['payload'] as Map<String, dynamic>? ?? {};
      final key = payload['key']?.toString() ?? '';

      final result = switch (method) {
        'get' => await _get(key),
        'set' => await _set(key, payload['value']?.toString() ?? ''),
        'remove' => await _remove(key),
        _ => throw StateError('Unknown native storage method: $method'),
      };
      await _resolve(requestId, result: result);
    } on Object catch (error) {
      await _resolve(requestId, error: error.toString());
    }
  }

  String? _companionKey(String key) => switch (key) {
    'bc.theme' => 'theme',
    'theme' => 'bc.theme',
    'bc.layout' => 'layout',
    'layout' => 'bc.layout',
    _ => null,
  };

  Future<String?> _get(String key) async {
    if (key.isEmpty) return null;
    final row = await (_db.select(
      _db.appMetadata,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    if (row != null) return row.value;

    final fallbackKey = _companionKey(key);
    if (fallbackKey != null) {
      final fallbackRow = await (_db.select(
        _db.appMetadata,
      )..where((t) => t.key.equals(fallbackKey))).getSingleOrNull();
      return fallbackRow?.value;
    }

    return null;
  }

  Future<bool> _set(String key, String value) async {
    if (key.isEmpty) return false;
    final now = DateTime.now().toUtc().toIso8601String();
    await _db
        .into(_db.appMetadata)
        .insertOnConflictUpdate(
          AppMetadataCompanion.insert(key: key, value: value, updatedAt: now),
        );

    final companion = _companionKey(key);
    if (companion != null) {
      await _db
          .into(_db.appMetadata)
          .insertOnConflictUpdate(
            AppMetadataCompanion.insert(
              key: companion,
              value: value,
              updatedAt: now,
            ),
          );
    }
    if (key == 'bc.access_token' || key == 'access_token') {
      _licenseValidator?.checkLicense(overrideToken: value);
    }
    return true;
  }

  Future<bool> _remove(String key) async {
    if (key.isEmpty) return false;
    await (_db.delete(_db.appMetadata)..where((t) => t.key.equals(key))).go();

    final companion = _companionKey(key);
    if (companion != null) {
      await (_db.delete(
        _db.appMetadata,
      )..where((t) => t.key.equals(companion))).go();
    }
    return true;
  }

  Future<void> _resolve(
    String requestId, {
    Object? result,
    String? error,
  }) async {
    final runJavaScript = _runJavaScript;
    if (requestId.isEmpty || runJavaScript == null) return;
    await runJavaScript(
      'if (window.__businessCentralNativeStorageResolve) { '
      'window.__businessCentralNativeStorageResolve('
      '${jsonEncode(requestId)}, ${jsonEncode(result)}, ${jsonEncode(error)}); '
      '}',
    );
  }
}
