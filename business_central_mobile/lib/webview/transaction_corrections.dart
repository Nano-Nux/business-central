part of 'native_database_bridge.dart';

extension TransactionCorrections on NativeDatabaseBridge {
  Future<void> _requireTransactionOwner(Map<String, dynamic> payload) async {
    final rows = await _db
        .customSelect(
          '''SELECT um.id FROM user_memberships um
      JOIN membership_roles mr ON mr.merchant_id=um.merchant_id AND mr.membership_id=um.id
      JOIN roles r ON r.merchant_id=mr.merchant_id AND r.id=mr.role_id
      JOIN role_permissions rp ON rp.role_id=r.id AND rp.permission_code='tenant.write'
      WHERE um.merchant_id=? AND um.id=? AND um.is_active=1 AND r.code IN ('merchant','owner')
      AND (um.shop_id IS NULL OR um.shop_id=?)''',
          variables: [
            Variable.withString(payload['merchant_id']?.toString() ?? ''),
            Variable.withString(payload['membership_id']?.toString() ?? ''),
            Variable.withString(payload['shop_id']?.toString() ?? ''),
          ],
        )
        .get();
    if (rows.isEmpty) {
      throw StateError(
        'Only merchant owners with tenant.write can correct transactions.',
      );
    }
  }

  Future<Map<String, dynamic>> _transactionCatalog(
    Map<String, dynamic> payload,
  ) async {
    final variants =
        await (_db.select(_db.cachedCatalogVariants)..where(
              (t) =>
                  t.merchantId.equals(payload['merchant_id']?.toString() ?? ''),
            ))
            .get();
    final products =
        await (_db.select(_db.cachedCatalogProducts)..where(
              (t) =>
                  t.merchantId.equals(payload['merchant_id']?.toString() ?? ''),
            ))
            .get();
    return {
      'data': variants
          .map(
            (v) => {
              'id': v.id,
              'product_name':
                  products
                      .where((p) => p.id == v.productId)
                      .firstOrNull
                      ?.name ??
                  v.name,
              'name': v.name,
              'sku': v.sku,
              'price': v.price ?? '0',
            },
          )
          .toList(),
      'meta': {'total_pages': 1},
    };
  }

  Future<Map<String, dynamic>> _correctTransaction(
    Map<String, dynamic> payload, {
    bool deleting = false,
  }) async {
    await _requireTransactionOwner(payload);
    final merchant = payload['merchant_id']?.toString() ?? '';
    final shop = payload['shop_id']?.toString() ?? '';
    final id = payload['id']?.toString() ?? '';
    final key = payload['idempotency_key']?.toString() ?? '';
    if (key.isEmpty || id.isEmpty || shop.isEmpty || merchant.isEmpty) {
      throw StateError('Correction scope and idempotency key are required.');
    }
    final signature = sha256
        .convert(utf8.encode(jsonEncode(payload)))
        .toString();
    final marker =
        'transaction-correction:$merchant:$shop:${deleting ? 'delete' : 'edit'}:$key';
    return _db.transaction(() async {
      final previous = await _getSetting({'key': marker});
      if (previous != null) {
        if (previous != signature) {
          throw StateError('Correction idempotency conflict.');
        }
        return {
          'data': {'id': id, 'deleted': deleting},
          'meta': <String, dynamic>{},
        };
      }
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
      final version =
          await _getSetting({'key': 'order-version:$merchant:$id'}) ??
          order.createdAt;
      if (payload['expected_updated_at'] != version) {
        throw StateError(
          'Transaction changed. Refresh before editing or deleting it.',
        );
      }
      await _saveSetting({
        'key': 'deleted-checkout:$merchant:${order.idempotencyKey}',
        'value': id,
      });
      final oldLines =
          await (_db.select(_db.localOrderLines)..where(
                (t) => t.merchantId.equals(merchant) & t.orderId.equals(id),
              ))
              .get();
      final movements =
          await (_db.select(_db.localInventoryMovements)..where(
                (t) =>
                    t.merchantId.equals(merchant) &
                    (t.orderLineId.isIn(oldLines.map((l) => l.id).toList()) |
                        t.eventKey.isIn(
                          oldLines
                              .map((l) => "pos_sale_${id}_${l.id}")
                              .toList(),
                        )),
              ))
              .get();
      if (movements.any(
        (m) => m.movementType == 'RETURN' || m.movementType == 'REVERSAL',
      )) {
        throw StateError(
          'Correct dependent return or reversal stock before changing this transaction.',
        );
      }
      final movementIds = movements.map((m) => m.id).toList();
      final allocations =
          await (_db.select(_db.localInventoryCostAllocations)..where(
                (t) =>
                    t.merchantId.equals(merchant) &
                    t.consumptionMovementId.isIn(movementIds),
              ))
              .get();
      final allocationIds = allocations.map((a) => a.id).toList();
      final restoredLayers =
          await (_db.select(_db.localInventoryCostLayers)..where(
                (t) =>
                    t.merchantId.equals(merchant) &
                    t.restoredFromAllocationId.isIn(allocationIds),
              ))
              .get();
      if (restoredLayers.isNotEmpty) {
        throw StateError(
          'Correct dependent return stock before changing this transaction.',
        );
      }
      for (final a in allocations) {
        final layer =
            await (_db.select(_db.localInventoryCostLayers)..where(
                  (t) =>
                      t.merchantId.equals(merchant) &
                      t.id.equals(a.costLayerId),
                ))
                .getSingle();
        await (_db.update(_db.localInventoryCostLayers)..where(
              (t) => t.merchantId.equals(merchant) & t.id.equals(layer.id),
            ))
            .write(
              LocalInventoryCostLayersCompanion(
                quantityRemaining: Value(
                  (double.parse(layer.quantityRemaining) +
                          double.parse(a.quantity))
                      .toStringAsFixed(6),
                ),
              ),
            );
      }
      for (final line in oldLines) {
        final variant =
            await (_db.select(_db.cachedCatalogVariants)..where(
                  (t) =>
                      t.merchantId.equals(merchant) &
                      t.id.equals(line.variantId),
                ))
                .getSingleOrNull();
        if (variant != null && variant.quantityOnHand != null) {
          await (_db.update(_db.cachedCatalogVariants)..where(
                (t) => t.merchantId.equals(merchant) & t.id.equals(variant.id),
              ))
              .write(
                CachedCatalogVariantsCompanion(
                  quantityOnHand: Value(
                    (double.parse(variant.quantityOnHand!) + line.quantity)
                        .toStringAsFixed(6),
                  ),
                ),
              );
        }
      }
      await (_db.delete(_db.localInventoryCostAllocations)..where(
            (t) =>
                t.merchantId.equals(merchant) &
                t.consumptionMovementId.isIn(movementIds),
          ))
          .go();
      await (_db.delete(_db.localInventoryMovements)..where(
            (t) => t.merchantId.equals(merchant) & t.id.isIn(movementIds),
          ))
          .go();
      await (_db.delete(
            _db.localRefunds,
          )..where((t) => t.merchantId.equals(merchant) & t.orderId.equals(id)))
          .go();
      await (_db.delete(
            _db.localPayments,
          )..where((t) => t.merchantId.equals(merchant) & t.orderId.equals(id)))
          .go();
      await (_db.delete(
            _db.localOrderPromotions,
          )..where((t) => t.merchantId.equals(merchant) & t.orderId.equals(id)))
          .go();
      await (_db.delete(
            _db.localOrderLines,
          )..where((t) => t.merchantId.equals(merchant) & t.orderId.equals(id)))
          .go();
      await (_db.delete(_db.localAuditEvents)..where(
            (t) => t.merchantId.equals(merchant) & t.entityId.equals(id),
          ))
          .go();
      await (_db.delete(
        _db.localOrders,
      )..where((t) => t.merchantId.equals(merchant) & t.id.equals(id))).go();
      if (!deleting) {
        final rawLines = payload['lines'] as List<dynamic>? ?? [];
        if (rawLines.isEmpty) {
          throw StateError('At least one item is required.');
        }
        double subtotal = 0, discount = 0, tax = 0;
        final prepared = <Map<String, dynamic>>[];
        final requested = <String, int>{};
        for (final raw in rawLines) {
          final line = Map<String, dynamic>.from(raw as Map);
          final variantId = line['variant_id']?.toString() ?? '';
          final qty = double.tryParse(line['quantity'].toString());
          final price = double.tryParse(line['unit_price'].toString());
          final d = double.tryParse(line['discount_amount']?.toString() ?? '0');
          final t = double.tryParse(line['tax_amount']?.toString() ?? '0');
          if (qty == null ||
              !qty.isFinite ||
              qty <= 0 ||
              qty != qty.truncateToDouble() ||
              price == null ||
              !price.isFinite ||
              price < 0 ||
              d == null ||
              !d.isFinite ||
              d < 0 ||
              d > qty * price ||
              t == null ||
              !t.isFinite ||
              t < 0) {
            throw StateError(
              'Items require positive whole quantities and valid prices, discounts and tax.',
            );
          }
          final variant =
              await (_db.select(_db.cachedCatalogVariants)..where(
                    (v) =>
                        v.merchantId.equals(merchant) & v.id.equals(variantId),
                  ))
                  .getSingleOrNull();
          if (variant == null) {
            throw StateError('Item is not available to this merchant.');
          }
          final product =
              await (_db.select(_db.cachedCatalogProducts)..where(
                    (p) =>
                        p.merchantId.equals(merchant) &
                        p.id.equals(variant.productId),
                  ))
                  .getSingleOrNull();
          if (product == null || !product.isActive) {
            throw StateError('Item is not active for this merchant.');
          }
          requested[variantId] = (requested[variantId] ?? 0) + qty.toInt();
          if (variant.isStockTracked &&
              requested[variantId]! >
                  double.parse(variant.quantityOnHand ?? '0')) {
            throw StateError('Insufficient stock for ${variant.name}.');
          }
          final gross = double.parse((qty * price).toStringAsFixed(2));
          subtotal += gross;
          discount += d;
          tax += t;
          prepared.add({
            ...line,
            'id': NativeDatabaseBridge._uuid.v4(),
            'quantity': qty.toInt(),
            'name': variant.name,
            'sku': variant.sku,
            'line_total': (gross - d + t).toStringAsFixed(2),
          });
        }
        final fee = double.tryParse(payload['delivery_fee']?.toString() ?? '0');
        if (fee == null || !fee.isFinite || fee < 0) {
          throw StateError('Invalid delivery fee.');
        }
        final grand = subtotal - discount + tax + fee;
        if (grand <= 0) throw StateError('Order total must be positive.');
        await _checkout({
          'correction': true,
          'order': {
            'id': id,
            'number': order.number,
            'merchant_id': merchant,
            'shop_id': shop,
            'currency_code': order.currencyCode,
            'subtotal': subtotal.toStringAsFixed(2),
            'discount_total': discount.toStringAsFixed(2),
            'tax_total': tax.toStringAsFixed(2),
            'grand_total': grand.toStringAsFixed(2),
            'delivery_fee': fee.toStringAsFixed(2),
            'delivery_payment_status': payload['delivery_payment_status'],
            'payment_method': payload['payment_method'],
            'customer_name': payload['customer_name'],
            'customer_phone': payload['customer_phone'],
            'note': payload['note'],
            'idempotency_key': 'correction:$key',
            'lines': prepared,
          },
        });
        await (_db.update(_db.localOrders)
              ..where((t) => t.merchantId.equals(merchant) & t.id.equals(id)))
            .write(LocalOrdersCompanion(createdAt: Value(order.createdAt)));
        await _saveSetting({
          'key': 'order-version:$merchant:$id',
          'value': DateTime.now().toUtc().toIso8601String(),
        });
        await _saveSetting({
          'key': 'order-delivery:$merchant:$id',
          'value': jsonEncode({
            'delivery_name': payload['delivery_name'],
            'delivery_contact': payload['delivery_contact'],
          }),
        });
      } else {
        await (_db.delete(_db.appMetadata)..where(
              (t) => t.key.isIn([
                'order-version:$merchant:$id',
                'order-delivery:$merchant:$id',
              ]),
            ))
            .go();
      }
      await _saveSetting({'key': marker, 'value': signature});
      return {
        'data': {'id': id, 'deleted': deleting},
        'meta': <String, dynamic>{},
      };
    });
  }
}
