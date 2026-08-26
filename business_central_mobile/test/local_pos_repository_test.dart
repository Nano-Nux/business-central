import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';
import 'package:business_central_mobile/features/deliveries/data/local_deliveries_repository.dart';
import 'package:business_central_mobile/features/pos/data/local_pos_repository.dart';
import 'package:business_central_mobile/features/pos/domain/pos_models.dart';
import 'package:business_central_mobile/features/transaction_history/data/local_transaction_history_repository.dart';

void main() {
  late AppDatabase database;
  late LocalAuthService auth;
  late String merchantId;
  late String shopId;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    auth = LocalAuthService(database: database);
    final setup = await auth.provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    merchantId = setup.merchantId;
    shopId = setup.shopId;
  });

  tearDown(() => database.closeForTest());

  test(
    'local quote and checkout are exact, atomic, and decrement stock',
    () async {
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
        name: 'Cable / 1m',
        baseUnitId: 'unit',
        price: '12.50',
        quantityOnHand: '3',
        isStockTracked: true,
      );
      final repository = LocalPosRepository(
        database: database,
        merchantId: merchantId,
      );
      final delivery =
          await LocalDeliveriesRepository(
            database: database,
            merchantId: merchantId,
            shopId: shopId,
          ).create(
            merchantId: merchantId,
            shopId: shopId,
            name: 'Courier',
            contactInfo: '555-0100',
          );
      final item = (await repository.catalog(shopId: shopId)).single;
      final line = PosCartLine(item: item, quantity: 2);

      final quote = await repository.quote(
        shopId: shopId,
        lines: [line],
        deliveryId: delivery.id,
      );
      expect(quote.grandTotal, '25.00');
      final result = await repository.checkout(
        shopId: shopId,
        lines: [line],
        paymentMethod: 'cash',
        customerName: 'Ada',
        deliveryId: delivery.id,
        idempotencyKey: 'sale-1',
      );
      final retry = await repository.checkout(
        shopId: shopId,
        lines: [line],
        paymentMethod: 'cash',
        idempotencyKey: 'sale-1',
      );

      expect(result.status, 'CONFIRMED');
      expect(retry.id, result.id);
      expect(
        (await database.select(database.localOrders).get()).single.grandTotal,
        '25.00',
      );
      expect(
        (await database.select(database.localOrders).get()).single.deliveryId,
        delivery.id,
      );
      expect(
        (await database.select(database.localOrderLines).get()).single.quantity,
        2,
      );
      expect(
        (await database.select(database.localPayments).get()).single.status,
        'CAPTURED',
      );
      expect(
        (await database.select(database.cachedCatalogVariants).get())
            .single
            .quantityOnHand,
        '1.000',
      );
      expect(variant.id, isNotEmpty);
    },
  );

  test(
    'local checkout rejects insufficient stock without writing an order',
    () async {
      final catalog = LocalCatalogRepository(
        database: database,
        merchantId: merchantId,
      );
      final product = await catalog.createProduct(
        name: 'Limited',
        productType: 'PHYSICAL',
        isActive: true,
      );
      await catalog.createVariant(
        productId: product.id,
        sku: 'LIMITED-1',
        name: 'Limited',
        baseUnitId: 'unit',
        price: '1.00',
        quantityOnHand: '1',
        isStockTracked: true,
      );
      final repository = LocalPosRepository(
        database: database,
        merchantId: merchantId,
      );
      final item = (await repository.catalog(shopId: shopId)).single;
      await expectLater(
        repository.checkout(
          shopId: shopId,
          lines: [PosCartLine(item: item, quantity: 2)],
          paymentMethod: 'CASH',
        ),
        throwsA(isA<StateError>()),
      );
      expect(await database.select(database.localOrders).get(), isEmpty);
    },
  );

  test(
    'local refund is idempotent and appears in transaction history',
    () async {
      final catalog = LocalCatalogRepository(
        database: database,
        merchantId: merchantId,
      );
      final product = await catalog.createProduct(
        name: 'Refundable',
        productType: 'PHYSICAL',
        isActive: true,
      );
      await catalog.createVariant(
        productId: product.id,
        sku: 'REFUND-1',
        name: 'Refundable',
        baseUnitId: 'unit',
        price: '10.00',
        isStockTracked: false,
      );
      final repository = LocalPosRepository(
        database: database,
        merchantId: merchantId,
      );
      final item = (await repository.catalog(shopId: shopId)).single;
      final order = await repository.checkout(
        shopId: shopId,
        lines: [PosCartLine(item: item, quantity: 1)],
        paymentMethod: 'CASH',
      );
      final payment =
          (await database.select(database.localPayments).get()).single;
      final refund = await repository.refund(
        orderId: order.id,
        paymentId: payment.id,
        amount: '10.00',
        reason: 'Customer return',
        idempotencyKey: 'refund-1',
      );
      final retry = await repository.refund(
        orderId: order.id,
        paymentId: payment.id,
        amount: '10.00',
        idempotencyKey: 'refund-1',
      );

      expect(retry.id, refund.id);
      expect(
        (await database.select(database.localRefunds).get()).single.status,
        'SUCCEEDED',
      );
      expect(
        (await database.select(database.localPayments).get()).single.status,
        'REFUNDED',
      );
      expect(
        (await database.select(database.localOrders).get()).single.status,
        'REFUNDED',
      );
      final history = LocalTransactionHistoryRepository(
        database: database,
        merchantId: merchantId,
      );
      expect(
        (await history.list(shopId: shopId, eventType: 'REFUND')).single.id,
        refund.id,
      );
      expect((await history.detail(refund.id)).entry.eventType, 'REFUND');
    },
  );
}
