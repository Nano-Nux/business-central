import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_canonical_record_repository.dart';

void main() {
  late AppDatabase database;
  const merchantId = 'm-canon-1';
  const shopId = 's-canon-1';
  late LocalCanonicalRecordRepository repository;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    await database
        .into(database.merchants)
        .insert(
          MerchantsCompanion.insert(
            id: merchantId,
            name: 'Canonical Test Merchant',
            slug: 'canonical-test-merchant',
            currencyCode: 'USD',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
    await database
        .into(database.shops)
        .insert(
          ShopsCompanion.insert(
            id: shopId,
            merchantId: merchantId,
            name: 'Main Shop',
            code: 'MAIN',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
    repository = LocalCanonicalRecordRepository(
      database: database,
      merchantId: merchantId,
    );
  });

  tearDown(() async {
    await database.close();
  });

  test('upserts canonical payloads by merchant/entity identity', () async {
    final first = await repository.put(
      entityType: 'customers',
      entityId: 'customer-1',
      shopId: shopId,
      payload: const {'display_name': 'Ada'},
      sourceVersion: 3,
    );
    final second = await repository.put(
      entityType: 'customers',
      entityId: 'customer-1',
      shopId: shopId,
      payload: const {'display_name': 'Ada Lovelace'},
      sourceVersion: 4,
    );

    expect(second.id, first.id);
    expect(second.payload['display_name'], 'Ada Lovelace');
    expect((await repository.list(entityType: 'customers')), hasLength(1));

    final direct = await repository.get(
      entityType: 'customers',
      entityId: 'customer-1',
    );
    expect(direct?.payload['display_name'], 'Ada Lovelace');
    expect(direct?.sourceVersion, 4);
  });

  test('preserves tombstones and rejects an out-of-scope shop', () async {
    await repository.put(
      entityType: 'customers',
      entityId: 'customer-2',
      shopId: shopId,
      payload: const {'display_name': 'Charles'},
    );

    await repository.put(
      entityType: 'customers',
      entityId: 'customer-2',
      shopId: shopId,
      payload: const {'display_name': 'Charles'},
      isDeleted: true,
      sourceVersion: 5,
    );

    expect(await repository.list(entityType: 'customers'), isEmpty);

    final allRecords = await repository.list(
      entityType: 'customers',
      includeDeleted: true,
    );
    expect(allRecords, hasLength(1));
    expect(allRecords.first.isDeleted, isTrue);
    expect(allRecords.first.sourceVersion, 5);

    expect(
      () => repository.put(
        entityType: 'customers',
        entityId: 'customer-3',
        shopId: 'shop-other',
        payload: const {'display_name': 'Bad shop'},
      ),
      throwsA(isA<StateError>()),
    );
  });
}
