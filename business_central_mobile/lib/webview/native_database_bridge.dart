import 'dart:convert';
import 'package:crypto/crypto.dart';

import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/database/app_database.dart';

part 'transaction_corrections.dart';

class NativeDatabaseBridge {
  NativeDatabaseBridge({AppDatabase? database}) {
    _database = database;
  }

  static const channelName = 'BusinessCentralDatabaseChannel';

  AppDatabase? _database;
  Future<void> Function(String script)? _runJavaScript;
  static const _uuid = Uuid();

  void attach(WebViewController controller, {AppDatabase? database}) {
    _runJavaScript = controller.runJavaScript;
    if (database != null) _database = database;
  }

  @visibleForTesting
  void attachJavaScriptEvaluator(
    Future<void> Function(String script) evaluate, {
    AppDatabase? database,
  }) {
    _runJavaScript = evaluate;
    if (database != null) _database = database;
  }

  AppDatabase get _db => _database ??= AppDatabase();

  Future<void> handleMessage(JavaScriptMessage message) async {
    String requestId = '';
    try {
      final request = jsonDecode(message.message) as Map<String, dynamic>;
      requestId = request['id']?.toString() ?? '';
      final method = request['method']?.toString() ?? '';
      final payload = request['payload'] as Map<String, dynamic>? ?? {};

      final result = switch (method) {
        'getProducts' => await _getProducts(payload),
        'saveProduct' => await _saveProduct(payload),
        'deleteProduct' => await _deleteProduct(payload),
        'getCustomers' => await _getCustomers(payload),
        'saveCustomer' => await _saveCustomer(payload),
        'checkout' => await _checkout(payload),
        'getTransactionHistory' => await _deliveryHistory(payload),
        'getTransactionHistoryDetail' => await _deliveryHistory(
          payload,
          detail: true,
        ),
        'updateDeliveryPayment' => await _updateDeliveryPayment(payload),
        'updateTransaction' => await _correctTransaction(payload),
        'deleteTransaction' => await _correctTransaction(
          payload,
          deleting: true,
        ),
        'getTransactionCatalog' => await _transactionCatalog(payload),
        'getOrders' => await _getOrders(payload),
        'getOrder' => await _getOrder(payload),
        'getSetting' => await _getSetting(payload),
        'saveSetting' => await _saveSetting(payload),
        'rawQuery' => await _rawQuery(payload),
        'rawExecute' => await _rawExecute(payload),
        _ => throw StateError('Unknown native database method: $method'),
      };
      await _resolve(requestId, result: result);
    } on Object catch (error) {
      await _resolve(requestId, error: error.toString());
    }
  }

  Future<String> _getOrFallbackMerchantId() async {
    final firstMerchant = await (_db.select(
      _db.merchants,
    )..limit(1)).getSingleOrNull();
    if (firstMerchant != null) return firstMerchant.id;
    final metaMerchantId = await (_db.select(
      _db.appMetadata,
    )..where((t) => t.key.equals('bc.merchant_id'))).getSingleOrNull();
    if (metaMerchantId != null && metaMerchantId.value.isNotEmpty) {
      return metaMerchantId.value;
    }
    return 'default-merchant';
  }

  Future<List<Map<String, dynamic>>> _getProducts(
    Map<String, dynamic> payload,
  ) async {
    final search = payload['search']?.toString().toLowerCase().trim();
    final categoryId = payload['categoryId']?.toString().trim();

    final query = _db.select(_db.cachedCatalogProducts);
    if (search != null && search.isNotEmpty) {
      final matchingVariants =
          await (_db.select(_db.cachedCatalogVariants)..where(
                (t) =>
                    t.sku.lower().like('%$search%') |
                    t.barcode.lower().like('%$search%') |
                    t.name.lower().like('%$search%'),
              ))
              .get();
      final matchingProductIds = matchingVariants
          .map((v) => v.productId)
          .toSet();
      if (matchingProductIds.isNotEmpty) {
        query.where(
          (t) =>
              t.name.lower().like('%$search%') | t.id.isIn(matchingProductIds),
        );
      } else {
        query.where((t) => t.name.lower().like('%$search%'));
      }
    }
    query.where((t) => t.isActive.equals(true));

    final products = await query.get();
    final result = <Map<String, dynamic>>[];

    for (final product in products) {
      if (categoryId != null && categoryId.isNotEmpty) {
        final link =
            await (_db.select(_db.cachedCatalogProductCategories)..where(
                  (t) =>
                      t.productId.equals(product.id) &
                      t.categoryId.equals(categoryId),
                ))
                .getSingleOrNull();
        if (link == null) continue;
      }

      final variants = await (_db.select(
        _db.cachedCatalogVariants,
      )..where((t) => t.productId.equals(product.id))).get();

      final categoryLinks = await (_db.select(
        _db.cachedCatalogProductCategories,
      )..where((t) => t.productId.equals(product.id))).get();

      final firstVariant = variants.isNotEmpty ? variants.first : null;

      result.add({
        'id': product.id,
        'merchant_id': product.merchantId,
        'name': product.name,
        'product_type': product.productType,
        'is_active': product.isActive,
        'updated_at': product.updatedAt,
        'original_price': firstVariant?.price ?? '0.00',
        'sell_price': firstVariant?.price ?? '0.00',
        'category_ids': categoryLinks.map((l) => l.categoryId).toList(),
        'variants': variants
            .map(
              (v) => {
                'id': v.id,
                'product_id': v.productId,
                'sku': v.sku,
                'barcode': v.barcode,
                'name': v.name,
                'base_unit_id': v.baseUnitId,
                'unit_of_measure': v.unitOfMeasure,
                'is_stock_tracked': v.isStockTracked,
                'quantity_on_hand': v.quantityOnHand ?? '0',
                'price': v.price ?? '0.00',
                'updated_at': v.updatedAt,
              },
            )
            .toList(),
      });
    }

    return result;
  }

  Future<Map<String, dynamic>> _saveProduct(
    Map<String, dynamic> payload,
  ) async {
    final product = (payload['product'] as Map<String, dynamic>?) ?? payload;
    final merchantId =
        product['merchant_id']?.toString() ?? await _getOrFallbackMerchantId();
    final productId = product['id']?.toString() ?? _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();

    await _db
        .into(_db.cachedCatalogProducts)
        .insertOnConflictUpdate(
          CachedCatalogProductsCompanion.insert(
            id: productId,
            merchantId: merchantId,
            name: product['name']?.toString() ?? 'Unnamed Product',
            productType: product['product_type']?.toString() ?? 'SIMPLE',
            isActive: Value(product['is_active'] as bool? ?? true),
            updatedAt: now,
          ),
        );

    final variants = product['variants'] as List<dynamic>? ?? [];
    if (variants.isNotEmpty) {
      for (final rawVariant in variants) {
        if (rawVariant is! Map<String, dynamic>) continue;
        final variantId = rawVariant['id']?.toString() ?? _uuid.v4();
        await _db
            .into(_db.cachedCatalogVariants)
            .insertOnConflictUpdate(
              CachedCatalogVariantsCompanion.insert(
                id: variantId,
                merchantId: merchantId,
                productId: productId,
                sku: rawVariant['sku']?.toString() ?? 'SKU-$variantId',
                barcode: Value(rawVariant['barcode']?.toString()),
                name:
                    rawVariant['name']?.toString() ??
                    product['name']?.toString() ??
                    'Default',
                baseUnitId: rawVariant['base_unit_id']?.toString() ?? 'unit',
                unitOfMeasure:
                    rawVariant['unit_of_measure']?.toString() ?? 'pcs',
                isStockTracked: Value(
                  rawVariant['is_stock_tracked'] as bool? ?? false,
                ),
                quantityOnHand: Value(
                  rawVariant['quantity_on_hand']?.toString() ?? '0',
                ),
                price: Value(
                  rawVariant['price']?.toString() ??
                      product['sell_price']?.toString() ??
                      '0.00',
                ),
                updatedAt: now,
              ),
            );
      }
    } else {
      final defaultVariantId = _uuid.v4();
      await _db
          .into(_db.cachedCatalogVariants)
          .insertOnConflictUpdate(
            CachedCatalogVariantsCompanion.insert(
              id: defaultVariantId,
              merchantId: merchantId,
              productId: productId,
              sku: 'SKU-${productId.substring(0, 8)}',
              barcode: Value(product['barcode']?.toString()),
              name: product['name']?.toString() ?? 'Standard',
              baseUnitId: 'unit',
              unitOfMeasure: 'pcs',
              isStockTracked: const Value(false),
              quantityOnHand: const Value('0'),
              price: Value(product['sell_price']?.toString() ?? '0.00'),
              updatedAt: now,
            ),
          );
    }

    final categoryIds =
        (product['category_ids'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        [];
    for (final catId in categoryIds) {
      await _db
          .into(_db.cachedCatalogProductCategories)
          .insertOnConflictUpdate(
            CachedCatalogProductCategoriesCompanion.insert(
              merchantId: merchantId,
              productId: productId,
              categoryId: catId,
            ),
          );
    }

    return {
      'id': productId,
      'merchant_id': merchantId,
      'name': product['name'],
      'is_active': true,
      'updated_at': now,
    };
  }

  Future<bool> _deleteProduct(Map<String, dynamic> payload) async {
    final id =
        payload['id']?.toString() ?? payload['productId']?.toString() ?? '';
    if (id.isEmpty) return false;
    await (_db.update(_db.cachedCatalogProducts)..where((t) => t.id.equals(id)))
        .write(const CachedCatalogProductsCompanion(isActive: Value(false)));
    return true;
  }

  Future<List<Map<String, dynamic>>> _getCustomers(
    Map<String, dynamic> payload,
  ) async {
    final search = payload['search']?.toString().toLowerCase().trim() ?? '';
    final rows =
        await (_db.select(_db.localCanonicalRecords)..where(
              (t) =>
                  t.entityType.equals('customer') & t.isDeleted.equals(false),
            ))
            .get();

    final customers = <Map<String, dynamic>>[];
    for (final row in rows) {
      try {
        final data = jsonDecode(row.payloadJson) as Map<String, dynamic>;
        data['id'] ??= row.entityId;
        data['merchant_id'] ??= row.merchantId;

        if (search.isNotEmpty) {
          final name = data['name']?.toString().toLowerCase() ?? '';
          final phone = data['phone']?.toString().toLowerCase() ?? '';
          final email = data['email']?.toString().toLowerCase() ?? '';
          if (!name.contains(search) &&
              !phone.contains(search) &&
              !email.contains(search)) {
            continue;
          }
        }
        customers.add(data);
      } catch (_) {
        // Skip unparseable records
      }
    }
    return customers;
  }

  Future<Map<String, dynamic>> _saveCustomer(
    Map<String, dynamic> payload,
  ) async {
    final customer = (payload['customer'] as Map<String, dynamic>?) ?? payload;
    final merchantId =
        customer['merchant_id']?.toString() ?? await _getOrFallbackMerchantId();
    final customerId = customer['id']?.toString() ?? _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();

    final mutableCustomer = Map<String, dynamic>.from(customer);
    mutableCustomer['id'] = customerId;
    mutableCustomer['merchant_id'] = merchantId;
    mutableCustomer['updated_at'] = now;

    final existing =
        await (_db.select(_db.localCanonicalRecords)..where(
              (t) =>
                  t.merchantId.equals(merchantId) &
                  t.entityType.equals('customer') &
                  t.entityId.equals(customerId),
            ))
            .getSingleOrNull();

    final recordId = existing?.id ?? _uuid.v4();
    final createdAt = existing?.createdAt ?? now;

    await _db
        .into(_db.localCanonicalRecords)
        .insertOnConflictUpdate(
          LocalCanonicalRecordsCompanion.insert(
            id: recordId,
            merchantId: merchantId,
            entityType: 'customer',
            entityId: customerId,
            payloadJson: jsonEncode(mutableCustomer),
            updatedAt: now,
            createdAt: createdAt,
          ),
        );

    return mutableCustomer;
  }

  Future<Map<String, dynamic>> _checkout(Map<String, dynamic> payload) async {
    final rawOrder =
        (payload['order'] as Map<String, dynamic>?) ??
        (payload['projection'] as Map<String, dynamic>?) ??
        payload;

    final requestPayload = payload['payload'] as Map<String, dynamic>? ?? {};
    final requestData =
        requestPayload['request'] as Map<String, dynamic>? ?? {};

    final merchantId =
        rawOrder['merchant_id']?.toString() ??
        requestPayload['merchant_id']?.toString() ??
        await _getOrFallbackMerchantId();

    final shopId =
        rawOrder['shop_id']?.toString() ??
        requestPayload['shop_id']?.toString() ??
        'default-shop';

    final orderId =
        rawOrder['id']?.toString() ??
        rawOrder['order_id']?.toString() ??
        rawOrder['provisional_id']?.toString() ??
        requestData['idempotency_key']?.toString() ??
        _uuid.v4();

    final orderNumber =
        rawOrder['number']?.toString() ??
        rawOrder['order_number']?.toString() ??
        'ORD-${DateTime.now().millisecondsSinceEpoch}';

    final snapshot = rawOrder['snapshot'] as Map<String, dynamic>? ?? {};
    final currencyCode =
        rawOrder['currency_code']?.toString() ??
        rawOrder['currencyCode']?.toString() ??
        snapshot['currency_code']?.toString() ??
        'USD';

    final subtotal =
        rawOrder['subtotal']?.toString() ??
        snapshot['subtotal']?.toString() ??
        '0.00';
    final discountTotal =
        rawOrder['discount_total']?.toString() ??
        snapshot['discount_total']?.toString() ??
        '0.00';
    final taxTotal =
        rawOrder['tax_total']?.toString() ??
        snapshot['tax_total']?.toString() ??
        '0.00';
    final grandTotal =
        rawOrder['grand_total']?.toString() ??
        snapshot['grand_total']?.toString() ??
        subtotal;

    final deliveryFee =
        rawOrder['delivery_fee']?.toString() ??
        requestData['delivery_fee']?.toString() ??
        '0.00';
    final requestedDeliveryPaymentStatus =
        rawOrder['delivery_payment_status']?.toString() ??
        requestData['delivery_payment_status']?.toString() ??
        'UN_PAID';
    if (!['UN_PAID', 'COMPLETE'].contains(requestedDeliveryPaymentStatus)) {
      throw StateError('Invalid delivery payment status.');
    }
    final deliveryAmount = double.tryParse(deliveryFee);
    if (deliveryAmount == null ||
        !deliveryAmount.isFinite ||
        deliveryAmount < 0 ||
        deliveryAmount > double.parse(grandTotal)) {
      throw StateError('Invalid delivery fee.');
    }
    final autoComplete = await _getSetting({
      'key': 'shop:$merchantId:$shopId:delivery_payment_status_auto_complete',
    });
    final deliveryPaymentStatus =
        autoComplete == 'true' && payload['correction'] != true
        ? 'COMPLETE'
        : requestedDeliveryPaymentStatus;
    final payment = rawOrder['payment'] as Map<String, dynamic>? ?? {};
    final receiptStatus = payment['status'] == 'PENDING_AUTHORIZATION'
        ? 'PENDING_AUTHORIZATION'
        : 'COMPLETED';
    final paymentMethod =
        rawOrder['payment_method']?.toString() ??
        payment['method']?.toString() ??
        requestData['payment_method']?.toString() ??
        'CASH';

    final customerName =
        rawOrder['customer_name']?.toString() ??
        rawOrder['customerName']?.toString() ??
        requestData['customer_name']?.toString();

    final customerPhone =
        rawOrder['customer_phone']?.toString() ??
        rawOrder['customerPhone']?.toString() ??
        requestData['customer_phone']?.toString();

    final note =
        rawOrder['note']?.toString() ?? requestData['note']?.toString();
    final idempotencyKey = rawOrder['idempotency_key']?.toString() ?? orderId;
    final now = DateTime.now().toUtc().toIso8601String();

    final rawLines =
        (rawOrder['lines'] as List<dynamic>?) ??
        (rawOrder['line_snapshots'] as List<dynamic>?) ??
        (requestData['lines'] as List<dynamic>?) ??
        [];

    await _db.transaction(() async {
      if (await _getSetting({
            'key': 'deleted-checkout:$merchantId:$idempotencyKey',
          }) !=
          null) {
        throw StateError('This checkout was permanently removed.');
      }
      final existingCheckout =
          await (_db.select(_db.localOrders)..where(
                (t) =>
                    t.merchantId.equals(merchantId) &
                    t.idempotencyKey.equals(idempotencyKey),
              ))
              .getSingleOrNull();
      if (existingCheckout != null) {
        if (existingCheckout.id != orderId ||
            existingCheckout.grandTotal != grandTotal ||
            existingCheckout.deliveryFee != deliveryFee ||
            existingCheckout.deliveryPaymentStatus != deliveryPaymentStatus) {
          throw StateError('Checkout idempotency conflict.');
        }
        return;
      }
      await _db
          .into(_db.localOrders)
          .insertOnConflictUpdate(
            LocalOrdersCompanion.insert(
              id: orderId,
              merchantId: merchantId,
              shopId: shopId,
              number: orderNumber,
              status: receiptStatus,
              currencyCode: currencyCode,
              subtotal: subtotal,
              discountTotal: discountTotal,
              taxTotal: taxTotal,
              grandTotal: grandTotal,
              deliveryFee: Value(deliveryFee),
              deliveryPaymentStatus: Value(deliveryPaymentStatus),
              paymentMethod: paymentMethod,
              customerName: Value(customerName),
              customerPhone: Value(customerPhone),
              note: Value(note),
              idempotencyKey: idempotencyKey,
              createdAt: now,
            ),
          );

      for (final rawLine in rawLines) {
        if (rawLine is! Map<String, dynamic>) continue;
        final lineId = rawLine['id']?.toString() ?? _uuid.v4();
        final variantId = rawLine['variant_id']?.toString() ?? _uuid.v4();
        final sku = rawLine['sku']?.toString() ?? 'SKU-$variantId';
        final lineName =
            rawLine['name']?.toString() ??
            rawLine['variant_name']?.toString() ??
            'Item';
        final unitPrice = rawLine['unit_price']?.toString() ?? '0.00';
        final quantity =
            (rawLine['quantity'] as num?)?.toInt() ??
            int.tryParse(rawLine['quantity']?.toString() ?? '1') ??
            1;
        final discountAmount = rawLine['discount_amount']?.toString() ?? '0.00';
        final taxAmount = rawLine['tax_amount']?.toString() ?? '0.00';
        final lineTotal =
            rawLine['line_total']?.toString() ??
            rawLine['line_subtotal']?.toString() ??
            unitPrice;

        await _db
            .into(_db.localOrderLines)
            .insert(
              LocalOrderLinesCompanion.insert(
                id: lineId,
                merchantId: merchantId,
                orderId: orderId,
                variantId: variantId,
                sku: sku,
                name: lineName,
                unitPrice: unitPrice,
                quantity: quantity,
                discountAmount: Value(discountAmount),
                taxAmount: Value(taxAmount),
                lineTotal: lineTotal,
              ),
            );

        // Record stock movement for offline balance deduction
        await _db
            .into(_db.localInventoryMovements)
            .insert(
              LocalInventoryMovementsCompanion.insert(
                id: _uuid.v4(),
                merchantId: merchantId,
                shopId: shopId,
                variantId: variantId,
                movementType: 'SALE',
                quantity: '-$quantity',
                totalCost: lineTotal,
                eventKey: 'pos_sale_${orderId}_$lineId',
                orderLineId: Value(lineId),
                occurredAt: now,
                createdAt: now,
              ),
            );

        // Deduct quantityOnHand in cachedCatalogVariants if row exists
        final existingVariant = await (_db.select(
          _db.cachedCatalogVariants,
        )..where((t) => t.id.equals(variantId))).getSingleOrNull();
        if (existingVariant != null && existingVariant.quantityOnHand != null) {
          final currentQty =
              double.tryParse(existingVariant.quantityOnHand!) ?? 0;
          final updatedQty = (currentQty - quantity).toStringAsFixed(2);
          await (_db.update(
            _db.cachedCatalogVariants,
          )..where((t) => t.id.equals(variantId))).write(
            CachedCatalogVariantsCompanion(
              quantityOnHand: Value(updatedQty),
              updatedAt: Value(now),
            ),
          );
        }
      }

      await _db
          .into(_db.localPayments)
          .insert(
            LocalPaymentsCompanion.insert(
              id: _uuid.v4(),
              merchantId: merchantId,
              orderId: orderId,
              method: paymentMethod,
              status: receiptStatus,
              amount: ((double.parse(grandTotal) - double.parse(deliveryFee)))
                  .toStringAsFixed(2),
              idempotencyKey: 'pay_$orderId',
              createdAt: now,
            ),
          );
      if (deliveryPaymentStatus == 'COMPLETE' &&
          double.parse(deliveryFee) > 0) {
        await _db
            .into(_db.localPayments)
            .insert(
              LocalPaymentsCompanion.insert(
                id: _uuid.v4(),
                merchantId: merchantId,
                orderId: orderId,
                method: paymentMethod,
                status: receiptStatus,
                amount: deliveryFee,
                purpose: const Value('DELIVERY'),
                idempotencyKey: 'delivery_$orderId',
                createdAt: now,
              ),
            );
      }
    });

    return {
      'order_id': orderId,
      'order_number': orderNumber,
      'status': 'COMPLETED',
    };
  }

  Future<List<Map<String, dynamic>>> _getOrders(
    Map<String, dynamic> payload,
  ) async {
    final limit = (payload['limit'] as num?)?.toInt() ?? 50;
    final offset = (payload['offset'] as num?)?.toInt() ?? 0;

    final orders =
        await (_db.select(_db.localOrders)
              ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
              ..limit(limit, offset: offset))
            .get();

    final result = <Map<String, dynamic>>[];
    for (final order in orders) {
      final lines = await (_db.select(
        _db.localOrderLines,
      )..where((t) => t.orderId.equals(order.id))).get();
      result.add({
        'id': order.id,
        'merchant_id': order.merchantId,
        'shop_id': order.shopId,
        'number': order.number,
        'status': order.status,
        'currency_code': order.currencyCode,
        'subtotal': order.subtotal,
        'discount_total': order.discountTotal,
        'tax_total': order.taxTotal,
        'grand_total': order.grandTotal,
        'delivery_fee': order.deliveryFee,
        'delivery_payment_status': order.deliveryPaymentStatus,
        'payment_method': order.paymentMethod,
        'customer_name': order.customerName,
        'customer_phone': order.customerPhone,
        'note': order.note,
        'created_at': order.createdAt,
        'lines': lines
            .map(
              (line) => {
                'id': line.id,
                'variant_id': line.variantId,
                'sku': line.sku,
                'name': line.name,
                'unit_price': line.unitPrice,
                'quantity': line.quantity,
                'line_total': line.lineTotal,
              },
            )
            .toList(),
      });
    }
    return result;
  }

  Future<Map<String, dynamic>?> _getOrder(Map<String, dynamic> payload) async {
    final orderId =
        payload['id']?.toString() ?? payload['order_id']?.toString() ?? '';
    if (orderId.isEmpty) return null;
    final order = await (_db.select(
      _db.localOrders,
    )..where((t) => t.id.equals(orderId))).getSingleOrNull();
    if (order == null) return null;
    final lines = await (_db.select(
      _db.localOrderLines,
    )..where((t) => t.orderId.equals(order.id))).get();
    return {
      'id': order.id,
      'merchant_id': order.merchantId,
      'shop_id': order.shopId,
      'number': order.number,
      'status': order.status,
      'currency_code': order.currencyCode,
      'subtotal': order.subtotal,
      'discount_total': order.discountTotal,
      'tax_total': order.taxTotal,
      'grand_total': order.grandTotal,
      'delivery_fee': order.deliveryFee,
      'delivery_payment_status': order.deliveryPaymentStatus,
      'payment_method': order.paymentMethod,
      'customer_name': order.customerName,
      'customer_phone': order.customerPhone,
      'note': order.note,
      'created_at': order.createdAt,
      'lines': lines
          .map(
            (line) => {
              'id': line.id,
              'variant_id': line.variantId,
              'sku': line.sku,
              'name': line.name,
              'unit_price': line.unitPrice,
              'quantity': line.quantity,
              'line_total': line.lineTotal,
            },
          )
          .toList(),
    };
  }

  Future<Map<String, dynamic>> _deliveryHistory(
    Map<String, dynamic> payload, {
    bool detail = false,
  }) async {
    final merchant = payload['merchant_id']?.toString() ?? '';
    final shop = payload['shop_id']?.toString() ?? '';
    if (merchant.isEmpty || shop.isEmpty) {
      throw StateError('Merchant and shop scope are required.');
    }
    final orders =
        await (_db.select(_db.localOrders)
              ..where(
                (t) => t.merchantId.equals(merchant) & t.shopId.equals(shop),
              )
              ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
            .get();
    final entries = <Map<String, dynamic>>[];
    final query = payload['query']?.toString().toLowerCase() ?? '';
    final filter = payload['filter']?.toString() ?? '';
    final from = DateTime.tryParse(
      RegExp(r'(?:^|,)from:([^,]+)').firstMatch(filter)?.group(1) ?? '',
    );
    final to = DateTime.tryParse(
      RegExp(r'(?:^|,)to:([^,]+)').firstMatch(filter)?.group(1) ?? '',
    );
    final eventType = RegExp(
      r'(?:^|,)event_type:([^,]+)',
    ).firstMatch(filter)?.group(1);
    for (final order in orders) {
      final occurred = DateTime.tryParse(order.createdAt);
      if (!detail &&
          ((eventType != null && eventType != 'TRANSACTION') ||
              (occurred != null &&
                  ((from != null && occurred.isBefore(from)) ||
                      (to != null && occurred.isAfter(to)))))) {
        continue;
      }

      if (detail && order.id != payload['id']) continue;
      if (query.isNotEmpty &&
          !'${order.number} ${order.customerName ?? ''}'.toLowerCase().contains(
            query,
          )) {
        continue;
      }
      final lines =
          await (_db.select(_db.localOrderLines)..where(
                (t) =>
                    t.merchantId.equals(merchant) & t.orderId.equals(order.id),
              ))
              .get();
      final payments =
          await (_db.select(_db.localPayments)..where(
                (t) =>
                    t.merchantId.equals(merchant) & t.orderId.equals(order.id),
              ))
              .get();
      final refunds =
          await (_db.select(_db.localRefunds)..where(
                (t) =>
                    t.merchantId.equals(merchant) & t.orderId.equals(order.id),
              ))
              .get();
      final captured = payments.where(
        (p) => [
          'COMPLETED',
          'CAPTURED',
          'PARTIALLY_REFUNDED',
          'REFUNDED',
        ].contains(p.status),
      );
      final paid =
          captured.fold<double>(0, (sum, p) => sum + double.parse(p.amount)) -
          refunds
              .where((r) => r.status == 'SUCCEEDED')
              .fold<double>(0, (sum, r) => sum + double.parse(r.amount));
      final orderPayments = captured
          .where((p) => p.purpose == 'ORDER')
          .map((p) => p.id)
          .toSet();
      final merchandisePaid =
          captured
              .where((p) => p.purpose == 'ORDER')
              .fold<double>(0, (sum, p) => sum + double.parse(p.amount)) -
          refunds
              .where(
                (r) =>
                    r.status == 'SUCCEEDED' &&
                    orderPayments.contains(r.paymentId),
              )
              .fold<double>(0, (sum, r) => sum + double.parse(r.amount));
      final financial = <String, dynamic>{
        'delivery_payment_status': order.deliveryPaymentStatus,
        'delivery_fee': order.deliveryFee,
        'paid_total': paid.toStringAsFixed(2),
        'outstanding_total': (double.parse(order.grandTotal) - paid)
            .toStringAsFixed(2),
        'payment_status':
            merchandisePaid >=
                double.parse(order.grandTotal) - double.parse(order.deliveryFee)
            ? 'COMPLETE'
            : 'UN_PAID',
      };
      final entry = <String, dynamic>{
        ...financial,
        'id': order.id,
        'event_type': 'TRANSACTION',
        'reference': order.number,
        'occurred_at': order.createdAt,
        'status': order.status == 'COMPLETED' ? 'FULFILLED' : order.status,
        'channel': 'POS',
        'customer_name': order.customerName,
        'customer_phone': order.customerPhone,
        'payment_method': order.paymentMethod,
        'amount': order.grandTotal,
        'currency_code': order.currencyCode,
        'shop_id': shop,
        'quantity': lines
            .fold<int>(0, (sum, line) => sum + line.quantity)
            .toString(),
        'details': lines.map((l) => l.name).join(', '),
        'product_name': lines.map((l) => l.name).join(', '),
      };
      if (detail) {
        final updatedAt =
            await _getSetting({'key': 'order-version:$merchant:${order.id}'}) ??
            order.createdAt;
        final deliveryRaw = await _getSetting({
          'key': 'order-delivery:$merchant:${order.id}',
        });
        final delivery = deliveryRaw == null
            ? <String, dynamic>{}
            : jsonDecode(deliveryRaw) as Map<String, dynamic>;
        return {
          'data': {
            'entry': entry,
            'order': {
              ...financial,
              'id': order.id,
              'order_number': order.number,
              'updated_at': updatedAt,
              ...delivery,
              'channel': 'POS',
              'status': order.status == 'COMPLETED'
                  ? 'FULFILLED'
                  : order.status,
              'currency_code': order.currencyCode,
              'subtotal': order.subtotal,
              'discount_total': order.discountTotal,
              'tax_total': order.taxTotal,
              'shipping_total': order.deliveryFee,
              'grand_total': order.grandTotal,
              'customer_name': order.customerName,
              'customer_phone': order.customerPhone,
              'shop_id': shop,
              'payment_type': order.paymentMethod,
              'note': order.note,
              'created_at': order.createdAt,
            },
            'lines': lines
                .map(
                  (l) => {
                    'id': l.id,
                    'variant_id': l.variantId,
                    'description': l.name,
                    'product_name': l.name,
                    'sku': l.sku,
                    'quantity': l.quantity.toString(),
                    'unit_price': l.unitPrice,
                    'discount_amount': l.discountAmount,
                    'tax_amount': l.taxAmount,
                    'line_total': l.lineTotal,
                    'cost_posted': false,
                    'original_cost': '0',
                    'original_unit_cost': '0',
                    'gross_profit': '0',
                    'gross_margin': '0',
                  },
                )
                .toList(),
            'payments': payments
                .map(
                  (p) => {
                    'id': p.id,
                    'method': p.method,
                    'purpose': p.purpose,
                    'status': p.status == 'COMPLETED' ? 'CAPTURED' : p.status,
                    'amount': p.amount,
                    'created_at': p.createdAt,
                  },
                )
                .toList(),
            'refunds': refunds
                .map(
                  (r) => {
                    'id': r.id,
                    'payment_id': r.paymentId,
                    'status': r.status,
                    'amount': r.amount,
                    'reason': r.reason,
                    'created_at': r.createdAt,
                  },
                )
                .toList(),
            'total_cost': '0',
            'gross_profit': '0',
            'gross_margin': '0',
          },
          'meta': <String, dynamic>{},
        };
      }
      entries.add(entry);
    }
    if (detail) throw StateError('Transaction not found in this shop.');
    final page = (payload['page_index'] as num?)?.toInt() ?? 0;
    final size = ((payload['page_size'] as num?)?.toInt() ?? 10).clamp(1, 200);
    return {
      'data': entries.skip(page * size).take(size).toList(),
      'meta': {
        'page_index': page,
        'page_size': size,
        'total': entries.length,
        'total_pages': (entries.length / size).ceil(),
      },
    };
  }

  Future<Map<String, dynamic>> _updateDeliveryPayment(
    Map<String, dynamic> payload,
  ) async {
    final merchant = payload['merchant_id']?.toString() ?? '';
    final shop = payload['shop_id']?.toString() ?? '';
    final id = payload['id']?.toString() ?? '';
    final status = payload['delivery_payment_status']?.toString() ?? '';
    final requestKey = payload['idempotency_key']?.toString() ?? '';
    if (merchant.isEmpty ||
        shop.isEmpty ||
        requestKey.isEmpty ||
        !['COMPLETE', 'UN_PAID'].contains(status)) {
      throw StateError('Invalid scoped delivery payment request.');
    }
    return _db.transaction(() async {
      final order =
          await (_db.select(_db.localOrders)..where(
                (t) =>
                    t.merchantId.equals(merchant) &
                    t.shopId.equals(shop) &
                    t.id.equals(id),
              ))
              .getSingleOrNull();
      if (order == null) {
        throw StateError('Transaction not found in this shop.');
      }
      final key = 'delivery-payment:$merchant:$requestKey';
      final signature = jsonEncode({
        'order_id': id,
        'expected_status': payload['expected_status'],
        'status': status,
      });
      final stored = await (_db.select(
        _db.appMetadata,
      )..where((t) => t.key.equals(key))).getSingleOrNull();
      if (stored != null) {
        if (stored.value != signature) {
          throw StateError('Idempotency conflict.');
        }
        return {
          'data': {'delivery_payment_status': status},
          'meta': <String, dynamic>{},
        };
      }
      if (['CANCELLED', 'REFUNDED'].contains(order.status)) {
        throw StateError('This order cannot change delivery collection.');
      }
      if (order.deliveryPaymentStatus != payload['expected_status']) {
        throw StateError('Delivery payment changed. Refresh before updating.');
      }
      final pendingRefunds =
          await (_db.select(_db.localRefunds)..where(
                (t) =>
                    t.merchantId.equals(merchant) &
                    t.orderId.equals(id) &
                    t.status.isNotIn(['SUCCEEDED', 'FAILED', 'CANCELLED']),
              ))
              .get();
      if (pendingRefunds.isNotEmpty) {
        throw StateError(
          'Wait for the pending refund before changing delivery payment.',
        );
      }
      final now = DateTime.now().toUtc().toIso8601String();
      if (order.deliveryPaymentStatus != status &&
          double.parse(order.deliveryFee) > 0) {
        if (status == 'COMPLETE') {
          final receipts =
              await (_db.select(_db.localPayments)..where(
                    (t) =>
                        t.merchantId.equals(merchant) &
                        t.orderId.equals(id) &
                        t.purpose.equals('DELIVERY'),
                  ))
                  .get();
          final receiptIds = receipts.map((p) => p.id).toSet();
          final refunds =
              await (_db.select(_db.localRefunds)..where(
                    (t) => t.merchantId.equals(merchant) & t.orderId.equals(id),
                  ))
                  .get();
          final collected =
              receipts
                  .where(
                    (p) => [
                      'COMPLETED',
                      'CAPTURED',
                      'PARTIALLY_REFUNDED',
                      'REFUNDED',
                    ].contains(p.status),
                  )
                  .fold<double>(0, (sum, p) => sum + double.parse(p.amount)) -
              refunds
                  .where(
                    (r) =>
                        r.status == 'SUCCEEDED' &&
                        receiptIds.contains(r.paymentId),
                  )
                  .fold<double>(0, (sum, r) => sum + double.parse(r.amount));
          final due = double.parse(order.deliveryFee) - collected;
          if (due > 0) {
            await _db
                .into(_db.localPayments)
                .insert(
                  LocalPaymentsCompanion.insert(
                    id: _uuid.v4(),
                    merchantId: merchant,
                    orderId: id,
                    method: order.paymentMethod,
                    status: 'COMPLETED',
                    amount: due.toStringAsFixed(2),
                    purpose: const Value('DELIVERY'),
                    idempotencyKey: requestKey,
                    createdAt: now,
                  ),
                );
          }
        } else {
          var payments =
              await (_db.select(_db.localPayments)..where(
                    (t) =>
                        t.merchantId.equals(merchant) &
                        t.orderId.equals(id) &
                        t.purpose.equals('DELIVERY'),
                  ))
                  .get();
          final refunds =
              await (_db.select(_db.localRefunds)..where(
                    (t) => t.merchantId.equals(merchant) & t.orderId.equals(id),
                  ))
                  .get();
          final legacy = payments.isEmpty;
          if (legacy) {
            payments =
                await (_db.select(_db.localPayments)..where(
                      (t) =>
                          t.merchantId.equals(merchant) &
                          t.orderId.equals(id) &
                          t.purpose.equals('ORDER'),
                    ))
                    .get();
          }
          final pending = payments
              .where((p) => p.status == 'PENDING_AUTHORIZATION')
              .toList();
          for (final receipt in pending) {
            await (_db.update(_db.localPayments)..where(
                  (t) =>
                      t.merchantId.equals(merchant) & t.id.equals(receipt.id),
                ))
                .write(const LocalPaymentsCompanion(status: Value('VOIDED')));
          }
          var reversed = 0.0;
          for (final receipt in payments.where(
            (p) => [
              'COMPLETED',
              'CAPTURED',
              'PARTIALLY_REFUNDED',
            ].contains(p.status),
          )) {
            final remaining =
                double.parse(receipt.amount) -
                refunds
                    .where(
                      (r) =>
                          r.paymentId == receipt.id &&
                          !['FAILED', 'CANCELLED'].contains(r.status),
                    )
                    .fold<double>(0, (sum, r) => sum + double.parse(r.amount));
            final amount = legacy ? double.parse(order.deliveryFee) : remaining;
            if (amount <= 0) {
              continue;
            }
            if (legacy && remaining < double.parse(order.grandTotal)) {
              throw StateError(
                'No collected delivery amount is available to reverse.',
              );
            }
            await _db
                .into(_db.localRefunds)
                .insert(
                  LocalRefundsCompanion.insert(
                    id: _uuid.v4(),
                    merchantId: merchant,
                    paymentId: receipt.id,
                    orderId: id,
                    amount: amount.toStringAsFixed(2),
                    status: 'SUCCEEDED',
                    reason: const Value('Delivery payment status correction'),
                    idempotencyKey: '$requestKey:${receipt.id}',
                    createdAt: now,
                  ),
                );
            reversed += amount;
            if (legacy) {
              break;
            }
          }
          if (reversed <= 0 && pending.isEmpty) {
            throw StateError('No delivery receipt is available to reverse.');
          }
        }
      }
      await (_db.update(_db.localOrders)
            ..where((t) => t.merchantId.equals(merchant) & t.id.equals(id)))
          .write(LocalOrdersCompanion(deliveryPaymentStatus: Value(status)));
      await _saveSetting({'key': 'order-version:$merchant:$id', 'value': now});
      await _db
          .into(_db.localAuditEvents)
          .insert(
            LocalAuditEventsCompanion.insert(
              id: _uuid.v4(),
              merchantId: merchant,
              shopId: Value(shop),
              actorMembershipId: Value(payload['membership_id']?.toString()),
              action: 'DELIVERY_PAYMENT_UPDATED',
              entityType: 'orders',
              entityId: Value(id),
              beforeData: Value(
                jsonEncode({
                  'delivery_payment_status': order.deliveryPaymentStatus,
                }),
              ),
              afterData: Value(jsonEncode({'delivery_payment_status': status})),
              occurredAt: now,
            ),
          );
      await _db
          .into(_db.appMetadata)
          .insertOnConflictUpdate(
            AppMetadataCompanion.insert(
              key: key,
              value: signature,
              updatedAt: now,
            ),
          );
      return {
        'data': {'delivery_payment_status': status},
        'meta': <String, dynamic>{},
      };
    });
  }

  Future<String?> _getSetting(Map<String, dynamic> payload) async {
    final key = payload['key']?.toString() ?? '';
    if (key.isEmpty) return null;
    final row = await (_db.select(
      _db.appMetadata,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    if (row != null) return row.value;
    final companion = _companionKey(key);
    if (companion != null) {
      final companionRow = await (_db.select(
        _db.appMetadata,
      )..where((t) => t.key.equals(companion))).getSingleOrNull();
      return companionRow?.value;
    }
    return null;
  }

  String? _companionKey(String key) => switch (key) {
    'bc.theme' => 'theme',
    'theme' => 'bc.theme',
    'bc.layout' => 'layout',
    'layout' => 'bc.layout',
    _ => null,
  };

  Future<bool> _saveSetting(Map<String, dynamic> payload) async {
    final key = payload['key']?.toString() ?? '';
    final value = payload['value']?.toString() ?? '';
    if (key.isEmpty) return false;
    final now = DateTime.now().toUtc().toIso8601String();
    await _db
        .into(_db.appMetadata)
        .insertOnConflictUpdate(
          AppMetadataCompanion.insert(key: key, value: value, updatedAt: now),
        );
    final companion = _companionKey(key);
    if (companion != null) {
      await _db
          .into(_db.appMetadata)
          .insertOnConflictUpdate(
            AppMetadataCompanion.insert(
              key: companion,
              value: value,
              updatedAt: now,
            ),
          );
    }
    return true;
  }

  Future<List<Map<String, dynamic>>> _rawQuery(
    Map<String, dynamic> payload,
  ) async {
    final sql = payload['sql']?.toString() ?? '';
    final rawParams = (payload['params'] as List<dynamic>?) ?? [];
    final variables = rawParams.map((p) {
      if (p == null) return const Variable(null);
      if (p is int) return Variable.withInt(p);
      if (p is double) return Variable.withReal(p);
      if (p is bool) return Variable.withBool(p);
      if (p is Uint8List) return Variable.withBlob(p);
      return Variable.withString(p.toString());
    }).toList();

    final rows = await _db.customSelect(sql, variables: variables).get();
    return rows.map((r) => r.data).toList();
  }

  Future<int> _rawExecute(Map<String, dynamic> payload) async {
    final sql = payload['sql']?.toString() ?? '';
    final rawParams = (payload['params'] as List<dynamic>?) ?? [];
    await _db.customStatement(sql, rawParams);
    return 1;
  }

  Future<void> _resolve(
    String requestId, {
    Object? result,
    String? error,
  }) async {
    final runJavaScript = _runJavaScript;
    if (requestId.isEmpty || runJavaScript == null) return;
    await runJavaScript(
      'if (window.__businessCentralNativeDatabaseResolve) { '
      'window.__businessCentralNativeDatabaseResolve('
      '${jsonEncode(requestId)}, ${jsonEncode(result)}, ${jsonEncode(error)}); '
      '}',
    );
  }
}
