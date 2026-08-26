import 'dart:convert';

import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import '../../../shared/money.dart';
import '../application/invoices_repository.dart';
import '../domain/invoice_models.dart';

class LocalInvoicesRepository implements InvoicesRepository {
  LocalInvoicesRepository({required this.database, required this.merchantId});

  final AppDatabase database;
  final String merchantId;

  @override
  Future<List<InvoiceRecord>> list({required String shopId}) async {
    final merchant = await (database.select(
      database.merchants,
    )..where((row) => row.id.equals(merchantId))).getSingleOrNull();
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (merchant == null || shop == null) {
      throw StateError('Invoice scope is outside the active merchant.');
    }
    final orders =
        await (database.select(database.localOrders)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.shopId.equals(shopId),
              )
              ..orderBy([(row) => OrderingTerm.desc(row.createdAt)]))
            .get();
    final lines = await (database.select(
      database.localOrderLines,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final deliveries =
        await (database.select(database.localDeliveries)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.shopId.equals(shopId),
            ))
            .get();
    final deliveriesById = {
      for (final delivery in deliveries) delivery.id: delivery,
    };
    final linesByOrder = <String, List<InvoiceLine>>{};
    for (final line in lines) {
      (linesByOrder[line.orderId] ??= []).add(
        InvoiceLine(
          name: line.name,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice,
        ),
      );
    }
    final invoices = [
      for (final order in orders)
        InvoiceRecord(
          id: order.id,
          number: order.number,
          customer: order.customerName ?? 'Walk-in customer',
          customerPhone: order.customerPhone,
          merchantName: merchant.name,
          shopId: order.shopId,
          shopName: shop.name,
          currencyCode: order.currencyCode,
          createdAt: DateTime.parse(order.createdAt).toUtc(),
          status: order.status,
          kind: 'pos',
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          taxTotal: order.taxTotal,
          grandTotal: order.grandTotal,
          note: order.note,
          paymentType: order.paymentMethod,
          deliveryName: deliveriesById[order.deliveryId]?.name,
          deliveryContact: deliveriesById[order.deliveryId]?.contactInfo,
          footerNote: 'Local invoice · no backend synchronization',
          items: linesByOrder[order.id] ?? const [],
        ),
    ];
    final repairs =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId) &
                  row.recordType.equals('REPAIR'),
            ))
            .get();
    final repairIds = repairs.map((repair) => repair.id).toSet();
    final parts = repairIds.isEmpty
        ? const <LocalRepairRecord>[]
        : await (database.select(database.localRepairRecords)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.parentId.isIn(repairIds) &
                    row.recordType.equals('PART'),
              ))
              .get();
    final variants = await (database.select(
      database.cachedCatalogVariants,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final products = await (database.select(
      database.cachedCatalogProducts,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final variantById = {for (final variant in variants) variant.id: variant};
    final productById = {for (final product in products) product.id: product};
    final partsByRepair = <String, List<LocalRepairRecord>>{};
    for (final part in parts) {
      final parentId = part.parentId;
      if (parentId != null) (partsByRepair[parentId] ??= []).add(part);
    }
    for (final repair in repairs) {
      final tax = _money(repair.taxAmount ?? '0.00');
      final total = _money(repair.totalCost);
      final subtotal = total - tax;
      final items = <InvoiceLine>[];
      final childWorkItems =
          await (database.select(database.localRepairRecords)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.parentId.equals(repair.id) &
                    row.recordType.equals('WORK_ITEM'),
              ))
              .get();
      final workItems = [repair, ...childWorkItems];
      for (final workItem in workItems) {
        final subject =
            [
                  workItem.deviceType,
                  workItem.manufacturer,
                  workItem.model,
                  workItem.serialNumber,
                ]
                .where((value) => value != null && value.trim().isNotEmpty)
                .join(' · ');
        final issue = workItem.issueDescription?.trim();
        final stored = _decodeFields(workItem.customFields);
        final issues = _storedList(stored, '_issues');
        final conditions = _storedList(stored, '_conditions');
        final fields = Map<String, Object?>.from(stored)
          ..remove('_issues')
          ..remove('_conditions');
        items.add(
          InvoiceLine(
            name: [
              subject.isEmpty ? 'Work item' : subject,
              if (issues.isNotEmpty)
                ...issues.map((value) => 'Issue: $value')
              else if (issue != null && issue.isNotEmpty)
                'Issue: $issue',
              ...conditions.map((value) => 'Condition: $value'),
              if (fields.isNotEmpty)
                fields.entries
                    .map((entry) => '${entry.key}: ${entry.value}')
                    .join(' | '),
            ].join(' · '),
            quantity: '1',
            unitPrice: '0.00',
          ),
        );
      }
      var partsTotal = _money('0.00');
      for (final part in partsByRepair[repair.id] ?? const []) {
        final metadata = _metadata(part);
        final quantity = metadata['quantity']?.toString() ?? '0';
        final unitPrice = _money(metadata['unit_price']?.toString() ?? '0.00');
        partsTotal += _multiply(unitPrice, quantity);
        final variant = variantById[metadata['variant_id']?.toString()];
        final product = variant == null ? null : productById[variant.productId];
        items.add(
          InvoiceLine(
            name: variant == null
                ? metadata['customer_supplied_part_id']?.toString() ??
                      'Replacement part'
                : '${product?.name ?? ''} · ${variant.name}',
            quantity: quantity,
            unitPrice: unitPrice.toDecimalString(),
          ),
        );
      }
      final serviceTotal = subtotal - partsTotal;
      items.insert(
        0,
        InvoiceLine(
          name: workItems.isEmpty
              ? 'Repair service'
              : 'Repair service (ticket total)',
          quantity: '1',
          unitPrice: serviceTotal.minorUnits.isNegative
              ? '0.00'
              : serviceTotal.toDecimalString(),
        ),
      );
      final payment =
          await (database.select(database.localRepairRecords)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.parentId.equals(repair.id) &
                    row.recordType.equals('PAYMENT'),
              ))
              .getSingleOrNull();
      invoices.add(
        InvoiceRecord(
          id: repair.id,
          number: repair.orderNumber ?? repair.id,
          customer: repair.customerName ?? 'Walk-in customer',
          customerPhone: repair.customerPhone,
          merchantName: merchant.name,
          shopId: repair.shopId,
          shopName: shop.name,
          currencyCode: 'USD',
          createdAt: DateTime.parse(repair.createdAt).toUtc(),
          status: repair.status,
          kind: 'repair',
          subtotal: subtotal.toDecimalString(),
          discountTotal: '0.00',
          taxTotal: tax.toDecimalString(),
          grandTotal: total.toDecimalString(),
          note: repair.issueDescription,
          paymentType: payment?.method,
          footerNote: 'Local repair invoice · no backend synchronization',
          items: items,
        ),
      );
    }
    invoices.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return invoices;
  }

  Map<String, Object?> _metadata(LocalRepairRecord row) {
    final note = row.note;
    if (note == null || note.trim().isEmpty) return const {};
    try {
      final decoded = jsonDecode(note);
      if (decoded is Map) {
        return decoded.map((key, value) => MapEntry(key.toString(), value));
      }
    } on FormatException {
      // Older local repair rows can contain free-form notes.
    }
    return const {};
  }

  Map<String, Object?> _decodeFields(String? value) {
    if (value == null || value.trim().isEmpty) return const {};
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map) {
        return decoded.map((key, item) => MapEntry(key.toString(), item));
      }
    } on FormatException {
      // Ignore malformed legacy metadata rather than breaking invoice reads.
    }
    return const {};
  }

  List<String> _storedList(Map<String, Object?> fields, String key) => [
    for (final item in fields[key] is List ? fields[key] as List : const [])
      if (item.toString().trim().isNotEmpty) item.toString().trim(),
  ];

  ExactMoney _money(String value) => ExactMoney.parse(value, decimalPlaces: 2);

  ExactMoney _multiply(ExactMoney unitPrice, String quantity) {
    final pieces = quantity.trim().split('.');
    if (pieces.length > 2 || pieces.first.isEmpty) {
      throw const FormatException('Repair part quantity is invalid.');
    }
    final whole = BigInt.tryParse(pieces.first);
    final fraction = pieces.length == 1 ? '' : pieces[1];
    if (whole == null || whole.isNegative || fraction.length > 3) {
      throw const FormatException('Repair part quantity is invalid.');
    }
    final milli =
        whole * BigInt.from(1000) + BigInt.tryParse(fraction.padRight(3, '0'))!;
    final raw = unitPrice.minorUnits * milli;
    var cents = raw ~/ BigInt.from(1000);
    if (raw % BigInt.from(1000) >= BigInt.from(500)) cents += BigInt.one;
    return ExactMoney(minorUnits: cents, decimalPlaces: 2);
  }
}
