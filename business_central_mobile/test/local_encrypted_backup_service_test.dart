import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_backup_service.dart';
import 'package:business_central_mobile/core/database/local_encrypted_backup_service.dart';

void main() {
  late AppDatabase database;
  const merchantId = 'm-encrypted-1';
  late LocalEncryptedBackupService service;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    await database
        .into(database.merchants)
        .insert(
          MerchantsCompanion.insert(
            id: merchantId,
            name: 'Encrypted Test Merchant',
            slug: 'encrypted-test-merchant',
            currencyCode: 'USD',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
    service = LocalEncryptedBackupService(database);
  });

  tearDown(() async {
    await database.close();
  });

  test('round-trips an Argon2id/AES-GCM operational backup', () async {
    final payload = await service.exportMerchant(
      merchantId: merchantId,
      password: 'backup password with enough length',
    );
    final decoded = Map<String, Object?>.from(jsonDecode(payload) as Map);
    expect(decoded['format'], 'business-central-mobile-encrypted-backup');
    expect(decoded['cipher'], 'aes-256-gcm');

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
