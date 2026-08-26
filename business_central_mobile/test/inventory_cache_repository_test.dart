import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/inventory/data/inventory_cache_repository.dart';
import 'package:business_central_mobile/features/inventory/domain/inventory_models.dart';

void main() {
  late AppDatabase database;
  late InventoryCacheRepository cache;

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    cache = InventoryCacheRepository(database);
  });
  tearDown(() => database.closeForTest());

  test('location cache is scoped by merchant and shop', () async {
    await cache.saveLocations(
      merchantId: 'merchant-a',
      locations: const [
        InventoryLocation(
          id: 'location-a',
          merchantId: 'merchant-a',
          shopId: 'shop-a',
          code: 'MAIN',
          name: 'Main stockroom',
          locationType: 'SHOP',
          isActive: true,
        ),
        InventoryLocation(
          id: 'location-b',
          merchantId: 'merchant-a',
          shopId: 'shop-b',
          code: 'OTHER',
          name: 'Other stockroom',
          locationType: 'SHOP',
          isActive: true,
        ),
      ],
    );

    expect(
      (await cache.locations(
        merchantId: 'merchant-a',
        shopId: 'shop-a',
      )).single.name,
      'Main stockroom',
    );
    expect(
      await cache.locations(merchantId: 'merchant-a', shopId: 'shop-b'),
      hasLength(1),
    );
    expect(
      await cache.locations(merchantId: 'merchant-b', shopId: 'shop-a'),
      isEmpty,
    );
  });

  test('location payload rejects another merchant', () {
    expect(
      () => InventoryLocation.fromJson(const {
        'id': 'location-a',
        'merchant_id': 'merchant-b',
        'shop_id': 'shop-a',
        'code': 'MAIN',
        'name': 'Main stockroom',
      }, merchantId: 'merchant-a'),
      throwsA(isA<StateError>()),
    );
  });
}
