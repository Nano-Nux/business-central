import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import '../../../shared/money.dart';
import '../application/reports_repository.dart';
import '../domain/report_models.dart';

class LocalReportsRepository implements ReportsRepository {
  LocalReportsRepository({required this.database, required this.merchantId});

  final AppDatabase database;
  final String merchantId;

  @override
  Future<ReportsSnapshot> load({
    required String shopId,
    required DateTime from,
    required DateTime to,
  }) async {
    final orders =
        await (database.select(database.localOrders)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.shopId.equals(shopId),
            ))
            .get();
    final included = [
      for (final order in orders)
        if (!DateTime.parse(order.createdAt).toUtc().isBefore(from.toUtc()) &&
            !DateTime.parse(order.createdAt).toUtc().isAfter(to.toUtc()))
          order,
    ];
    final orderIds = included.map((order) => order.id).toSet();
    final refunds = orderIds.isEmpty
        ? const <LocalRefund>[]
        : await (database.select(database.localRefunds)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.orderId.isIn(orderIds) &
                    row.status.equals('SUCCEEDED'),
              ))
              .get();
    final refundByOrder = <String, ExactMoney>{};
    for (final refund in refunds) {
      refundByOrder[refund.orderId] = _add(
        refundByOrder[refund.orderId],
        _money(refund.amount),
      );
    }
    final lines =
        await (database.select(database.localOrderLines)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.orderId.isIn(orderIds),
            ))
            .get();
    final saleMovements =
        await (database.select(database.localInventoryMovements)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.movementType.equals('SALE') &
                  row.orderLineId.isNotNull(),
            ))
            .get();
    final allocations = await (database.select(
      database.localInventoryCostAllocations,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final costByMovement = <String, ExactMoney>{};
    for (final allocation in allocations) {
      costByMovement[allocation.consumptionMovementId] = _add(
        costByMovement[allocation.consumptionMovementId],
        _money(allocation.totalCost),
      );
    }
    final costByLine = <String, ExactMoney>{};
    for (final movement in saleMovements) {
      final lineId = movement.orderLineId;
      if (lineId == null) continue;
      costByLine[lineId] = _add(
        costByLine[lineId],
        costByMovement[movement.id] ?? _money('0.00'),
      );
    }
    final variants = await (database.select(
      database.cachedCatalogVariants,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final products = await (database.select(
      database.cachedCatalogProducts,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final variantById = {for (final variant in variants) variant.id: variant};
    final productById = {for (final product in products) product.id: product};
    final grossSales = _sum(included.map((order) => order.subtotal));
    final discounts = _sum(included.map((order) => order.discountTotal));
    final netSales = _sum(included.map((order) => order.grandTotal));
    final refundTotal = _sumCosts(refundByOrder.values);
    final itemQuantity = lines.fold<int>(0, (sum, line) => sum + line.quantity);
    final dayOrders = <String, Set<String>>{};
    final daySales = <String, ExactMoney>{};
    final dayRefunds = <String, ExactMoney>{};
    final dayCosts = <String, ExactMoney>{};
    final dayQuantity = <String, int>{};
    for (final order in included) {
      final day = order.createdAt.substring(0, 10);
      (dayOrders[day] ??= {}).add(order.id);
      daySales[day] = _add(daySales[day], _money(order.grandTotal));
      dayRefunds[day] = _add(
        dayRefunds[day],
        refundByOrder[order.id] ?? _money('0.00'),
      );
    }
    for (final line in lines) {
      final order = included.firstWhere((item) => item.id == line.orderId);
      final day = order.createdAt.substring(0, 10);
      dayQuantity[day] = (dayQuantity[day] ?? 0) + line.quantity;
      dayCosts[day] = _add(
        dayCosts[day],
        costByLine[line.id] ?? _money('0.00'),
      );
    }
    final top = <String, _TopProduct>{};
    for (final line in lines) {
      final variant = variantById[line.variantId];
      final product = variant == null ? null : productById[variant.productId];
      final key = line.variantId;
      final existing = top[key];
      final sales = _money(line.lineTotal);
      final cost = costByLine[line.id] ?? _money('0.00');
      top[key] = _TopProduct(
        productName: product?.name ?? '',
        variantName: variant?.name ?? line.name,
        sku: variant?.sku ?? line.sku,
        quantity: (existing?.quantity ?? 0) + line.quantity,
        sales: _add(existing?.sales, sales),
        costs: _add(existing?.costs, cost),
      );
    }
    final costOfGoodsSold = _sumCosts(
      lines
          .where((line) => orderIds.contains(line.orderId))
          .map((line) => costByLine[line.id] ?? _money('0.00')),
    );
    final grossProfit = netSales - refundTotal - costOfGoodsSold;
    return ReportsSnapshot(
      summary: ReportSummary(
        orderCount: included.length,
        posOrderCount: included.length,
        repairCount: 0,
        itemQuantity: itemQuantity.toString(),
        grossSales: grossSales.toDecimalString(),
        discounts: discounts.toDecimalString(),
        netSales: netSales.toDecimalString(),
        refunds: refundTotal.toDecimalString(),
        costOfGoodsSold: costOfGoodsSold.toDecimalString(),
        grossProfit: grossProfit.toDecimalString(),
        grossMarginPercent: _percent(grossProfit, netSales),
      ),
      days: [
        for (final day in daySales.keys.toList()..sort())
          ReportDay(
            day: DateTime.parse(day).toUtc(),
            orderCount: dayOrders[day]!.length,
            itemQuantity: (dayQuantity[day] ?? 0).toString(),
            netSales: daySales[day]!.toDecimalString(),
            refunds: (dayRefunds[day] ?? _money('0.00')).toDecimalString(),
            costOfGoodsSold: (dayCosts[day] ?? _money('0.00'))
                .toDecimalString(),
            grossProfit:
                (daySales[day]! -
                        (dayRefunds[day] ?? _money('0.00')) -
                        (dayCosts[day] ?? _money('0.00')))
                    .toDecimalString(),
          ),
      ],
      topProducts: [
        for (final item
            in (top.values.toList()..sort(
                  (a, b) => b.sales.minorUnits.compareTo(a.sales.minorUnits),
                ))
                .take(20))
          TopProductReport(
            productName: item.productName,
            variantName: item.variantName,
            sku: item.sku,
            itemQuantity: item.quantity.toString(),
            netSales: item.sales.toDecimalString(),
            costOfGoodsSold: item.costs.toDecimalString(),
            grossProfit: (item.sales - item.costs).toDecimalString(),
          ),
      ],
      from: from,
      to: to,
    );
  }

  ExactMoney _money(String value) => ExactMoney.parse(value, decimalPlaces: 2);

  ExactMoney _sum(Iterable<String> values) {
    var total = ExactMoney(minorUnits: BigInt.zero, decimalPlaces: 2);
    for (final value in values) {
      total = total + _money(value);
    }
    return total;
  }

  ExactMoney _add(ExactMoney? left, ExactMoney right) =>
      (left ?? ExactMoney(minorUnits: BigInt.zero, decimalPlaces: 2)) + right;

  ExactMoney _sumCosts(Iterable<ExactMoney> values) {
    var total = _money('0.00');
    for (final value in values) {
      total += value;
    }
    return total;
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
    final whole = absolute.substring(0, absolute.length - 2);
    final fraction = absolute.substring(absolute.length - 2);
    return '${negative ? '-' : ''}$whole.$fraction';
  }
}

class _TopProduct {
  const _TopProduct({
    required this.productName,
    required this.variantName,
    required this.sku,
    required this.quantity,
    required this.sales,
    required this.costs,
  });
  final String productName;
  final String variantName;
  final String sku;
  final int quantity;
  final ExactMoney sales;
  final ExactMoney costs;
}
