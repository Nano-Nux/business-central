import 'package:drift/native.dart';
import 'package:drift/drift.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/catalog/data/local_catalog_repository.dart';
import 'package:business_central_mobile/features/customers/data/local_customers_repository.dart';
import 'package:business_central_mobile/features/dashboard/data/local_dashboard_repository.dart';
import 'package:business_central_mobile/features/invoices/data/local_invoices_repository.dart';
import 'package:business_central_mobile/features/inventory/data/local_inventory_repository.dart';
import 'package:business_central_mobile/features/pos/data/local_pos_repository.dart';
import 'package:business_central_mobile/features/pos/domain/pos_models.dart';
import 'package:business_central_mobile/features/repairs/data/local_repairs_repository.dart';
import 'package:business_central_mobile/features/repairs/domain/repair_models.dart';
import 'package:business_central_mobile/features/reports/data/local_reports_repository.dart';
import 'package:business_central_mobile/features/transaction_history/data/local_transaction_history_repository.dart';

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
    final catalog = LocalCatalogRepository(
      database: database,
      merchantId: merchantId,
    );
    final product = await catalog.createProduct(
      name: 'Notebook',
      productType: 'PHYSICAL',
      isActive: true,
    );
    await catalog.createVariant(
      productId: product.id,
      sku: 'NOTE-1',
      name: 'Notebook',
      baseUnitId: 'unit',
      price: '9.99',
      isStockTracked: false,
    );
  });

  tearDown(() => database.closeForTest());

  test('local invoice list reads durable order lines', () async {
    final pos = LocalPosRepository(database: database, merchantId: merchantId);
    final item = (await pos.catalog(shopId: shopId)).single;
    await pos.checkout(
      shopId: shopId,
      lines: [PosCartLine(item: item, quantity: 2)],
      paymentMethod: 'CASH',
      customerName: 'Ada',
    );

    final invoices = await LocalInvoicesRepository(
      database: database,
      merchantId: merchantId,
    ).list(shopId: shopId);
    expect(invoices.single.customer, 'Ada');
    expect(invoices.single.grandTotal, '19.98');
    expect(invoices.single.items.single.quantity, '2');
  });

  test('local invoice projection includes repair service and parts', () async {
    final repairRepository = LocalRepairsRepository(
      database: database,
      merchantId: merchantId,
    );
    final ticket = await repairRepository.createTicket(
      shopId: shopId,
      orderNumber: 'REP-INVOICE',
      deviceType: 'Phone',
      issueDescription: 'Screen replacement',
      workItems: const [
        RepairWorkItemInput(
          deviceType: 'Phone',
          issueDescription: 'Screen replacement',
          conditions: ['Cracked glass', 'Bent frame'],
        ),
      ],
      customerName: 'Ada',
      additionalFee: '30.00',
    );
    final variant =
        (await database.select(database.cachedCatalogVariants).get()).single;
    await repairRepository.createPart(
      repairOrderId: ticket.repairOrderId,
      variantId: variant.id,
      quantity: '1',
      unitPrice: '5.00',
      status: 'PENDING',
    );

    final invoice = (await LocalInvoicesRepository(
      database: database,
      merchantId: merchantId,
    ).list(shopId: shopId)).single;
    expect(invoice.number, 'REP-INVOICE');
    expect(invoice.customer, 'Ada');
    expect(invoice.subtotal, '35.00');
    expect(invoice.grandTotal, '35.00');
    expect(invoice.items.map((item) => item.name), [
      'Repair service (ticket total)',
      'Phone · Issue: Screen replacement · Condition: Cracked glass · Condition: Bent frame',
      'Notebook · Notebook',
    ]);
    expect(invoice.items.last.unitPrice, '5.00');
  });

  test(
    'local report snapshot aggregates sales without inventing COGS',
    () async {
      final pos = LocalPosRepository(
        database: database,
        merchantId: merchantId,
      );
      final item = (await pos.catalog(shopId: shopId)).single;
      final checkout = await pos.checkout(
        shopId: shopId,
        lines: [PosCartLine(item: item, quantity: 1)],
        paymentMethod: 'CARD',
      );
      final payment =
          await (database.select(database.localPayments)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.orderId.equals(checkout.id),
              ))
              .getSingle();
      await pos.refund(
        orderId: checkout.id,
        paymentId: payment.id,
        amount: '4.99',
        reason: 'Local report refund',
      );
      final now = DateTime.now().toUtc();
      final report =
          await LocalReportsRepository(
            database: database,
            merchantId: merchantId,
          ).load(
            shopId: shopId,
            from: now.subtract(const Duration(days: 1)),
            to: now.add(const Duration(minutes: 1)),
          );
      expect(report.summary.orderCount, 1);
      expect(report.summary.netSales, '9.99');
      expect(report.summary.refunds, '4.99');
      expect(report.summary.costOfGoodsSold, '0.00');
      expect(report.summary.grossProfit, '5.00');
      expect(report.summary.grossMarginPercent, '50.05');
      expect(report.topProducts.single.sku, 'NOTE-1');
      expect(report.days.single.refunds, '4.99');
      expect(report.days.single.grossProfit, '5.00');
    },
  );

  test(
    'local reports and history expose FIFO COGS for tracked POS sales',
    () async {
      final catalog = LocalCatalogRepository(
        database: database,
        merchantId: merchantId,
      );
      final product = await catalog.createProduct(
        name: 'Tracked notebook',
        productType: 'PHYSICAL',
        isActive: true,
      );
      final variant = await catalog.createVariant(
        productId: product.id,
        sku: 'TRACK-1',
        name: 'Tracked notebook',
        baseUnitId: 'unit',
        price: '10.00',
        isStockTracked: true,
      );
      final locationId =
          (await database.select(database.locations).get()).single.id;
      final inventory = LocalInventoryRepository(
        database: database,
        merchantId: merchantId,
      );
      await inventory.stockIn(
        variantId: variant.id,
        destinationLocationId: locationId,
        quantity: '2',
        unitCost: '1.00',
        eventKey: 'report-fifo-1',
      );
      await inventory.stockIn(
        variantId: variant.id,
        destinationLocationId: locationId,
        quantity: '2',
        unitCost: '2.00',
        eventKey: 'report-fifo-2',
      );
      final pos = LocalPosRepository(
        database: database,
        merchantId: merchantId,
      );
      final item = (await pos.catalog(
        shopId: shopId,
      )).firstWhere((entry) => entry.sku == 'TRACK-1');
      final result = await pos.checkout(
        shopId: shopId,
        lines: [PosCartLine(item: item, quantity: 3)],
        paymentMethod: 'CASH',
      );
      final now = DateTime.now().toUtc();
      final report =
          await LocalReportsRepository(
            database: database,
            merchantId: merchantId,
          ).load(
            shopId: shopId,
            from: now.subtract(const Duration(days: 1)),
            to: now.add(const Duration(minutes: 1)),
          );
      expect(report.summary.costOfGoodsSold, '4.00');
      expect(report.summary.grossProfit, '26.00');
      expect(report.summary.grossMarginPercent, '86.67');
      final history = LocalTransactionHistoryRepository(
        database: database,
        merchantId: merchantId,
      );
      final detail = await history.detail(result.id);
      expect(detail.totalCost, '4.00');
      expect(detail.lines.single.originalCost, '1.33');
      expect(detail.lines.single.grossProfit, '26.00');
    },
  );

  test(
    'local dashboard reads the same canonical local order projection',
    () async {
      final pos = LocalPosRepository(
        database: database,
        merchantId: merchantId,
      );
      final item = (await pos.catalog(shopId: shopId)).single;
      await pos.checkout(
        shopId: shopId,
        lines: [PosCartLine(item: item, quantity: 1)],
        paymentMethod: 'CASH',
        customerName: 'Grace',
      );
      final dashboard = LocalDashboardRepository(
        reports: LocalReportsRepository(
          database: database,
          merchantId: merchantId,
        ),
      );
      final now = DateTime.now().toUtc();
      final summary = await dashboard.salesSummary(
        from: now.subtract(const Duration(days: 1)),
        to: now.add(const Duration(minutes: 1)),
        shopId: shopId,
      );
      expect(summary.orderCount, 1);
      expect(summary.netSales, '9.99');
    },
  );

  test('local customer history remains a read projection', () async {
    final pos = LocalPosRepository(database: database, merchantId: merchantId);
    final item = (await pos.catalog(shopId: shopId)).single;
    await pos.checkout(
      shopId: shopId,
      lines: [PosCartLine(item: item, quantity: 1)],
      paymentMethod: 'CASH',
      customerName: 'Grace',
      customerPhone: '555-0100',
    );
    await LocalRepairsRepository(
      database: database,
      merchantId: merchantId,
    ).createTicket(
      shopId: shopId,
      orderNumber: 'REP-1001',
      deviceType: 'Phone',
      issueDescription: 'Battery issue',
      customerName: 'Grace',
      customerPhone: '555-0100',
    );
    final customers = await LocalCustomersRepository(
      database: database,
      merchantId: merchantId,
    ).list(shopId: shopId);
    expect(customers.single.name, 'Grace');
    expect(customers.single.sales, 1);
    expect(customers.single.repairs, 1);
  });

  test('local transaction history exposes order detail and payment', () async {
    final pos = LocalPosRepository(database: database, merchantId: merchantId);
    final item = (await pos.catalog(shopId: shopId)).single;
    final result = await pos.checkout(
      shopId: shopId,
      lines: [PosCartLine(item: item, quantity: 1)],
      paymentMethod: 'QR',
    );
    final history = LocalTransactionHistoryRepository(
      database: database,
      merchantId: merchantId,
    );
    final entries = await history.list(
      shopId: shopId,
      eventType: 'TRANSACTION',
    );
    expect(entries.single.id, result.id);
    final detail = await history.detail(result.id);
    expect(detail.payments.single.method, 'BANK_TRANSFER');
    expect(detail.lines.single.lineTotal, '9.99');
  });

  test('local transaction history includes stock movements', () async {
    final catalog = LocalCatalogRepository(
      database: database,
      merchantId: merchantId,
    );
    final product = await catalog.createProduct(
      name: 'Tracked',
      productType: 'PHYSICAL',
      isActive: true,
    );
    await catalog.createVariant(
      productId: product.id,
      sku: 'TRACK-1',
      name: 'Tracked',
      baseUnitId: 'unit',
      price: '1.00',
      isStockTracked: true,
    );
    final locationId =
        (await database.select(database.locations).get()).single.id;
    final inventory = LocalInventoryRepository(
      database: database,
      merchantId: merchantId,
    );
    await inventory.stockIn(
      variantId: (await catalog.listVariants(product.id)).single.id,
      destinationLocationId: locationId,
      quantity: '1',
      unitCost: '0.50',
      eventKey: 'history-receipt',
    );
    final entries = await LocalTransactionHistoryRepository(
      database: database,
      merchantId: merchantId,
    ).list(shopId: shopId, eventType: 'STOCK_IN');
    expect(entries.single.reference, 'history-receipt');
    final repairRepository = LocalRepairsRepository(
      database: database,
      merchantId: merchantId,
    );
    final repair = await repairRepository.createTicket(
      shopId: shopId,
      orderNumber: 'REP-HISTORY',
      deviceType: 'Phone',
      issueDescription: 'History repair',
      additionalFee: '15.00',
    );
    final repairEntries = await LocalTransactionHistoryRepository(
      database: database,
      merchantId: merchantId,
    ).list(shopId: shopId, eventType: 'REPAIR_CHECKOUT');
    expect(repairEntries.single.reference, 'REP-HISTORY');
    expect(
      (await LocalTransactionHistoryRepository(
        database: database,
        merchantId: merchantId,
      ).detail(repair.repairOrderId)).entry.eventType,
      'REPAIR_CHECKOUT',
    );
    final payment = await repairRepository.createPayment(
      repairOrderId: repair.repairOrderId,
      kind: 'FINAL',
      method: 'CASH',
      amount: '15.00',
    );
    final repairRefund = await repairRepository.createRefund(
      repairOrderId: repair.repairOrderId,
      paymentId: payment.id,
      amount: '5.00',
      reason: 'Repair history refund',
    );
    final refundEntries = await LocalTransactionHistoryRepository(
      database: database,
      merchantId: merchantId,
    ).list(shopId: shopId, eventType: 'REFUND');
    expect(refundEntries.single.id, repairRefund.id);
    expect(
      (await LocalTransactionHistoryRepository(
        database: database,
        merchantId: merchantId,
      ).detail(repairRefund.id)).refunds.single['amount'],
      '5.00',
    );
  });
}
