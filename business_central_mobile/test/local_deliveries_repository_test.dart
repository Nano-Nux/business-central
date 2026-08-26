import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/deliveries/data/local_deliveries_repository.dart';

void main() {
  late AppDatabase database;
  late String merchantId;
  late String shopId;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    final setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    merchantId = setup.merchantId;
    shopId = setup.shopId;
  });

  tearDown(() => database.closeForTest());

  test('local delivery options are merchant/shop scoped and durable', () async {
    final repository = LocalDeliveriesRepository(
      database: database,
      merchantId: merchantId,
      shopId: shopId,
    );
    final created = await repository.create(
      merchantId: merchantId,
      shopId: shopId,
      name: 'Courier',
      contactInfo: '555-0100',
    );

    expect(
      (await repository.list(merchantId: merchantId, shopId: shopId)).single.id,
      created.id,
    );
    await expectLater(
      repository.create(
        merchantId: merchantId,
        shopId: shopId,
        name: 'Courier',
        contactInfo: 'different',
      ),
      throwsA(isA<StateError>()),
    );
    await expectLater(
      repository.list(merchantId: 'other-merchant', shopId: shopId),
      throwsA(isA<StateError>()),
    );
    await repository.delete(created.id);
    expect(
      await repository.list(merchantId: merchantId, shopId: shopId),
      isEmpty,
    );
  });
}
