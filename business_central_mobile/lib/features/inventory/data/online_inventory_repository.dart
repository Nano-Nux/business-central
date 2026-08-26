import '../../../core/network/network_boundary.dart';
import '../../../features/auth/data/online_auth_api.dart';
import 'package:uuid/uuid.dart';
import '../application/inventory_repository.dart';
import '../domain/inventory_models.dart';
import 'inventory_cache_repository.dart';

class OnlineInventoryRepository implements InventoryRepository {
  OnlineInventoryRepository(this.api, this.cache);
  final OnlineAuthApi api;
  final InventoryCacheRepository cache;

  @override
  Future<List<InventoryLocation>> locations({
    required String merchantId,
    required String shopId,
  }) async {
    try {
      final all = [
        for (final item in await api.getCollection(
          '/inventory/locations?page_index=0&page_size=100',
        ))
          InventoryLocation.fromJson(item, merchantId: merchantId),
      ];
      final selected = [
        for (final location in all)
          if (location.shopId == shopId) location,
      ];
      await cache.saveLocations(merchantId: merchantId, locations: all);
      return selected;
    } on NetworkDeniedException {
      return cache.locations(merchantId: merchantId, shopId: shopId);
    }
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
    if (quantity.trim().isEmpty || unitCost.trim().isEmpty) {
      throw const FormatException('Quantity and unit cost are required.');
    }
    final purchaseOrder = purchaseOrderId?.trim() ?? '';
    final purchaseOrderLine = purchaseOrderLineId?.trim() ?? '';
    if ((purchaseOrder.isEmpty) != (purchaseOrderLine.isEmpty)) {
      throw const FormatException(
        'Purchase order and purchase order line must be supplied together.',
      );
    }
    if (purchaseOrder.isNotEmpty && (receiptNumber?.trim().isEmpty ?? true)) {
      throw const FormatException(
        'Receipt number is required for purchase-order receiving.',
      );
    }
    await api.postResource('/inventory/stock-in', {
      'variant_id': variantId,
      'destination_location_id': destinationLocationId,
      if (purchaseOrder.isNotEmpty) 'purchase_order_id': purchaseOrder,
      if (purchaseOrderLine.isNotEmpty)
        'purchase_order_line_id': purchaseOrderLine,
      if (unitId?.trim().isNotEmpty == true) 'unit_id': unitId!.trim(),
      if (receiptNumber?.trim().isNotEmpty == true)
        'receipt_number': receiptNumber!.trim(),
      if (batchNumber?.trim().isNotEmpty == true)
        'batch_number': batchNumber!.trim(),
      if (expiresAt?.trim().isNotEmpty == true) 'expires_at': expiresAt!.trim(),
      'quantity': quantity.trim(),
      'unit_cost': unitCost.trim(),
      'event_key': eventKey?.trim().isNotEmpty == true
          ? eventKey!.trim()
          : Uuid().v4(),
    });
  }

  @override
  Future<List<InventoryMovement>> movements({
    required Set<String> locationIds,
  }) async {
    if (locationIds.isEmpty) return [];
    final all = [
      for (final item in await api.getCollection(
        '/inventory/movements?page_index=0&page_size=100',
      ))
        InventoryMovement.fromJson(item),
    ];
    return [
      for (final movement in all)
        if (locationIds.contains(movement.sourceLocationId) ||
            locationIds.contains(movement.destinationLocationId))
          movement,
    ];
  }

  @override
  Future<InventoryMovementDetail> movementDetail({required String id}) async {
    return InventoryMovementDetail.fromJson(
      await api.getResource('/inventory/movements/$id'),
    );
  }
}
