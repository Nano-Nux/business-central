import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/auth/data/workspace_cache_repository.dart';

void main() {
  late AppDatabase database;
  setUp(() => database = AppDatabase(executor: NativeDatabase.memory()));
  tearDown(() => database.closeForTest());

  test(
    'workspace cache persists only shops belonging to the merchant',
    () async {
      final merchant = OnlineMerchant(
        id: 'merchant-a',
        name: 'Merchant A',
        slug: 'merchant-a',
        currencyCode: 'USD',
        isActive: true,
      );
      final shop = OnlineShop(
        id: 'shop-a',
        merchantId: 'merchant-a',
        name: 'Main Shop',
        code: 'MAIN',
        moduleCodes: const ['CORE'],
        isActive: true,
      );
      await WorkspaceCacheRepository(
        database,
      ).save(merchant: merchant, shops: [shop]);
      expect(
        (await database.select(database.merchants).get()).single.id,
        'merchant-a',
      );
      expect(
        (await database.select(database.shops).get()).single.merchantId,
        'merchant-a',
      );
    },
  );

  test('cross-tenant shop data is rejected before the transaction', () async {
    final merchant = OnlineMerchant(
      id: 'merchant-a',
      name: 'Merchant A',
      slug: 'merchant-a',
      currencyCode: 'USD',
      isActive: true,
    );
    final otherShop = OnlineShop(
      id: 'shop-b',
      merchantId: 'merchant-b',
      name: 'Other Shop',
      code: 'OTHER',
      moduleCodes: const [],
      isActive: true,
    );
    Object? error;
    try {
      await WorkspaceCacheRepository(
        database,
      ).save(merchant: merchant, shops: [otherShop]);
    } on Object catch (caught) {
      error = caught;
    }
    expect(error, isA<StateError>());
    expect(await database.select(database.merchants).get(), isEmpty);
  });
}
