import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';

import 'app_database.dart';
import 'local_backup_service.dart';

/// Password-protected recovery envelope for the operational local backup.
///
/// The owner supplies the password for every export/import. No password is
/// stored in SQLite or secure session state, and a missing/incorrect password
/// cannot silently fall back to a default credential.
class LocalEncryptedBackupService {
  LocalEncryptedBackupService(this.database);

  final AppDatabase database;
  static const _format = 'business-central-mobile-encrypted-backup';
  static final _algorithm = Argon2id(
    parallelism: 1,
    memory: 19 * 1024,
    iterations: 2,
    hashLength: 32,
  );
  static final _cipher = AesGcm.with256bits();

  Future<String> exportMerchant({
    required String merchantId,
    required String password,
  }) async {
    _validatePassword(password);
    final plaintext = await LocalBackupService(
      database,
    ).exportMerchant(merchantId: merchantId);
    final salt = _random(16);
    final key = await _deriveKey(password, salt);
    final box = await _cipher.encrypt(
      utf8.encode(plaintext),
      secretKey: SecretKey(key),
    );
    final ciphertext = base64UrlEncode(box.cipherText);
    final mac = base64UrlEncode(box.mac.bytes);
    return jsonEncode({
      'format': _format,
      'schema_version': database.schemaVersion,
      'merchant_id': merchantId,
      'kdf': 'argon2id',
      'cipher': 'aes-256-gcm',
      'salt': base64UrlEncode(salt),
      'nonce': base64UrlEncode(box.nonce),
      'ciphertext': ciphertext,
      'mac': mac,
      'checksum': _checksum('$ciphertext.$mac'),
    });
  }

  Future<void> restoreMerchant({
    required String merchantId,
    required String password,
    required String payload,
  }) async {
    _validatePassword(password);
    final decoded = jsonDecode(payload);
    if (decoded is! Map) {
      throw const LocalBackupException(
        'Encrypted backup must be a JSON object.',
      );
    }
    final data = Map<String, Object?>.from(decoded);
    if (data['format'] != _format || data['merchant_id'] != merchantId) {
      throw const LocalBackupException(
        'Encrypted backup format or merchant scope is invalid.',
      );
    }
    if ((data['schema_version'] as num?)?.toInt() != database.schemaVersion) {
      throw const LocalBackupException(
        'Encrypted backup schema version is incompatible.',
      );
    }
    final salt = _decode(data, 'salt');
    final nonce = _decode(data, 'nonce');
    final ciphertext = _decode(data, 'ciphertext');
    final mac = _decode(data, 'mac');
    final checksum = data['checksum'];
    if (checksum is! String ||
        checksum !=
            _checksum(
              '${base64UrlEncode(ciphertext)}.${base64UrlEncode(mac)}',
            )) {
      throw const LocalBackupException('Encrypted backup checksum is invalid.');
    }
    try {
      final key = await _deriveKey(password, salt);
      final plaintext = await _cipher.decrypt(
        SecretBox(ciphertext, nonce: nonce, mac: Mac(mac)),
        secretKey: SecretKey(key),
      );
      await LocalBackupService(database).restoreMerchant(
        merchantId: merchantId,
        payload: utf8.decode(plaintext),
      );
    } catch (_) {
      throw const LocalBackupException(
        'Encrypted backup could not be authenticated with this password.',
      );
    }
  }

  Future<List<int>> _deriveKey(String password, List<int> salt) async {
    final key = await _algorithm.deriveKeyFromPassword(
      password: password,
      nonce: salt,
    );
    return key.extractBytes();
  }

  List<int> _decode(Map<String, Object?> data, String key) {
    final value = data[key];
    if (value is! String || value.isEmpty) {
      throw LocalBackupException('Encrypted backup field $key is invalid.');
    }
    try {
      return base64Url.decode(value);
    } on FormatException {
      throw LocalBackupException('Encrypted backup field $key is invalid.');
    }
  }

  List<int> _random(int length) => List<int>.generate(
    length,
    (_) => SecureRandom.defaultRandom.nextInt(256),
    growable: false,
  );

  String _checksum(String value) =>
      sha256.convert(utf8.encode(value)).toString();

  void _validatePassword(String password) {
    if (password.length < 12) {
      throw ArgumentError(
        'Backup password must contain at least 12 characters.',
      );
    }
  }
}
