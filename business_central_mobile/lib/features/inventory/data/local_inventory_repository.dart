import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../../../shared/money.dart';
import '../application/inventory_repository.dart';
import '../domain/inventory_models.dart';

class LocalSaleCost {
  const LocalSaleCost({required this.movementId, required this.totalCost});

  final String movementId;
  final String totalCost;
}

class LocalInventoryRepository implements InventoryRepository {
  LocalInventoryRepository({
    required this.database,
    required this.merchantId,
    this.actorMembershipId,
  });

  final AppDatabase database;
  final String merchantId;
  final String? actorMembershipId;
  static const _uuid = Uuid();

  @override
  Future<List<InventoryLocation>> locations({
    required String merchantId,
    required String shopId,
  }) async {
    if (merchantId != this.merchantId) {
      throw StateError('Inventory request is outside the active merchant.');
    }
    final rows =
        await (database.select(database.locations)
              ..where(
                (row) =>
                    row.merchantId.equals(this.merchantId) &
                    row.shopId.equals(shopId) &
                    row.isActive.equals(true),
              )
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final row in rows)
        InventoryLocation(
          id: row.id,
          merchantId: row.merchantId,
          shopId: row.shopId,
          code: row.code,
          name: row.name,
          locationType: row.locationType,
          isActive: row.isActive,
        ),
    ];
  }

  @override
  Future<void> stockIn({
    required String variantId,
    required String destinationLocationId,
    required String quantity,
    required String unitCost,
    String? purchaseOrderId,
    String? purchaseOrderLineId,
    String? unitId,
    String? receiptNumber,
    String? batchNumber,
    String? expiresAt,
    String? eventKey,
  }) async {
    final parsedQuantity = _quantity(quantity);
    if (parsedQuantity.minorUnits <= BigInt.zero) {
      throw const FormatException('Quantity must be positive.');
    }
    final parsedUnitCost = ExactMoney.parse(unitCost, decimalPlaces: 2);
    if (parsedUnitCost.minorUnits.isNegative) {
      throw const FormatException('Unit cost cannot be negative.');
    }
    final purchaseOrder = purchaseOrderId?.trim() ?? '';
    final purchaseOrderLine = purchaseOrderLineId?.trim() ?? '';
    if ((purchaseOrder.isEmpty) != (purchaseOrderLine.isEmpty)) {
      throw const FormatException(
        'Purchase order and purchase order line must be supplied together.',
      );
    }
    final normalizedReceipt = _optional(receiptNumber);
    if (purchaseOrder.isNotEmpty && normalizedReceipt == null) {
      throw const FormatException(
        'Receipt number is required for purchase-order receiving.',
      );
    }
    final location =
        await (database.select(database.locations)..where(
              (row) =>
                  row.id.equals(destinationLocationId) &
                  row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    final variant =
        await (database.select(database.cachedCatalogVariants)..where(
              (row) =>
                  row.id.equals(variantId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (location == null || variant == null) {
      throw StateError('Stock receipt is outside the active merchant.');
    }
    final commandKey = eventKey?.trim().isNotEmpty == true
        ? eventKey!.trim()
        : _uuid.v4();
    final existing =
        await (database.select(database.localInventoryMovements)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.eventKey.equals(commandKey),
            ))
            .getSingleOrNull();
    if (existing != null) return;

    final current = _quantity(variant.quantityOnHand ?? '0');
    final next = current + parsedQuantity;
    final now = DateTime.now().toUtc().toIso8601String();
    final movementId = _uuid.v4();
    final totalCost = _multiplyCost(parsedQuantity, parsedUnitCost);
    await database.transaction(() async {
      await (database.update(database.cachedCatalogVariants)..where(
            (row) =>
                row.id.equals(variantId) & row.merchantId.equals(merchantId),
          ))
          .write(
            CachedCatalogVariantsCompanion(
              quantityOnHand: Value(next.toDecimalString()),
              updatedAt: Value(now),
            ),
          );
      await database
          .into(database.localInventoryMovements)
          .insert(
            LocalInventoryMovementsCompanion.insert(
              id: movementId,
              merchantId: merchantId,
              shopId: location.shopId ?? '',
              variantId: variantId,
              movementType: 'RECEIPT',
              destinationLocationId: Value(destinationLocationId),
              quantity: parsedQuantity.toDecimalString(),
              enteredQuantity: Value(parsedQuantity.toDecimalString()),
              unitCost: Value(parsedUnitCost.toDecimalString()),
              unitId: Value(_optional(unitId)),
              purchaseOrderId: Value(_optional(purchaseOrder)),
              purchaseOrderLineId: Value(_optional(purchaseOrderLine)),
              receiptNumber: Value(normalizedReceipt),
              batchNumber: Value(_optional(batchNumber)),
              expiresAt: Value(_optional(expiresAt)),
              totalCost: totalCost.toDecimalString(),
              eventKey: commandKey,
              occurredAt: now,
              createdAt: now,
            ),
          );
      await database
          .into(database.localInventoryCostLayers)
          .insert(
            LocalInventoryCostLayersCompanion.insert(
              id: _uuid.v4(),
              merchantId: merchantId,
              variantId: variantId,
              locationId: destinationLocationId,
              receiptMovementId: movementId,
              quantityReceived: parsedQuantity.toDecimalString(),
              quantityRemaining: parsedQuantity.toDecimalString(),
              unitCost: parsedUnitCost.toDecimalString(),
              createdAt: now,
            ),
          );
      await _audit.record(
        action: 'CREATE',
        entityType: 'inventory_movement',
        entityId: movementId,
        shopId: location.shopId,
        requestId: commandKey,
        afterData: {
          'movement_type': 'RECEIPT',
          'variant_id': variantId,
          'destination_location_id': destinationLocationId,
          'quantity': parsedQuantity.toDecimalString(),
          'unit_cost': parsedUnitCost.toDecimalString(),
          'purchase_order_id': _optional(purchaseOrder),
          'purchase_order_line_id': _optional(purchaseOrderLine),
          'receipt_number': normalizedReceipt,
          'batch_number': _optional(batchNumber),
          'expires_at': _optional(expiresAt),
        },
      );
    });
  }

  /// Records a sale movement and allocates FIFO layers. Call this method
  /// inside the caller's transaction when the order and order line must be
  /// committed atomically with inventory.
  Future<LocalSaleCost> recordSaleWithinTransaction({
    required String shopId,
    required String variantId,
    required String sourceLocationId,
    required String quantity,
    required String orderLineId,
    required String eventKey,
  }) => _recordSale(
    shopId: shopId,
    variantId: variantId,
    sourceLocationId: sourceLocationId,
    quantity: quantity,
    orderLineId: orderLineId,
    eventKey: eventKey,
  );

  Future<LocalSaleCost> recordSale({
    required String shopId,
    required String variantId,
    required String sourceLocationId,
    required String quantity,
    required String orderLineId,
    required String eventKey,
  }) => database.transaction(
    () => _recordSale(
      shopId: shopId,
      variantId: variantId,
      sourceLocationId: sourceLocationId,
      quantity: quantity,
      orderLineId: orderLineId,
      eventKey: eventKey,
    ),
  );

  Future<LocalSaleCost> _recordSale({
    required String shopId,
    required String variantId,
    required String sourceLocationId,
    required String quantity,
    required String orderLineId,
    required String eventKey,
  }) async {
    final parsedQuantity = _quantity(quantity);
    if (parsedQuantity.minorUnits <= BigInt.zero) {
      throw const FormatException('Quantity must be positive.');
    }
    final location =
        await (database.select(database.locations)..where(
              (row) =>
                  row.id.equals(sourceLocationId) &
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId),
            ))
            .getSingleOrNull();
    final variant =
        await (database.select(database.cachedCatalogVariants)..where(
              (row) =>
                  row.id.equals(variantId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (location == null || variant == null) {
      throw StateError('Sale is outside the active merchant/shop.');
    }
    final existing =
        await (database.select(database.localInventoryMovements)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.eventKey.equals(eventKey),
            ))
            .getSingleOrNull();
    if (existing != null) {
      final allocations = await _allocations(existing.id);
      return LocalSaleCost(
        movementId: existing.id,
        totalCost: _sumCosts(
          allocations.map((row) => row.totalCost),
        ).toDecimalString(),
      );
    }

    final current = _quantity(variant.quantityOnHand ?? '0');
    if (current.minorUnits < parsedQuantity.minorUnits) {
      throw StateError('Insufficient local stock for ${variant.name}.');
    }
    final layers =
        await (database.select(database.localInventoryCostLayers)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.variantId.equals(variantId) &
                    row.locationId.equals(sourceLocationId),
              )
              ..orderBy([
                (row) => OrderingTerm(expression: row.createdAt),
                (row) => OrderingTerm(expression: row.id),
              ]))
            .get();
    var layered = ExactMoney(minorUnits: BigInt.zero, decimalPlaces: 3);
    for (final layer in layers) {
      layered += _quantity(layer.quantityRemaining);
    }
    if (layered.minorUnits < parsedQuantity.minorUnits) {
      final openingQuantity = parsedQuantity - layered;
      await _createOpeningLayer(
        variantId: variantId,
        locationId: sourceLocationId,
        shopId: shopId,
        quantity: openingQuantity,
      );
    }

    final refreshedLayers =
        await (database.select(database.localInventoryCostLayers)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.variantId.equals(variantId) &
                  row.locationId.equals(sourceLocationId),
            ))
            .get();
    refreshedLayers.sort((a, b) {
      final created = a.createdAt.compareTo(b.createdAt);
      return created == 0 ? a.id.compareTo(b.id) : created;
    });
    final movementId = _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();
    final allocations =
        <({String layerId, String quantity, String unitCost})>[];
    var remaining = parsedQuantity;
    for (final layer in refreshedLayers) {
      if (remaining.minorUnits <= BigInt.zero) break;
      final available = _quantity(layer.quantityRemaining);
      if (available.minorUnits <= BigInt.zero) continue;
      final allocated = available.minorUnits < remaining.minorUnits
          ? available
          : remaining;
      allocations.add((
        layerId: layer.id,
        quantity: allocated.toDecimalString(),
        unitCost: layer.unitCost,
      ));
      remaining -= allocated;
    }
    if (remaining.minorUnits > BigInt.zero) {
      throw StateError('Insufficient FIFO cost layers for sale.');
    }
    var totalCost = ExactMoney(minorUnits: BigInt.zero, decimalPlaces: 2);
    for (final allocation in allocations) {
      totalCost += _multiplyCost(
        _quantity(allocation.quantity),
        ExactMoney.parse(allocation.unitCost, decimalPlaces: 2),
      );
    }
    final singleUnitCost = allocations.length == 1
        ? Value<String>(allocations.single.unitCost)
        : const Value<String>.absent();
    await database
        .into(database.localInventoryMovements)
        .insert(
          LocalInventoryMovementsCompanion.insert(
            id: movementId,
            merchantId: merchantId,
            shopId: shopId,
            variantId: variantId,
            movementType: 'SALE',
            sourceLocationId: Value(sourceLocationId),
            quantity: parsedQuantity.toDecimalString(),
            unitCost: singleUnitCost,
            totalCost: totalCost.toDecimalString(),
            eventKey: eventKey,
            orderLineId: Value(orderLineId),
            occurredAt: now,
            createdAt: now,
          ),
        );
    for (final allocation in allocations) {
      final layer = refreshedLayers.firstWhere(
        (row) => row.id == allocation.layerId,
      );
      final allocatedQuantity = _quantity(allocation.quantity);
      final layerRemaining = _quantity(layer.quantityRemaining);
      await (database.update(database.localInventoryCostLayers)..where(
            (row) =>
                row.id.equals(layer.id) & row.merchantId.equals(merchantId),
          ))
          .write(
            LocalInventoryCostLayersCompanion(
              quantityRemaining: Value(
                (layerRemaining - allocatedQuantity).toDecimalString(),
              ),
            ),
          );
      final allocationCost = _multiplyCost(
        allocatedQuantity,
        ExactMoney.parse(allocation.unitCost, decimalPlaces: 2),
      );
      await database
          .into(database.localInventoryCostAllocations)
          .insert(
            LocalInventoryCostAllocationsCompanion.insert(
              id: _uuid.v4(),
              merchantId: merchantId,
              consumptionMovementId: movementId,
              costLayerId: layer.id,
              quantity: allocatedQuantity.toDecimalString(),
              unitCost: allocation.unitCost,
              totalCost: allocationCost.toDecimalString(),
              createdAt: now,
            ),
          );
    }
    await (database.update(database.cachedCatalogVariants)..where(
          (row) => row.id.equals(variantId) & row.merchantId.equals(merchantId),
        ))
        .write(
          CachedCatalogVariantsCompanion(
            quantityOnHand: Value((current - parsedQuantity).toDecimalString()),
            updatedAt: Value(now),
          ),
        );
    await _audit.record(
      action: 'CREATE',
      entityType: 'inventory_movement',
      entityId: movementId,
      shopId: shopId,
      requestId: eventKey,
      afterData: {
        'movement_type': 'SALE',
        'variant_id': variantId,
        'source_location_id': sourceLocationId,
        'quantity': parsedQuantity.toDecimalString(),
        'total_cost': totalCost.toDecimalString(),
        'order_line_id': orderLineId,
      },
    );
    return LocalSaleCost(
      movementId: movementId,
      totalCost: totalCost.toDecimalString(),
    );
  }

  @override
  Future<List<InventoryMovement>> movements({
    required Set<String> locationIds,
  }) async {
    if (locationIds.isEmpty) return const [];
    final rows =
        await (database.select(database.localInventoryMovements)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    (row.sourceLocationId.isIn(locationIds) |
                        row.destinationLocationId.isIn(locationIds)),
              )
              ..orderBy([(row) => OrderingTerm.desc(row.occurredAt)]))
            .get();
    return [for (final row in rows) _movement(row)];
  }

  @override
  Future<InventoryMovementDetail> movementDetail({required String id}) async {
    final row =
        await (database.select(database.localInventoryMovements)..where(
              (entry) =>
                  entry.id.equals(id) & entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (row == null) {
      throw StateError('Movement is outside the active merchant.');
    }
    final variant =
        await (database.select(database.cachedCatalogVariants)..where(
              (entry) =>
                  entry.id.equals(row.variantId) &
                  entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (variant == null) throw StateError('Movement variant is unavailable.');
    final product =
        await (database.select(database.cachedCatalogProducts)..where(
              (entry) =>
                  entry.id.equals(variant.productId) &
                  entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (product == null) throw StateError('Movement product is unavailable.');
    final locationRows = await (database.select(
      database.locations,
    )..where((entry) => entry.merchantId.equals(merchantId))).get();
    final locationsById = {for (final entry in locationRows) entry.id: entry};
    final source = locationsById[row.sourceLocationId];
    final destination = locationsById[row.destinationLocationId];
    final allocationRows = await _allocations(row.id);
    final layerIds = allocationRows
        .map((allocation) => allocation.costLayerId)
        .toSet();
    final layerRows = layerIds.isEmpty
        ? const <LocalInventoryCostLayer>[]
        : await (database.select(database.localInventoryCostLayers)..where(
                (layer) =>
                    layer.merchantId.equals(merchantId) &
                    layer.id.isIn(layerIds),
              ))
              .get();
    final layersById = {for (final layer in layerRows) layer.id: layer};
    return InventoryMovementDetail(
      movement: _movement(row),
      productName: product.name,
      variantName: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      unitName: variant.unitOfMeasure,
      sourceLocationName: source?.name,
      sourceLocationCode: source?.code,
      destinationLocationName: destination?.name,
      destinationLocationCode: destination?.code,
      totalCost: row.totalCost,
      receipt: row.receiptNumber == null
          ? null
          : {
              'receipt_number': row.receiptNumber,
              'batch_number': row.batchNumber,
              'expires_at': row.expiresAt,
              'quantity_received': row.quantity,
              'unit_cost': row.unitCost,
            },
      order: row.purchaseOrderId == null
          ? null
          : {
              'purchase_order_id': row.purchaseOrderId,
              'purchase_order_line_id': row.purchaseOrderLineId,
            },
      destinationQuantityOnHand: destination == null
          ? null
          : variant.quantityOnHand,
      costAllocations: [
        for (final allocation in allocationRows)
          InventoryCostAllocation(
            id: allocation.id,
            costLayerId: allocation.costLayerId,
            quantity: allocation.quantity,
            unitCost: allocation.unitCost,
            totalCost: allocation.totalCost,
            layerQuantityReceived:
                layersById[allocation.costLayerId]?.quantityReceived ??
                allocation.quantity,
            layerQuantityRemaining:
                layersById[allocation.costLayerId]?.quantityRemaining ??
                '0.000',
          ),
      ],
    );
  }

  InventoryMovement _movement(LocalInventoryMovement row) => InventoryMovement(
    id: row.id,
    merchantId: row.merchantId,
    variantId: row.variantId,
    movementType: row.movementType,
    sourceLocationId: row.sourceLocationId,
    destinationLocationId: row.destinationLocationId,
    quantity: row.quantity,
    enteredQuantity: row.enteredQuantity,
    unitId: row.unitId,
    receiptLineId: row.receiptLineId,
    unitCost: row.unitCost,
    orderLineId: row.orderLineId,
    reversesMovementId: row.reversesMovementId,
    eventKey: row.eventKey,
    occurredAt: DateTime.parse(row.occurredAt).toUtc(),
    createdAt: DateTime.parse(row.createdAt).toUtc(),
  );

  Future<void> _createOpeningLayer({
    required String variantId,
    required String locationId,
    required String shopId,
    required ExactMoney quantity,
  }) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final movementId = _uuid.v4();
    await database
        .into(database.localInventoryMovements)
        .insert(
          LocalInventoryMovementsCompanion.insert(
            id: movementId,
            merchantId: merchantId,
            shopId: shopId,
            variantId: variantId,
            movementType: 'ADJUSTMENT',
            destinationLocationId: Value(locationId),
            quantity: quantity.toDecimalString(),
            unitCost: const Value('0.00'),
            totalCost: '0.00',
            eventKey: 'opening:$merchantId:$variantId:$locationId:$movementId',
            occurredAt: now,
            createdAt: now,
          ),
        );
    await database
        .into(database.localInventoryCostLayers)
        .insert(
          LocalInventoryCostLayersCompanion.insert(
            id: _uuid.v4(),
            merchantId: merchantId,
            variantId: variantId,
            locationId: locationId,
            receiptMovementId: movementId,
            quantityReceived: quantity.toDecimalString(),
            quantityRemaining: quantity.toDecimalString(),
            unitCost: '0.00',
            createdAt: now,
          ),
        );
    await _audit.record(
      action: 'CREATE',
      entityType: 'inventory_movement',
      entityId: movementId,
      shopId: shopId,
      afterData: {
        'movement_type': 'ADJUSTMENT',
        'variant_id': variantId,
        'destination_location_id': locationId,
        'quantity': quantity.toDecimalString(),
        'reason': 'opening_cost_layer',
      },
    );
  }

  Future<List<LocalInventoryCostAllocation>> _allocations(String movementId) =>
      (database.select(database.localInventoryCostAllocations)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.consumptionMovementId.equals(movementId),
          ))
          .get();

  LocalAuditRepository get _audit => LocalAuditRepository(
    database: database,
    merchantId: merchantId,
    actorMembershipId: actorMembershipId,
  );

  ExactMoney _sumCosts(Iterable<String> values) {
    var total = ExactMoney(minorUnits: BigInt.zero, decimalPlaces: 2);
    for (final value in values) {
      total += ExactMoney.parse(value, decimalPlaces: 2);
    }
    return total;
  }

  ExactMoney _multiplyCost(ExactMoney quantity, ExactMoney unitCost) {
    final numerator = unitCost.minorUnits * quantity.minorUnits;
    const denominator = 1000;
    var cents = numerator ~/ BigInt.from(denominator);
    if ((numerator % BigInt.from(denominator)) * BigInt.two >=
        BigInt.from(denominator)) {
      cents += BigInt.one;
    }
    return ExactMoney(minorUnits: cents, decimalPlaces: 2);
  }

  String? _optional(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  ExactMoney _quantity(String value) =>
      ExactMoney.parse(value, decimalPlaces: 3);
}
