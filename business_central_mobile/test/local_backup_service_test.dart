import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_backup_service.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';
import 'package:business_central_mobile/features/catalog/data/local_measurement_repository.dart';
import 'package:business_central_mobile/features/catalog/data/local_pricing_repository.dart';
import 'package:business_central_mobile/features/deliveries/data/local_deliveries_repository.dart';
import 'package:business_central_mobile/features/inventory/data/local_inventory_repository.dart';
import 'package:business_central_mobile/features/repairs/data/local_repairs_repository.dart';
import 'package:business_central_mobile/features/services/data/local_services_repository.dart';
import 'package:business_central_mobile/features/settings/data/local_repair_specifications_repository.dart';

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

  test(
    'local backup round-trips merchant-scoped operational catalog data',
    () async {
      final catalog = LocalCatalogRepository(
        database: database,
        merchantId: merchantId,
      );
      final category = await catalog.createCategory(
        name: 'Accessories',
        slug: 'accessories',
      );
      final product = await catalog.createProduct(
        name: 'Cable',
        productType: 'PHYSICAL',
        isActive: true,
        categoryIds: [category.id],
      );
      final variant = await catalog.createVariant(
        productId: product.id,
        sku: 'CABLE-1',
        name: 'Cable',
        baseUnitId: 'unit',
        price: '5.00',
        isStockTracked: false,
      );
      final measurements = LocalMeasurementRepository(
        database: database,
        merchantId: merchantId,
      );
      final unit = await measurements.createUnit(code: 'EA', name: 'Each');
      final deliveries = LocalDeliveriesRepository(
        database: database,
        merchantId: merchantId,
        shopId: shopId,
      );
      final delivery = await deliveries.create(
        merchantId: merchantId,
        shopId: shopId,
        name: 'Courier',
        contactInfo: '555-0100',
      );
      final pricing = LocalPricingRepository(
        database: database,
        merchantId: merchantId,
      );
      final priceList = (await pricing.listPriceLists(
        merchantId: merchantId,
      )).single;
      await pricing.upsertPrice(
        priceListId: priceList.id,
        variantId: variant.id,
        amount: '6.50',
      );
      final locationId =
          (await database.select(database.locations).get()).single.id;
      await LocalInventoryRepository(
        database: database,
        merchantId: merchantId,
      ).stockIn(
        variantId: variant.id,
        destinationLocationId: locationId,
        quantity: '2',
        unitCost: '1.25',
        eventKey: 'backup-receipt',
      );
      final services = LocalServicesRepository(
        database: database,
        merchantId: merchantId,
      );
      await services.createDefinition(
        code: 'REPAIR',
        name: 'Device repair',
        laborFee: '25.00',
      );
      final serviceOrder = await services.createOrder(
        shopId: shopId,
        orderNumber: 'SR-1001',
        serviceType: 'REPAIR',
        priority: 'NORMAL',
      );
      await services.createNote(orderId: serviceOrder.id, note: 'Local note');
      final repairs = LocalRepairsRepository(
        database: database,
        merchantId: merchantId,
      );
      final repair = await repairs.createTicket(
        shopId: shopId,
        orderNumber: 'REP-1001',
        deviceType: 'Phone',
        issueDescription: 'Broken screen',
        additionalFee: '40.00',
      );
      final repairSpecifications = LocalRepairSpecificationsRepository(
        database: database,
      );
      await repairSpecifications.save(
        merchantId: merchantId,
        shopId: shopId,
        faultPresets: const ['Broken screen', 'Water damage'],
        defaultDuration: '3 business days',
      );
      await database.enqueueOperation(
        operationId: 'pending-settings-operation',
        merchantId: merchantId,
        shopId: shopId,
        deviceId: 'device-1',
        entityType: 'SHOP_SETTINGS',
        entityId: shopId,
        operationType: 'UPDATE',
        payload: {'name': 'Pending name'},
        payloadHash: 'hash-1',
        baseVersion: 2,
      );
      final backup = LocalBackupService(database);
      final payload = await backup.exportMerchant(merchantId: merchantId);
      await catalog.deleteProduct(product.id);
      await database.delete(database.localServiceRecords).go();
      await database.delete(database.localRepairRecords).go();
      await database.delete(database.localPrices).go();
      await database.delete(database.localPriceLists).go();
      await database.delete(database.localMeasurementUnits).go();
      await database.delete(database.localDeliveries).go();
      await database.delete(database.localInventoryCostAllocations).go();
      await database.delete(database.localInventoryCostLayers).go();
      await database.delete(database.localInventoryMovements).go();
      await database.delete(database.localAuditEvents).go();
      await database.delete(database.operationQueue).go();
      expect(await catalog.listProducts(), isEmpty);

      await backup.restoreMerchant(merchantId: merchantId, payload: payload);
      expect((await catalog.listProducts()).single.name, 'Cable');
      expect((await catalog.listVariants(product.id)).single.sku, 'CABLE-1');
      expect(
        (await services.listOrders(shopId: shopId)).single.orderNumber,
        'SR-1001',
      );
      expect(
        (await services.listNotes(orderId: serviceOrder.id)).single.note,
        'Local note',
      );
      expect(
        (await repairs.list(shopId: shopId)).single.id,
        repair.repairOrderId,
      );
      expect(
        (await pricing.listPrices(priceListId: priceList.id)).single.amount,
        '6.50',
      );
      expect((await measurements.listUnits()).single.id, unit.id);
      expect(
        (await deliveries.list(
          merchantId: merchantId,
          shopId: shopId,
        )).single.id,
        delivery.id,
      );
      final restoredSpecifications = await repairSpecifications.load(
        merchantId: merchantId,
        shopId: shopId,
      );
      expect(restoredSpecifications.faultPresets, [
        'Broken screen',
        'Water damage',
      ]);
      expect(restoredSpecifications.defaultDuration, '3 business days');
      final restoredQueue = await database.pendingOperations(merchantId);
      expect(restoredQueue.single.operationId, 'pending-settings-operation');
      expect(restoredQueue.single.payloadHash, 'hash-1');
      expect(
        (await database.select(database.localInventoryCostLayers).get())
            .single
            .unitCost,
        '1.25',
      );
      expect(
        await database.select(database.localAuditEvents).get(),
        isNotEmpty,
      );
    },
  );

  test(
    'local backup rejects a cross-merchant restore before writing',
    () async {
      final payload = await LocalBackupService(
        database,
      ).exportMerchant(merchantId: merchantId);
      await expectLater(
        LocalBackupService(
          database,
        ).restoreMerchant(merchantId: 'another-merchant', payload: payload),
        throwsA(isA<LocalBackupException>()),
      );
    },
  );

  test('local backup rejects tampered payloads by checksum', () async {
    final backup = LocalBackupService(database);
    final payload = await backup.exportMerchant(merchantId: merchantId);
    final decoded = Map<String, dynamic>.from(jsonDecode(payload) as Map);
    final merchant = Map<String, dynamic>.from(decoded['merchant'] as Map);
    merchant['name'] = 'Tampered merchant';
    decoded['merchant'] = merchant;
    final tampered = jsonEncode(decoded);
    expect(
      () => backup.restoreMerchant(merchantId: merchantId, payload: tampered),
      throwsA(isA<LocalBackupException>()),
    );
  });
}
