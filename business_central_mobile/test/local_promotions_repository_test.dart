import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';
import 'package:business_central_mobile/features/pos/data/local_pos_repository.dart';
import 'package:business_central_mobile/features/pos/domain/pos_models.dart';
import 'package:business_central_mobile/features/promotions/data/local_promotions_repository.dart';

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

  test('local promotion CRUD, code, and scope stay merchant-scoped', () async {
    final catalog = LocalCatalogRepository(
      database: database,
      merchantId: merchantId,
    );
    final product = await catalog.createProduct(
      name: 'Cable',
      productType: 'PHYSICAL',
      isActive: true,
    );
    final variant = await catalog.createVariant(
      productId: product.id,
      sku: 'CABLE-1',
      name: 'Cable',
      baseUnitId: 'unit',
      price: '10.00',
      isStockTracked: false,
    );
    final repository = LocalPromotionsRepository(
      database: database,
      merchantId: merchantId,
    );

    final promotion = await repository.create(
      name: 'Ten percent',
      promotionType: 'PERCENTAGE',
      value: '10.00',
      minimumSubtotal: '5.00',
      usageLimit: 2,
    );
    final code = await repository.createCode(
      promotionId: promotion.id,
      code: 'TENOFF',
      usageLimit: 2,
    );
    await repository.assignProductScope(
      promotionId: promotion.id,
      productId: product.id,
      variantId: variant.id,
    );

    expect((await repository.list()).single.value, '10.00');
    expect((await repository.listCodes(promotion.id)).single.id, code.id);
    final scope = (await repository.listProductScopes(promotion.id)).single;
    expect(scope.productId, product.id);
    expect(scope.variantId, variant.id);
    expect(
      (await database.select(database.localAuditEvents).get()).length,
      greaterThanOrEqualTo(3),
    );
    expect(shopId, isNotEmpty);
  });

  test('local POS applies scoped promotion and exact tax settings', () async {
    final catalog = LocalCatalogRepository(
      database: database,
      merchantId: merchantId,
    );
    final product = await catalog.createProduct(
      name: 'Cable',
      productType: 'PHYSICAL',
      isActive: true,
    );
    await catalog.createVariant(
      productId: product.id,
      sku: 'CABLE-1',
      name: 'Cable',
      baseUnitId: 'unit',
      price: '25.00',
      isStockTracked: false,
    );
    await database
        .into(database.merchantSettings)
        .insert(
          MerchantSettingsCompanion.insert(
            id: 'tax-setting',
            merchantId: merchantId,
            shopId: Value(shopId),
            settingKey: 'tax.include',
            valueType: 'BOOLEAN',
            valueJson: 'true',
            updatedAt: DateTime.now().toUtc().toIso8601String(),
          ),
        );
    await database
        .into(database.merchantSettings)
        .insert(
          MerchantSettingsCompanion.insert(
            id: 'tax-rate-setting',
            merchantId: merchantId,
            shopId: Value(shopId),
            settingKey: 'tax.rate',
            valueType: 'DECIMAL',
            valueJson: '12.50',
            updatedAt: DateTime.now().toUtc().toIso8601String(),
          ),
        );
    final promotion =
        await LocalPromotionsRepository(
          database: database,
          merchantId: merchantId,
        ).create(
          name: 'Twenty percent',
          promotionType: 'PERCENTAGE',
          value: '20.00',
        );
    final item = (await LocalPosRepository(
      database: database,
      merchantId: merchantId,
    ).catalog(shopId: shopId)).single;
    final repository = LocalPosRepository(
      database: database,
      merchantId: merchantId,
    );

    final quote = await repository.quote(
      shopId: shopId,
      lines: [PosCartLine(item: item, quantity: 1)],
      promotionId: promotion.id,
    );
    expect(quote.subtotal, '25.00');
    expect(quote.discountTotal, '5.00');
    expect(quote.taxTotal, '2.50');
    expect(quote.grandTotal, '22.50');

    final order = await repository.checkout(
      shopId: shopId,
      lines: [PosCartLine(item: item, quantity: 1)],
      promotionId: promotion.id,
      paymentMethod: 'CASH',
      idempotencyKey: 'promotion-sale-1',
    );
    expect(order.status, 'CONFIRMED');
    expect(
      (await database.select(database.localOrders).get()).single.discountTotal,
      '5.00',
    );
    final line = (await database.select(database.localOrderLines).get()).single;
    expect(line.discountAmount, '5.00');
    expect(line.taxAmount, '2.50');
    expect(line.lineTotal, '22.50');
    expect(
      (await database.select(database.localOrderPromotions).get())
          .single
          .discountAmount,
      '5.00',
    );
    expect(
      (await database.select(database.localPromotions).get())
          .single
          .redemptionCount,
      1,
    );
  });
}
