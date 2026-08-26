import 'package:drift/native.dart';
import 'package:drift/drift.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';
import 'package:business_central_mobile/features/inventory/data/local_inventory_repository.dart';

void main() {
  late AppDatabase database;
  late String merchantId;
  late String shopId;
  late String locationId;
  late String variantId;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    final auth = LocalAuthService(database: database);
    final setup = await auth.provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    merchantId = setup.merchantId;
    shopId = setup.shopId;
    locationId = (await database.select(database.locations).get()).single.id;
    final catalog = LocalCatalogRepository(
      database: database,
      merchantId: merchantId,
    );
    final product = await catalog.createProduct(
      name: 'Cable',
      productType: 'PHYSICAL',
      isActive: true,
    );
    variantId = (await catalog.createVariant(
      productId: product.id,
      sku: 'CABLE-1',
      name: 'Cable / 1m',
      baseUnitId: 'unit',
      price: '2.00',
      isStockTracked: true,
    )).id;
  });

  tearDown(() => database.closeForTest());

  test('local stock receiving updates balance and movement detail', () async {
    final inventory = LocalInventoryRepository(
      database: database,
      merchantId: merchantId,
    );
    expect(
      (await inventory.locations(
        merchantId: merchantId,
        shopId: shopId,
      )).single.id,
      locationId,
    );
    await inventory.stockIn(
      variantId: variantId,
      destinationLocationId: locationId,
      quantity: '2',
      unitCost: '3.50',
      purchaseOrderId: 'po-1',
      purchaseOrderLineId: 'po-line-1',
      receiptNumber: 'GR-1001',
      batchNumber: 'BATCH-1',
      expiresAt: '2027-01-01T00:00:00Z',
      eventKey: 'receipt-1',
    );
    await inventory.stockIn(
      variantId: variantId,
      destinationLocationId: locationId,
      quantity: '2',
      unitCost: '3.50',
      eventKey: 'receipt-1',
    );

    expect(
      (await database.select(database.cachedCatalogVariants).get())
          .single
          .quantityOnHand,
      '2.000',
    );
    final movements = await inventory.movements(locationIds: {locationId});
    expect(movements.single.eventKey, 'receipt-1');
    final detail = await inventory.movementDetail(id: movements.single.id);
    expect(detail.productName, 'Cable');
    expect(detail.destinationLocationCode, 'MAIN-STOCK');
    expect(detail.totalCost, '7.00');
    expect(detail.receipt?['receipt_number'], 'GR-1001');
    expect(detail.receipt?['batch_number'], 'BATCH-1');
    expect(detail.order?['purchase_order_id'], 'po-1');
    expect(
      (await database.select(database.localInventoryCostLayers).get())
          .single
          .quantityRemaining,
      '2.000',
    );
  });

  test('local sale consumes stock using FIFO cost allocations', () async {
    final inventory = LocalInventoryRepository(
      database: database,
      merchantId: merchantId,
    );
    await inventory.stockIn(
      variantId: variantId,
      destinationLocationId: locationId,
      quantity: '2',
      unitCost: '1.00',
      eventKey: 'fifo-receipt-1',
    );
    await inventory.stockIn(
      variantId: variantId,
      destinationLocationId: locationId,
      quantity: '2',
      unitCost: '2.00',
      eventKey: 'fifo-receipt-2',
    );
    final sale = await inventory.recordSale(
      shopId: shopId,
      variantId: variantId,
      sourceLocationId: locationId,
      quantity: '3',
      orderLineId: 'line-fifo',
      eventKey: 'fifo-sale-1',
    );

    expect(sale.totalCost, '4.00');
    final allocations =
        await (database.select(database.localInventoryCostAllocations)
              ..where(
                (row) => row.consumptionMovementId.equals(sale.movementId),
              )
              ..orderBy([(row) => OrderingTerm(expression: row.unitCost)]))
            .get();
    expect(allocations.map((row) => row.quantity), ['2.000', '1.000']);
    expect(allocations.map((row) => row.unitCost), ['1.00', '2.00']);
    expect(
      (await database.select(database.cachedCatalogVariants).get())
          .single
          .quantityOnHand,
      '1.000',
    );
  });

  test('local stock receiving rejects another merchant location', () async {
    final inventory = LocalInventoryRepository(
      database: database,
      merchantId: 'merchant-b',
    );
    await expectLater(
      inventory.stockIn(
        variantId: variantId,
        destinationLocationId: locationId,
        quantity: '1',
        unitCost: '1.00',
      ),
      throwsA(isA<StateError>()),
    );
  });
}
