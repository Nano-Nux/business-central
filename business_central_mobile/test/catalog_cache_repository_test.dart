import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/catalog/data/catalog_cache_repository.dart';
import 'package:business_central_mobile/features/catalog/domain/catalog_models.dart';

void main() {
  late AppDatabase database;
  late CatalogCacheRepository cache;

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    cache = CatalogCacheRepository(database);
  });
  tearDown(() => database.closeForTest());

  test(
    'catalog cache preserves merchant scope and reads cached products',
    () async {
      await cache.saveCategories(
        merchantId: 'merchant-a',
        categories: const [
          CatalogCategory(
            id: 'category-a',
            merchantId: 'merchant-a',
            name: 'Accessories',
            slug: 'accessories',
          ),
        ],
      );
      await cache.saveProducts(
        merchantId: 'merchant-a',
        products: const [
          CatalogProduct(
            id: 'product-a',
            merchantId: 'merchant-a',
            name: 'Cable',
            productType: 'PHYSICAL',
            isActive: true,
            categoryNames: ['Accessories'],
          ),
        ],
      );
      expect((await cache.categories('merchant-a')).single.name, 'Accessories');
      expect((await cache.products('merchant-a')).single.name, 'Cable');
      expect(await cache.products('merchant-b'), isEmpty);
    },
  );

  test('cache rejects data carrying another merchant ID', () async {
    await expectLater(
      cache.saveProducts(
        merchantId: 'merchant-a',
        products: const [
          CatalogProduct(
            id: 'product-b',
            merchantId: 'merchant-b',
            name: 'Cross tenant',
            productType: 'PHYSICAL',
            isActive: true,
            categoryNames: [],
          ),
        ],
      ),
      throwsA(isA<StateError>()),
    );
    expect(
      await database.select(database.cachedCatalogProducts).get(),
      isEmpty,
    );
  });
}
