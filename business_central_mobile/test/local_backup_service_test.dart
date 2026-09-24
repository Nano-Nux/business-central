import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_backup_service.dart';

void main() {
  late AppDatabase database;
  const merchantId = 'merchant-test-1';
  const shopId = 'shop-test-1';

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    await database
        .into(database.merchants)
        .insert(
          MerchantsCompanion.insert(
            id: merchantId,
            name: 'Test Merchant',
            slug: 'test-merchant',
            currencyCode: 'USD',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
    await database
        .into(database.shops)
        .insert(
          ShopsCompanion.insert(
            id: shopId,
            merchantId: merchantId,
            name: 'Main Shop',
            code: 'MAIN',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
  });

  tearDown(() async {
    await database.close();
  });

  test(
    'local backup round-trips merchant-scoped operational catalog data',
    () async {
      // Insert product, variant, order, order lines
      await database
          .into(database.cachedCatalogProducts)
          .insert(
            CachedCatalogProductsCompanion.insert(
              id: 'prod-1',
              merchantId: merchantId,
              name: 'Cable',
              productType: 'PHYSICAL',
              isActive: const Value(true),
              updatedAt: '2026-09-18T00:00:00Z',
            ),
          );

      await database
          .into(database.cachedCatalogVariants)
          .insert(
            CachedCatalogVariantsCompanion.insert(
              id: 'var-1',
              merchantId: merchantId,
              productId: 'prod-1',
              sku: 'CABLE-1',
              name: 'Cable',
              baseUnitId: 'unit',
              unitOfMeasure: 'pcs',
              price: const Value('5.00'),
              updatedAt: '2026-09-18T00:00:00Z',
            ),
          );

      await database
          .into(database.localOrders)
          .insert(
            LocalOrdersCompanion.insert(
              id: 'ord-1',
              merchantId: merchantId,
              shopId: shopId,
              number: 'ORD-1001',
              status: 'COMPLETED',
              currencyCode: 'USD',
              subtotal: '5.00',
              discountTotal: '0.00',
              taxTotal: '0.00',
              grandTotal: '5.00',
              paymentMethod: 'CASH',
              idempotencyKey: 'idemp-1',
              createdAt: '2026-09-18T00:00:00Z',
            ),
          );

      await database
          .into(database.localOrderLines)
          .insert(
            LocalOrderLinesCompanion.insert(
              id: 'line-1',
              merchantId: merchantId,
              orderId: 'ord-1',
              variantId: 'var-1',
              sku: 'CABLE-1',
              name: 'Cable',
              unitPrice: '5.00',
              quantity: 1,
              lineTotal: '5.00',
            ),
          );

      final backup = LocalBackupService(database);
      final payload = await backup.exportMerchant(merchantId: merchantId);

      // Delete local rows to verify restore
      await database.delete(database.cachedCatalogProducts).go();
      await database.delete(database.cachedCatalogVariants).go();
      await database.delete(database.localOrders).go();
      await database.delete(database.localOrderLines).go();

      expect(
        await database.select(database.cachedCatalogProducts).get(),
        isEmpty,
      );
      expect(await database.select(database.localOrders).get(), isEmpty);

      // Restore from payload
      await backup.restoreMerchant(merchantId: merchantId, payload: payload);

      final restoredProducts = await database
          .select(database.cachedCatalogProducts)
          .get();
      expect(restoredProducts, hasLength(1));
      expect(restoredProducts.first.name, 'Cable');

      final restoredVariants = await database
          .select(database.cachedCatalogVariants)
          .get();
      expect(restoredVariants, hasLength(1));
      expect(restoredVariants.first.sku, 'CABLE-1');

      final restoredOrders = await database.select(database.localOrders).get();
      expect(restoredOrders, hasLength(1));
      expect(restoredOrders.first.number, 'ORD-1001');

      final restoredLines = await database
          .select(database.localOrderLines)
          .get();
      expect(restoredLines, hasLength(1));
      expect(restoredLines.first.unitPrice, '5.00');
    },
  );

  test(
    'local backup rejects a cross-merchant restore before writing',
    () async {
      final backup = LocalBackupService(database);
      final payload = await backup.exportMerchant(merchantId: merchantId);

      expect(
        () => backup.restoreMerchant(
          merchantId: 'different-merchant',
          payload: payload,
        ),
        throwsA(isA<LocalBackupException>()),
      );
    },
  );

  test('local backup rejects tampered payloads by checksum', () async {
    final backup = LocalBackupService(database);
    final payload = await backup.exportMerchant(merchantId: merchantId);
    final decoded = jsonDecode(payload) as Map<String, dynamic>;
    decoded['merchant'] = {'id': merchantId, 'name': 'Tampered'};
    final tamperedPayload = jsonEncode(decoded);

    expect(
      () => backup.restoreMerchant(
        merchantId: merchantId,
        payload: tamperedPayload,
      ),
      throwsA(isA<LocalBackupException>()),
    );
  });
}
