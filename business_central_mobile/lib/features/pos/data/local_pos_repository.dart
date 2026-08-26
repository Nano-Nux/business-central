import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../../deliveries/data/local_deliveries_repository.dart';
import '../../../shared/money.dart';
import '../../inventory/data/local_inventory_repository.dart';
import '../application/pos_repository.dart';
import '../domain/pos_models.dart';

/// Local POS authority for FULLY_OFFLINE deployments.
///
/// It only reads the local catalog and writes local orders atomically. It
/// never constructs an API client and never places work in the ONLINE sync
/// queue; standalone deployments have no remote reconciliation target.
class LocalPosRepository implements PosRepository {
  LocalPosRepository({
    required this.database,
    required this.merchantId,
    this.actorMembershipId,
    this.currencyCode = 'USD',
  });

  final AppDatabase database;
  final String merchantId;
  final String? actorMembershipId;
  final String currencyCode;
  static const _uuid = Uuid();

  @override
  Future<List<PosCatalogItem>> catalog({required String shopId}) async {
    await _requireShop(shopId);
    final products =
        await (database.select(database.cachedCatalogProducts)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.isActive.equals(true),
            ))
            .get();
    final productsById = {for (final product in products) product.id: product};
    final variants =
        await (database.select(database.cachedCatalogVariants)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final variant in variants)
        if (productsById.containsKey(variant.productId))
          PosCatalogItem(
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            productName: productsById[variant.productId]!.name,
            barcode: variant.barcode,
            price: variant.price,
            quantityOnHand: variant.quantityOnHand,
            isStockTracked: variant.isStockTracked,
          ),
    ];
  }

  @override
  Future<List<PosCatalogItem>> lookupBarcode({
    required String shopId,
    required String barcode,
  }) async {
    final normalized = barcode.trim().toLowerCase();
    if (normalized.isEmpty) return const [];
    return [
      for (final item in await catalog(shopId: shopId))
        if (item.barcode?.trim().toLowerCase() == normalized) item,
    ];
  }

  @override
  Future<PosQuote> quote({
    required String shopId,
    required List<PosCartLine> lines,
    String? deliveryId,
    String? promotionId,
  }) async {
    await _requireShop(shopId);
    await _validateDelivery(shopId, deliveryId);
    final totals = await _totals(shopId, lines, promotionId: promotionId);
    return PosQuote(
      subtotal: totals.subtotal.toDecimalString(),
      discountTotal: totals.discount.toDecimalString(),
      taxTotal: totals.tax.toDecimalString(),
      grandTotal: totals.grandTotal.toDecimalString(),
      currencyCode: currencyCode,
    );
  }

  @override
  Future<PosCheckoutResult> checkout({
    required String shopId,
    required List<PosCartLine> lines,
    required String paymentMethod,
    String? customerName,
    String? customerPhone,
    String? deliveryId,
    String? deliveryFee,
    String? manualPromotion,
    String? note,
    String? promotionId,
    String? idempotencyKey,
  }) async {
    await _requireShop(shopId);
    await _validateDelivery(shopId, deliveryId);
    final normalizedPaymentMethod = paymentMethod.trim().toUpperCase();
    const supportedPaymentMethods = {
      'CASH',
      'CARD',
      'QR',
      'BANK_TRANSFER',
      'ONLINE',
      'WALLET',
      'OTHER',
    };
    if (!supportedPaymentMethods.contains(normalizedPaymentMethod)) {
      throw FormatException('Unsupported payment method: $paymentMethod');
    }
    if (lines.isEmpty) {
      throw const FormatException(
        'Add at least one item before completing checkout.',
      );
    }
    final totals = await _totals(shopId, lines, promotionId: promotionId);
    final orderId = _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();
    final number = 'LOCAL-${orderId.substring(0, 8).toUpperCase()}';
    final commandKey = idempotencyKey?.trim().isNotEmpty == true
        ? idempotencyKey!.trim()
        : _uuid.v4();
    final existing =
        await (database.select(database.localOrders)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.idempotencyKey.equals(commandKey),
            ))
            .getSingleOrNull();
    if (existing != null) {
      return PosCheckoutResult(
        id: existing.id,
        number: existing.number,
        status: existing.status,
      );
    }
    final shopLocationId = await _shopLocationId(shopId);
    final inventory = LocalInventoryRepository(
      database: database,
      merchantId: merchantId,
      actorMembershipId: actorMembershipId,
    );
    await database.transaction(() async {
      await database
          .into(database.localOrders)
          .insert(
            LocalOrdersCompanion.insert(
              id: orderId,
              merchantId: merchantId,
              shopId: shopId,
              number: number,
              status: 'CONFIRMED',
              currencyCode: currencyCode,
              subtotal: totals.subtotal.toDecimalString(),
              discountTotal: totals.discount.toDecimalString(),
              taxTotal: totals.tax.toDecimalString(),
              grandTotal: totals.grandTotal.toDecimalString(),
              paymentMethod: normalizedPaymentMethod,
              customerName: Value(_optional(customerName)),
              customerPhone: Value(_optional(customerPhone)),
              deliveryId: Value(_optional(deliveryId)),
              note: Value(_optional(note)),
              idempotencyKey: commandKey,
              createdAt: now,
            ),
          );
      var allocatedTax = _money('0.00');
      for (var index = 0; index < lines.length; index++) {
        final line = lines[index];
        final variant =
            await (database.select(database.cachedCatalogVariants)..where(
                  (row) =>
                      row.id.equals(line.item.id) &
                      row.merchantId.equals(merchantId),
                ))
                .getSingle();
        final unitPrice = _money(variant.price);
        final lineTotal = ExactMoney(
          minorUnits: unitPrice.minorUnits * BigInt.from(line.quantity),
          decimalPlaces: unitPrice.decimalPlaces,
        );
        final lineDiscount =
            totals.lineDiscounts[line.item.id] ?? _money('0.00');
        final netLineTotal = lineTotal - lineDiscount;
        final lineTax = index == lines.length - 1
            ? totals.tax - allocatedTax
            : _percentageOf(netLineTotal, totals.taxRate);
        allocatedTax += lineTax;
        final lineId = _uuid.v4();
        await database
            .into(database.localOrderLines)
            .insert(
              LocalOrderLinesCompanion.insert(
                id: lineId,
                merchantId: merchantId,
                orderId: orderId,
                variantId: line.item.id,
                sku: variant.sku,
                name: variant.name,
                unitPrice: unitPrice.toDecimalString(),
                quantity: line.quantity,
                discountAmount: Value(lineDiscount.toDecimalString()),
                taxAmount: Value(lineTax.toDecimalString()),
                lineTotal: (netLineTotal + lineTax).toDecimalString(),
              ),
            );
        if (variant.isStockTracked) {
          if (shopLocationId == null) {
            throw StateError('A local shop stock location is required.');
          }
          final variantId = variant.id;
          await inventory.recordSaleWithinTransaction(
            shopId: shopId,
            variantId: variantId,
            sourceLocationId: shopLocationId,
            quantity: '${line.quantity}.000',
            orderLineId: lineId,
            eventKey: '$commandKey:stock:$variantId',
          );
        }
      }
      final normalizedPromotionId = promotionId?.trim();
      if (normalizedPromotionId != null && normalizedPromotionId.isNotEmpty) {
        final promotion =
            await (database.select(database.localPromotions)..where(
                  (row) =>
                      row.id.equals(normalizedPromotionId) &
                      row.merchantId.equals(merchantId),
                ))
                .getSingleOrNull();
        if (promotion == null ||
            !promotion.isActive ||
            (promotion.usageLimit != null &&
                promotion.redemptionCount >= promotion.usageLimit!)) {
          throw const FormatException(
            'The selected promotion is no longer available.',
          );
        }
        await (database.update(database.localPromotions)..where(
              (row) =>
                  row.id.equals(normalizedPromotionId) &
                  row.merchantId.equals(merchantId),
            ))
            .write(
              LocalPromotionsCompanion(
                redemptionCount: Value(promotion.redemptionCount + 1),
              ),
            );
        await database
            .into(database.localOrderPromotions)
            .insert(
              LocalOrderPromotionsCompanion.insert(
                id: _uuid.v4(),
                merchantId: merchantId,
                orderId: orderId,
                promotionId: normalizedPromotionId,
                discountAmount: totals.discount.toDecimalString(),
                createdAt: now,
              ),
            );
      }
      final paymentMethodForRecord = normalizedPaymentMethod == 'QR'
          ? 'BANK_TRANSFER'
          : normalizedPaymentMethod;
      await database
          .into(database.localPayments)
          .insert(
            LocalPaymentsCompanion.insert(
              id: _uuid.v4(),
              merchantId: merchantId,
              orderId: orderId,
              method: paymentMethodForRecord,
              status: 'CAPTURED',
              amount: totals.grandTotal.toDecimalString(),
              idempotencyKey: commandKey,
              capturedAt: Value(now),
              createdAt: now,
            ),
          );
      await _audit.record(
        action: 'CREATE',
        entityType: 'order',
        entityId: orderId,
        shopId: shopId,
        requestId: commandKey,
        afterData: {
          'status': 'CONFIRMED',
          'grand_total': totals.grandTotal.toDecimalString(),
          'discount_total': totals.discount.toDecimalString(),
          'tax_total': totals.tax.toDecimalString(),
          'promotion_id': promotionId?.trim(),
          'payment_method': normalizedPaymentMethod,
          'line_count': lines.length,
        },
      );
    });
    return PosCheckoutResult(id: orderId, number: number, status: 'CONFIRMED');
  }

  @override
  Future<PosRefund> refund({
    required String orderId,
    required String paymentId,
    required String amount,
    String? reason,
    String? idempotencyKey,
  }) async {
    final commandKey = idempotencyKey?.trim().isNotEmpty == true
        ? idempotencyKey!.trim()
        : _uuid.v4();
    final existing =
        await (database.select(database.localRefunds)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.idempotencyKey.equals(commandKey),
            ))
            .getSingleOrNull();
    if (existing != null) return _refund(existing);
    final requestedAmount = _money(amount);
    if (requestedAmount.minorUnits <= BigInt.zero) {
      throw const FormatException('Refund amount must be greater than zero.');
    }
    final order =
        await (database.select(database.localOrders)..where(
              (row) =>
                  row.id.equals(orderId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (order == null) {
      throw StateError('Order is outside the active merchant.');
    }
    final payment =
        await (database.select(database.localPayments)..where(
              (row) =>
                  row.id.equals(paymentId) &
                  row.merchantId.equals(merchantId) &
                  row.orderId.equals(orderId),
            ))
            .getSingleOrNull();
    if (payment == null) {
      throw StateError('Payment is outside the active order.');
    }
    if (payment.status != 'CAPTURED' &&
        payment.status != 'PARTIALLY_REFUNDED') {
      throw const FormatException('Only captured payments can be refunded.');
    }
    final priorRefunds =
        await (database.select(database.localRefunds)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.paymentId.equals(paymentId) &
                  row.status.isNotIn(const ['FAILED', 'CANCELLED']),
            ))
            .get();
    var refunded = _money('0.00');
    for (final row in priorRefunds) {
      refunded += _money(row.amount);
    }
    final paymentAmount = _money(payment.amount);
    if ((refunded + requestedAmount).minorUnits > paymentAmount.minorUnits) {
      throw const FormatException(
        'Refund amount exceeds the remaining captured payment.',
      );
    }
    final refundId = _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();
    await database.transaction(() async {
      await database
          .into(database.localRefunds)
          .insert(
            LocalRefundsCompanion.insert(
              id: refundId,
              merchantId: merchantId,
              paymentId: paymentId,
              orderId: orderId,
              amount: requestedAmount.toDecimalString(),
              status: 'SUCCEEDED',
              reason: Value(_optional(reason)),
              idempotencyKey: commandKey,
              createdAt: now,
            ),
          );
      final nextRefunded = refunded + requestedAmount;
      await (database.update(database.localPayments)..where(
            (row) =>
                row.id.equals(paymentId) & row.merchantId.equals(merchantId),
          ))
          .write(
            LocalPaymentsCompanion(
              status: Value(
                nextRefunded.minorUnits >= paymentAmount.minorUnits
                    ? 'REFUNDED'
                    : 'PARTIALLY_REFUNDED',
              ),
            ),
          );
      final orderRefunds =
          await (database.select(database.localRefunds)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.orderId.equals(orderId) &
                    row.status.equals('SUCCEEDED'),
              ))
              .get();
      var totalRefunded = _money('0.00');
      for (final row in orderRefunds) {
        totalRefunded += _money(row.amount);
      }
      if (totalRefunded.minorUnits >= _money(order.grandTotal).minorUnits) {
        await (database.update(database.localOrders)..where(
              (row) =>
                  row.id.equals(orderId) & row.merchantId.equals(merchantId),
            ))
            .write(const LocalOrdersCompanion(status: Value('REFUNDED')));
      }
      await _audit.record(
        action: 'CREATE',
        entityType: 'refund',
        entityId: refundId,
        shopId: order.shopId,
        requestId: commandKey,
        afterData: {
          'order_id': orderId,
          'payment_id': paymentId,
          'amount': requestedAmount.toDecimalString(),
          'reason': _optional(reason),
        },
      );
    });
    return PosRefund(
      id: refundId,
      paymentId: paymentId,
      orderId: orderId,
      status: 'SUCCEEDED',
      amount: requestedAmount.toDecimalString(),
      reason: _optional(reason),
      createdAt: DateTime.parse(now).toUtc(),
    );
  }

  Future<
    ({
      ExactMoney subtotal,
      ExactMoney discount,
      ExactMoney tax,
      ExactMoney grandTotal,
      ExactMoney taxRate,
      Map<String, ExactMoney> lineDiscounts,
    })
  >
  _totals(String shopId, List<PosCartLine> lines, {String? promotionId}) async {
    final lineGrosses = await _lineGrosses(lines);
    var subtotal = _money('0.00');
    for (final line in lineGrosses) {
      subtotal += line.gross;
    }
    final settings = await _taxSettings(shopId);
    final promotion = await _promotionDiscount(
      promotionId: promotionId,
      subtotal: subtotal,
      lines: lineGrosses,
    );
    final discount = promotion.discount;
    final taxable = subtotal - discount;
    final tax = settings.includeTax
        ? _percentageOf(taxable, settings.rate)
        : _money('0.00');
    final grandTotal = taxable + tax;
    if (grandTotal.minorUnits <= BigInt.zero) {
      throw const FormatException(
        'The payment total must be greater than zero.',
      );
    }
    return (
      subtotal: subtotal,
      discount: discount,
      tax: tax,
      grandTotal: grandTotal,
      taxRate: settings.includeTax ? settings.rate : _money('0.00'),
      lineDiscounts: promotion.lineDiscounts,
    );
  }

  Future<({ExactMoney discount, Map<String, ExactMoney> lineDiscounts})>
  _promotionDiscount({
    required String? promotionId,
    required ExactMoney subtotal,
    required List<({PosCartLine line, ExactMoney gross, String productId})>
    lines,
  }) async {
    final normalizedId = promotionId?.trim();
    if (normalizedId == null || normalizedId.isEmpty) {
      return (discount: _money('0.00'), lineDiscounts: <String, ExactMoney>{});
    }
    final promotion =
        await (database.select(database.localPromotions)..where(
              (row) =>
                  row.id.equals(normalizedId) &
                  row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (promotion == null) {
      throw const FormatException('The selected promotion is not available.');
    }
    final now = DateTime.now().toUtc();
    if (!promotion.isActive ||
        (promotion.startsAt != null && now.isBefore(promotion.startsAt!)) ||
        (promotion.endsAt != null && !now.isBefore(promotion.endsAt!)) ||
        (promotion.usageLimit != null &&
            promotion.redemptionCount >= promotion.usageLimit!)) {
      throw const FormatException('The selected promotion is not available.');
    }
    final minimum = _money(promotion.minimumSubtotal);
    if (subtotal.minorUnits < minimum.minorUnits) {
      throw const FormatException(
        'The order does not meet the promotion minimum.',
      );
    }
    final scopes =
        await (database.select(database.localPromotionScopes)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.promotionId.equals(normalizedId),
            ))
            .get();
    final eligible = scopes.isEmpty
        ? lines
        : [
            for (final line in lines)
              if (scopes.any(
                (scope) =>
                    scope.productId == line.productId &&
                    (scope.variantId == null ||
                        scope.variantId == line.line.item.id),
              ))
                line,
          ];
    if (eligible.isEmpty) {
      throw const FormatException(
        'The promotion does not apply to an item in this order.',
      );
    }
    var eligibleSubtotal = _money('0.00');
    for (final line in eligible) {
      eligibleSubtotal += line.gross;
    }
    final value = _money(promotion.value);
    final discount = promotion.promotionType == 'PERCENTAGE'
        ? _percentageOf(eligibleSubtotal, value)
        : value.minorUnits > eligibleSubtotal.minorUnits
        ? eligibleSubtotal
        : value;
    final lineDiscounts = <String, ExactMoney>{};
    var remaining = discount;
    for (var index = 0; index < eligible.length; index++) {
      final line = eligible[index];
      final amount = index == eligible.length - 1
          ? remaining
          : _proportional(discount, line.gross, eligibleSubtotal);
      remaining -= amount;
      lineDiscounts[line.line.item.id] =
          (lineDiscounts[line.line.item.id] ?? _money('0.00')) + amount;
    }
    return (discount: discount, lineDiscounts: lineDiscounts);
  }

  ExactMoney _proportional(
    ExactMoney total,
    ExactMoney part,
    ExactMoney whole,
  ) {
    final numerator = total.minorUnits * part.minorUnits;
    final denominator = whole.minorUnits;
    var cents = numerator ~/ denominator;
    if ((numerator % denominator).abs() * BigInt.from(2) >= denominator.abs()) {
      cents += numerator.isNegative ? -BigInt.one : BigInt.one;
    }
    return ExactMoney(minorUnits: cents, decimalPlaces: 2);
  }

  Future<({bool includeTax, ExactMoney rate})> _taxSettings(
    String shopId,
  ) async {
    await _requireShop(shopId);
    final rows =
        await (database.select(database.merchantSettings)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId) &
                  row.settingKey.isIn(const ['tax.include', 'tax.rate']),
            ))
            .get();
    final values = <String, String>{};
    for (final row in rows) {
      try {
        values[row.settingKey] = jsonDecode(row.valueJson)?.toString() ?? '';
      } on FormatException {
        values[row.settingKey] = row.valueJson;
      }
    }
    final includeTax = values['tax.include'] == 'true';
    final rateValue = values['tax.rate']?.trim();
    final rate = rateValue == null || rateValue.isEmpty
        ? _money('0.00')
        : _money(rateValue);
    if (rate.minorUnits.isNegative) {
      throw const FormatException('Tax rate must be zero or greater.');
    }
    return (includeTax: includeTax, rate: rate);
  }

  Future<List<({PosCartLine line, ExactMoney gross, String productId})>>
  _lineGrosses(List<PosCartLine> lines) async {
    if (lines.isEmpty) {
      throw const FormatException(
        'Add at least one item before requesting a quote.',
      );
    }
    final result = <({PosCartLine line, ExactMoney gross, String productId})>[];
    final seenVariants = <String>{};
    for (final line in lines) {
      if (line.quantity <= 0) {
        throw const FormatException('Quantity must be positive.');
      }
      final variant =
          await (database.select(database.cachedCatalogVariants)..where(
                (row) =>
                    row.id.equals(line.item.id) &
                    row.merchantId.equals(merchantId),
              ))
              .getSingleOrNull();
      if (variant == null) {
        throw StateError('Cart item is outside the active merchant.');
      }
      if (!seenVariants.add(variant.id)) {
        throw const FormatException(
          'Each POS variant may appear only once in the cart.',
        );
      }
      final unitPrice = _money(variant.price ?? line.item.price);
      result.add((
        line: line,
        productId: variant.productId,
        gross: ExactMoney(
          minorUnits: unitPrice.minorUnits * BigInt.from(line.quantity),
          decimalPlaces: unitPrice.decimalPlaces,
        ),
      ));
    }
    return result;
  }

  ExactMoney _money(String? value) {
    if (value == null || value.trim().isEmpty) {
      throw const FormatException('Every local POS item needs a price.');
    }
    return ExactMoney.parse(value, decimalPlaces: 2);
  }

  ExactMoney _percentageOf(ExactMoney amount, ExactMoney percentage) {
    final denominator = BigInt.from(100) * BigInt.from(100);
    final numerator = amount.minorUnits * percentage.minorUnits;
    var cents = numerator ~/ denominator;
    if ((numerator % denominator).abs() * BigInt.from(2) >= denominator) {
      cents += numerator.isNegative ? -BigInt.one : BigInt.one;
    }
    return ExactMoney(minorUnits: cents, decimalPlaces: 2);
  }

  PosRefund _refund(LocalRefund row) => PosRefund(
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    status: row.status,
    amount: row.amount,
    reason: row.reason,
    createdAt: DateTime.parse(row.createdAt).toUtc(),
  );

  Future<void> _requireShop(String shopId) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null) {
      throw StateError('Shop is outside the active merchant.');
    }
  }

  Future<String?> _shopLocationId(String shopId) async {
    final location =
        await (database.select(database.locations)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.shopId.equals(shopId),
            ))
            .getSingleOrNull();
    return location?.id;
  }

  Future<void> _validateDelivery(String shopId, String? deliveryId) async {
    final normalized = deliveryId?.trim();
    if (normalized == null || normalized.isEmpty) return;
    await LocalDeliveriesRepository(
      database: database,
      merchantId: merchantId,
      shopId: shopId,
    ).requireDelivery(
      merchantId: merchantId,
      shopId: shopId,
      deliveryId: normalized,
    );
  }

  String? _optional(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  LocalAuditRepository get _audit => LocalAuditRepository(
    database: database,
    merchantId: merchantId,
    actorMembershipId: actorMembershipId,
  );
}
