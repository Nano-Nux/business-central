import '../domain/inventory_models.dart';

abstract interface class InventoryRepository {
  Future<List<InventoryLocation>> locations({
    required String merchantId,
    required String shopId,
  });

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
  });

  Future<List<InventoryMovement>> movements({required Set<String> locationIds});

  Future<InventoryMovementDetail> movementDetail({required String id});
}
