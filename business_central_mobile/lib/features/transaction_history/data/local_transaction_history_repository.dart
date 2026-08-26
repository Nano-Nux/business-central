import 'dart:convert';

import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import '../../../shared/money.dart';
import '../application/transaction_history_repository.dart';
import '../domain/transaction_history_models.dart';

class LocalTransactionHistoryRepository
    implements TransactionHistoryRepository {
  LocalTransactionHistoryRepository({
    required this.database,
    required this.merchantId,
  });

  final AppDatabase database;
  final String merchantId;

  @override
  Future<List<TransactionHistoryEntry>> list({
    required String shopId,
    String? query,
    String? eventType,
    DateTime? from,
    DateTime? to,
  }) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null) {
      throw StateError('History scope is outside the active merchant.');
    }
    final orders =
        await (database.select(database.localOrders)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.shopId.equals(shopId),
            ))
            .get();
    final lines = await (database.select(
      database.localOrderLines,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final variants = await (database.select(
      database.cachedCatalogVariants,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final products = await (database.select(
      database.cachedCatalogProducts,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final variantsById = {for (final row in variants) row.id: row};
    final productsById = {for (final row in products) row.id: row};
    final linesByOrder = <String, List<LocalOrderLine>>{};
    for (final line in lines) {
      (linesByOrder[line.orderId] ??= []).add(line);
    }
    final entries = <TransactionHistoryEntry>[];
    for (final order in orders) {
      final occurred = DateTime.parse(order.createdAt).toUtc();
      if (!_inRange(occurred, from, to)) continue;
      final orderLines = linesByOrder[order.id] ?? const <LocalOrderLine>[];
      final first = orderLines.firstOrNull;
      final variant = first == null ? null : variantsById[first.variantId];
      final product = variant == null ? null : productsById[variant.productId];
      final entry = TransactionHistoryEntry(
        id: order.id,
        eventType: 'TRANSACTION',
        reference: order.number,
        occurredAt: occurred,
        status: order.status,
        channel: 'POS',
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        paymentMethod: order.paymentMethod,
        amount: order.grandTotal,
        currencyCode: order.currencyCode,
        shopId: order.shopId,
        shopName: shop.name,
        quantity: orderLines
            .fold<int>(0, (sum, line) => sum + line.quantity)
            .toString(),
        productName: product?.name,
        variantName: variant?.name,
        sku: variant?.sku,
        details: order.note ?? 'Local order',
      );
      if (_matches(entry, query, eventType)) entries.add(entry);
    }
    final movements =
        await (database.select(database.localInventoryMovements)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.shopId.equals(shopId),
            ))
            .get();
    for (final movement in movements) {
      final occurred = DateTime.parse(movement.occurredAt).toUtc();
      if (!_inRange(occurred, from, to)) continue;
      final variant = variantsById[movement.variantId];
      final product = variant == null ? null : productsById[variant.productId];
      final type = _isReceipt(movement.movementType) ? 'STOCK_IN' : 'STOCK_OUT';
      final entry = TransactionHistoryEntry(
        id: movement.id,
        eventType: type,
        reference: movement.eventKey,
        occurredAt: occurred,
        status: 'COMPLETED',
        amount: movement.totalCost,
        currencyCode: 'USD',
        shopId: shopId,
        shopName: shop.name,
        quantity: movement.quantity,
        productName: product?.name,
        variantName: variant?.name,
        sku: variant?.sku,
        details: movement.movementType,
      );
      if (_matches(entry, query, eventType)) entries.add(entry);
    }
    final repairs =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId) &
                  row.recordType.equals('REPAIR'),
            ))
            .get();
    for (final repair in repairs) {
      final occurred = DateTime.parse(repair.createdAt).toUtc();
      if (!_inRange(occurred, from, to)) continue;
      final entry = TransactionHistoryEntry(
        id: repair.id,
        eventType: 'REPAIR_CHECKOUT',
        reference: repair.orderNumber ?? repair.id,
        occurredAt: occurred,
        status: repair.status,
        channel: 'REPAIR',
        customerName: repair.customerName,
        customerPhone: repair.customerPhone,
        amount: repair.totalCost,
        currencyCode: 'USD',
        shopId: repair.shopId,
        shopName: shop.name,
        details: repair.issueDescription ?? 'Local repair',
      );
      if (_matches(entry, query, eventType)) entries.add(entry);
    }
    if (repairs.isNotEmpty) {
      final repairIds = repairs.map((repair) => repair.id).toSet();
      final repairById = {for (final repair in repairs) repair.id: repair};
      final repairRefunds =
          await (database.select(database.localRepairRecords)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.parentId.isIn(repairIds) &
                    row.recordType.equals('REFUND'),
              ))
              .get();
      for (final refund in repairRefunds) {
        final repair = repairById[refund.parentId];
        if (repair == null) continue;
        final occurred = DateTime.parse(refund.createdAt).toUtc();
        if (!_inRange(occurred, from, to)) continue;
        final metadata = _metadata(refund);
        final entry = TransactionHistoryEntry(
          id: refund.id,
          eventType: 'REFUND',
          reference: repair.orderNumber ?? repair.id,
          occurredAt: occurred,
          status: refund.status,
          channel: 'REPAIR',
          customerName: repair.customerName,
          customerPhone: repair.customerPhone,
          amount: refund.amount,
          currencyCode: 'USD',
          shopId: repair.shopId,
          shopName: shop.name,
          details: metadata['reason']?.toString() ?? 'Repair refund',
        );
        if (_matches(entry, query, eventType)) entries.add(entry);
      }
    }
    if (orders.isNotEmpty) {
      final refunds =
          await (database.select(database.localRefunds)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.orderId.isIn(orders.map((order) => order.id).toSet()),
              ))
              .get();
      final ordersById = {for (final order in orders) order.id: order};
      for (final refund in refunds) {
        final order = ordersById[refund.orderId];
        if (order == null) continue;
        final occurred = DateTime.parse(refund.createdAt).toUtc();
        if (!_inRange(occurred, from, to)) continue;
        final entry = TransactionHistoryEntry(
          id: refund.id,
          eventType: 'REFUND',
          reference: order.number,
          occurredAt: occurred,
          status: refund.status,
          channel: 'POS',
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          paymentMethod: order.paymentMethod,
          amount: refund.amount,
          currencyCode: order.currencyCode,
          shopId: order.shopId,
          shopName: shop.name,
          details: refund.reason ?? 'Local refund',
        );
        if (_matches(entry, query, eventType)) entries.add(entry);
      }
    }
    entries.sort((a, b) => b.occurredAt.compareTo(a.occurredAt));
    return entries;
  }

  @override
  Future<TransactionHistoryDetail> detail(String id) async {
    final order =
        await (database.select(database.localOrders)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (order != null) return _orderDetail(order);
    final refund =
        await (database.select(database.localRefunds)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (refund != null) {
      final refundOrder =
          await (database.select(database.localOrders)..where(
                (row) =>
                    row.id.equals(refund.orderId) &
                    row.merchantId.equals(merchantId),
              ))
              .getSingleOrNull();
      if (refundOrder == null) {
        throw StateError('Refund order is outside the active merchant.');
      }
      final base = await _orderDetail(refundOrder);
      return TransactionHistoryDetail(
        entry: TransactionHistoryEntry(
          id: refund.id,
          eventType: 'REFUND',
          reference: refundOrder.number,
          occurredAt: DateTime.parse(refund.createdAt).toUtc(),
          status: refund.status,
          channel: 'POS',
          customerName: refundOrder.customerName,
          customerPhone: refundOrder.customerPhone,
          paymentMethod: refundOrder.paymentMethod,
          amount: refund.amount,
          currencyCode: refundOrder.currencyCode,
          shopId: refundOrder.shopId,
          details: refund.reason ?? 'Local refund',
        ),
        order: base.order,
        lines: base.lines,
        payments: base.payments,
        refunds: base.refunds,
        totalCost: base.totalCost,
        grossProfit: base.grossProfit,
        grossMargin: base.grossMargin,
      );
    }
    final movement =
        await (database.select(database.localInventoryMovements)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (movement == null) {
      final repair =
          await (database.select(database.localRepairRecords)..where(
                (row) =>
                    row.id.equals(id) &
                    row.merchantId.equals(merchantId) &
                    row.recordType.equals('REPAIR'),
              ))
              .getSingleOrNull();
      if (repair != null) return _repairDetail(repair);
      final repairRefund =
          await (database.select(database.localRepairRecords)..where(
                (row) =>
                    row.id.equals(id) &
                    row.merchantId.equals(merchantId) &
                    row.recordType.equals('REFUND'),
              ))
              .getSingleOrNull();
      if (repairRefund != null && repairRefund.parentId != null) {
        final repairParent =
            await (database.select(database.localRepairRecords)..where(
                  (row) =>
                      row.id.equals(repairRefund.parentId!) &
                      row.merchantId.equals(merchantId) &
                      row.recordType.equals('REPAIR'),
                ))
                .getSingleOrNull();
        if (repairParent != null) {
          final base = await _repairDetail(repairParent);
          final metadata = _metadata(repairRefund);
          return TransactionHistoryDetail(
            entry: TransactionHistoryEntry(
              id: repairRefund.id,
              eventType: 'REFUND',
              reference: repairParent.orderNumber ?? repairParent.id,
              occurredAt: DateTime.parse(repairRefund.createdAt).toUtc(),
              status: repairRefund.status,
              channel: 'REPAIR',
              customerName: repairParent.customerName,
              customerPhone: repairParent.customerPhone,
              amount: repairRefund.amount,
              currencyCode: 'USD',
              shopId: repairParent.shopId,
              details: metadata['reason']?.toString() ?? 'Repair refund',
            ),
            lines: base.lines,
            payments: base.payments,
            refunds: base.refunds,
            totalCost: base.totalCost,
            grossProfit: base.grossProfit,
            grossMargin: base.grossMargin,
          );
        }
      }
      final payment =
          await (database.select(database.localRepairRecords)..where(
                (row) =>
                    row.id.equals(id) &
                    row.merchantId.equals(merchantId) &
                    row.recordType.equals('PAYMENT'),
              ))
              .getSingleOrNull();
      if (payment != null && payment.parentId != null) {
        final repairParent =
            await (database.select(database.localRepairRecords)..where(
                  (row) =>
                      row.id.equals(payment.parentId!) &
                      row.merchantId.equals(merchantId) &
                      row.recordType.equals('REPAIR'),
                ))
                .getSingleOrNull();
        if (repairParent != null) return _repairDetail(repairParent);
      }
      throw StateError('History entry is outside the active merchant.');
    }
    final variant =
        await (database.select(database.cachedCatalogVariants)..where(
              (row) =>
                  row.id.equals(movement.variantId) &
                  row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    final entry = TransactionHistoryEntry(
      id: movement.id,
      eventType: _isReceipt(movement.movementType) ? 'STOCK_IN' : 'STOCK_OUT',
      reference: movement.eventKey,
      occurredAt: DateTime.parse(movement.occurredAt).toUtc(),
      status: 'COMPLETED',
      amount: movement.totalCost,
      quantity: movement.quantity,
      variantName: variant?.name,
      sku: variant?.sku,
      details: movement.movementType,
    );
    return TransactionHistoryDetail(
      entry: entry,
      lines: [
        TransactionHistoryLine(
          description: variant?.name ?? movement.variantId,
          quantity: movement.quantity,
          unitPrice: movement.unitCost ?? '0.00',
          originalCost: movement.unitCost ?? '0.00',
          lineTotal: movement.totalCost,
          grossProfit: '0.00',
          variantName: variant?.name,
          sku: variant?.sku,
        ),
      ],
      payments: const [],
      refunds: const [],
      totalCost: movement.totalCost,
      grossProfit: '0.00',
      grossMargin: '0.00',
    );
  }

  Future<TransactionHistoryDetail> _orderDetail(LocalOrder order) async {
    final lines =
        await (database.select(database.localOrderLines)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.orderId.equals(order.id),
            ))
            .get();
    final lineIds = lines.map((line) => line.id).toSet();
    final saleMovements = lineIds.isEmpty
        ? const <LocalInventoryMovement>[]
        : await (database.select(database.localInventoryMovements)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.orderLineId.isIn(lineIds) &
                    row.movementType.equals('SALE'),
              ))
              .get();
    final movementIds = saleMovements.map((movement) => movement.id).toSet();
    final allocations = movementIds.isEmpty
        ? const <LocalInventoryCostAllocation>[]
        : await (database.select(database.localInventoryCostAllocations)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.consumptionMovementId.isIn(movementIds),
              ))
              .get();
    final costByLine = <String, ExactMoney>{};
    for (final allocation in allocations) {
      final movement = saleMovements.firstWhere(
        (item) => item.id == allocation.consumptionMovementId,
      );
      final lineId = movement.orderLineId;
      if (lineId == null) continue;
      costByLine[lineId] = _add(
        costByLine[lineId],
        _money(allocation.totalCost),
      );
    }
    final payments =
        await (database.select(database.localPayments)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.orderId.equals(order.id),
            ))
            .get();
    final refunds =
        await (database.select(database.localRefunds)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.orderId.equals(order.id),
            ))
            .get();
    var totalCost = _money('0.00');
    final detailLines = [
      for (final line in lines)
        (() {
          final cost = costByLine[line.id] ?? _money('0.00');
          totalCost += cost;
          final lineTotal = _money(line.lineTotal);
          return TransactionHistoryLine(
            description: line.name,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice,
            originalCost: _divideByQuantity(cost, line.quantity),
            lineTotal: line.lineTotal,
            grossProfit: (lineTotal - cost).toDecimalString(),
            variantName: line.name,
            sku: line.sku,
          );
        })(),
    ];
    final grossProfit = _money(order.grandTotal) - totalCost;
    final entry = TransactionHistoryEntry(
      id: order.id,
      eventType: 'TRANSACTION',
      reference: order.number,
      occurredAt: DateTime.parse(order.createdAt).toUtc(),
      status: order.status,
      amount: order.grandTotal,
      currencyCode: order.currencyCode,
      customerName: order.customerName,
      paymentMethod: order.paymentMethod,
      details: order.note,
    );
    return TransactionHistoryDetail(
      entry: entry,
      lines: detailLines,
      payments: [
        for (final payment in payments)
          TransactionPayment(
            id: payment.id,
            method: payment.method,
            status: payment.status,
            amount: payment.amount,
          ),
      ],
      refunds: [
        for (final refund in refunds)
          {
            'id': refund.id,
            'payment_id': refund.paymentId,
            'status': refund.status,
            'amount': refund.amount,
            'reason': refund.reason,
            'created_at': refund.createdAt,
          },
      ],
      totalCost: totalCost.toDecimalString(),
      grossProfit: grossProfit.toDecimalString(),
      grossMargin: _percent(grossProfit, _money(order.grandTotal)),
      order: {'id': order.id, 'number': order.number, 'local': true},
    );
  }

  ExactMoney _money(String value) => ExactMoney.parse(value, decimalPlaces: 2);

  ExactMoney _add(ExactMoney? left, ExactMoney right) =>
      (left ?? _money('0.00')) + right;

  String _divideByQuantity(ExactMoney value, int quantity) {
    if (quantity <= 0) return '0.00';
    var cents = value.minorUnits ~/ BigInt.from(quantity);
    final remainder = value.minorUnits % BigInt.from(quantity);
    if (remainder.abs() * BigInt.from(2) >= BigInt.from(quantity)) {
      cents += value.minorUnits.isNegative ? -BigInt.one : BigInt.one;
    }
    return ExactMoney(minorUnits: cents, decimalPlaces: 2).toDecimalString();
  }

  String _percent(ExactMoney numerator, ExactMoney denominator) {
    if (denominator.minorUnits == BigInt.zero) return '0.00';
    final scaled = numerator.minorUnits * BigInt.from(10000);
    var value = scaled ~/ denominator.minorUnits;
    final remainder = scaled % denominator.minorUnits;
    if (remainder.abs() * BigInt.from(2) >= denominator.minorUnits.abs()) {
      value += scaled.isNegative ? -BigInt.one : BigInt.one;
    }
    final negative = value.isNegative;
    final absolute = value.abs().toString().padLeft(3, '0');
    return '${negative ? '-' : ''}${absolute.substring(0, absolute.length - 2)}.${absolute.substring(absolute.length - 2)}';
  }

  Future<TransactionHistoryDetail> _repairDetail(
    LocalRepairRecord repair,
  ) async {
    final diagnostics =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.parentId.equals(repair.id) &
                  row.merchantId.equals(merchantId) &
                  row.recordType.equals('DIAGNOSTIC'),
            ))
            .get();
    final payments =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.parentId.equals(repair.id) &
                  row.merchantId.equals(merchantId) &
                  row.recordType.equals('PAYMENT'),
            ))
            .get();
    final refunds =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.parentId.equals(repair.id) &
                  row.merchantId.equals(merchantId) &
                  row.recordType.equals('REFUND'),
            ))
            .get();
    final entry = TransactionHistoryEntry(
      id: repair.id,
      eventType: 'REPAIR_CHECKOUT',
      reference: repair.orderNumber ?? repair.id,
      occurredAt: DateTime.parse(repair.createdAt).toUtc(),
      status: repair.status,
      channel: 'REPAIR',
      customerName: repair.customerName,
      customerPhone: repair.customerPhone,
      amount: repair.totalCost,
      shopId: repair.shopId,
      details: repair.issueDescription,
    );
    return TransactionHistoryDetail(
      entry: entry,
      lines: [
        for (final diagnostic in diagnostics)
          TransactionHistoryLine(
            description: diagnostic.diagnosis ?? 'Diagnostic',
            quantity: '1',
            unitPrice: diagnostic.estimatedCost ?? '0.00',
            originalCost: '0.00',
            lineTotal: diagnostic.estimatedCost ?? '0.00',
            grossProfit: '0.00',
          ),
      ],
      payments: [
        for (final payment in payments)
          TransactionPayment(
            id: payment.id,
            method: payment.method ?? '',
            status: payment.status,
            amount: payment.amount ?? '0.00',
          ),
      ],
      refunds: [
        for (final refund in refunds)
          {
            'id': refund.id,
            'payment_id': _metadata(refund)['payment_id'],
            'status': refund.status,
            'amount': refund.amount,
            'reason': _metadata(refund)['reason'],
            'created_at': refund.createdAt,
          },
      ],
      totalCost: repair.totalCost,
      grossProfit: '0.00',
      grossMargin: '0.00',
    );
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

  bool _inRange(DateTime value, DateTime? from, DateTime? to) =>
      (from == null || !value.isBefore(from.toUtc())) &&
      (to == null || !value.isAfter(to.toUtc()));

  bool _isReceipt(String movementType) =>
      movementType == 'RECEIPT' || movementType == 'STOCK_IN';

  bool _matches(
    TransactionHistoryEntry entry,
    String? query,
    String? eventType,
  ) {
    if (eventType != null &&
        eventType.trim().isNotEmpty &&
        entry.eventType != eventType) {
      return false;
    }
    final normalized = query?.trim().toLowerCase() ?? '';
    if (normalized.isEmpty) return true;
    return [
      entry.reference,
      entry.customerName,
      entry.productName,
      entry.variantName,
      entry.sku,
      entry.details,
    ].whereType<String>().any(
      (value) => value.toLowerCase().contains(normalized),
    );
  }
}
