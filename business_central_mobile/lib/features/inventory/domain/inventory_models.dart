class InventoryLocation {
  const InventoryLocation({
    required this.id,
    required this.merchantId,
    required this.shopId,
    required this.code,
    required this.name,
    required this.locationType,
    required this.isActive,
  });

  final String id;
  final String merchantId;
  final String? shopId;
  final String code;
  final String name;
  final String locationType;
  final bool isActive;

  factory InventoryLocation.fromJson(
    Map<String, Object?> json, {
    required String merchantId,
  }) {
    final payloadMerchantId = json['merchant_id'] as String?;
    if (payloadMerchantId != null &&
        payloadMerchantId.isNotEmpty &&
        payloadMerchantId != merchantId) {
      throw StateError('Inventory location belongs to another merchant.');
    }
    return InventoryLocation(
      id: json['id'] as String,
      merchantId: merchantId,
      shopId: json['shop_id'] as String?,
      code: json['code'] as String,
      name: json['name'] as String,
      locationType: json['location_type'] as String? ?? 'SHOP',
      isActive: json['is_active'] as bool? ?? true,
    );
  }
}

class InventoryMovement {
  const InventoryMovement({
    required this.id,
    required this.merchantId,
    required this.variantId,
    required this.movementType,
    required this.quantity,
    required this.eventKey,
    required this.occurredAt,
    required this.createdAt,
    this.sourceLocationId,
    this.destinationLocationId,
    this.unitId,
    this.receiptLineId,
    this.orderLineId,
    this.reversesMovementId,
    this.enteredQuantity,
    this.unitCost,
  });

  final String id;
  final String merchantId;
  final String variantId;
  final String movementType;
  final String? sourceLocationId;
  final String? destinationLocationId;
  final String? unitId;
  final String? receiptLineId;
  final String? orderLineId;
  final String? reversesMovementId;
  final String quantity;
  final String? enteredQuantity;
  final String? unitCost;
  final String eventKey;
  final DateTime occurredAt;
  final DateTime createdAt;

  factory InventoryMovement.fromJson(Map<String, Object?> json) {
    return InventoryMovement(
      id: json['id'] as String,
      merchantId: json['merchant_id'] as String,
      variantId: json['variant_id'] as String,
      movementType: json['movement_type'] as String,
      sourceLocationId: json['source_location_id'] as String?,
      destinationLocationId: json['destination_location_id'] as String?,
      unitId: json['unit_id'] as String?,
      receiptLineId: json['receipt_line_id'] as String?,
      orderLineId: json['order_line_id'] as String?,
      reversesMovementId: json['reverses_movement_id'] as String?,
      quantity: (json['quantity'] ?? '0').toString(),
      enteredQuantity: json['entered_quantity']?.toString(),
      unitCost: json['unit_cost']?.toString(),
      eventKey: json['event_key'] as String,
      occurredAt: DateTime.parse(json['occurred_at'] as String).toUtc(),
      createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
    );
  }
}

class InventoryCostAllocation {
  const InventoryCostAllocation({
    required this.id,
    required this.costLayerId,
    required this.quantity,
    required this.unitCost,
    required this.totalCost,
    required this.layerQuantityReceived,
    required this.layerQuantityRemaining,
    this.sourceReceiptNumber,
  });

  final String id;
  final String costLayerId;
  final String quantity;
  final String unitCost;
  final String totalCost;
  final String layerQuantityReceived;
  final String layerQuantityRemaining;
  final String? sourceReceiptNumber;

  factory InventoryCostAllocation.fromJson(Map<String, Object?> json) {
    return InventoryCostAllocation(
      id: json['id'] as String,
      costLayerId: json['cost_layer_id'] as String,
      quantity: (json['quantity'] ?? '0').toString(),
      unitCost: (json['unit_cost'] ?? '0').toString(),
      totalCost: (json['total_cost'] ?? '0').toString(),
      layerQuantityReceived: (json['layer_quantity_received'] ?? '0')
          .toString(),
      layerQuantityRemaining: (json['layer_quantity_remaining'] ?? '0')
          .toString(),
      sourceReceiptNumber: json['source_receipt_number'] as String?,
    );
  }
}

class InventoryMovementDetail {
  const InventoryMovementDetail({
    required this.movement,
    required this.productName,
    required this.variantName,
    required this.sku,
    required this.totalCost,
    required this.costAllocations,
    this.productDescription,
    this.barcode,
    this.unitName,
    this.unitSymbol,
    this.sourceLocationName,
    this.sourceLocationCode,
    this.destinationLocationName,
    this.destinationLocationCode,
    this.sourceQuantityOnHand,
    this.sourceQuantityReserved,
    this.destinationQuantityOnHand,
    this.destinationQuantityReserved,
    this.receipt,
    this.order,
  });

  final InventoryMovement movement;
  final String productName;
  final String? productDescription;
  final String variantName;
  final String sku;
  final String? barcode;
  final String? unitName;
  final String? unitSymbol;
  final String? sourceLocationName;
  final String? sourceLocationCode;
  final String? destinationLocationName;
  final String? destinationLocationCode;
  final String totalCost;
  final String? sourceQuantityOnHand;
  final String? sourceQuantityReserved;
  final String? destinationQuantityOnHand;
  final String? destinationQuantityReserved;
  final Map<String, Object?>? receipt;
  final Map<String, Object?>? order;
  final List<InventoryCostAllocation> costAllocations;

  factory InventoryMovementDetail.fromJson(Map<String, Object?> json) {
    final receipt = json['receipt'];
    final order = json['order'];
    return InventoryMovementDetail(
      movement: InventoryMovement.fromJson(
        Map<String, Object?>.from(json['movement']! as Map),
      ),
      productName: json['product_name'] as String,
      productDescription: json['product_description'] as String?,
      variantName: json['variant_name'] as String,
      sku: json['sku'] as String,
      barcode: json['barcode'] as String?,
      unitName: json['unit_name'] as String?,
      unitSymbol: json['unit_symbol'] as String?,
      sourceLocationName: json['source_location_name'] as String?,
      sourceLocationCode: json['source_location_code'] as String?,
      destinationLocationName: json['destination_location_name'] as String?,
      destinationLocationCode: json['destination_location_code'] as String?,
      totalCost: (json['total_cost'] ?? '0').toString(),
      sourceQuantityOnHand: json['source_quantity_on_hand']?.toString(),
      sourceQuantityReserved: json['source_quantity_reserved']?.toString(),
      destinationQuantityOnHand: json['destination_quantity_on_hand']
          ?.toString(),
      destinationQuantityReserved: json['destination_quantity_reserved']
          ?.toString(),
      receipt: receipt is Map ? Map<String, Object?>.from(receipt) : null,
      order: order is Map ? Map<String, Object?>.from(order) : null,
      costAllocations: [
        for (final value
            in (json['cost_allocations'] as List<Object?>? ?? const []))
          InventoryCostAllocation.fromJson(
            Map<String, Object?>.from(value! as Map),
          ),
      ],
    );
  }
}
