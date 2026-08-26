import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class DatabaseKeyStore {
  Future<String> readOrCreate();
}

class PlatformDatabaseKeyStore implements DatabaseKeyStore {
  PlatformDatabaseKeyStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _databaseKeyName = 'business_central.sqlite_key';
  final FlutterSecureStorage _storage;

  @override
  Future<String> readOrCreate() async {
    final existing = await _storage.read(key: _databaseKeyName);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final bytes = List<int>.generate(32, (_) => Random.secure().nextInt(256));
    final generated = base64UrlEncode(bytes);
    await _storage.write(key: _databaseKeyName, value: generated);

    final persisted = await _storage.read(key: _databaseKeyName);
    if (persisted != generated) {
      throw StateError(
        'The local database encryption key could not be persisted.',
      );
    }
    return generated;
  }
}
