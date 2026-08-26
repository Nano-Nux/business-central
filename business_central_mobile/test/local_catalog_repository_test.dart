import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';

void main() {
  late AppDatabase database;
  late LocalCatalogRepository repository;

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    repository = LocalCatalogRepository(
      database: database,
      merchantId: 'merchant-a',
    );
  });

  tearDown(() => database.closeForTest());

  test('local catalog CRUD stays durable and merchant scoped', () async {
    final category = await repository.createCategory(
      name: 'Accessories',
      slug: 'accessories',
      sortOrder: 2,
    );
    final product = await repository.createProduct(
      name: 'Cable',
      productType: 'physical',
      isActive: true,
      categoryIds: [category.id],
    );
    final variant = await repository.createVariant(
      productId: product.id,
      sku: 'CABLE-1',
      name: 'Cable / 1m',
      baseUnitId: 'unit',
      unitOfMeasure: 'EA',
      isStockTracked: true,
    );

    expect((await repository.listCategories()).single.sortOrder, 2);
    final storedProduct = (await repository.listProducts()).single;
    expect(storedProduct.categoryIds, [category.id]);
    expect(storedProduct.categoryNames, ['Accessories']);
    expect((await repository.listVariants(product.id)).single.id, variant.id);

    await repository.updateProduct(
      id: product.id,
      name: 'USB Cable',
      productType: 'PHYSICAL',
      isActive: false,
    );
    expect((await repository.listProducts()).single.name, 'USB Cable');
    expect((await repository.listProducts()).single.categoryIds, isEmpty);

    await repository.deleteProduct(product.id);
    expect(await repository.listProducts(), isEmpty);
    expect(await repository.listVariants(product.id), isEmpty);
    expect((await repository.listCategories()).single.id, category.id);
  });

  test('local catalog rejects cross-merchant category links', () async {
    final other = LocalCatalogRepository(
      database: database,
      merchantId: 'merchant-b',
    );
    final category = await other.createCategory(name: 'Other', slug: 'other');
    await expectLater(
      repository.createProduct(
        name: 'Cross tenant',
        productType: 'PHYSICAL',
        isActive: true,
        categoryIds: [category.id],
      ),
      throwsA(isA<StateError>()),
    );
    expect(await repository.listProducts(), isEmpty);
  });
}
