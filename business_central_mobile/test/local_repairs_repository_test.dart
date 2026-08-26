import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';
import 'package:business_central_mobile/features/inventory/data/local_inventory_repository.dart';
import 'package:business_central_mobile/features/repairs/data/local_repairs_repository.dart';
import 'package:business_central_mobile/features/repairs/domain/repair_models.dart';
import 'package:business_central_mobile/features/promotions/data/local_promotions_repository.dart';

void main() {
  late AppDatabase database;
  late LocalOwnerSetupResult setup;
  late LocalRepairsRepository repairs;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    repairs = LocalRepairsRepository(
      database: database,
      merchantId: setup.merchantId,
    );
  });

  tearDown(() => database.closeForTest());

  test(
    'creates a local repair and tracks diagnostics and payment balance',
    () async {
      final ticket = await repairs.createTicket(
        shopId: setup.shopId,
        orderNumber: 'REP-1001',
        deviceType: 'Phone',
        manufacturer: 'Example',
        model: 'X1',
        serialNumber: 'SERIAL-1',
        issueDescription: 'Charging port is damaged',
        priority: 'HIGH',
        customerName: 'A Customer',
        customerPhone: '+66000000000',
        additionalFee: '50.00',
        note: 'Customer supplied the unlock code.',
        workItems: const [
          RepairWorkItemInput(
            id: 'work-item-phone',
            deviceType: 'Phone',
            issueDescription: 'Charging port is damaged',
          ),
          RepairWorkItemInput(
            id: 'work-item-tablet',
            deviceType: 'Tablet',
            issueDescription: 'Tablet has a separate charging fault',
          ),
        ],
      );
      final workItemRows = await (database.select(
        database.localRepairRecords,
      )..where((row) => row.recordType.equals('WORK_ITEM'))).get();
      final workItems = workItemRows
          .where((row) => row.parentId == ticket.repairOrderId)
          .toList();
      expect(workItems, hasLength(1));
      expect(
        workItems.single.issueDescription,
        'Tablet has a separate charging fault',
      );
      final projectedWorkItems = await repairs.listWorkItems(
        repairOrderId: ticket.repairOrderId,
      );
      expect(projectedWorkItems, hasLength(2));
      expect(projectedWorkItems.first.id, 'work-item-phone');
      expect(projectedWorkItems[1].deviceType, 'Tablet');
      var repair = (await repairs.list(shopId: setup.shopId)).single;
      expect(repair.id, ticket.repairOrderId);
      expect(repair.status, 'RECEIVED');
      expect(repair.paymentStatus, 'UNPAID');

      final diagnostic = await repairs.createDiagnostic(
        repairOrderId: repair.id,
        diagnosis: 'Charging port replacement required',
        estimatedCost: '50.00',
        workItemId: 'work-item-tablet',
      );
      expect(
        (await repairs.listDiagnostics(repairOrderId: repair.id)).single.id,
        diagnostic.id,
      );
      expect(diagnostic.workItemId, 'work-item-tablet');

      expect(
        () => repairs.createDiagnostic(
          repairOrderId: repair.id,
          diagnosis: 'Invalid scope',
          workItemId: 'work-item-outside',
        ),
        throwsA(isA<StateError>()),
      );
      final updatedWorkItem = await repairs.updateWorkItem(
        repairOrderId: repair.id,
        workItemId: 'work-item-tablet',
        status: 'COMPLETED',
      );
      expect(updatedWorkItem.status, 'COMPLETED');

      await repairs.createPayment(
        repairOrderId: repair.id,
        kind: 'DEPOSIT',
        method: 'CASH',
        amount: '20.00',
      );
      repair = (await repairs.list(shopId: setup.shopId)).single;
      expect(repair.paymentStatus, 'PARTIAL');

      await repairs.createPayment(
        repairOrderId: repair.id,
        kind: 'FINAL',
        method: 'CARD',
        amount: '30.00',
      );
      repair = (await repairs.list(shopId: setup.shopId)).single;
      expect(repair.paymentStatus, 'PAID');
      expect(
        (await repairs.listPayments(repairOrderId: repair.id)),
        hasLength(2),
      );

      final deposit = (await repairs.listPayments(
        repairOrderId: repair.id,
      )).first;
      final refund = await repairs.createRefund(
        repairOrderId: repair.id,
        paymentId: deposit.id,
        amount: '5.00',
        reason: 'Local repair refund',
        idempotencyKey: 'repair-refund-1',
      );
      expect(
        (await repairs.createRefund(
          repairOrderId: repair.id,
          paymentId: deposit.id,
          amount: '5.00',
          reason: 'Local repair refund',
          idempotencyKey: 'repair-refund-1',
        )).id,
        refund.id,
      );
      expect(
        (await repairs.listRefunds(repairOrderId: repair.id)).single.amount,
        '5.00',
      );
      repair = (await repairs.list(shopId: setup.shopId)).single;
      expect(repair.paymentStatus, 'PARTIAL');

      await repairs.updateStatus(repair: repair, status: 'READY_FOR_PICKUP');
      expect(
        (await repairs.list(shopId: setup.shopId)).single.status,
        'READY_FOR_PICKUP',
      );
    },
  );

  test('rejects cross-shop intake and overpayment', () async {
    expect(
      () => repairs.createTicket(
        shopId: 'another-shop',
        orderNumber: 'REP-1002',
        deviceType: 'Tablet',
        issueDescription: 'Broken screen',
      ),
      throwsA(isA<StateError>()),
    );

    final ticket = await repairs.createTicket(
      shopId: setup.shopId,
      orderNumber: 'REP-1003',
      deviceType: 'Tablet',
      issueDescription: 'Broken screen',
      additionalFee: '10.00',
    );
    expect(
      () => repairs.createPayment(
        repairOrderId: ticket.repairOrderId,
        kind: 'FINAL',
        method: 'CASH',
        amount: '10.01',
      ),
      throwsA(isA<FormatException>()),
    );
  });

  test(
    'stores repair parts, images, approvals, and warranties locally',
    () async {
      final ticket = await repairs.createTicket(
        shopId: setup.shopId,
        orderNumber: 'REP-1004',
        deviceType: 'Phone',
        issueDescription: 'Camera fault',
      );
      final catalog = LocalCatalogRepository(
        database: database,
        merchantId: setup.merchantId,
      );
      final product = await catalog.createProduct(
        name: 'Camera part',
        productType: 'PHYSICAL',
        isActive: true,
      );
      final variant = await catalog.createVariant(
        productId: product.id,
        sku: 'CAMERA-1',
        name: 'Camera part',
        baseUnitId: 'unit',
        price: '20.00',
        isStockTracked: false,
      );
      final image = await repairs.createImage(
        repairOrderId: ticket.repairOrderId,
        filename: 'camera.jpg',
        contentType: 'image/jpeg',
        dataBase64: 'AA==',
      );
      final part = await repairs.createPart(
        repairOrderId: ticket.repairOrderId,
        variantId: variant.id,
        quantity: '1',
        unitPrice: '20.00',
        status: 'PENDING',
      );
      final approval = await repairs.createApproval(
        repairOrderId: ticket.repairOrderId,
        approvalVersion: 1,
        status: 'APPROVED',
        approvedAmount: '20.00',
      );
      final warranty = await repairs.createWarranty(
        repairOrderId: ticket.repairOrderId,
        startsAt: DateTime.utc(2026, 8, 5),
        endsAt: DateTime.utc(2026, 9, 5),
        terms: '30 days',
      );

      expect(
        (await repairs.listImages(
          repairOrderId: ticket.repairOrderId,
        )).single.id,
        image.id,
      );
      expect(
        (await repairs.listParts(
          repairOrderId: ticket.repairOrderId,
        )).single.id,
        part.id,
      );
      expect(
        (await repairs.listApprovals(
          repairOrderId: ticket.repairOrderId,
        )).single.status,
        'APPROVED',
      );
      expect(
        (await repairs.listWarranties(
          repairOrderId: ticket.repairOrderId,
        )).single.id,
        warranty.id,
      );

      await repairs.deleteImage(image.id);
      await repairs.deletePart(part.id);
      await repairs.deleteApproval(approval.id);
      await repairs.deleteWarranty(warranty.id);
      expect(
        await repairs.listImages(repairOrderId: ticket.repairOrderId),
        isEmpty,
      );
    },
  );

  test('used local repair parts consume stock with FIFO costing', () async {
    final catalog = LocalCatalogRepository(
      database: database,
      merchantId: setup.merchantId,
    );
    final product = await catalog.createProduct(
      name: 'Repair battery',
      productType: 'PHYSICAL',
      isActive: true,
    );
    final variant = await catalog.createVariant(
      productId: product.id,
      sku: 'BATTERY-1',
      name: 'Repair battery',
      baseUnitId: 'unit',
      price: '50.00',
      isStockTracked: true,
    );
    final locationId =
        (await database.select(database.locations).get()).single.id;
    await LocalInventoryRepository(
      database: database,
      merchantId: setup.merchantId,
    ).stockIn(
      variantId: variant.id,
      destinationLocationId: locationId,
      quantity: '2',
      unitCost: '12.00',
      eventKey: 'repair-receipt',
    );
    final ticket = await repairs.createTicket(
      shopId: setup.shopId,
      orderNumber: 'REP-1005',
      deviceType: 'Phone',
      issueDescription: 'Battery fault',
      additionalFee: '5.00',
    );
    final part = await repairs.createPart(
      repairOrderId: ticket.repairOrderId,
      variantId: variant.id,
      quantity: '1',
      unitPrice: '50.00',
      status: 'USED',
    );

    expect(part.status, 'USED');
    expect(
      (await repairs.list(shopId: setup.shopId)).single.totalCost,
      '55.00',
    );
    expect(
      (await database.select(database.cachedCatalogVariants).get())
          .single
          .quantityOnHand,
      '1.000',
    );
    expect(
      (await database.select(database.localInventoryCostAllocations).get())
          .single
          .totalCost,
      '12.00',
    );
  });

  test(
    'local repair-part promotions use product scope and exact totals',
    () async {
      final catalog = LocalCatalogRepository(
        database: database,
        merchantId: setup.merchantId,
      );
      final product = await catalog.createProduct(
        name: 'Repair screen',
        productType: 'PHYSICAL',
        isActive: true,
      );
      final variant = await catalog.createVariant(
        productId: product.id,
        sku: 'SCREEN-1',
        name: 'Repair screen',
        baseUnitId: 'unit',
        price: '50.00',
        isStockTracked: false,
      );
      final promotion =
          await LocalPromotionsRepository(
            database: database,
            merchantId: setup.merchantId,
          ).create(
            name: 'Repair discount',
            promotionType: 'PERCENTAGE',
            value: '10.00',
            minimumSubtotal: '40.00',
          );
      await LocalPromotionsRepository(
        database: database,
        merchantId: setup.merchantId,
      ).assignProductScope(
        promotionId: promotion.id,
        productId: product.id,
        variantId: variant.id,
      );
      final ticket = await repairs.createTicket(
        shopId: setup.shopId,
        orderNumber: 'REP-1006',
        deviceType: 'Phone',
        issueDescription: 'Screen fault',
        additionalFee: '5.00',
      );

      await repairs.createPart(
        repairOrderId: ticket.repairOrderId,
        variantId: variant.id,
        quantity: '1',
        unitPrice: '50.00',
        status: 'USED',
        promotionId: promotion.id,
      );

      expect(
        (await repairs.list(shopId: setup.shopId)).single.totalCost,
        '50.00',
      );
      expect(
        (await database.select(database.localPromotions).get())
            .single
            .redemptionCount,
        1,
      );
    },
  );
}
