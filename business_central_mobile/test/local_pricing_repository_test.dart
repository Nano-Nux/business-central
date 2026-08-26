import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';
import 'package:business_central_mobile/features/catalog/data/local_pricing_repository.dart';

void main() {
  late AppDatabase database;
  late LocalOwnerSetupResult setup;
  late LocalPricingRepository pricing;
  late String variantId;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    final catalog = LocalCatalogRepository(
      database: database,
      merchantId: setup.merchantId,
    );
    final product = await catalog.createProduct(
      name: 'Cable',
      productType: 'PHYSICAL',
      isActive: true,
    );
    variantId = (await catalog.createVariant(
      productId: product.id,
      sku: 'CABLE-1',
      name: 'Cable',
      baseUnitId: 'unit',
      price: '5.00',
      isStockTracked: false,
    )).id;
    pricing = LocalPricingRepository(
      database: database,
      merchantId: setup.merchantId,
    );
  });

  tearDown(() => database.closeForTest());

  test('manages local price lists and feeds POS variant pricing', () async {
    final lists = await pricing.listPriceLists(merchantId: setup.merchantId);
    expect(lists.single.isDefault, isTrue);
    final price = await pricing.upsertPrice(
      priceListId: lists.single.id,
      variantId: variantId,
      amount: '7.25',
    );
    expect(price.amount, '7.25');
    expect(
      (await database.select(database.cachedCatalogVariants).get())
          .single
          .price,
      '7.25',
    );
    expect(
      (await pricing.listPrices(priceListId: lists.single.id)).single.amount,
      '7.25',
    );

    await pricing.deletePrice(
      priceListId: lists.single.id,
      variantId: variantId,
    );
    expect((await pricing.listPrices(priceListId: lists.single.id)), isEmpty);
    expect(
      (await database.select(database.cachedCatalogVariants).get())
          .single
          .price,
      isNull,
    );
  });

  test('rejects price writes outside the local merchant scope', () async {
    final lists = await pricing.listPriceLists(merchantId: setup.merchantId);
    expect(
      () => pricing.listPriceLists(merchantId: 'another-merchant'),
      throwsA(isA<StateError>()),
    );
    expect(
      () => pricing.upsertPrice(
        priceListId: lists.single.id,
        variantId: 'another-variant',
        amount: '1.00',
      ),
      throwsA(isA<StateError>()),
    );
  });
}
