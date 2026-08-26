import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/sync/sync_queue.dart';
import 'package:business_central_mobile/core/sync/sync_models.dart';
import 'package:business_central_mobile/core/sync/sync_worker.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/settings/data/local_settings_repository.dart';

void main() {
  late AppDatabase database;
  late LocalOwnerSetupResult setup;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
  });

  tearDown(() => database.closeForTest());

  test(
    'device identifier is durable and queue payload hash is stable',
    () async {
      final queue = SyncQueueWriter(database: database);
      final first = await queue.deviceIdentifier();
      final second = await queue.deviceIdentifier();
      expect(first, second);

      final payload = <String, Object?>{'name': 'Updated'};
      await queue.enqueue(
        operationId: 'operation-1',
        merchantId: setup.merchantId,
        shopId: setup.shopId,
        deviceId: first,
        entityType: 'SHOP_SETTINGS',
        entityId: setup.shopId,
        operationType: 'UPDATE',
        payload: payload,
      );

      final row = await (database.select(
        database.operationQueue,
      )..where((entry) => entry.operationId.equals('operation-1'))).getSingle();
      expect(row.status, 'PENDING');
      expect(
        row.payloadHash,
        sha256.convert(utf8.encode(jsonEncode(payload))).toString(),
      );
      expect(row.merchantId, setup.merchantId);
      expect(row.shopId, setup.shopId);
    },
  );

  test('settings mutation and queue record commit together', () async {
    final settings = LocalSettingsRepository(database: database);
    final queue = SyncQueueWriter(database: database);
    final updated = await settings.updateAndQueue(
      merchantId: setup.merchantId,
      shopId: setup.shopId,
      name: 'Queued Shop',
      code: 'QUEUED',
      timezone: 'Asia/Bangkok',
      taxRate: '7.00',
      queue: queue,
    );

    final pending = await database.pendingOperations(setup.merchantId);
    expect(updated.name, 'Queued Shop');
    expect(pending, hasLength(1));
    expect(pending.single.entityType, 'SHOP_SETTINGS');
    expect(pending.single.baseVersion, isNull);
  });

  test('fully offline worker never performs synchronization work', () async {
    await const FullyOfflineSyncWorker().synchronize(
      SyncContext(merchantId: 'merchant', membershipId: 'membership'),
    );
  });
}
