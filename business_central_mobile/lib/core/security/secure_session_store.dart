import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class SecureSessionStore {
  Future<void> writeAccessToken(String token);
  Future<String?> readAccessToken();
  Future<void> writeRefreshToken(String token);
  Future<String?> readRefreshToken();
  Future<void> clear();
}

class PlatformSecureSessionStore implements SecureSessionStore {
  PlatformSecureSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _accessTokenKey = 'business_central.access_token';
  static const _refreshTokenKey = 'business_central.refresh_token';
  final FlutterSecureStorage _storage;

  @override
  Future<void> writeAccessToken(String token) =>
      _storage.write(key: _accessTokenKey, value: token);

  @override
  Future<String?> readAccessToken() => _storage.read(key: _accessTokenKey);

  @override
  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: _refreshTokenKey, value: token);

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }
}
