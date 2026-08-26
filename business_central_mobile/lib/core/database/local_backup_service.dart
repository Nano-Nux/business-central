import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';

import 'app_database.dart';

class LocalBackupException implements Exception {
  const LocalBackupException(this.message);
  final String message;
  @override
  String toString() => 'LocalBackupException: $message';
}

/// Exports/restores local operational data without exporting credentials or
/// authorization assignments. The caller must authenticate the local owner
/// before restoring into the matching merchant.
class LocalBackupService {
  LocalBackupService(this.database);
  final AppDatabase database;

  Future<String> exportMerchant({required String merchantId}) async {
    final merchant = await (database.select(
      database.merchants,
    )..where((row) => row.id.equals(merchantId))).getSingleOrNull();
    if (merchant == null) {
      throw const LocalBackupException('Merchant not found.');
    }
    final shops = await (database.select(
      database.shops,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final merchantSettings = await (database.select(
      database.merchantSettings,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final locations = await (database.select(
      database.locations,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final categories = await (database.select(
      database.cachedCatalogCategories,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final products = await (database.select(
      database.cachedCatalogProducts,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final links = await (database.select(
      database.cachedCatalogProductCategories,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final variants = await (database.select(
      database.cachedCatalogVariants,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final promotions = await (database.select(
      database.localPromotions,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final promotionCodes = await (database.select(
      database.localPromotionCodes,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final promotionScopes = await (database.select(
      database.localPromotionScopes,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final measurementUnits = await (database.select(
      database.localMeasurementUnits,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final measurementConversions = await (database.select(
      database.localMeasurementConversions,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final deliveries = await (database.select(
      database.localDeliveries,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final orders = await (database.select(
      database.localOrders,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final orderLines = await (database.select(
      database.localOrderLines,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final orderPromotions = await (database.select(
      database.localOrderPromotions,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final movements = await (database.select(
      database.localInventoryMovements,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final costLayers = await (database.select(
      database.localInventoryCostLayers,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final costAllocations = await (database.select(
      database.localInventoryCostAllocations,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final payments = await (database.select(
      database.localPayments,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final refunds = await (database.select(
      database.localRefunds,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final auditEvents = await (database.select(
      database.localAuditEvents,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final serviceRecords = await (database.select(
      database.localServiceRecords,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final repairRecords = await (database.select(
      database.localRepairRecords,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final priceLists = await (database.select(
      database.localPriceLists,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final prices = await (database.select(
      database.localPrices,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final canonicalRecords = await (database.select(
      database.localCanonicalRecords,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final queuedOperations = await (database.select(
      database.operationQueue,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final data = <String, Object?>{
      'format': 'business-central-mobile-local-backup',
      'schema_version': database.schemaVersion,
      'merchant_id': merchantId,
      'merchant': {
        'id': merchant.id,
        'name': merchant.name,
        'slug': merchant.slug,
        'currency_code': merchant.currencyCode,
        'created_at': merchant.createdAt,
      },
      'shops': [
        for (final row in shops)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'name': row.name,
            'code': row.code,
            'footer_note': row.footerNote,
            'timezone': row.timezone,
            'is_active': row.isActive,
            'created_at': row.createdAt,
          },
      ],
      'merchant_settings': [
        for (final row in merchantSettings)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'setting_key': row.settingKey,
            'value_type': row.valueType,
            'value_json': row.valueJson,
            'updated_at': row.updatedAt,
          },
      ],
      'locations': [
        for (final row in locations)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'code': row.code,
            'name': row.name,
            'location_type': row.locationType,
            'is_active': row.isActive,
            'created_at': row.createdAt,
          },
      ],
      'categories': [
        for (final row in categories)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'parent_category_id': row.parentCategoryId,
            'name': row.name,
            'slug': row.slug,
            'sort_order': row.sortOrder,
            'is_active': row.isActive,
            'updated_at': row.updatedAt,
          },
      ],
      'products': [
        for (final row in products)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'name': row.name,
            'product_type': row.productType,
            'is_active': row.isActive,
            'updated_at': row.updatedAt,
          },
      ],
      'product_categories': [
        for (final row in links)
          {
            'merchant_id': row.merchantId,
            'product_id': row.productId,
            'category_id': row.categoryId,
          },
      ],
      'variants': [
        for (final row in variants)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'product_id': row.productId,
            'sku': row.sku,
            'barcode': row.barcode,
            'name': row.name,
            'base_unit_id': row.baseUnitId,
            'unit_of_measure': row.unitOfMeasure,
            'is_stock_tracked': row.isStockTracked,
            'quantity_on_hand': row.quantityOnHand,
            'price': row.price,
            'updated_at': row.updatedAt,
          },
      ],
      'promotions': [
        for (final row in promotions)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'name': row.name,
            'promotion_type': row.promotionType,
            'value': row.value,
            'minimum_subtotal': row.minimumSubtotal,
            'usage_limit': row.usageLimit,
            'redemption_count': row.redemptionCount,
            'starts_at': row.startsAt?.toUtc().toIso8601String(),
            'ends_at': row.endsAt?.toUtc().toIso8601String(),
            'is_active': row.isActive,
            'created_at': row.createdAt,
          },
      ],
      'promotion_codes': [
        for (final row in promotionCodes)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'promotion_id': row.promotionId,
            'code': row.code,
            'is_active': row.isActive,
            'usage_limit': row.usageLimit,
            'redemption_count': row.redemptionCount,
            'created_at': row.createdAt,
          },
      ],
      'promotion_scopes': [
        for (final row in promotionScopes)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'promotion_id': row.promotionId,
            'product_id': row.productId,
            'variant_id': row.variantId,
            'created_at': row.createdAt,
          },
      ],
      'measurement_units': [
        for (final row in measurementUnits)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'code': row.code,
            'name': row.name,
            'symbol': row.symbol,
            'dimension_code': row.dimensionCode,
            'allows_decimal': row.allowsDecimal,
            'is_active': row.isActive,
            'created_at': row.createdAt,
          },
      ],
      'measurement_conversions': [
        for (final row in measurementConversions)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'from_unit_id': row.fromUnitId,
            'to_unit_id': row.toUnitId,
            'multiplier': row.multiplier,
            'additive_offset': row.additiveOffset,
            'is_active': row.isActive,
            'created_at': row.createdAt,
          },
      ],
      'deliveries': [
        for (final row in deliveries)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'name': row.name,
            'contact_info': row.contactInfo,
            'is_active': row.isActive,
            'created_at': row.createdAt,
          },
      ],
      'orders': [
        for (final row in orders)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'number': row.number,
            'status': row.status,
            'currency_code': row.currencyCode,
            'subtotal': row.subtotal,
            'discount_total': row.discountTotal,
            'tax_total': row.taxTotal,
            'grand_total': row.grandTotal,
            'payment_method': row.paymentMethod,
            'customer_name': row.customerName,
            'customer_phone': row.customerPhone,
            'delivery_id': row.deliveryId,
            'note': row.note,
            'idempotency_key': row.idempotencyKey,
            'created_at': row.createdAt,
          },
      ],
      'order_lines': [
        for (final row in orderLines)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'order_id': row.orderId,
            'variant_id': row.variantId,
            'sku': row.sku,
            'name': row.name,
            'unit_price': row.unitPrice,
            'quantity': row.quantity,
            'discount_amount': row.discountAmount,
            'tax_amount': row.taxAmount,
            'line_total': row.lineTotal,
          },
      ],
      'order_promotions': [
        for (final row in orderPromotions)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'order_id': row.orderId,
            'promotion_id': row.promotionId,
            'discount_amount': row.discountAmount,
            'created_at': row.createdAt,
          },
      ],
      'inventory_movements': [
        for (final row in movements)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'variant_id': row.variantId,
            'movement_type': row.movementType,
            'source_location_id': row.sourceLocationId,
            'destination_location_id': row.destinationLocationId,
            'quantity': row.quantity,
            'unit_id': row.unitId,
            'entered_quantity': row.enteredQuantity,
            'unit_cost': row.unitCost,
            'receipt_line_id': row.receiptLineId,
            'purchase_order_id': row.purchaseOrderId,
            'purchase_order_line_id': row.purchaseOrderLineId,
            'receipt_number': row.receiptNumber,
            'batch_number': row.batchNumber,
            'expires_at': row.expiresAt,
            'total_cost': row.totalCost,
            'event_key': row.eventKey,
            'order_line_id': row.orderLineId,
            'reverses_movement_id': row.reversesMovementId,
            'occurred_at': row.occurredAt,
            'created_at': row.createdAt,
          },
      ],
      'inventory_cost_layers': [
        for (final row in costLayers)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'variant_id': row.variantId,
            'location_id': row.locationId,
            'receipt_movement_id': row.receiptMovementId,
            'receipt_line_id': row.receiptLineId,
            'quantity_received': row.quantityReceived,
            'quantity_remaining': row.quantityRemaining,
            'unit_cost': row.unitCost,
            'transferred_from_layer_id': row.transferredFromLayerId,
            'restored_from_allocation_id': row.restoredFromAllocationId,
            'created_at': row.createdAt,
          },
      ],
      'inventory_cost_allocations': [
        for (final row in costAllocations)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'consumption_movement_id': row.consumptionMovementId,
            'cost_layer_id': row.costLayerId,
            'quantity': row.quantity,
            'unit_cost': row.unitCost,
            'total_cost': row.totalCost,
            'created_at': row.createdAt,
          },
      ],
      'payments': [
        for (final row in payments)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'order_id': row.orderId,
            'method': row.method,
            'status': row.status,
            'amount': row.amount,
            'provider_reference': row.providerReference,
            'idempotency_key': row.idempotencyKey,
            'captured_at': row.capturedAt,
            'created_at': row.createdAt,
          },
      ],
      'refunds': [
        for (final row in refunds)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'payment_id': row.paymentId,
            'order_id': row.orderId,
            'amount': row.amount,
            'status': row.status,
            'reason': row.reason,
            'idempotency_key': row.idempotencyKey,
            'created_at': row.createdAt,
          },
      ],
      'audit_events': [
        for (final row in auditEvents)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'actor_membership_id': row.actorMembershipId,
            'action': row.action,
            'entity_type': row.entityType,
            'entity_id': row.entityId,
            'before_data': row.beforeData == null
                ? null
                : jsonDecode(row.beforeData!),
            'after_data': row.afterData == null
                ? null
                : jsonDecode(row.afterData!),
            'request_id': row.requestId,
            'occurred_at': row.occurredAt,
          },
      ],
      'service_records': [
        for (final row in serviceRecords)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'entity_type': row.entityType,
            'parent_id': row.parentId,
            'service_id': row.serviceId,
            'code': row.code,
            'name': row.name,
            'description': row.description,
            'order_number': row.orderNumber,
            'service_type': row.serviceType,
            'priority': row.priority,
            'status': row.status,
            'is_active': row.isActive,
            'quantity': row.quantity,
            'amount': row.amount,
            'starts_at': row.startsAt,
            'ends_at': row.endsAt,
            'duration_minutes': row.durationMinutes,
            'created_at': row.createdAt,
          },
      ],
      'repair_records': [
        for (final row in repairRecords)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'record_type': row.recordType,
            'parent_id': row.parentId,
            'work_item_id': row.workItemId,
            'order_number': row.orderNumber,
            'device_id': row.deviceId,
            'device_type': row.deviceType,
            'manufacturer': row.manufacturer,
            'model': row.model,
            'serial_number': row.serialNumber,
            'issue_description': row.issueDescription,
            'priority': row.priority,
            'customer_name': row.customerName,
            'customer_phone': row.customerPhone,
            'status': row.status,
            'payment_status': row.paymentStatus,
            'total_cost': row.totalCost,
            'labor_fee': row.laborFee,
            'additional_fee': row.additionalFee,
            'tax_amount': row.taxAmount,
            'diagnosis': row.diagnosis,
            'estimated_cost': row.estimatedCost,
            'kind': row.kind,
            'method': row.method,
            'amount': row.amount,
            'note': row.note,
            'custom_fields': row.customFields,
            'ticket_fields': row.ticketFields,
            'created_at': row.createdAt,
          },
      ],
      'price_lists': [
        for (final row in priceLists)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'code': row.code,
            'currency_code': row.currencyCode,
            'is_default': row.isDefault,
            'created_at': row.createdAt,
          },
      ],
      'prices': [
        for (final row in prices)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'price_list_id': row.priceListId,
            'variant_id': row.variantId,
            'amount': row.amount,
            'valid_from': row.validFrom,
            'valid_until': row.validUntil,
          },
      ],
      'canonical_records': [
        for (final row in canonicalRecords)
          {
            'id': row.id,
            'merchant_id': row.merchantId,
            'entity_type': row.entityType,
            'entity_id': row.entityId,
            'shop_id': row.shopId,
            'payload': jsonDecode(row.payloadJson),
            'source_version': row.sourceVersion,
            'is_deleted': row.isDeleted,
            'created_at': row.createdAt,
            'updated_at': row.updatedAt,
          },
      ],
      'operation_queue': [
        for (final row in queuedOperations)
          {
            'operation_id': row.operationId,
            'merchant_id': row.merchantId,
            'shop_id': row.shopId,
            'device_id': row.deviceId,
            'entity_type': row.entityType,
            'entity_id': row.entityId,
            'operation_type': row.operationType,
            'payload': jsonDecode(row.payload),
            'payload_hash': row.payloadHash,
            'base_version': row.baseVersion,
            'client_created_at': row.clientCreatedAt,
            'dependency_operation_id': row.dependencyOperationId,
            'status': row.status,
            'retry_count': row.retryCount,
            'next_retry_at': row.nextRetryAt,
            'last_error': row.lastError,
          },
      ],
    };
    data['checksum'] = _checksum(data);
    return jsonEncode(data);
  }

  Future<void> restoreMerchant({
    required String merchantId,
    required String payload,
  }) async {
    final decoded = jsonDecode(payload);
    if (decoded is! Map) {
      throw const LocalBackupException('Backup must be a JSON object.');
    }
    final data = Map<String, Object?>.from(decoded);
    if (data['format'] != 'business-central-mobile-local-backup' ||
        data['merchant_id'] != merchantId) {
      throw const LocalBackupException(
        'Backup format or merchant scope is invalid.',
      );
    }
    final checksum = data.remove('checksum');
    if (checksum is! String || checksum != _checksum(data)) {
      throw const LocalBackupException('Backup checksum is invalid.');
    }
    if ((data['schema_version'] as num?)?.toInt() != database.schemaVersion) {
      throw const LocalBackupException(
        'Backup schema version is incompatible.',
      );
    }
    await _requireRowsInMerchant(data, merchantId);
    await database.transaction(() async {
      await _restoreShops(data['shops'], merchantId);
      await _restoreMerchantSettings(data['merchant_settings'], merchantId);
      await _restoreLocations(data['locations'], merchantId);
      await _restoreCategories(data['categories'], merchantId);
      await _restoreProducts(data['products'], merchantId);
      await _restoreLinks(data['product_categories'], merchantId);
      await _restoreMeasurementUnits(data['measurement_units'], merchantId);
      await _restoreMeasurementConversions(
        data['measurement_conversions'],
        merchantId,
      );
      await _restoreDeliveries(data['deliveries'], merchantId);
      await _restoreVariants(data['variants'], merchantId);
      await _restorePromotions(data['promotions'], merchantId);
      await _restorePromotionCodes(data['promotion_codes'], merchantId);
      await _restorePromotionScopes(data['promotion_scopes'], merchantId);
      await _restoreOrders(data['orders'], merchantId);
      await _restoreOrderLines(data['order_lines'], merchantId);
      await _restoreOrderPromotions(data['order_promotions'], merchantId);
      await _restoreMovements(data['inventory_movements'], merchantId);
      await _restoreCostLayers(data['inventory_cost_layers'], merchantId);
      await _restoreCostAllocations(
        data['inventory_cost_allocations'],
        merchantId,
      );
      await _restorePayments(data['payments'], merchantId);
      await _restoreRefunds(data['refunds'], merchantId);
      await _restoreAuditEvents(data['audit_events'], merchantId);
      await _restoreServiceRecords(data['service_records'], merchantId);
      await _restoreRepairRecords(data['repair_records'], merchantId);
      await _restorePriceLists(data['price_lists'], merchantId);
      await _restorePrices(data['prices'], merchantId);
      await _restoreCanonicalRecords(data['canonical_records'], merchantId);
      await _restoreOperationQueue(data['operation_queue'], merchantId);
    });
  }

  String _checksum(Map<String, Object?> data) {
    return sha256.convert(utf8.encode(jsonEncode(data))).toString();
  }

  Future<void> _requireRowsInMerchant(
    Map<String, Object?> data,
    String merchantId,
  ) async {
    for (final key in const [
      'shops',
      'merchant_settings',
      'locations',
      'categories',
      'products',
      'product_categories',
      'variants',
      'promotions',
      'promotion_codes',
      'promotion_scopes',
      'measurement_units',
      'measurement_conversions',
      'deliveries',
      'orders',
      'order_lines',
      'order_promotions',
      'inventory_movements',
      'inventory_cost_layers',
      'inventory_cost_allocations',
      'payments',
      'refunds',
      'audit_events',
      'service_records',
      'repair_records',
      'price_lists',
      'prices',
      'canonical_records',
      'operation_queue',
    ]) {
      final rows = data[key];
      if (rows is! List) {
        throw LocalBackupException('Backup field $key is invalid.');
      }
      for (final value in rows) {
        if (value is! Map) {
          throw LocalBackupException('Backup field $key has an invalid row.');
        }
        final row = Map<String, Object?>.from(value);
        if (row['merchant_id'] != merchantId) {
          throw LocalBackupException(
            'Backup field $key crosses merchant scope.',
          );
        }
      }
    }
  }

  Future<void> _restoreCanonicalRecords(
    Object? value,
    String merchantId,
  ) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localCanonicalRecords)
          .insertOnConflictUpdate(
            LocalCanonicalRecordsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              entityType: _string(row, 'entity_type'),
              entityId: _string(row, 'entity_id'),
              shopId: Value(_nullable(row, 'shop_id')),
              payloadJson: jsonEncode(row['payload']),
              sourceVersion: Value(_nullableInt(row, 'source_version')),
              isDeleted: Value(_bool(row, 'is_deleted')),
              createdAt: _string(row, 'created_at'),
              updatedAt: _string(row, 'updated_at'),
            ),
          );
    }
  }

  Future<void> _restoreOperationQueue(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.operationQueue)
          .insertOnConflictUpdate(
            OperationQueueCompanion.insert(
              operationId: _string(row, 'operation_id'),
              merchantId: merchantId,
              shopId: Value(_nullable(row, 'shop_id')),
              deviceId: _string(row, 'device_id'),
              entityType: _string(row, 'entity_type'),
              entityId: _string(row, 'entity_id'),
              operationType: _string(row, 'operation_type'),
              payload: jsonEncode(row['payload']),
              payloadHash: _string(row, 'payload_hash'),
              baseVersion: Value(_nullableInt(row, 'base_version')),
              clientCreatedAt: _string(row, 'client_created_at'),
              dependencyOperationId: Value(
                _nullable(row, 'dependency_operation_id'),
              ),
              status: _string(row, 'status'),
              retryCount: Value(_int(row, 'retry_count')),
              nextRetryAt: Value(_nullable(row, 'next_retry_at')),
              lastError: Value(_nullable(row, 'last_error')),
            ),
          );
    }
  }

  Future<void> _restoreMerchantSettings(
    Object? value,
    String merchantId,
  ) async {
    for (final row in _rows(value)) {
      await database
          .into(database.merchantSettings)
          .insertOnConflictUpdate(
            MerchantSettingsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: Value(_nullable(row, 'shop_id')),
              settingKey: _string(row, 'setting_key'),
              valueType: _string(row, 'value_type'),
              valueJson: _string(row, 'value_json'),
              updatedAt: _string(row, 'updated_at'),
            ),
          );
    }
  }

  Future<void> _restoreShops(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.shops)
          .insertOnConflictUpdate(
            ShopsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              name: _string(row, 'name'),
              code: _string(row, 'code'),
              footerNote: Value(_nullable(row, 'footer_note') ?? ''),
              timezone: Value(_nullable(row, 'timezone') ?? 'UTC'),
              isActive: Value(_bool(row, 'is_active')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreLocations(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.locations)
          .insertOnConflictUpdate(
            LocationsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: Value(_nullable(row, 'shop_id')),
              code: _string(row, 'code'),
              name: _string(row, 'name'),
              locationType: _string(row, 'location_type'),
              isActive: Value(_bool(row, 'is_active')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreCategories(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.cachedCatalogCategories)
          .insertOnConflictUpdate(
            CachedCatalogCategoriesCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              parentCategoryId: Value(_nullable(row, 'parent_category_id')),
              name: _string(row, 'name'),
              slug: _string(row, 'slug'),
              sortOrder: Value(_int(row, 'sort_order')),
              isActive: Value(_bool(row, 'is_active')),
              updatedAt: _string(row, 'updated_at'),
            ),
          );
    }
  }

  Future<void> _restoreProducts(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.cachedCatalogProducts)
          .insertOnConflictUpdate(
            CachedCatalogProductsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              name: _string(row, 'name'),
              productType: _string(row, 'product_type'),
              isActive: Value(_bool(row, 'is_active')),
              updatedAt: _string(row, 'updated_at'),
            ),
          );
    }
  }

  Future<void> _restoreLinks(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.cachedCatalogProductCategories)
          .insertOnConflictUpdate(
            CachedCatalogProductCategoriesCompanion.insert(
              merchantId: merchantId,
              productId: _string(row, 'product_id'),
              categoryId: _string(row, 'category_id'),
            ),
          );
    }
  }

  Future<void> _restoreVariants(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.cachedCatalogVariants)
          .insertOnConflictUpdate(
            CachedCatalogVariantsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              productId: _string(row, 'product_id'),
              sku: _string(row, 'sku'),
              barcode: Value(_nullable(row, 'barcode')),
              name: _string(row, 'name'),
              baseUnitId: _string(row, 'base_unit_id'),
              unitOfMeasure: _string(row, 'unit_of_measure'),
              isStockTracked: Value(_bool(row, 'is_stock_tracked')),
              quantityOnHand: Value(_nullable(row, 'quantity_on_hand')),
              price: Value(_nullable(row, 'price')),
              updatedAt: _string(row, 'updated_at'),
            ),
          );
    }
  }

  Future<void> _restorePromotions(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localPromotions)
          .insertOnConflictUpdate(
            LocalPromotionsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              name: _string(row, 'name'),
              promotionType: _string(row, 'promotion_type'),
              value: _string(row, 'value'),
              minimumSubtotal: Value(_string(row, 'minimum_subtotal')),
              usageLimit: Value(_nullableInt(row, 'usage_limit')),
              redemptionCount: Value(_int(row, 'redemption_count')),
              startsAt: Value(_dateTime(row, 'starts_at')),
              endsAt: Value(_dateTime(row, 'ends_at')),
              isActive: Value(_bool(row, 'is_active')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restorePromotionCodes(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localPromotionCodes)
          .insertOnConflictUpdate(
            LocalPromotionCodesCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              promotionId: _string(row, 'promotion_id'),
              code: _string(row, 'code'),
              isActive: Value(_bool(row, 'is_active')),
              usageLimit: Value(_nullableInt(row, 'usage_limit')),
              redemptionCount: Value(_int(row, 'redemption_count')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restorePromotionScopes(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localPromotionScopes)
          .insertOnConflictUpdate(
            LocalPromotionScopesCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              promotionId: _string(row, 'promotion_id'),
              productId: _string(row, 'product_id'),
              variantId: Value(_nullable(row, 'variant_id')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreMeasurementUnits(
    Object? value,
    String merchantId,
  ) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localMeasurementUnits)
          .insertOnConflictUpdate(
            LocalMeasurementUnitsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              code: _string(row, 'code'),
              name: _string(row, 'name'),
              symbol: Value(_nullable(row, 'symbol')),
              dimensionCode: _string(row, 'dimension_code'),
              allowsDecimal: Value(_bool(row, 'allows_decimal')),
              isActive: Value(_bool(row, 'is_active')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreMeasurementConversions(
    Object? value,
    String merchantId,
  ) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localMeasurementConversions)
          .insertOnConflictUpdate(
            LocalMeasurementConversionsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              fromUnitId: _string(row, 'from_unit_id'),
              toUnitId: _string(row, 'to_unit_id'),
              multiplier: _string(row, 'multiplier'),
              additiveOffset: _string(row, 'additive_offset'),
              isActive: Value(_bool(row, 'is_active')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreDeliveries(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localDeliveries)
          .insertOnConflictUpdate(
            LocalDeliveriesCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: _string(row, 'shop_id'),
              name: _string(row, 'name'),
              contactInfo: _string(row, 'contact_info'),
              isActive: Value(_bool(row, 'is_active')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreOrders(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localOrders)
          .insertOnConflictUpdate(
            LocalOrdersCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: _string(row, 'shop_id'),
              number: _string(row, 'number'),
              status: _string(row, 'status'),
              currencyCode: _string(row, 'currency_code'),
              subtotal: _string(row, 'subtotal'),
              discountTotal: _string(row, 'discount_total'),
              taxTotal: _string(row, 'tax_total'),
              grandTotal: _string(row, 'grand_total'),
              paymentMethod: _string(row, 'payment_method'),
              customerName: Value(_nullable(row, 'customer_name')),
              customerPhone: Value(_nullable(row, 'customer_phone')),
              deliveryId: Value(_nullable(row, 'delivery_id')),
              note: Value(_nullable(row, 'note')),
              idempotencyKey: _string(row, 'idempotency_key'),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreOrderLines(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localOrderLines)
          .insertOnConflictUpdate(
            LocalOrderLinesCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              orderId: _string(row, 'order_id'),
              variantId: _string(row, 'variant_id'),
              sku: _string(row, 'sku'),
              name: _string(row, 'name'),
              unitPrice: _string(row, 'unit_price'),
              quantity: _int(row, 'quantity'),
              discountAmount: Value(_string(row, 'discount_amount')),
              taxAmount: Value(_string(row, 'tax_amount')),
              lineTotal: _string(row, 'line_total'),
            ),
          );
    }
  }

  Future<void> _restoreOrderPromotions(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localOrderPromotions)
          .insertOnConflictUpdate(
            LocalOrderPromotionsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              orderId: _string(row, 'order_id'),
              promotionId: _string(row, 'promotion_id'),
              discountAmount: _string(row, 'discount_amount'),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreMovements(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localInventoryMovements)
          .insertOnConflictUpdate(
            LocalInventoryMovementsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: _string(row, 'shop_id'),
              variantId: _string(row, 'variant_id'),
              movementType: _string(row, 'movement_type'),
              sourceLocationId: Value(_nullable(row, 'source_location_id')),
              destinationLocationId: Value(
                _nullable(row, 'destination_location_id'),
              ),
              quantity: _string(row, 'quantity'),
              unitId: Value(_nullable(row, 'unit_id')),
              enteredQuantity: Value(_nullable(row, 'entered_quantity')),
              unitCost: Value(_nullable(row, 'unit_cost')),
              receiptLineId: Value(_nullable(row, 'receipt_line_id')),
              purchaseOrderId: Value(_nullable(row, 'purchase_order_id')),
              purchaseOrderLineId: Value(
                _nullable(row, 'purchase_order_line_id'),
              ),
              receiptNumber: Value(_nullable(row, 'receipt_number')),
              batchNumber: Value(_nullable(row, 'batch_number')),
              expiresAt: Value(_nullable(row, 'expires_at')),
              totalCost: _string(row, 'total_cost'),
              eventKey: _string(row, 'event_key'),
              orderLineId: Value(_nullable(row, 'order_line_id')),
              reversesMovementId: Value(_nullable(row, 'reverses_movement_id')),
              occurredAt: _string(row, 'occurred_at'),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreCostLayers(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localInventoryCostLayers)
          .insertOnConflictUpdate(
            LocalInventoryCostLayersCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              variantId: _string(row, 'variant_id'),
              locationId: _string(row, 'location_id'),
              receiptMovementId: _string(row, 'receipt_movement_id'),
              receiptLineId: Value(_nullable(row, 'receipt_line_id')),
              quantityReceived: _string(row, 'quantity_received'),
              quantityRemaining: _string(row, 'quantity_remaining'),
              unitCost: _string(row, 'unit_cost'),
              transferredFromLayerId: Value(
                _nullable(row, 'transferred_from_layer_id'),
              ),
              restoredFromAllocationId: Value(
                _nullable(row, 'restored_from_allocation_id'),
              ),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreCostAllocations(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localInventoryCostAllocations)
          .insertOnConflictUpdate(
            LocalInventoryCostAllocationsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              consumptionMovementId: _string(row, 'consumption_movement_id'),
              costLayerId: _string(row, 'cost_layer_id'),
              quantity: _string(row, 'quantity'),
              unitCost: _string(row, 'unit_cost'),
              totalCost: _string(row, 'total_cost'),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restorePayments(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localPayments)
          .insertOnConflictUpdate(
            LocalPaymentsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              orderId: _string(row, 'order_id'),
              method: _string(row, 'method'),
              status: _string(row, 'status'),
              amount: _string(row, 'amount'),
              providerReference: Value(_nullable(row, 'provider_reference')),
              idempotencyKey: _string(row, 'idempotency_key'),
              capturedAt: Value(_nullable(row, 'captured_at')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreRefunds(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localRefunds)
          .insertOnConflictUpdate(
            LocalRefundsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              paymentId: _string(row, 'payment_id'),
              orderId: _string(row, 'order_id'),
              amount: _string(row, 'amount'),
              status: _string(row, 'status'),
              reason: Value(_nullable(row, 'reason')),
              idempotencyKey: _string(row, 'idempotency_key'),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreAuditEvents(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localAuditEvents)
          .insertOnConflictUpdate(
            LocalAuditEventsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: Value(_nullable(row, 'shop_id')),
              actorMembershipId: Value(_nullable(row, 'actor_membership_id')),
              action: _string(row, 'action'),
              entityType: _string(row, 'entity_type'),
              entityId: Value(_nullable(row, 'entity_id')),
              beforeData: Value(_jsonValue(row['before_data'])),
              afterData: Value(_jsonValue(row['after_data'])),
              requestId: Value(_nullable(row, 'request_id')),
              occurredAt: _string(row, 'occurred_at'),
            ),
          );
    }
  }

  Future<void> _restoreServiceRecords(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localServiceRecords)
          .insertOnConflictUpdate(
            LocalServiceRecordsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: Value(_nullable(row, 'shop_id')),
              entityType: _string(row, 'entity_type'),
              parentId: Value(_nullable(row, 'parent_id')),
              serviceId: Value(_nullable(row, 'service_id')),
              code: Value(_nullable(row, 'code')),
              name: Value(_nullable(row, 'name')),
              description: Value(_nullable(row, 'description')),
              orderNumber: Value(_nullable(row, 'order_number')),
              serviceType: Value(_nullable(row, 'service_type')),
              priority: Value(_nullable(row, 'priority')),
              status: _string(row, 'status'),
              isActive: Value(_bool(row, 'is_active')),
              quantity: Value(_nullable(row, 'quantity')),
              amount: Value(_nullable(row, 'amount')),
              startsAt: Value(_nullable(row, 'starts_at')),
              endsAt: Value(_nullable(row, 'ends_at')),
              durationMinutes: Value(_nullableInt(row, 'duration_minutes')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restoreRepairRecords(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localRepairRecords)
          .insertOnConflictUpdate(
            LocalRepairRecordsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              shopId: _string(row, 'shop_id'),
              recordType: _string(row, 'record_type'),
              parentId: Value(_nullable(row, 'parent_id')),
              workItemId: Value(_nullable(row, 'work_item_id')),
              orderNumber: Value(_nullable(row, 'order_number')),
              deviceId: Value(_nullable(row, 'device_id')),
              deviceType: Value(_nullable(row, 'device_type')),
              manufacturer: Value(_nullable(row, 'manufacturer')),
              model: Value(_nullable(row, 'model')),
              serialNumber: Value(_nullable(row, 'serial_number')),
              issueDescription: Value(_nullable(row, 'issue_description')),
              priority: Value(_nullable(row, 'priority')),
              customerName: Value(_nullable(row, 'customer_name')),
              customerPhone: Value(_nullable(row, 'customer_phone')),
              status: _string(row, 'status'),
              paymentStatus: _string(row, 'payment_status'),
              totalCost: _string(row, 'total_cost'),
              laborFee: Value(_nullable(row, 'labor_fee')),
              additionalFee: Value(_nullable(row, 'additional_fee')),
              taxAmount: Value(_nullable(row, 'tax_amount')),
              diagnosis: Value(_nullable(row, 'diagnosis')),
              estimatedCost: Value(_nullable(row, 'estimated_cost')),
              kind: Value(_nullable(row, 'kind')),
              method: Value(_nullable(row, 'method')),
              amount: Value(_nullable(row, 'amount')),
              note: Value(_nullable(row, 'note')),
              customFields: Value(_nullable(row, 'custom_fields')),
              ticketFields: Value(_nullable(row, 'ticket_fields')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restorePriceLists(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localPriceLists)
          .insertOnConflictUpdate(
            LocalPriceListsCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              code: _string(row, 'code'),
              currencyCode: _string(row, 'currency_code'),
              isDefault: Value(_bool(row, 'is_default')),
              createdAt: _string(row, 'created_at'),
            ),
          );
    }
  }

  Future<void> _restorePrices(Object? value, String merchantId) async {
    for (final row in _rows(value)) {
      await database
          .into(database.localPrices)
          .insertOnConflictUpdate(
            LocalPricesCompanion.insert(
              id: _string(row, 'id'),
              merchantId: merchantId,
              priceListId: _string(row, 'price_list_id'),
              variantId: _string(row, 'variant_id'),
              amount: _string(row, 'amount'),
              validFrom: _string(row, 'valid_from'),
              validUntil: Value(_nullable(row, 'valid_until')),
            ),
          );
    }
  }

  List<Map<String, Object?>> _rows(Object? value) => [
    for (final row in value is List ? value : const [])
      Map<String, Object?>.from(row as Map),
  ];

  String _string(Map<String, Object?> row, String key) {
    final value = row[key];
    if (value == null || value.toString().trim().isEmpty) {
      throw LocalBackupException('Backup field $key is required.');
    }
    return value.toString();
  }

  String? _nullable(Map<String, Object?> row, String key) =>
      row[key]?.toString();

  String? _jsonValue(Object? value) => value == null ? null : jsonEncode(value);

  bool _bool(Map<String, Object?> row, String key) =>
      row[key] as bool? ?? false;

  int _int(Map<String, Object?> row, String key) =>
      (row[key] as num?)?.toInt() ?? 0;

  int? _nullableInt(Map<String, Object?> row, String key) =>
      (row[key] as num?)?.toInt();

  DateTime? _dateTime(Map<String, Object?> row, String key) {
    final value = _nullable(row, key);
    return value == null ? null : DateTime.tryParse(value)?.toUtc();
  }
}
