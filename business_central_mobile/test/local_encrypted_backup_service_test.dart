import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_backup_service.dart';
import 'package:business_central_mobile/core/database/local_encrypted_backup_service.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';

void main() {
  late AppDatabase database;
  late String merchantId;
  late LocalEncryptedBackupService service;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    final setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    merchantId = setup.merchantId;
    service = LocalEncryptedBackupService(database);
  });

  tearDown(() => database.closeForTest());

  test('round-trips an Argon2id/AES-GCM operational backup', () async {
    final payload = await service.exportMerchant(
      merchantId: merchantId,
      password: 'backup password with enough length',
    );
    final decoded = Map<String, Object?>.from(jsonDecode(payload) as Map);
    expect(decoded['format'], 'business-central-mobile-encrypted-backup');
    expect(decoded['cipher'], 'aes-256-gcm');
    expect(payload, isNot(contains('correct horse battery staple')));

    await service.restoreMerchant(
      merchantId: merchantId,
      password: 'backup password with enough length',
      payload: payload,
    );
  });

  test('rejects wrong passwords and modified encrypted data', () async {
    final payload = await service.exportMerchant(
      merchantId: merchantId,
      password: 'backup password with enough length',
    );
    expect(
      () => service.restoreMerchant(
        merchantId: merchantId,
        password: 'a different password of length',
        payload: payload,
      ),
      throwsA(isA<LocalBackupException>()),
    );
    final decoded = Map<String, dynamic>.from(jsonDecode(payload) as Map);
    final ciphertext = decoded['ciphertext'] as String;
    decoded['ciphertext'] = '${ciphertext}A';
    expect(
      () => service.restoreMerchant(
        merchantId: merchantId,
        password: 'backup password with enough length',
        payload: jsonEncode(decoded),
      ),
      throwsA(isA<LocalBackupException>()),
    );
  });
}
