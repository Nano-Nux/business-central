import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_canonical_record_repository.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';

void main() {
  late AppDatabase database;
  late LocalOwnerSetupResult setup;
  late LocalCanonicalRecordRepository repository;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    repository = LocalCanonicalRecordRepository(
      database: database,
      merchantId: setup.merchantId,
    );
  });

  tearDown(() => database.closeForTest());

  test('upserts canonical payloads by merchant/entity identity', () async {
    final first = await repository.put(
      entityType: 'customers',
      entityId: 'customer-1',
      shopId: setup.shopId,
      payload: const {'display_name': 'Ada'},
      sourceVersion: 3,
    );
    final second = await repository.put(
      entityType: 'customers',
      entityId: 'customer-1',
      shopId: setup.shopId,
      payload: const {'display_name': 'Ada Lovelace'},
      sourceVersion: 4,
    );

    expect(second.id, first.id);
    expect(second.payload['display_name'], 'Ada Lovelace');
    expect((await repository.list(entityType: 'customers')), hasLength(1));
    expect(
      (await repository.get(
        entityType: 'customers',
        entityId: 'customer-1',
      ))?.sourceVersion,
      4,
    );
  });

  test('preserves tombstones and rejects an out-of-scope shop', () async {
    await expectLater(
      repository.put(
        entityType: 'promotions',
        entityId: 'promotion-1',
        shopId: 'another-shop',
        payload: const {},
      ),
      throwsA(isA<StateError>()),
    );
    await repository.put(
      entityType: 'promotions',
      entityId: 'promotion-1',
      payload: const {},
      isDeleted: true,
    );
    expect(await repository.list(entityType: 'promotions'), isEmpty);
    expect(
      (await repository.list(
        entityType: 'promotions',
        includeDeleted: true,
      )).single.isDeleted,
      isTrue,
    );
  });
}
